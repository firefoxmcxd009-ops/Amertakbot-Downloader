require("dotenv").config();

const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");

// ========================
// CONFIG
// ========================

const TOKEN =
    process.env.BOT_TOKEN;

const OWNER_ID =
    process.env.OWNER_ID;

// YOUR API
const API_BASE =
    process.env.API_BASE ||
    "https://YOUR-RENDER-URL.onrender.com";

// YOUR API KEY
const API_KEY =
    process.env.API_KEY ||
    "amertak_super_key_2026";

// ========================
// BOT
// ========================

const bot = new TelegramBot(
    TOKEN,
    {
        polling: true
    }
);

// ========================
// EXPRESS
// ========================

const app = express();

app.get("/", (_, res) => {

    res.send("Bot Running");

});

app.listen(
    process.env.PORT || 3000
);

// ========================
// USERS DB
// ========================

const DB_FILE =
    "./users.json";

function loadUsers() {

    if (!fs.existsSync(DB_FILE)) {

        fs.writeFileSync(
            DB_FILE,
            "[]"
        );

    }

    return new Set(
        JSON.parse(
            fs.readFileSync(DB_FILE)
        )
    );

}

function saveUsers(set) {

    fs.writeFileSync(
        DB_FILE,
        JSON.stringify([...set])
    );

}

const users = loadUsers();

function addUser(id) {

    if (!users.has(id)) {

        users.add(id);

        saveUsers(users);

    }

}

// ========================
// STATE
// ========================

const userStates = {};

// ========================
// HELPERS
// ========================

function formatQuality(q) {

    if (!q)
        return "Unknown";

    return q
        .split("_")
        .map(
            w =>
                w[0].toUpperCase() +
                w.slice(1)
        )
        .join(" ");

}

function isImage(url = "") {

    return (
        url.includes(".jpg") ||
        url.includes(".jpeg") ||
        url.includes(".png") ||
        url.includes(".webp")
    );

}

// ========================
// PROGRESS BAR
// ========================

async function progressBar(
    chatId,
    msgId
) {

    const steps = [
        "⬜⬜⬜⬜⬜ 0%",
        "🟩⬜⬜⬜⬜ 20%",
        "🟩🟩⬜⬜⬜ 40%",
        "🟩🟩🟩⬜⬜ 60%",
        "🟩🟩🟩🟩⬜ 80%",
        "🟩🟩🟩🟩🟩 100%"
    ];

    for (let i = 0; i < steps.length; i++) {

        await new Promise(
            r => setTimeout(r, 350)
        );

        await bot.editMessageText(
            `📥 Downloading...\n\n${steps[i]}`,
            {
                chat_id: chatId,
                message_id: msgId
            }
        ).catch(() => {});

    }

}

// ========================
// FETCH VIDEO
// ========================

async function fetchVideo(
    chatId,
    url
) {

    const loading =
        await bot.sendMessage(
            chatId,
            "⏳ Processing..."
        );

    try {

        const res =
            await axios.get(
                `${API_BASE}/api/download`,
                {
                    params: {
                        url
                    },
                    headers: {
                        "x-api-key":
                            API_KEY
                    }
                }
            );

        await bot.deleteMessage(
            chatId,
            loading.message_id
        ).catch(() => {});

        return res.data;

    } catch (err) {

        console.error(err?.response?.data || err);

        await bot.deleteMessage(
            chatId,
            loading.message_id
        ).catch(() => {});

        await bot.sendMessage(
            chatId,
            `❌ API Error\n\n${err?.response?.data?.message || err.message}`
        );

        return null;

    }

}

// ========================
// FIND MEDIA
// ========================

function findMedia(data, type) {

    if (!data?.medias)
        return null;

    // VIDEO
    if (type === "video") {

        return data.medias.find(
            m =>
                m.type?.toLowerCase() ===
                "video"
        );

    }

    // AUDIO
    if (type === "mp3") {

        return data.medias.find(
            m =>
                m.type?.toLowerCase() ===
                "audio"
        );

    }

    // IMAGE
    if (type === "image") {

        return data.medias.find(
            m =>
                m.type?.toLowerCase() ===
                    "image" ||
                isImage(m.url)
        );

    }

    return null;

}

// ========================
// SEND FILE
// ========================

