import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const app = express();
app.use(express.json());

// =====================
// ENV
// =====================
const BOT_TOKEN = process.env.BOT_TOKEN;              // es: 8243...Et8
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;    // es: 88b6...
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN env");
if (!HELIUS_API_KEY) throw new Error("Missing HELIUS_API_KEY env");

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// =====================
// SIMPLE FILE DB
// =====================
const DB_PATH = path.join(process.cwd(), "db.json");

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return {
      links: {},     // code -> { chatId, linkedAt }
      watches: []    // { chatId, wallet, alerts, lastSignature, createdAt }
    };
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}
function makeCode() {
  return crypto.randomBytes(10).toString("hex"); // 20 chars
}

// =====================
// HELPERS
// =====================
async function sendMessage(chatId, text) {
  const resp = await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.ok) {
    console.error("TG send failed:", resp.status, data);
  }
}

function parseStartCode(text) {
  // "/start" oppure "/start CODE"
  if (!text) return null;
  const parts = text.trim().split(/\s+/);
  if (parts[0] !== "/start") return null;
  return parts[1] || null;
}

// =====================
// HEALTH
// =====================
app.get("/", (_, res) => res.send("OK"));

// =====================
// 1) APP: crea un CODE
// =====================
// L'app chiama /api/new-link e ottiene { code, botUrl }
app.post("/api/new-link", (req, res) => {
  const db = loadDB();
  const code = makeCode();

  // pre-registriamo il code (non ancora collegato)
  db.links[code] = { chatId: null, linkedAt: null, createdAt: Date.now() };
  saveDB(db);

  // il frontend usa questo per aprire Telegram
  // username del bot lo metti nel frontend (perché qui non lo sappiamo)
  res.json({ code });
});

// =====================
// 2) APP: controlla se CODE è collegato
// =====================
app.get("/api/link-status/:code", (req, res) => {
  const db = loadDB();
  const code = req.params.code;
  const link = db.links[code];
  if (!link) return res.status(404).json({ ok: false, error: "code_not_found" });

  res.json({
    ok: true,
    linked: !!link.chatId,
    chatId: link.chatId || null
  });
});

// =====================
// 3) APP: salva wallet da monitorare
// =====================
app.post("/api/watch", (req, res) => {
  const { chatId, wallet, alerts } = req.body || {};
  if (!chatId || !wallet) return res.status(400).json({ ok: false, error: "missing_chatId_or_wallet" });

  const db = loadDB();

  // evita duplicati
  const exists = db.watches.some(w => w.chatId === String(chatId) && w.wallet === wallet);
  if (exists) return res.json({ ok: true, already: true });

  db.watches.push({
    chatId: String(chatId),
    wallet,
    alerts: alerts || { in: true, out: true, nft: false },
    lastSignature: null,
    createdAt: Date.now()
  });

  saveDB(db);
  res.json({ ok: true });
});

// opzionale: lista watchers (debug)
app.get("/api/watches/:chatId", (req, res) => {
  const db = loadDB();
  const chatId = String(req.params.chatId);
  res.json({ ok: true, watches: db.watches.filter(w => w.chatId === chatId) });
});

// =====================
// TELEGRAM WEBHOOK
// =====================
app.post("/telegram", async (req, res) => {
  try {
    const msgText = req.body?.message?.text || "";
    const chatId = req.body?.message?.chat?.id;

    if (!chatId) return res.sendStatus(200);

    const code = parseStartCode(msgText);

    // se l'utente fa /start CODE -> collegamento automatico
    if (code) {
      const db = loadDB();
      if (db.links[code]) {
        db.links[code].chatId = String(chatId);
        db.links[code].linkedAt = Date.now();
        saveDB(db);

        await sendMessage(
          chatId,
          `✅ Collegato!\n\nOra puoi tornare nell’app: il collegamento è automatico.\n\n(chat_id: <code>${chatId}</code>)`
        );
      } else {
        await sendMessage(chatId, `❌ Codice non valido.\nTorna nell’app e rifai “OPEN BOT”.`);
      }
    } else if (msgText === "/start") {
      // /start senza code -> spiegazione
      await sendMessage(
        chatId,
        `👋 Ciao! Per collegarti apri il bot dall’app con “OPEN BOT”.\nCosì arrivo con un codice automatico.`
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

// =====================
// H24 MONITOR (polling)
// =====================
// Nota: qui è polling semplice. Per produzione: queue + scaling + db vero.
async function heliusRecentTx(wallet) {
  const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${HELIUS_API_KEY}&limit=10`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function monitorLoop() {
  while (true) {
    try {
      const db = loadDB();

      for (const w of db.watches) {
        const txs = await heliusRecentTx(w.wallet);
        if (!txs.length) continue;

        const latestSig = txs[0].signature;

        // prima volta: inizializza firma e non spammare
        if (!w.lastSignature) {
          w.lastSignature = latestSig;
          continue;
        }

        // trova nuove tx fino a lastSignature
        const newTxs = [];
        for (const tx of txs) {
          if (tx.signature === w.lastSignature) break;
          newTxs.push(tx);
        }

        if (newTxs.length) {
          // manda una notifica semplice (poi puoi fare parsing IN/OUT/NFT come nel frontend)
          await sendMessage(
            w.chatId,
            `🔔 Nuove attività su wallet:\n<code>${w.wallet}</code>\nNuove tx: <b>${newTxs.length}</b>`
          );

          w.lastSignature = latestSig;
        }

        // piccola pausa per non martellare
        await sleep(250);
      }

      saveDB(db);
    } catch (e) {
      console.error("Monitor loop error:", e);
    }

    // ogni 30s (puoi cambiare)
    await sleep(30_000);
  }
}

monitorLoop();

// =====================
app.listen(PORT, () => console.log("Backend running on", PORT));
