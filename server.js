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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});

// ========================
// TEMP USER STORAGE
// ========================

const userStates = {};

// ========================
// HELPERS
// ========================

function formatQuality(quality) {

    if (!quality) return "Unknown";

    return quality
        .split("_")
        .map(
            (word) =>
                word.charAt(0).toUpperCase() +
                word.slice(1)
        )
        .join(" ");
}

function formatFileSize(bytes) {

    if (!bytes || bytes === 0)
        return "0 Bytes";

    const k = 1024;

    const sizes = [
        "Bytes",
        "KB",
        "MB",
        "GB"
    ];

    const i = Math.floor(
        Math.log(bytes) / Math.log(k)
    );

    return (
        parseFloat(
            (
                bytes /
                Math.pow(k, i)
            ).toFixed(2)
        ) +
        " " +
        sizes[i]
    );
}

function showLoader(chatId) {

    return bot.sendMessage(
        chatId,
        "⏳ កំពុងដំណើរការ..."
    );
}

function showError(chatId) {

    return bot.sendMessage(
        chatId,
        "❌ Can't fetch URL."
    );
}

// ========================
// FETCH VIDEO
// ========================

async function fetchVideo(chatId, url) {

    let loading;

    try {

        loading = await showLoader(chatId);

        const response = await axios.post(
            API_URL,
            {
                url
            },
            {
                headers: {
                    "Content-Type":
                        "application/json",

                    "X-RapidAPI-Host":
                        "social-download-all-in-one.p.rapidapi.com",

                    "X-RapidAPI-Key":
                        API_KEY
                }
            }
        );

        const data = response.data;

        if (!data || data.error) {
            throw new Error(
                data?.message || "API Error"
            );
        }

        if (loading) {

            await bot
                .deleteMessage(
                    chatId,
                    loading.message_id
                )
                .catch(() => {});
        }

        return data;

    } catch (err) {

        console.error(
            "fetchVideo error:",
            err.message
        );

        if (loading) {

            await bot
                .deleteMessage(
                    chatId,
                    loading.message_id
                )
                .catch(() => {});
        }

        await showError(chatId);

        return null;
    }
}

// ========================
// FIND MEDIA
// ========================

function findMedia(data, type) {

    if (!data?.medias) return null;

    // VIDEO
    if (type === "video") {

        return data.medias.find(
            (m) =>
                m.type?.toLowerCase() === "video"
        );
    }

    // AUDIO
    if (type === "mp3") {

        return data.medias.find(
            (m) =>
                m.type?.toLowerCase() === "audio"
        );
    }

    // IMAGE
    if (type === "image") {

        return data.medias.find(
            (m) =>
                m.extension?.toLowerCase() === "jpg" ||
                m.extension?.toLowerCase() === "png" ||
                m.type?.toLowerCase() === "image"
        );
    }

    return null;
}

// ========================
// SEND DOWNLOAD RESULT
// ========================

async function sendDownload(chatId, media, data) {

    try {

        // THUMBNAIL
        if (data.thumbnail) {

            await bot.sendPhoto(
                chatId,
                data.thumbnail,
                {
                    caption:
`🎉 រួចរាល់ហើយ

📌 ${data.title || "Untitled"}

⚡ ${formatQuality(media.quality)}

💾 ${formatFileSize(media.data_size)}`
                }
            );
        }

        // DOWNLOAD BUTTON
        await bot.sendMessage(
            chatId,
            "📥 ចុចទាញយកខាងក្រោម",
            {
                reply_markup: {

                    keyboard: [

                        [
                            {
                                text: "📥 ទាញយក"
                            }
                        ],

                        [
                            {
                                text: "🔵 Tools"
                            },

                            {
                                text: "🏠 Home"
                            }
                        ]
                    ],

                    resize_keyboard: true,
                    persistent: true
                }
            }
        );

        // SAVE DOWNLOAD URL
        userStates[chatId].downloadUrl =
            media.url;

    } catch (err) {

        console.error(
            "sendDownload error:",
            err.message
        );

        await showError(chatId);
    }
}

// ========================
// START COMMAND
// ========================

