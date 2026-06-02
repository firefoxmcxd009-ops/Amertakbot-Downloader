require("dotenv").config();

const fs = require("fs");
const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// ========================
// CONFIG
// ========================
const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const API_BASE = process.env.API_BASE;
const API_KEY = process.env.API_KEY || "amertak_super_key_2026";

// ========================
// INIT
// ========================
const bot = new TelegramBot(TOKEN, { polling: true });

const app = express();
app.get("/", (_, res) => res.send("Bot Running OK"));
app.listen(process.env.PORT || 3000);

// ========================
// USERS DB
// ========================
const DB_FILE = "./users.json";

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");
    return new Set(JSON.parse(fs.readFileSync(DB_FILE)));
}

function saveUsers(set) {
    fs.writeFileSync(DB_FILE, JSON.stringify([...set]));
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
function isImage(url = "") {
    return /\.(jpg|jpeg|png|webp)/i.test(url);
}

// ========================
// FETCH MEDIA INFO
// ========================
async function fetchVideo(chatId, url) {
    const loading = await bot.sendMessage(chatId, "កំពុងស្វែងរក...");

    try {
        const res = await axios.get(`${API_BASE}/api/download`, {
            params: { url },
            headers: { "x-api-key": API_KEY }
        });

        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        return res.data;

    } catch (err) {
        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        await bot.sendMessage(chatId, "API មានបញ្ហា");
        return null;
    }
}

// ========================
// MEDIA FINDER
// ========================
function findMedia(data, type) {
    if (!data?.medias) return null;

    if (type === "video") {
        return data.medias.find(m => m.type === "video");
    }

    if (type === "mp3") {
        return data.medias.find(m => m.type === "audio");
    }

    if (type === "image") {
        return data.medias.find(m => m.type === "image" || isImage(m.url));
    }

    return null;
}

// ========================
// ULTRA REAL PROGRESS ENGINE
// ========================
async function sendFile(chatId, media, data) {

    const msg = await bot.sendMessage(chatId, "Starting download... 0%");

    try {
        const response = await axios.get(`${API_BASE}/api/proxy`, {
            responseType: "stream",
            params: { url: media.url }
        });

        const total = parseInt(response.headers["content-length"] || "0");
        let downloaded = 0;
        let lastEdit = 0;

        const chunks = [];

        const renderBar = (p) => {
            const blocks = Math.round(p / 10);
            return "█".repeat(blocks) + "░".repeat(10 - blocks);
        };

        response.data.on("data", async (chunk) => {
            downloaded += chunk.length;
            chunks.push(chunk);

            const percent = total ? Math.floor((downloaded / total) * 100) : 0;

            const now = Date.now();

            // ⚡ throttle updates (IMPORTANT for Telegram)
            if (now - lastEdit < 800) return;
            lastEdit = now;

            const bar = renderBar(percent);

            try {
                await bot.editMessageText(
                    `Downloading...\n[${bar}] ${percent}%`,
                    {
                        chat_id: chatId,
                        message_id: msg.message_id
                    }
                );
            } catch (_) {}
        });

        response.data.on("end", async () => {

            const buffer = Buffer.concat(chunks);

            const caption = data.title || "File";

            try {
                if (media.type === "audio") {
                    await bot.sendAudio(chatId, buffer, { caption });
                } else if (media.type === "video") {
                    await bot.sendVideo(chatId, buffer, { caption });
                } else if (media.type === "image" || isImage(media.url)) {
                    await bot.sendPhoto(chatId, buffer, { caption });
                } else {
                    await bot.sendDocument(chatId, buffer, { caption });
                }
            } catch (err) {
                await bot.sendMessage(chatId, "Failed to send file");
            }

            await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        });

        response.data.on("error", async () => {
            await bot.sendMessage(chatId, "Download error");
            await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        });

    } catch (err) {
        await bot.sendMessage(chatId, "Server error");
    }
}

// ========================
// START
// ========================
bot.onText(/\/start/, async (msg) => {

    const name =
        (msg.from.first_name || "") + " " + (msg.from.last_name || "");

    addUser(msg.chat.id);

    await bot.sendMessage(msg.chat.id,
`Welcome ${name}

How to use:
1. Send link
2. Choose format
3. Wait download

Use /ask for support`,
{
    reply_markup: {
        inline_keyboard: [[
            {
                text: "Tools",
                web_app: {
                    url: "https://tools-amertak.vercel.app"
                }
            }
        ]]
    }
});
});

// ========================
// ASK SYSTEM
// ========================
bot.onText(/\/ask (.+)/, async (msg, match) => {

    const question = match[1];

    await bot.sendMessage(msg.chat.id,
        "You will get reply when owner sees it"
    );

    await bot.sendMessage(OWNER_ID,
`NEW ASK

Name: ${msg.from.first_name}
ID: ${msg.from.id}

Message:
${question}`,
{
    reply_markup: {
        inline_keyboard: [[
            {
                text: "Reply",
                callback_data: `reply_${msg.from.id}`
            }
        ]]
    }
});
});

// ========================
// CALLBACK HANDLER
// ========================
bot.on("callback_query", async query => {

    const chatId = query.message.chat.id;
    const action = query.data;

    await bot.answerCallbackQuery(query.id);

    // OWNER REPLY AUTO
    if (action.startsWith("reply_")) {

        const id = action.split("_")[1];

        return bot.sendMessage(
            chatId,
            `/reply ${id} `
        );
    }

    const data = userStates[chatId]?.data;
    if (!data) return;

    const media = findMedia(data, action);
    if (!media) return;

    return sendFile(chatId, media, data);
});

// ========================
// MAIN MESSAGE
// ========================
bot.on("message", async (msg) => {

    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    addUser(chatId);

    if (!text.startsWith("http")) {
        return bot.sendMessage(chatId, "Send valid link");
    }

    const data = await fetchVideo(chatId, text);
    if (!data) return;

    userStates[chatId] = { data };

    if (data.thumbnail) {
        await bot.sendPhoto(chatId, data.thumbnail, {
            caption: data.title || "Media"
        });
    }

    const keyboard = [];

    if (findMedia(data, "video")) {
        keyboard.push([{ text: "Video", callback_data: "video" }]);
    }

    if (findMedia(data, "image")) {
        keyboard.push([{ text: "Image", callback_data: "image" }]);
    }

    if (findMedia(data, "mp3")) {
        keyboard.push([{ text: "Audio", callback_data: "mp3" }]);
    }

    return bot.sendMessage(chatId,
        "Select format",
        { reply_markup: { inline_keyboard: keyboard } }
    );
});