async function sendFile(
    chatId,
    media,
    data
) {

    const msg =
        await bot.sendMessage(
            chatId,
            "📥 Starting...\n⬜⬜⬜⬜⬜ 0%"
        );

    await progressBar(
        chatId,
        msg.message_id
    );

    try {

        const stream =
            await axios.get(
                `${API_BASE}/api/proxy`,
                {
                    responseType: "stream",
                    params: {
                        url: media.url
                    }
                }
            );

        // AUDIO
        if (
            media.type?.toLowerCase() ===
            "audio"
        ) {

            await bot.sendAudio(
                chatId,
                stream.data,
                {
                    caption:
                        `🎵 ${data.title || "Audio"}`
                }
            );

        }

        // VIDEO
        else if (
            media.type?.toLowerCase() ===
            "video"
        ) {

            await bot.sendVideo(
                chatId,
                stream.data,
                {
                    caption:
                        `🎬 ${data.title || "Video"}`
                }
            );

        }

        // IMAGE
        else if (
            media.type?.toLowerCase() ===
                "image" ||
            isImage(media.url)
        ) {

            await bot.sendPhoto(
                chatId,
                stream.data,
                {
                    caption:
                        `🖼 ${data.title || "Image"}`
                }
            );

        }

        // FILE
        else {

            await bot.sendDocument(
                chatId,
                stream.data,
                {
                    caption:
                        `📁 ${data.title || "File"}`
                }
            );

        }

    } catch (err) {

        console.error(err);

        await bot.sendMessage(
            chatId,
            "❌ Failed to send media"
        );

    }

    await bot.deleteMessage(
        chatId,
        msg.message_id
    ).catch(() => {});

}

// ========================
// START
// ========================

bot.onText(
    /\/start/,
    async (msg) => {

    addUser(msg.chat.id);

    await bot.sendMessage(
        msg.chat.id,

`🎬 AMERTAK DOWNLOADER

Supported:
• TikTok
• YouTube
• Instagram
• Pinterest
• Spotify

Send URL to download.`,

{
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
// /ID
// ========================

bot.onText(
    /\/id/,
    async (msg) => {

    const chatId =
        msg.chat.id;

    const userId =
        msg.from.id;

    await bot.sendMessage(
        chatId,

`🆔 Your Telegram Info

👤 User ID: ${userId}
💬 Chat ID: ${chatId}
📛 Username: @${msg.from.username || "no_username"}`

    );

});

// ========================
// /NOTIFY
// ========================

bot.onText(
    /\/notify (.+)/,
    async (msg, match) => {

    const chatId =
        msg.chat.id;

    const text =
        match[1];

    if (
        String(chatId) !==
        String(OWNER_ID)
    ) {

        return bot.sendMessage(
            chatId,
            "❌ Not allowed"
        );

    }

    let sent = 0;
    let failed = 0;

    for (let id of users) {

        try {

            await bot.sendMessage(
                id,
                `📢 ${text}`
            );

            sent++;

            await new Promise(
                r => setTimeout(r, 40)
            );

        } catch (e) {

            failed++;

        }

    }

    return bot.sendMessage(
        chatId,

`✅ Broadcast Done

📤 Sent: ${sent}
❌ Failed: ${failed}`

    );

});

// ========================
// MAIN HANDLER
// ========================

bot.on(
    "message",
    async (msg) => {

    const chatId =
        msg.chat.id;

    const text =
        msg.text;

    if (
        !text ||
        text.startsWith("/")
    ) return;

    addUser(chatId);

    // URL
    if (
        text.startsWith("http")
    ) {

        const data =
            await fetchVideo(
                chatId,
                text
            );

        if (!data) return;

        userStates[chatId] = {
            data
        };

        // THUMBNAIL
        if (data.thumbnail) {

            await bot.sendPhoto(
                chatId,
                data.thumbnail,
                {
                    caption:
`📌 ${data.title || "Untitled"}

👤 ${data.author || "Unknown"}

🌐 ${data.platform || "Unknown"}`
                }
            );

        }

        // CHECK MEDIA
        const hasVideo =
            findMedia(
                data,
                "video"
            );

        const hasAudio =
            findMedia(
                data,
                "mp3"
            );

        const hasImage =
            findMedia(
                data,
                "image"
            );

        const keyboard = [];

        // VIDEO BUTTON
        if (hasVideo) {

            keyboard.push([
                {
                    text: "🎬 Video",
                    callback_data:
                        "video"
                }
            ]);

        }

        // IMAGE BUTTON
        if (hasImage) {

            keyboard.push([
                {
                    text: "🖼 Image",
                    callback_data:
                        "image"
                }
            ]);

        }

        // AUDIO BUTTON
        if (hasAudio) {

            keyboard.push([
                {
                    text: "🎵 MP3",
                    callback_data:
                        "mp3"
                }
            ]);

        }

        // TOOLS
        keyboard.push([
            {
                text: "🔵 Tools",
                web_app: {
                    url: "https://tools-amertak.vercel.app"
                }
            }
        ]);

        return bot.sendMessage(
            chatId,
            "📂 Choose format",
            {
                reply_markup: {
                    inline_keyboard:
                        keyboard
                }
            }
        );

    }

    return bot.sendMessage(
        chatId,
        "📎 Send valid URL"
    );

});

// ========================
// CALLBACK
// ========================

bot.on(
    "callback_query",
    async (query) => {

    const chatId =
        query.message.chat.id;

    const action =
        query.data;

    await bot.answerCallbackQuery(
        query.id
    );

    const data =
        userStates[chatId]?.data;

    if (!data) {

        return bot.sendMessage(
            chatId,
            "❌ Session expired"
        );

    }

    const media =
        findMedia(
            data,
            action
        );

    if (!media) {

        return bot.sendMessage(
            chatId,
            "❌ Media not found"
        );

    }

    return sendFile(
        chatId,
        media,
        data
    );

});