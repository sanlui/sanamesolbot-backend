import { getData } from "./storage.js";

export function startPoller({
  pollIntervalMs,
  rpcUrl,
  heliusApiKey,
  onAlert,
}) {
  // per ogni wallet memorizziamo l’ultima signature vista
  const lastSigByWallet = new Map();

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
      const data = await r.json();
      return (data.result?.value || 0) / 1e9;
    } catch {
      return null;
    }
  }

  async function getNewTxs(address) {
    try {
      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusApiKey}&limit=20`;
      const r = await fetch(url);
      if (!r.ok) return [];

      const txs = await r.json();
      if (!Array.isArray(txs) || txs.length === 0) return [];

      const latest = txs[0]?.signature;
      const last = lastSigByWallet.get(address);

      // prima volta: settiamo solo il “puntatore” e non spammare
      if (!last) {
        lastSigByWallet.set(address, latest);
        return [];
      }

      const newTxs = [];
      for (const tx of txs) {
        if (tx.signature === last) break;
        newTxs.push(tx);
      }

      // aggiorna puntatore
      lastSigByWallet.set(address, latest);
      return newTxs;
    } catch {
      return [];
    }
  }

  async function tick() {
    try {
      const data = await getData();
      const users = Object.values(data.users || {});
      if (users.length === 0) return;

      // wallet -> lista chatId interessati
      const walletToChats = new Map();
      for (const u of users) {
        for (const w of (u.wallets || [])) {
          if (!walletToChats.has(w)) walletToChats.set(w, []);
          walletToChats.get(w).push(u.chatId);
        }
      }

      for (const [wallet, chatIds] of walletToChats.entries()) {
        const newTxs = await getNewTxs(wallet);
        if (newTxs.length === 0) continue;

        // crea messaggio “bello” (semplice)
        const bal = await getBalanceSol(wallet);
        for (const tx of newTxs) {
          // prova a capire transfer sol
          let msg = `🔔 <b>NEW ACTIVITY</b>\nWallet: <code>${wallet}</code>\n`;
          if (typeof bal === "number") msg += `Balance: <b>${bal.toFixed(4)} SOL</b>\n`;

          if (Array.isArray(tx.nativeTransfers) && tx.nativeTransfers.length) {
            // prendi il primo “grande”
            const t = tx.nativeTransfers.find(x => (x.amount / 1e9) >= 0.001) || tx.nativeTransfers[0];
            const amt = (t.amount / 1e9).toFixed(4);
            msg += `Transfer: <b>${amt} SOL</b>\n`;
            msg += `From: <code>${t.fromUserAccount || "?"}</code>\n`;
            msg += `To: <code>${t.toUserAccount || "?"}</code>\n`;
          } else {
            msg += `Type: <b>${tx.type || "UNKNOWN"}</b>\n`;
          }

          msg += `Tx: <code>${tx.signature}</code>`;

          // manda a tutti gli utenti che seguono quel wallet
          for (const chatId of chatIds) {
            await onAlert(chatId, msg);
          }
        }
      }
    } catch (e) {
      console.error("poller tick error:", e);
    }
  }

  // start
  tick();
  const timer = setInterval(tick, pollIntervalMs);

  return () => clearInterval(timer);
}
