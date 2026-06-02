require("dotenv").config();

const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");

// ========================
// CONFIG
// ========================

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

const API_BASE = process.env.API_BASE;
const API_KEY = process.env.API_KEY || "amertak_super_key_2026";

// ========================
// BOT INIT
// ========================

const bot = new TelegramBot(TOKEN, {
    polling: true
});

// ========================
// EXPRESS
// ========================

const app = express();

app.get("/", (_, res) => {
    res.send("Bot Running");
});

app.listen(process.env.PORT || 3000);

// ========================
// USERS DB
// ========================

const DB_FILE = "./users.json";

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, "[]");
    }

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
// STATES
// ========================

const userStates = {};
const askStates = {};

// ========================
// HELPERS
// ========================

function isImage(url = "") {
    return (
        url.includes(".jpg") ||
        url.includes(".jpeg") ||
        url.includes(".png") ||
        url.includes(".webp")
    );
}

function formatQuality(q) {
    if (!q) return "Unknown";

    return q
        .split("_")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

// ========================
// PROGRESS BAR
// ========================

async function progressBar(chatId, msgId) {

    const steps = [
        "⬜⬜⬜⬜⬜ 0%",
        "🟩⬜⬜⬜⬜ 20%",
        "🟩🟩⬜⬜⬜ 40%",
        "🟩🟩🟩⬜⬜ 60%",
        "🟩🟩🟩🟩⬜ 80%",
        "🟩🟩🟩🟩🟩 100%"
    ];

    for (let i = 0; i < steps.length; i++) {

        await new Promise(r => setTimeout(r, 350));

        await bot.editMessageText(
            `📥 កំពុងទាញយក...\n\n${steps[i]}`,
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

async function fetchVideo(chatId, url) {

    const loading = await bot.sendMessage(chatId, "⏳ Processing...");

    try {

        const res = await axios.get(`${API_BASE}/api/download`, {
            params: { url },
            headers: {
                "x-api-key": API_KEY
            }
        });

        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        return res.data;

    } catch (err) {

        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});

        await bot.sendMessage(chatId,
            `❌ API Error\n\n${err.message}`
        );

        return null;
    }
}

// ========================
// FIND MEDIA
// ========================

function findMedia(data, type) {

    if (!data?.medias) return null;

    if (type === "video") {
        return data.medias.find(m =>
            m.type?.toLowerCase() === "video"
        );
    }

    if (type === "mp3") {
        return data.medias.find(m =>
            m.type?.toLowerCase() === "audio"
        );
    }

    if (type === "image") {
        return data.medias.find(m =>
            m.type?.toLowerCase() === "image" ||
            isImage(m.url)
        );
    }

    return null;
}

// ========================
// SEND FILE
// ========================

async function sendFile(chatId, media, data) {

    const msg = await bot.sendMessage(chatId,
        "📥 Starting...\n⬜⬜⬜⬜⬜ 0%"
    );

    await progressBar(chatId, msg.message_id);

    try {

        const stream = await axios.get(`${API_BASE}/api/proxy`, {
            responseType: "stream",
            params: {
                url: media.url
            }
        });

        const caption = `📌 ${data.title || "Amertak"}`;

        if (media.type?.toLowerCase() === "audio") {

            await bot.sendAudio(chatId, stream.data, {
                caption,
                title: data.title || "Audio",
                performer: data.author || "Amertak",
                filename: `${data.title || "audio"}.mp3`
            });

        } else if (media.type?.toLowerCase() === "video") {

            await bot.sendVideo(chatId, stream.data, {
                caption
            });

        } else if (media.type?.toLowerCase() === "image" || isImage(media.url)) {

            await bot.sendPhoto(chatId, stream.data, {
                caption
            });

        } else {

            await bot.sendDocument(chatId, stream.data, {
                caption
            });

        }

    } catch (err) {

        await bot.sendMessage(chatId,
            "❌ Download failed"
        );

    }

    await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
}

// ========================
// /START
// ========================

bot.onText(/\/start/, async (msg) => {

    const fullName =
        `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();

    addUser(msg.chat.id);

    await bot.sendMessage(msg.chat.id,
`👋 សូមស្វាគមន៍ ${fullName}

📥 Amertak Downloader

📖 របៀបប្រើ:
1️⃣ ផ្ញើ URL
2️⃣ ជ្រើស format
3️⃣ Download

💬 /ask សម្រាប់ support`,
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
// /ID
// ========================

bot.onText(/\/id/, async (msg) => {

    await bot.sendMessage(msg.chat.id,
`🆔 INFO

User: ${msg.from.id}
Chat: ${msg.chat.id}
Username: @${msg.from.username || "none"}`
    );

});

// ========================
// /ASK
// ========================

bot.onText(/\/ask (.+)/, async (msg, match) => {

    const question = match[1];

    addUser(msg.chat.id);

    await bot.sendMessage(msg.chat.id,
        "⏳អ្នកនឹងទទួលបានការឆ្លើយតបនៅពេល owner បានឃើញ!"
    );

    await bot.sendMessage(OWNER_ID,
`📩 NEW ASK

👤 ${msg.from.first_name}
🆔 ${msg.from.id}

💬 ${question}

Reply:
/reply ${msg.from.id} message`
    );

});

// ========================
// /REPLY
// ========================

bot.onText(/\/reply (\d+) (.+)/, async (msg, match) => {

    if (String(msg.chat.id) !== String(OWNER_ID)) {
        return bot.sendMessage(msg.chat.id, "❌ Not allowed");
    }

    const userId = match[1];
    const text = match[2];

    await bot.sendMessage(userId,
`📩 Reply From Owner

━━━━━━━━━━━━━━━

${text}`);

    await bot.sendMessage(msg.chat.id, "✅ Sent");

});

// ========================
// /NOTIFY
// ========================

bot.onText(/\/notify (.+)/, async (msg, match) => {

    if (String(msg.chat.id) !== String(OWNER_ID)) {
        return bot.sendMessage(msg.chat.id, "❌ Not allowed");
    }

    let sent = 0;
    let failed = 0;

    for (let id of users) {

        try {

            await bot.sendMessage(id, `📢 ${match[1]}`);
            sent++;

        } catch (e) {
            failed++;
        }
    }

    await bot.sendMessage(msg.chat.id,
`✅ DONE
Sent: ${sent}
Failed: ${failed}`
    );

});

// ========================
// MAIN MESSAGE
// ========================

bot.on("message", async (msg) => {

    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    addUser(chatId);

    if (text.startsWith("http")) {

        const data = await fetchVideo(chatId, text);
        if (!data) return;

        userStates[chatId] = { data };

        if (data.thumbnail) {

            await bot.sendPhoto(chatId, data.thumbnail, {
                caption: `📌 ${data.title || "Video"}`
            });

        }

        const keyboard = [];

        if (findMedia(data, "video")) {
            keyboard.push([{ text: "🎬 Video", callback_data: "video" }]);
        }

        if (findMedia(data, "image")) {
            keyboard.push([{ text: "🖼 Image", callback_data: "image" }]);
        }

        if (findMedia(data, "mp3")) {
            keyboard.push([{ text: "🎵 MP3", callback_data: "mp3" }]);
        }

        keyboard.push([{
            text: "🔵 Tools",
            web_app: {
                url: "https://tools-amertak.vercel.app"
            }
        }]);

        return bot.sendMessage(chatId,
            "📂 Choose format",
            {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    }

    bot.sendMessage(chatId,
        "📎 Send valid URL"
    );

});

// ========================
// CALLBACK QUERY
// ========================

bot.on("callback_query", async (query) => {

    const chatId = query.message.chat.id;
    const data = userStates[chatId]?.data;

    await bot.answerCallbackQuery(query.id);

    if (!data) return bot.sendMessage(chatId, "❌ Session expired");

    const media = findMedia(data, query.data);
    if (!media) return bot.sendMessage(chatId, "❌ Not found");

    sendFile(chatId, media, data);

});