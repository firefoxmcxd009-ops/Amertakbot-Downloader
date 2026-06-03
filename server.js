//////////////////////////////////////////////////////
// AMERTAK TELEGRAM BOT - PRO v7 UPGRADE
//////////////////////////////////////////////////////

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

require("dotenv").config();

const fs = require("fs");
const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// ========================
// CONFIG
// ========================

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID);
const API_BASE = process.env.API_BASE;
const API_KEY = process.env.API_KEY || "amertak_super_key_2026";

// ========================
// INIT
// ========================

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();

app.get("/", (_, res) => res.send("Bot Running OK"));
app.listen(process.env.PORT || 3000, () => console.log("Server Started"));

// ========================
// USER DB
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

let saveLock = false;
function saveUsersSafe() {
    if (saveLock) return;
    saveLock = true;

    setTimeout(() => {
        saveUsers(users);
        saveLock = false;
    }, 3000);
}

function addUser(id) {
    id = String(id);
    if (!users.has(id)) {
        users.add(id);
        saveUsersSafe();
    }
}

// ========================
// STATE
// ========================

const userStates = new Map();
const replyStates = new Map();
const requestQueue = new Map();

// ========================
// HELPERS
// ========================

const isURL = (t) => /^https?:\/\//.test(t);

const isImage = (u) =>
    /\.(jpg|jpeg|png|webp|gif)/i.test(u);

// ========================
// PROGRESS SYSTEM (UI STYLE)
// ========================

function progress(percent) {
    const bars = 10;
    const filled = Math.round((percent / 100) * bars);
    return "█".repeat(filled) + "░".repeat(bars - filled);
}

async function updateProgress(chatId, msgId, percent, text = "Processing") {
    const bar = progress(percent);

    return bot.editMessageText(
`//////////////////////////////////////////
${percent}%

${bar}

${text}
//////////////////////////////////////////`,
        {
            chat_id: chatId,
            message_id: msgId
        }
    ).catch(() => {});
}

// ========================
// API FETCH (SAFE)
// ========================

async function fetchVideo(chatId, url) {
    const loading = await bot.sendMessage(chatId, "//////////////////////////////////////////\n0%\n\nStarting...");

    let percent = 0;

    const interval = setInterval(() => {
        percent += 10;
        if (percent > 90) return;
        updateProgress(chatId, loading.message_id, percent, "Fetching data...");
    }, 300);

    try {
        const res = await axios.get(`${API_BASE}/api/download`, {
            params: { url },
            headers: { "x-api-key": API_KEY },
            timeout: 120000
        });

        clearInterval(interval);
        await updateProgress(chatId, loading.message_id, 100, "Done");

        setTimeout(() => {
            bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        }, 500);

        return res.data;

    } catch (err) {
        clearInterval(interval);
        bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        bot.sendMessage(chatId, "❌ Failed to fetch");
        return null;
    }
}

// ========================
// MEDIA FINDER
// ========================

function findMedia(data, type) {
    if (!data?.medias) return null;

    return data.medias.find(m => {
        const t = (m.type || "").toLowerCase();

        if (type === "image") {
            return t === "image" || isImage(m.url);
        }

        return t === type;
    });
}

// ========================
// START
// ========================

bot.onText(/\/start/, (msg) => {
    addUser(msg.chat.id);

    bot.sendMessage(msg.chat.id,
`👋 Welcome

Send link to download

/ask - ask admin
/id - info`,
        {
            reply_markup: {
                inline_keyboard: [[
                    { text: "Tools", web_app: { url: "https://tools-amertak.vercel.app" } }
                ]]
            }
        }
    );
});

// ========================
// ID
// ========================

bot.onText(/\/id/, (msg) => {
    bot.sendMessage(msg.chat.id,
`User: ${msg.from.id}
Chat: ${msg.chat.id}
Username: @${msg.from.username || "none"}`
    );
});

// ========================
// ASK
// ========================

bot.onText(/\/ask (.+)/, (msg, match) => {
    bot.sendMessage(msg.chat.id, "Sent to admin");

    bot.sendMessage(OWNER_ID,
`New Question:
${match[1]}`,
        {
            reply_markup: {
                inline_keyboard: [[
                    { text: "Reply", callback_data: `reply_${msg.from.id}` }
                ]]
            }
        }
    );
});

// ========================
// REPLY OWNER
// ========================

bot.onText(/\/reply (\d+) (.+)/, (msg, match) => {
    if (String(msg.chat.id) !== OWNER_ID) return;

    bot.sendMessage(match[1], `Reply:\n${match[2]}`);
});

// ========================
// MESSAGE HANDLER
// ========================

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    addUser(chatId);

    if (!isURL(text)) {
        return bot.sendMessage(chatId, "Send valid link");
    }

    const data = await fetchVideo(chatId, text);
    if (!data) return;

    userStates.set(chatId, data);

    if (data.thumbnail) {
        bot.sendPhoto(chatId, data.thumbnail, {
            caption: data.title || "Media"
        });
    }

    const kb = [];

    if (findMedia(data, "video"))
        kb.push([{ text: "Video", callback_data: "video" }]);

    if (findMedia(data, "audio"))
        kb.push([{ text: "Audio", callback_data: "audio" }]);

    if (findMedia(data, "image"))
        kb.push([{ text: "Image", callback_data: "image" }]);

    kb.push([{ text: "Tools", web_app: { url: "https://tools-amertak.vercel.app" } }]);

    bot.sendMessage(chatId, "Choose format:", {
        reply_markup: { inline_keyboard: kb }
    });
});

// ========================
// CALLBACK (DOWNLOAD ENGINE)
// ========================

bot.on("callback_query", async (q) => {
    const chatId = q.message.chat.id;
    const data = userStates.get(chatId);

    bot.answerCallbackQuery(q.id);

    if (!data) return bot.sendMessage(chatId, "Session expired");

    const media = findMedia(data, q.data);
    if (!media) return bot.sendMessage(chatId, "No media found");

    const progressMsg = await bot.sendMessage(chatId,
`//////////////////////////////////////////
0%

Starting download...
//////////////////////////////////////////`);

    let percent = 0;

    const timer = setInterval(() => {
        percent += 15;
        if (percent > 90) return;
        updateProgress(chatId, progressMsg.message_id, percent, "Downloading...");
    }, 400);

    try {
        const file = await axios.get(`${API_BASE}/api/proxy`, {
            params: { url: media.url },
            responseType: "arraybuffer",
            timeout: 60000
        });

        clearInterval(timer);
        await updateProgress(chatId, progressMsg.message_id, 100, "Sending file...");

        const buffer = Buffer.from(file.data);

        if (media.type === "audio") {
            return bot.sendAudio(chatId, buffer, { caption: data.title });
        }

        if (media.type === "image") {
            return bot.sendPhoto(chatId, buffer, { caption: data.title });
        }

        return bot.sendVideo(chatId, buffer, {
            caption: data.title,
            supports_streaming: true
        });

    } catch (err) {
        clearInterval(timer);
        bot.sendMessage(chatId, "Download failed");
    }
});