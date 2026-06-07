require("dotenv").config();

const express = require("express");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── EXPRESS MIDDLEWARE ───────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "webapp")));

// ─── DASHBOARD API ────────────────────────────────────────────────
const { getHistory, getStats } = require("./db/store");

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "webapp", "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/api/history/:userId", (req, res) => {
  const history = getHistory(req.params.userId);
  res.json({ success: true, data: history });
});

app.get("/api/stats/:userId", (req, res) => {
  const stats = getStats(req.params.userId);
  res.json({ success: true, data: stats });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// ─── TELEGRAM BOT ─────────────────────────────────────────────────
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    autoStart: true,
    interval: 300,
    params: { timeout: 10 }
  }
});

// ─── HANDLERS ─────────────────────────────────────────────────────
require("./handlers/start")(bot);
require("./handlers/download")(bot);
require("./handlers/callback")(bot);

// ─── ERROR HANDLER ────────────────────────────────────────────────
bot.on("polling_error", (error) => {
  console.log("❌ Polling Error:", error.message);
});

// ─── GRACEFUL STOP ────────────────────────────────────────────────
const graceful = async (sig) => {
  console.log(`🛑 ${sig} received`);
  try { await bot.stopPolling(); } catch (e) { console.log(e.message); }
  process.exit(0);
};

process.on("SIGINT",  () => graceful("SIGINT"));
process.on("SIGTERM", () => graceful("SIGTERM"));

console.log("🚀 Amertak Downloader Bot Running...");
