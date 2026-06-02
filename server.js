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
// DB USERS
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
// FETCH API
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
// PROGRESS ENGINE (REAL + STABLE)
// ========================
function bar(p) {
    const blocks = Math.round(p / 10);
    return "█".repeat(blocks) + "░".repeat(10 - blocks);
}

// ========================
// SEND FILE STREAM (ULTRA STABLE)
// ========================
async function sendFile(chatId, media, data) {

    const msg = await bot.sendMessage(chatId, "កំពុងទាញយក... 0%");

    try {
        const response = await axios.get(`${API_BASE}/api/proxy`, {
            responseType: "stream",
            params: { url: media.url }
        });

        const total = parseInt(response.headers["content-length"] || "0");
        let downloaded = 0;
        let last = 0;
        const chunks = [];

        response.data.on("data", (chunk) => {
            downloaded += chunk.length;
            chunks.push(chunk);

            const percent = total ? Math.floor((downloaded / total) * 100) : 0;

            const now = Date.now();
            if (now - last < 800) return;
            last = now;

            bot.editMessageText(
                `កំពុងទាញយក...\n[${bar(percent)}] ${percent}%`,
                { chat_id: chatId, message_id: msg.message_id }
            ).catch(() => {});
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
            } catch (e) {
                await bot.sendMessage(chatId, "Send failed");
            }

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
`សូមស្វាគមន៍ ${name}

- ផ្ញើ link
- ជ្រើស format
- រងចាំ download

/ask សម្រាប់ support`,
{
    reply_markup: {
        inline_keyboard: [[
            {
                text: "Tools",
                web_app: { url: "https://tools-amertak.vercel.app" }
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
        "អ្នកនឹងទទួលបានការឆ្លើយតបពេល owner ឃើញ"
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
// CALLBACK (ULTRA FIXED)
// ========================
bot.on("callback_query", async (query) => {

    const chatId = query.message.chat.id;
    const action = query.data;

    await bot.answerCallbackQuery(query.id);

    // =========================
    // PRO REPLY BUTTON (FIXED UX)
    // =========================
    if (action.startsWith("reply_")) {

        const id = action.split("_")[1];

        // IMPORTANT: we cannot auto-type in Telegram input box
        // so we simulate "one-tap command insertion"

        return bot.sendMessage(chatId,
`ចុចខាងក្រោម ដើម្បី reply៖

/reply ${id} `
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
        return bot.sendMessage(chatId, "សូមផ្ញើ link");
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
        "ជ្រើសរើស format",
        { reply_markup: { inline_keyboard: keyboard } }
    );
});