import { getData } from "./storage.js";

export function startPoller({ pollIntervalMs, rpcUrl, heliusApiKey, onAlert }) {
  const lastSigByWallet = new Map();
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

  function buildMsg(wallet, bal, tx) {
    let msg = `🔔 <b>NEW ACTIVITY</b>\nWallet: <code>${wallet}</code>\n`;
    if (typeof bal === "number") msg += `Balance: <b>${bal.toFixed(4)} SOL</b>\n`;

    if (Array.isArray(tx?.nativeTransfers) && tx.nativeTransfers.length) {
      const t =
        tx.nativeTransfers.find((x) => (Number(x?.amount || 0) / 1e9) >= 0.001) ||
        tx.nativeTransfers[0];

      const amt = (Number(t?.amount || 0) / 1e9).toFixed(4);
      msg += `Transfer: <b>${amt} SOL</b>\n`;
      msg += `From: <code>${t?.fromUserAccount || "?"}</code>\n`;
      msg += `To: <code>${t?.toUserAccount || "?"}</code>\n`;
    } else if (Array.isArray(tx?.tokenTransfers) && tx.tokenTransfers.length) {
      const t = tx.tokenTransfers[0];
      msg += `SPL: <b>${t?.tokenAmount ?? "?"}</b>\n`;
      msg += `Mint: <code>${t?.mint || "?"}</code>\n`;
      msg += `From: <code>${t?.fromUserAccount || "?"}</code>\n`;
      msg += `To: <code>${t?.toUserAccount || "?"}</code>\n`;
    } else {
      msg += `Type: <b>${tx?.type || "UNKNOWN"}</b>\n`;
    }

    msg += `Tx: <code>${tx?.signature || "?"}</code>`;
    return msg;
  }

  async function tick() {
    if (running) return;
    running = true;

    try {
      const data = await getData();
      const users = Object.values(data?.users || {});
      if (users.length === 0) return;

      // wallet -> lista subscriber {chatId, filter}
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
          walletToSubs.get(ww).push({ chatId: cid, filter });
        }
      }

      for (const [wallet, subs] of walletToSubs.entries()) {
        const newTxs = await getNewTxs(wallet);
        if (newTxs.length === 0) continue;

        const bal = await getBalanceSol(wallet);

        for (const tx of newTxs) {
          // manda solo agli utenti i cui filtri matchano
          for (const sub of subs) {
            if (!matchFilter(tx, sub.filter)) continue;
            await onAlert(sub.chatId, buildMsg(wallet, bal, tx));
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