bot.onText(/\/start/, async (msg) => {

    const chatId = msg.chat.id;

    const name =
        msg.from.first_name || "User";

    const welcome =
`
🎬 AMERTAK DOWNLOADER

👋 សួស្តី ${name}

ផ្ញើ Link Video ដើម្បីទាញយក

Supported:
• YouTube
• TikTok
• Facebook
• Instagram`;

    await bot.sendMessage(
        chatId,
        welcome,
        {
            reply_markup: {

                keyboard: [

                    [
                        {
                            text: "🔵 Tools"
                        },

                        {
                            text: "📥 Download"
                        },

                        {
                            text: "🎵 MP3"
                        }
                    ]
                ],

                resize_keyboard: true,
                persistent: true
            }
        }
    );
});

// ========================
// HELP COMMAND
// ========================

bot.onText(/\/help/, async (msg) => {

    await bot.sendMessage(
        msg.chat.id,

`
📘 HOW TO USE

1. Send video URL

2. Choose file type

3. Download file

Supported:
• YouTube
• TikTok
• Facebook
• Instagram`
    );
});

// ========================
// MESSAGE HANDLER
// ========================

bot.on("message", async (msg) => {

    const chatId = msg.chat.id;

    const text = msg.text;

    if (!text) return;

    // IGNORE COMMANDS

    if (text.startsWith("/"))
        return;

    // ========================
    // TOOLS
    // ========================

    if (text === "🔵 Tools") {

        return bot.sendMessage(
            chatId,
            "🌐 https://tools-amertak.vercel.app"
        );
    }

    // ========================
    // HOME
    // ========================

    if (text === "🏠 Home") {

        return bot.sendMessage(
            chatId,
            "🏠 Home Menu",
            {
                reply_markup: {

                    keyboard: [

                        [
                            {
                                text: "🔵 Tools"
                            },

                            {
                                text: "📥 Download"
                            },

                            {
                                text: "🎵 MP3"
                            }
                        ]
                    ],

                    resize_keyboard: true,
                    persistent: true
                }
            }
        );
    }

    // ========================
    // DOWNLOAD BUTTON
    // ========================

    if (text === "📥 ទាញយក") {

        const url =
            userStates[chatId]?.downloadUrl;

        if (!url) {

            return bot.sendMessage(
                chatId,
                "❌ Download URL not found."
            );
        }

        return bot.sendMessage(
            chatId,
            url
        );
    }

    // ========================
    // VIDEO OPTION
    // ========================

    if (text === "🎬 Video") {

        const data =
            userStates[chatId]?.data;

        if (!data) {

            return showError(chatId);
        }

        const media =
            findMedia(data, "video");

        if (!media) {

            return showError(chatId);
        }

        return sendDownload(
            chatId,
            media,
            data
        );
    }

    // ========================
    // IMAGE OPTION
    // ========================

    if (text === "🖼 Image") {

        const data =
            userStates[chatId]?.data;

        if (!data) {

            return showError(chatId);
        }

        const media =
            findMedia(data, "image");

        if (!media) {

            return showError(chatId);
        }

        return sendDownload(
            chatId,
            media,
            data
        );
    }

    // ========================
    // MP3 OPTION
    // ========================

    if (text === "🎵 MP3") {

        const data =
            userStates[chatId]?.data;

        if (!data) {

            return bot.sendMessage(
                chatId,
                "🎵 Send video URL first."
            );
        }

        const media =
            findMedia(data, "mp3");

        if (!media) {

            return showError(chatId);
        }

        return sendDownload(
            chatId,
            media,
            data
        );
    }

    // ========================
    // URL DETECT
    // ========================

    if (
        text.startsWith("http://") ||
        text.startsWith("https://")
    ) {

        const data =
            await fetchVideo(
                chatId,
                text.trim()
            );

        if (!data) return;

        // SAVE USER DATA
        userStates[chatId] = {
            data
        };

        // SEND THUMBNAIL
        if (data.thumbnail) {

            await bot.sendPhoto(
                chatId,
                data.thumbnail,
                {
                    caption:
`📌 ${data.title || "Untitled"}

👤 ${data.author || "Unknown"}`
                }
            );
        }

        // CHOOSE TYPE
        return bot.sendMessage(
            chatId,
            "📂 ជ្រើសរើសប្រភេទ File",
            {
                reply_markup: {

                    keyboard: [

                        [
                            {
                                text: "🎬 Video"
                            },

                            {
                                text: "🖼 Image"
                            },

                            {
                                text: "🎵 MP3"
                            }
                        ],

                        [
                            {
                                text: "🔵 Tools"
                            }
                        ]
                    ],

                    resize_keyboard: true,
                    persistent: true
                }
            }
        );
    }
});