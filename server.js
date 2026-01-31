import express from "express";
import { upsertUser, addWallet, removeWallet, listWallets } from "./storage.js";
import { startPoller } from "./poller.js";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = process.env.RPC_URL;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 30000); // 30s default

if (!BOT_TOKEN) console.error("❌ Missing BOT_TOKEN");
if (!HELIUS_API_KEY) console.error("❌ Missing HELIUS_API_KEY");
if (!RPC_URL) console.error("❌ Missing RPC_URL");

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  const resp = await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.ok) {
    console.error("❌ Telegram sendMessage failed:", resp.status, data);
  }
  return data;
}

app.get("/", (_, res) => res.send("OK"));
app.get("/health", (_, res) => res.json({ ok: true }));

// ====== API per app/web ======
app.post("/api/register", async (req, res) => {
  const { chatId } = req.body || {};
  if (!chatId) return res.status(400).json({ ok: false, error: "chatId missing" });
  await upsertUser(String(chatId));
  res.json({ ok: true });
});

app.post("/api/add-wallet", async (req, res) => {
  const { chatId, wallet } = req.body || {};
  if (!chatId || !wallet) return res.status(400).json({ ok: false, error: "chatId/wallet missing" });
  const user = await addWallet(String(chatId), String(wallet));
  res.json({ ok: true, wallets: user.wallets });
});

app.post("/api/remove-wallet", async (req, res) => {
  const { chatId, wallet } = req.body || {};
  if (!chatId || !wallet) return res.status(400).json({ ok: false, error: "chatId/wallet missing" });
  const user = await removeWallet(String(chatId), String(wallet));
  res.json({ ok: true, wallets: user?.wallets || [] });
});

app.get("/api/list-wallets", async (req, res) => {
  const chatId = req.query.chatId;
  if (!chatId) return res.status(400).json({ ok: false, error: "chatId missing" });
  const wallets = await listWallets(String(chatId));
  res.json({ ok: true, wallets });
});

// endpoint “notify” per test dal frontend
app.post("/notify", async (req, res) => {
  const { chatId, text } = req.body || {};
  if (!chatId || !text) return res.status(400).json({ ok: false, error: "chatId/text missing" });
  await sendMessage(String(chatId), String(text));
  res.json({ ok: true });
});

// ====== Telegram Webhook ======
app.post("/telegram", async (req, res) => {
  try {
    const msg = req.body?.message?.text;
    const chatId = req.body?.message?.chat?.id;

    if (!chatId) return res.sendStatus(200);

    const cid = String(chatId);
    await upsertUser(cid);

    if (typeof msg === "string" && msg.startsWith("/start")) {
      await sendMessage(
        cid,
        `✅ Bot collegato!\n\nIl tuo <b>chat_id</b> è:\n<b>${cid}</b>\n\nComandi:\n/add WALLET\n/remove WALLET\n/list\n/test`
      );
      return res.sendStatus(200);
    }

    if (typeof msg === "string" && msg.startsWith("/add ")) {
      const wallet = msg.replace("/add", "").trim();
      if (!wallet) {
        await sendMessage(cid, "❌ Uso: /add WALLET");
      } else {
        const u = await addWallet(cid, wallet);
        await sendMessage(cid, `✅ Aggiunto!\nOra monitori:\n${u.wallets.map(w => `• <code>${w}</code>`).join("\n")}`);
      }
      return res.sendStatus(200);
    }

    if (typeof msg === "string" && msg.startsWith("/remove ")) {
      const wallet = msg.replace("/remove", "").trim();
      if (!wallet) {
        await sendMessage(cid, "❌ Uso: /remove WALLET");
      } else {
        const u = await removeWallet(cid, wallet);
        await sendMessage(cid, `✅ Rimosso!\nOra monitori:\n${(u?.wallets || []).map(w => `• <code>${w}</code>`).join("\n") || "(nessuno)"}`);
      }
      return res.sendStatus(200);
    }

    if (typeof msg === "string" && msg === "/list") {
      const wallets = await listWallets(cid);
      await sendMessage(
        cid,
        wallets.length
          ? `📌 Wallet monitorati:\n${wallets.map(w => `• <code>${w}</code>`).join("\n")}`
          : "📭 Nessun wallet in monitoraggio. Usa /add WALLET"
      );
      return res.sendStatus(200);
    }

    if (typeof msg === "string" && msg === "/test") {
      await sendMessage(cid, "✅ TEST OK — se vedi questo messaggio, il bot funziona.");
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("telegram webhook error:", err);
    return res.sendStatus(200);
  }
});

// ====== Start server + Poller H24 ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);

  // Avvio poller solo se env ok
  if (BOT_TOKEN && HELIUS_API_KEY && RPC_URL) {
    startPoller({
      pollIntervalMs: POLL_INTERVAL_MS,
      rpcUrl: RPC_URL,
      heliusApiKey: HELIUS_API_KEY,
      onAlert: async (chatId, msg) => {
        await sendMessage(chatId, msg);
      }
    });
    console.log("✅ Poller started:", POLL_INTERVAL_MS, "ms");
  } else {
    console.log("⚠️ Poller NOT started (missing env vars)");
  }
});
