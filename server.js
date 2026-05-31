require("dotenv").config();

// ========================
// CRASH GUARDS
// ========================
process.on("uncaughtException", (err) => {
    console.error("uncaughtException:", err.message || err);
});

process.on("unhandledRejection", (err) => {
    console.error("unhandledRejection:", err?.message || err);
});

// ========================
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const fs = require("fs");

// ========================
// ENV
// ========================
const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
    console.error("BOT_TOKEN missing");
    process.exit(1);
}

// ========================
// API CONFIG (from frontend)
// ========================
const API_URL =
    "https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink";

const API_KEY =
    "67b70b3ec3mshf2ea79c89077f81p1e76a9jsn19b5d6afc545";

// ========================
// BOT INIT (advanced structure)
// ========================
let bot;
let isRestarting = false;

async function createBot() {
    if (isRestarting) return;
    isRestarting = true;

    if (bot) {
        try { await bot.stopPolling(); } catch (_) {}
        bot = null;
    }

    bot = new TelegramBot(TOKEN, {
        polling: {
            autoStart: true,
            interval: 500,
            params: {
                timeout: 10,
                allowed_updates: ["message"]
            }
        }
    });

    registerHandlers();

    isRestarting = false;
    console.log("Bot started");
}

// ========================
// EXPRESS
// ========================
const app = express();

app.get("/", (_, res) => res.send("Social Downloader Bot Running"));
app.get("/health", (_, res) =>
    res.json({ status: "ok", uptime: process.uptime() })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running:", PORT));

// ========================
// SIMPLE USER DB
// ========================
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const USERS_FILE = "./data/users.json";

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

function loadUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUser(user) {
    const users = loadUsers();
    if (!users.find((u) => u.id === user.id)) {
        users.push(user);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
}

// ========================
// HELPERS (frontend mapped)
// ========================
function showLoader(chatId) {
    return bot.sendMessage(chatId, "⏳ Loading...");
}

function showError(chatId, message) {
    return bot.sendMessage(chatId, `❌ ${message}`);
}

function formatQuality(q) {
    if (!q) return "Unknown";
    return q
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function formatFileSize(bytes) {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
        parseFloat((bytes / Math.pow(k, i)).toFixed(2)) +
        " " +
        sizes[i]
    );
}

// ========================
// CORE FETCH (frontend logic converted)
// ========================
async function fetchVideoInfo(chatId, videoUrl) {
    let loadingMsg;

    try {
        loadingMsg = await showLoader(chatId);

        const response = await axios.post(
            API_URL,
            { url: videoUrl },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-RapidAPI-Host":
                        "social-download-all-in-one.p.rapidapi.com",
                    "X-RapidAPI-Key": API_KEY,
                },
            }
        );

        const data = response.data;

        if (!data || data.error) {
            throw new Error(data.message || "API error");
        }

        await displayVideoInfo(chatId, data);

    } catch (err) {
        console.error(err.message);
        await showError(chatId, err.message);
    } finally {
        if (loadingMsg) {
            bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
        }
    }
}

// ========================
// DISPLAY (frontend UI → Telegram)
// ========================
async function displayVideoInfo(chatId, data) {
    const title = data.title || "Untitled Video";
    const author = data.author || "Unknown";

    if (data.thumbnail) {
        await bot.sendPhoto(chatId, data.thumbnail);
    }

    let msg =
        `🎬 ${title}\n` +
        `👤 By: ${author}\n\n` +
        `📥 Download Options:\n\n`;

    if (data.medias && data.medias.length > 0) {
        data.medias.forEach((m, i) => {
            msg +=
                `#${i + 1}\n` +
                `🎞 ${m.type.toUpperCase()} • ${m.extension.toUpperCase()}\n` +
                `⚡ ${formatQuality(m.quality)}\n` +
                `📦 ${formatFileSize(m.data_size)}\n` +
                `🔗 ${m.url}\n\n`;
        });
    } else {
        msg += "No download options available.";
    }

    await bot.sendMessage(chatId, msg);

    if (data.medias?.length) {
        const buttons = data.medias.map((m) => [
            { text: "⬇️ Download", url: m.url },
        ]);

        await bot.sendMessage(chatId, "👇 Download:", {
            reply_markup: { inline_keyboard: buttons },
        });
    }
}

// ========================
// HANDLERS
// ========================
function registerHandlers() {

    // START
    bot.onText(/\/start/, async (msg) => {
        saveUser({
            id: msg.from.id,
            name: msg.from.first_name,
            username: msg.from.username || "none",
        });

        bot.sendMessage(
            msg.chat.id,
            "👋 Send video URL (TikTok / FB / IG / etc)"
        );
    });

    // MAIN INPUT (like frontend click + enter)
    bot.on("message", async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text || text.startsWith("/")) return;

        await fetchVideoInfo(chatId, text.trim());
    });
}

// ========================
// START BOT
// ========================
createBot();