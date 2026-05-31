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

// ========================
// ENV
// ========================
const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
    console.error("BOT_TOKEN missing");
    process.exit(1);
}

// ========================
// API CONFIG
// ========================
const API_URL =
    "https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink";

const API_KEY =
    "67b70b3ec3mshf2ea79c89077f81p1e76a9jsn19b5d6afc545";

// ========================
// BOT INIT
// ========================
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("🤖 Bot running...");

// ========================
// EXPRESS (optional backend)
// ========================
const app = express();

app.get("/", (_, res) => res.send("Downloader Bot Running"));
app.get("/health", (_, res) =>
    res.json({ status: "ok", uptime: process.uptime() })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT);

// ========================
// HELPERS
// ========================
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
// UI BUILDER (DARK CARD)
// ========================
function buildUI(data) {
    return `
━━━━━━━━━━━━━━━━━━━━
🎬 VIDEO DOWNLOADER
━━━━━━━━━━━━━━━━━━━━

📌 Title: ${data.title || "Untitled"}
👤 Author: ${data.author || "Unknown"}

━━━━━━━━━━━━━━━━━━━━
📥 DOWNLOAD READY
━━━━━━━━━━━━━━━━━━━━
`;
}

// ========================
// LOADER
// ========================
function showLoader(chatId) {
    return bot.sendMessage(chatId, "⏳ Processing...");
}

// ========================
// ERROR
// ========================
function showError(chatId, msg) {
    return bot.sendMessage(chatId, `❌ ${msg}`);
}

// ========================
// FETCH API
// ========================
async function fetchVideo(chatId, url) {
    let loading;

    try {
        loading = await showLoader(chatId);

        const res = await axios.post(
            API_URL,
            { url },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-RapidAPI-Host":
                        "social-download-all-in-one.p.rapidapi.com",
                    "X-RapidAPI-Key": API_KEY,
                },
            }
        );

        const data = res.data;

        if (!data || data.error) {
            throw new Error(data.message || "API error");
        }

        if (loading) {
            bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        }

        await sendResult(chatId, data);

    } catch (err) {
        if (loading) {
            bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        }

        showError(chatId, err.message);
    }
}

// ========================
// RESULT + WEBAPP BUTTON (FULL UI BACKGROUND)
// ========================
async function sendResult(chatId, data) {

    if (data.thumbnail) {
        await bot.sendPhoto(chatId, data.thumbnail);
    }

    // DARK CARD MESSAGE
    await bot.sendMessage(chatId, buildUI(data));

    // INFO LIST
    let info = "";

    if (data.medias?.length) {
        data.medias.forEach((m, i) => {
            info +=
                `#${i + 1}\n` +
                `• ${m.type.toUpperCase()} • ${m.extension.toUpperCase()}\n` +
                `• ${formatQuality(m.quality)}\n` +
                `• ${formatFileSize(m.data_size)}\n\n`;
        });
    }

    await bot.sendMessage(chatId, info || "No media found");

    // =========================
    // 🔥 WEBAPP BUTTON (REAL BACKGROUND UI)
    // =========================
    const buttons = (data.medias || []).map((m, i) => [
        {
            text: `⬇ Download ${i + 1}`,
            web_app: {
                url: `https://tools-amertak.vercel.app/download?url=${encodeURIComponent(
                    m.url
                )}`,
            },
        },
    ]);

    await bot.sendMessage(chatId, "👇 Open Downloader UI", {
        reply_markup: {
            inline_keyboard: buttons,
        },
    });
}

// ========================
// START
// ========================
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        "👋 Send any video URL to download"
    );
});

// ========================
// INPUT HANDLER
// ========================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    await fetchVideo(chatId, text.trim());
});