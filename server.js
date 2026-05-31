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
// MODULES
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
// BOT
// ========================

const bot = new TelegramBot(TOKEN, {
    polling: true
});

console.log("Bot started");

// ========================
// EXPRESS
// ========================

const app = express();

app.get("/", (_, res) => {
    res.send("Amertak Downloader Bot Running");
});

app.get("/health", (_, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime()
    });
});

app.listen(process.env.PORT || 3000);

// ========================
// STORAGE
// ========================

const userStates = {};

// ========================
// HELPERS
// ========================

function formatQuality(q) {
    if (!q) return "Unknown";
    return q
        .split("_")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function formatFileSize(bytes) {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ========================
// INLINE KEYBOARDS (REPLACEMENT)
// ========================

function toolsWebApp() {
    return {
        inline_keyboard: [
            [
                {
                    text: "🔵 Open Tools",
                    web_app: {
                        url: "https://tools-amertak.vercel.app"
                    }
                }
            ],
            [
                {
                    text: "🏠 Home",
                    callback_data: "home"
                }
            ]
        ]
    };
}

function typeMenu() {
    return {
        inline_keyboard: [
            [
                { text: "🎬 Video", callback_data: "video" },
                { text: "🖼 Image", callback_data: "image" }
            ],
            [
                { text: "🎵 MP3", callback_data: "mp3" }
            ],
            [
                {
                    text: "🔵 Tools",
                    web_app: {
                        url: "https://tools-amertak.vercel.app"
                    }
                }
            ]
        ]
    };
}

function downloadMenu(url) {
    return {
        inline_keyboard: [
            [
                {
                    text: "📥 Download",
                    url: url
                }
            ],
            [
                {
                    text: "🔁 Back",
                    callback_data: "back"
                }
            ]
        ]
    };
}

// ========================
// FETCH VIDEO
// ========================

async function fetchVideo(chatId, url) {
    let loading;

    try {
        loading = await bot.sendMessage(chatId, "⏳ កំពុងដំណើរការ...");

        const response = await axios.post(
            API_URL,
            { url },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-RapidAPI-Host":
                        "social-download-all-in-one.p.rapidapi.com",
                    "X-RapidAPI-Key": API_KEY
                }
            }
        );

        if (loading) {
            await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        }

        return response.data;

    } catch (err) {
        console.error(err.message);

        if (loading) {
            await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        }

        await bot.sendMessage(chatId, "❌ Can't fetch URL.");
        return null;
    }
}

// ========================
// MEDIA FINDER
// ========================

function findMedia(data, type) {
    if (!data?.medias) return null;

    if (type === "video") {
        return data.medias.find(m => m.type?.toLowerCase() === "video");
    }

    if (type === "mp3") {
        return data.medias.find(m => m.type?.toLowerCase() === "audio");
    }

    if (type === "image") {
        return data.medias.find(m =>
            m.extension?.toLowerCase() === "jpg" ||
            m.extension?.toLowerCase() === "png"
        );
    }

    return null;
}

// ========================
// SEND RESULT
// ========================

async function sendDownload(chatId, media, data) {

    if (data.thumbnail) {
        await bot.sendPhoto(chatId, data.thumbnail, {
            caption:
`🎉 Ready

📌 ${data.title || "Untitled"}

⚡ ${formatQuality(media.quality)}

💾 ${formatFileSize(media.data_size)}`
        });
    }

    await bot.sendMessage(chatId, "📥 Download Ready", {
        reply_markup: downloadMenu(media.url)
    });

    userStates[chatId].downloadUrl = media.url;
}

// ========================
// START
// ========================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
        chatId,
`🎬 AMERTAK DOWNLOADER

Send a video link to start`,
        {
            reply_markup: typeMenu()
        }
    );
});

// ========================
// CALLBACK HANDLER
// ========================

bot.on("callback_query", async (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

    await bot.answerCallbackQuery(query.id);

    if (data === "video" || data === "image" || data === "mp3") {
        const state = userStates[chatId];
        if (!state?.data) {
            return bot.sendMessage(chatId, "❌ Send URL first.");
        }

        const media = findMedia(state.data, data);
        if (!media) {
            return bot.sendMessage(chatId, "❌ Not found.");
        }

        return sendDownload(chatId, media, state.data);
    }

    if (data === "home") {
        return bot.sendMessage(chatId, "🏠 Home", {
            reply_markup: typeMenu()
        });
    }

    if (data === "back") {
        return bot.sendMessage(chatId, "📂 Choose type", {
            reply_markup: typeMenu()
        });
    }
});

// ========================
// MESSAGE HANDLER
// ========================

bot.on("message", async (msg) => {

    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    // ========================
    // URL DETECT
    // ========================

    if (text.startsWith("http")) {

        const data = await fetchVideo(chatId, text);
        if (!data) return;

        userStates[chatId] = { data };

        if (data.thumbnail) {
            await bot.sendPhoto(chatId, data.thumbnail, {
                caption: `📌 ${data.title || "Untitled"}`
            });
        }

        return bot.sendMessage(chatId, "📂 Select type", {
            reply_markup: typeMenu()
        });
    }

    return bot.sendMessage(chatId, "📎 Send valid URL");
});