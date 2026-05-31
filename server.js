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
// API CONFIG (YOUR KEY ADDED)
// ========================

const API_URL =
    "https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink";

const API_KEY =
    "67b70b3ec3mshf2ea79c89077f81p1e76a9jsn19b5d6afc545";

// ========================
// BOT
// ========================

const bot = new TelegramBot(TOKEN, { polling: true });

// ========================
// EXPRESS
// ========================

const app = express();
app.get("/", (_, res) => res.send("Bot Running"));
app.listen(process.env.PORT || 3000);

// ========================
// STATE
// ========================

const userStates = {};

// ========================
// HELPERS
// ========================

function formatQuality(q) {
    if (!q) return "Unknown";
    return q.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function formatSize(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// ========================
// PROGRESS BAR (MESSAGE EDIT)
// ========================

async function progress(chatId, msgId) {
    const bar = [
        "⬜⬜⬜⬜⬜ 0%",
        "🟩⬜⬜⬜⬜ 20%",
        "🟩🟩⬜⬜⬜ 40%",
        "🟩🟩🟩⬜⬜ 60%",
        "🟩🟩🟩🟩⬜ 80%",
        "🟩🟩🟩🟩🟩 100%"
    ];

    for (let i = 0; i < bar.length; i++) {
        await new Promise(r => setTimeout(r, 400));

        await bot.editMessageText(
            `📥 Downloading...\n\n${bar[i]}`,
            { chat_id: chatId, message_id: msgId }
        ).catch(() => {});
    }
}

// ========================
// FETCH VIDEO
// ========================

async function fetchVideo(chatId, url) {
    let loading;

    try {
        loading = await bot.sendMessage(chatId, "⏳ Processing...");

        const res = await axios.post(API_URL, { url }, {
            headers: {
                "Content-Type": "application/json",
                "X-RapidAPI-Host": "social-download-all-in-one.p.rapidapi.com",
                "X-RapidAPI-Key": API_KEY
            }
        });

        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        return res.data;

    } catch (err) {
        console.error(err.message);

        if (loading) {
            await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        }

        await bot.sendMessage(chatId, "❌ API Error");
        return null;
    }
}

// ========================
// FIND MEDIA (KEEP LOGIC)
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
// SEND DIRECT FILE (NO WEB REDIRECT)
// ========================

async function sendFile(chatId, media, data) {

    const msg = await bot.sendMessage(chatId, "📥 Starting... ⬜⬜⬜⬜⬜ 0%");

    await progress(chatId, msg.message_id);

    try {
        const stream = await axios.get(media.url, { responseType: "stream" });

        if (media.type?.toLowerCase() === "audio") {
            await bot.sendAudio(chatId, stream.data, {
                caption: `🎵 ${data.title || "Audio"}`
            });
        } else if (media.type?.toLowerCase() === "video") {
            await bot.sendVideo(chatId, stream.data, {
                caption: `🎬 ${data.title || "Video"}`
            });
        } else {
            await bot.sendDocument(chatId, stream.data, {
                caption: `📁 ${data.title || "File"}`
            });
        }

        await bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    } catch (err) {
        console.error(err.message);
        await bot.sendMessage(chatId, "❌ Download failed");
    }
}

// ========================
// START (NO KEYBOARD → MARKDOWN STYLE)
// ========================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(chatId,
`🎬 *AMERTAK DOWNLOADER*

Send video link to start

🔵 Tools: https://tools-amertak.vercel.app`,
{
    parse_mode: "Markdown",
    reply_markup: {
        inline_keyboard: [
            [
                {
                    text: "🔵 Tools",
                    web_app: {
                        url: "https://tools-amertak.vercel.app"
                    }
                }
            ]
        ]
    }
});
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

        // ========================
        // MARKDOWN STYLE (NO BUTTON)
        // ========================

        return bot.sendMessage(chatId,
`📂 *Choose format*

👉 send:
- video
- image
- mp3`,
{
    parse_mode: "Markdown"
});
    }

    // ========================
    // MP3
    // ========================

    if (text.toLowerCase().includes("mp3")) {
        const data = userStates[chatId]?.data;
        if (!data) return;

        const media = findMedia(data, "mp3");
        if (!media) return bot.sendMessage(chatId, "❌ Not found");

        return sendFile(chatId, media, data);
    }

    // ========================
    // VIDEO
    // ========================

    if (text.toLowerCase().includes("video")) {
        const data = userStates[chatId]?.data;
        if (!data) return;

        const media = findMedia(data, "video");
        if (!media) return bot.sendMessage(chatId, "❌ Not found");

        return sendFile(chatId, media, data);
    }

    // ========================
    // IMAGE
    // ========================

    if (text.toLowerCase().includes("image")) {
        const data = userStates[chatId]?.data;
        if (!data) return;

        const media = findMedia(data, "image");
        if (!media) return bot.sendMessage(chatId, "❌ Not found");

        return sendFile(chatId, media, data);
    }

    return bot.sendMessage(chatId, "📎 Send valid URL");
});