import { getData } from "./storage.js";

export function startPoller({ pollIntervalMs, rpcUrl, heliusApiKey, onAlert }) {
  // onAlert(chatId, message, wallet)

  const lastSigByWallet = new Map();
  const recentAlertByFingerprint = new Map();
  const DEDUP_WINDOW_MS = 45_000;
  let running = false;

  function matchFilter(tx, filter) {
    const f = filter || { mode: "all", minSol: 0, minToken: 0, types: [] };
    const mode = String(f.mode || "all").toLowerCase();

    if (mode === "all") return true;

    const typeUp = String(tx?.type || "UNKNOWN").toUpperCase();

    if (mode === "swap") {
      return typeUp.includes("SWAP");
    }

    if (mode === "types") {
      const allowed = Array.isArray(f.types) ? f.types.map(x => String(x).toUpperCase()) : [];
      return allowed.includes(typeUp);
    }

    if (mode === "sol") {
      const transfers = Array.isArray(tx?.nativeTransfers) ? tx.nativeTransfers : [];
      if (!transfers.length) return false;
      const minSol = Number(f.minSol || 0);
      if (minSol <= 0) return true;
      return transfers.some((t) => (Number(t?.amount || 0) / 1e9) >= minSol);
    }

    if (mode === "spl") {
      const transfers = Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : [];
      if (!transfers.length) return false;
      const minToken = Number(f.minToken || 0);
      if (minToken <= 0) return true;
      return transfers.some((t) => Number(t?.tokenAmount || 0) >= minToken);
    }

    return true;
  }

  async function getBalanceSol(address) {
    try {
      const r = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-bal",
          method: "getBalance",
          params: [address],
        }),
      });

      if (!r.ok) return null;

      const data = await r.json().catch(() => null);
      const lamports = data?.result?.value ?? 0;
      return Number(lamports) / 1e9;
    } catch {
      return null;
    }
  }

  async function getNewTxs(address) {
    try {
      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusApiKey}&limit=20`;
      const r = await fetch(url);

      if (!r.ok) return [];

      const txs = await r.json().catch(() => []);
      if (!Array.isArray(txs) || txs.length === 0) return [];

      const latest = txs[0]?.signature;
      const last = lastSigByWallet.get(address);

      // prima volta: setta puntatore e non inviare notifiche
      if (!last) {
        if (latest) lastSigByWallet.set(address, latest);
        return [];
      }

      const newTxs = [];
      for (const tx of txs) {
        if (tx?.signature === last) break;
        if (tx?.signature) newTxs.push(tx);
      }

      if (latest) lastSigByWallet.set(address, latest);
      return newTxs;
    } catch {
      return [];
    }
  }

  function computeAlertScore(tx) {
    const nativeTransfers = Array.isArray(tx?.nativeTransfers) ? tx.nativeTransfers : [];
    const tokenTransfers = Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : [];
    const maxSol = nativeTransfers.reduce((m, t) => Math.max(m, Number(t?.amount || 0) / 1e9), 0);
    const tokenCount = tokenTransfers.length;
    const type = String(tx?.type || 'UNKNOWN').toUpperCase();

    let score = 30;
    if (type.includes('SWAP')) score += 20;
    if (maxSol >= 100) score += 40;
    else if (maxSol >= 25) score += 30;
    else if (maxSol >= 5) score += 15;
    if (tokenCount >= 3) score += 10;

    score = Math.max(0, Math.min(100, score));
    const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : 'C';
    return { score, grade };
  }

  function makeFingerprint(wallet, tx) {
    const type = String(tx?.type || 'UNKNOWN').toUpperCase();
    const nativeTransfers = Array.isArray(tx?.nativeTransfers) ? tx.nativeTransfers : [];
    const topSol = nativeTransfers.reduce((m, t) => Math.max(m, Number(t?.amount || 0)), 0);
    return `${wallet}|${type}|${topSol}`;
  }

  function shouldSendByDedup(fingerprint) {
    const now = Date.now();
    const last = recentAlertByFingerprint.get(fingerprint) || 0;
    if (now - last < DEDUP_WINDOW_MS) return false;
    recentAlertByFingerprint.set(fingerprint, now);
    return true;
  }

  function short(v, n = 6) {
    const s = String(v || '');
    if (s.length <= n * 2 + 3) return s;
    return `${s.slice(0, n)}...${s.slice(-n)}`;
  }

  function buildMsg(wallet, bal, tx) {
    const quality = computeAlertScore(tx);
    let msg = `🔔 NEW ACTIVITY\n`;
    msg += `Wallet: ${short(wallet)}\n`;
    msg += `Quality: ${quality.grade} (${quality.score}/100)\n`;
    if (typeof bal === 'number') msg += `Balance: ${bal.toFixed(4)} SOL\n`;

    if (Array.isArray(tx?.nativeTransfers) && tx.nativeTransfers.length) {
      const t =
        tx.nativeTransfers.find((x) => (Number(x?.amount || 0) / 1e9) >= 0.001) ||
        tx.nativeTransfers[0];

      const amt = (Number(t?.amount || 0) / 1e9).toFixed(4);
      msg += `Transfer: ${amt} SOL\n`;
      msg += `From: ${short(t?.fromUserAccount || '?')}\n`;
      msg += `To: ${short(t?.toUserAccount || '?')}\n`;
    } else if (Array.isArray(tx?.tokenTransfers) && tx.tokenTransfers.length) {
      const t = tx.tokenTransfers[0];
      msg += `Token amount: ${t?.tokenAmount ?? '?'}\n`;
      msg += `Mint: ${short(t?.mint || '?')}\n`;
      msg += `From: ${short(t?.fromUserAccount || '?')}\n`;
      msg += `To: ${short(t?.toUserAccount || '?')}\n`;
    } else {
      msg += `Type: ${tx?.type || 'UNKNOWN'}\n`;
    }

    msg += `Tx: ${tx?.signature || '?'}`;
    return msg;
  }

  async function tick() {
    if (running) return;
    running = true;

    try {
      const data = await getData();
      const users = Object.values(data?.users || {});
      const devices = Object.values(data?.devices || {});
      if (users.length === 0 && devices.length === 0) return;

      // wallet -> subscribers [{ chatId, filter, source }]
      const walletToSubs = new Map();

      for (const u of users) {
        const cid = u?.chatId;
        const wallets = Array.isArray(u?.wallets) ? u.wallets : [];
        const filter = u?.filter || { mode: "all", minSol: 0, minToken: 0, types: [] };

        if (!cid || wallets.length === 0) continue;

        for (const w of wallets) {
          const ww = String(w || "").trim();
          if (!ww) continue;
          if (!walletToSubs.has(ww)) walletToSubs.set(ww, []);
          walletToSubs.get(ww).push({ chatId: cid, filter, source: 'user' });
        }
      }

      // Device-based subscribers (mobile app path, no Telegram required)
      for (const d of devices) {
        const wallet = String(d?.walletAddress || '').trim();
        if (!wallet) continue;
        const filter = d?.filter || { mode: 'all', minSol: 0, minToken: 0, types: [] };
        if (!walletToSubs.has(wallet)) walletToSubs.set(wallet, []);
        walletToSubs.get(wallet).push({ chatId: null, filter, source: 'device' });
      }

      for (const [wallet, subs] of walletToSubs.entries()) {
        const newTxs = await getNewTxs(wallet);
        if (newTxs.length === 0) continue;

        const bal = await getBalanceSol(wallet);

        for (const tx of newTxs) {
          const fingerprint = makeFingerprint(wallet, tx);
          if (!shouldSendByDedup(fingerprint)) continue;

          for (const sub of subs) {
            if (!matchFilter(tx, sub.filter)) continue;
            if (!wallet) {
              console.warn('poller: skipping alert with empty wallet');
              continue;
            }
            await onAlert(sub.chatId, buildMsg(wallet, bal, tx), wallet);
          }
        }
      }
    } catch (e) {
      console.error("poller tick error:", e);
    } finally {
      running = false;
    }
  }

  tick();
  const timer = setInterval(tick, pollIntervalMs);
  return () => clearInterval(timer);
}
