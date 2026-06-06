require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

const PORT = process.env.PORT || 3000;

// =========================
// EXPRESS SERVER
// =========================
app.get("/", (req, res) => {
  res.send("✅ Telegram Bot Running");
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// =========================
// TELEGRAM BOT
// =========================
const bot = new TelegramBot(
  process.env.BOT_TOKEN,
  {
    polling: {
      autoStart: true,
      interval: 300,
      params: {
        timeout: 10
      }
    }
  }
);

// =========================
// HANDLERS
// =========================
require("./handlers/start")(bot);
require("./handlers/download")(bot);

// =========================
// ERROR HANDLER
// =========================
bot.on("polling_error", (error) => {
  console.log("❌ Polling Error:", error.message);
});

// =========================
// GRACEFUL STOP
// =========================
process.on("SIGINT", async () => {
  console.log("🛑 SIGINT received");
  
  try {
    await bot.stopPolling();
  } catch (e) {
    console.log(e.message);
  }
  
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received");
  
  try {
    await bot.stopPolling();
  } catch (e) {
    console.log(e.message);
  }
  
  process.exit(0);
});

// =========================
// START LOG
// =========================
console.log("🚀 Telegram Bot Running...");