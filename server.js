import express from "express";

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

app.get("/", (_, res) => res.send("OK"));

app.post("/telegram", async (req, res) => {
  try {
    const msg = req.body.message?.text;
    const chatId = req.body.message?.chat?.id;

    if (!chatId) return res.sendStatus(200);

    if (msg === "/start") {
      await sendMessage(
        chatId,
        `✅ Bot collegato!\n\nIl tuo chat_id è:\n${chatId}\n\n👉 Incollalo nell’app:\n⚙️ Settings → ACTIVATE`
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Telegram bot backend running")
);
