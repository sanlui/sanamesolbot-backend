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

app.get("/", (req, res) => {
  res.send("OK");
});

app.post("/telegram", async (req, res) => {
  console.log("UPDATE ARRIVED");

  try {
    const update = req.body;

    const message =
      update.message ||
      update.edited_message ||
      update.channel_post;

    if (!message) {
      console.log("NO MESSAGE FIELD");
      return res.sendStatus(200);
    }

    const chatId = message.chat?.id;
    const text = message.text || "";

    console.log("CHAT:", chatId, "TEXT:", text);

    if (text.startsWith("/start")) {
      await sendMessage(
        chatId,
        `✅ BOT OK\n\nIl tuo chat_id è:\n${chatId}`
      );
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error("ERROR:", e);
    return res.sendStatus(200);
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("BOT SERVER RUNNING")
);
