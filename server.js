import express from "express";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML"
    })
  });
}

// health check
app.get("/", (_, res) => res.send("OK"));

// webhook
app.post("/telegram", async (req, res) => {
  try {
    const message =
      req.body.message ||
      req.body.edited_message ||
      req.body.callback_query?.message;

    const msg = message?.text || "";
    const chatId = message?.chat?.id;

    if (!chatId) return res.sendStatus(200);

    // ✅ gestisce /start e /start connect
    if (msg.startsWith("/start")) {
      await sendMessage(
        chatId,
        `✅ <b>Bot collegato!</b>\n\n` +
        `Il tuo <b>chat_id</b> è:\n<code>${chatId}</code>\n\n` +
        `👉 Incollalo nell’app:\n⚙️ Settings → ACTIVATE`
      );
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(200);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Telegram bot backend running");
});
V
