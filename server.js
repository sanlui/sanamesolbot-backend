// server.js
// ✅ Express API + Telegram webhook + Test/Activate endpoint (robusto, CORS, log, no-silent-fail)

import express from "express";
import cors from "cors";
import fetch from "node-fetch"; // ✅ compatibile anche con Node < 18
import { upsertUser, addWallet, removeWallet, listWallets } from "./storage.js";
import { startPoller } from "./poller.js";

const app = express();

// ====== Config base ======
app.use(express.json({ limit: "1mb" }));

// CORS (se frontend e backend sono su domini/porte diverse)
app.use(
  cors({
    origin: true, // oppure metti: ["https://tuodominio.com"]
    credentials: true,
  })
);
app.options("*", cors());

// Log richieste (debug: vedi subito se ACTIVATE chiama davvero l'API)
app.use((req, _res, next) => {
  console.log(`-> ${req.method} ${req.url}`);
  next();
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = process.env.RPC_URL;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 30000);

if (!BOT_TOKEN) console.error("❌ Missing BOT_TOKEN");
if (!HELIUS_API_KEY) console.error("❌ Missing HELIUS_API_KEY");
if (!RPC_URL) console.error("❌ Missing RPC_URL");

const TG_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

// ====== Utils ======
function normalizeChatId(bodyOrQuery) {
  const raw =
    bodyOrQuery?.chatId ??
    bodyOrQuery?.chat_id ??
    bodyOrQuery?.chatID ??
    bodyOrQuery?.cid;

  const chatId =
    typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";

  if (!chatId || !/^[-]?\d+$/.test(chatId)) return null;
  return chatId;
}

async function sendMessage(chatId, text) {
  if (!TG_API) {
    console.error("❌ Telegram not configured: missing BOT_TOKEN");
    return null;
  }

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

// ====== Basic ======
app.get("/", (_req, res) => res.send("OK"));
app.get("/health", (_req, res) => res.json({ ok: true }));

// ====== API per app/web ======

// Register: salva chatId (accetta chatId o chat_id)
app.post("/api/register", async (req, res) => {
  try {
    console.log("register body:", req.body);

    const chatId = normalizeChatId(req.body);
    if (!chatId) return res.status(400).json({ ok: false, error: "invalid chatId" });

    await upsertUser(chatId);
    return res.json({ ok: true, chatId });
  } catch (err) {
    console.error("❌ /api/register error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// Activate: salva chatId + manda un messaggio Telegram (end-to-end test)
app.post("/api/activate", async (req, res) => {
  try {
    console.log("activate body:", req.body);

    const chatId = normalizeChatId(req.body);
    if (!chatId) return res.status(400).json({ ok: false, error: "invalid chatId" });

    await upsertUser(chatId);

    const out = await sendMessage(chatId, "✅ Attivazione completata! Riceverai le notifiche qui.");
    return res.json({ ok: true, chatId, telegramOk: !!out?.ok });
  } catch (err) {
    console.error("❌ /api/activate error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

app.post("/api/add-wallet", async (req, res) => {
  try {
    const chatId = normalizeChatId(req.body);
    const wallet = typeof req.body?.wallet === "string" ? req.body.wallet.trim() : "";

    if (!chatId || !wallet) {
      return res.status(400).json({ ok: false, error: "chatId/wallet missing" });
    }

    const user = await addWallet(chatId, wallet);
    return res.json({ ok: true, wallets: user.wallets });
  } catch (err) {
    console.error("❌ /api/add-wallet error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

app.post("/api/remove-wallet", async (req, res) => {
  try {
    const chatId = normalizeChatId(req.body);
    const wallet = typeof req.body?.wallet === "string" ? req.body.wallet.trim() : "";

    if (!chatId || !wallet) {
      return res.status(400).json({ ok: false, error: "chatId/wallet missing" });
    }

    const user = await removeWallet(chatId, wallet);
    return res.json({ ok: true, wallets: user?.wallets || [] });
  } catch (err) {
    console.error("❌ /api/remove-wallet error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

app.get("/api/list-wallets", async (req, res) => {
  try {
    const chatId = normalizeChatId(req.query);
    if (!chatId) return res.status(400).json({ ok: false, error: "invalid chatId" });

    const wallets = await listWallets(chatId);
    return res.json({ ok: true, wallets });
  } catch (err) {
    console.error("❌ /api/list-wallets error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

// notify: endpoint “test telegram” dal frontend
app.post("/notify", async (req, res) => {
  try {
    const chatId = normalizeChatId(req.body);
    const text = typeof req.body?.text === "string" ? req.body.text : "";

    if (!chatId || !text) return res.status(400).json({ ok: false, error: "chatId/text missing" });

    const out = await sendMessage(chatId, text);
    return res.json({ ok: true, telegramOk: !!out?.ok });
  } catch (err) {
    console.error("❌ /notify error:", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
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
        await sendMessage(
          cid,
          `✅ Aggiunto!\nOra monitori:\n${u.wallets.map((w) => `• <code>${w}</code>`).join("\n")}`
        );
      }
      return res.sendStatus(200);
    }

    if (typeof msg === "string" && msg.startsWith("/remove ")) {
      const wallet = msg.replace("/remove", "").trim();
      if (!wallet) {
        await sendMessage(cid, "❌ Uso: /remove WALLET");
      } else {
        const u = await removeWallet(cid, wallet);
        await sendMessage(
          cid,
          `✅ Rimosso!\nOra monitori:\n${
            (u?.wallets || []).map((w) => `• <code>${w}</code>`).join("\n") || "(nessuno)"
          }`
        );
      }
      return res.sendStatus(200);
    }

    if (typeof msg === "string" && msg === "/list") {
      const wallets = await listWallets(cid);
      await sendMessage(
        cid,
        wallets.length
          ? `📌 Wallet monitorati:\n${wallets.map((w) => `• <code>${w}</code>`).join("\n")}`
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
    console.error("❌ telegram webhook error:", err);
    return res.sendStatus(200);
  }
});

// ====== Start server + Poller H24 ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);

  if (BOT_TOKEN && HELIUS_API_KEY && RPC_URL) {
    startPoller({
      pollIntervalMs: POLL_INTERVAL_MS,
      rpcUrl: RPC_URL,
      heliusApiKey: HELIUS_API_KEY,
      onAlert: async (chatId, msg) => {
        await sendMessage(String(chatId), String(msg));
      },
    });
    console.log("✅ Poller started:", POLL_INTERVAL_MS, "ms");
  } else {
    console.log("⚠️ Poller NOT started (missing env vars)");
  }
});
