import { getData } from "./storage.js";

export function startPoller({ pollIntervalMs, rpcUrl, heliusApiKey, onAlert }) {
  const lastSigByWallet = new Map();

  let running = false; // evita tick sovrapposti

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

  async function tick() {
    if (running) return;
    running = true;

    try {
      const data = await getData();
      const users = Object.values(data?.users || {});
      if (users.length === 0) return;

      // wallet -> lista chatId interessati
      const walletToChats = new Map();
      for (const u of users) {
        const cid = u?.chatId;
        const wallets = Array.isArray(u?.wallets) ? u.wallets : [];
        if (!cid || wallets.length === 0) continue;

        for (const w of wallets) {
          if (!w) continue;
          if (!walletToChats.has(w)) walletToChats.set(w, []);
          walletToChats.get(w).push(cid);
        }
      }

      for (const [wallet, chatIds] of walletToChats.entries()) {
        const newTxs = await getNewTxs(wallet);
        if (newTxs.length === 0) continue;

        const bal = await getBalanceSol(wallet);

        for (const tx of newTxs) {
          let msg = `🔔 <b>NEW ACTIVITY</b>\nWallet: <code>${wallet}</code>\n`;
          if (typeof bal === "number") msg += `Balance: <b>${bal.toFixed(4)} SOL</b>\n`;

          if (Array.isArray(tx.nativeTransfers) && tx.nativeTransfers.length) {
            const t =
              tx.nativeTransfers.find((x) => (x.amount / 1e9) >= 0.001) ||
              tx.nativeTransfers[0];

            const amt = (Number(t?.amount || 0) / 1e9).toFixed(4);
            msg += `Transfer: <b>${amt} SOL</b>\n`;
            msg += `From: <code>${t?.fromUserAccount || "?"}</code>\n`;
            msg += `To: <code>${t?.toUserAccount || "?"}</code>\n`;
          } else {
            msg += `Type: <b>${tx.type || "UNKNOWN"}</b>\n`;
          }

          msg += `Tx: <code>${tx.signature}</code>`;

          for (const chatId of chatIds) {
            await onAlert(chatId, msg);
          }
        }
      }
    } catch (e) {
      console.error("poller tick error:", e);
    } finally {
      running = false;
    }
  }

  // start
  tick();
  const timer = setInterval(tick, pollIntervalMs);

  return () => clearInterval(timer);
}
