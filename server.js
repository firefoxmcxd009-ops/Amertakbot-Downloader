require("dotenv").config();

const fs          = require("fs");
const express     = require("express");
const axios       = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// ========================
// CONFIG
// ========================
const TOKEN    = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const API_BASE = process.env.API_BASE;
const API_KEY  = process.env.API_KEY || "amertak_super_key_2026";
const PORT     = process.env.PORT || 3000;

// ========================
// VALIDATE
// ========================
if (!TOKEN)    throw new Error("BOT_TOKEN missing");
if (!OWNER_ID)  throw new Error("OWNER_ID missing");
if (!API_BASE)  throw new Error("API_BASE missing");

// ========================
// BOT INIT
// ========================
const bot = new TelegramBot(TOKEN, {
    polling: true
});

// ========================
// EXPRESS (for Render keep-alive)
// ========================
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        bot: "Amertak Telegram Bot",
        uptime: process.uptime()
    });
});

app.get("/health", (req, res) => {
    res.json({ alive: true });
});

app.listen(PORT, () => {
    console.log(`Bot server running on ${PORT}`);
});

// ========================
// MEMORY DB
// ========================
const users = new Set();

// ========================
// EMOJI
// ========================
const A = {
    start: "🚀",
    link: "🔗",
    loading: "⏳",
    success: "✅",
    error: "❌",
    download: "⬇️",
    video: "🎬",
    audio: "🎵",
    image: "🖼"
};

// ========================
// HELPERS
// ========================
function isValidURL(text) {
    return /^https?:\/\//.test(text);
}

function safeText(text = "") {
    return String(text).replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ========================
// FETCH FROM BACKEND API
// ========================
async function fetchMedia(url) {
    const res = await axios.get(`${API_BASE}/api/download`, {
        params: { url },
        headers: { "x-api-key": API_KEY },
        timeout: 120000
    });

    return res.data.result;
}

// ========================
// BUILD MESSAGE
// ========================
function buildInfo(data) {
    return `
${A.link} <b>${safeText(data.title)}</b>

👤 ${safeText(data.author || "Unknown")}
🌐 ${data.platform}
`;
}

// ========================
// SEND MEDIA OPTIONS
// ========================
async function sendOptions(chatId, data) {
    const keyboard = [];

    const videos = data.medias.filter(m => m.type === "video");
    const audios = data.medias.filter(m => m.type === "audio");
    const images = data.medias.filter(m => m.type === "image");

    if (videos.length) {
        keyboard.push(videos.map((v, i) => ({
            text: `${A.video} ${v.quality || "Video"}`,
            callback_data: `video_${i}`
        })));
    }

    if (audios.length) {
        keyboard.push(audios.map((a, i) => ({
            text: `${A.audio} ${a.quality || "Audio"}`,
            callback_data: `audio_${i}`
        })));
    }

    if (images.length) {
        keyboard.push(images.map((i, idx) => ({
            text: `${A.image} Image ${idx + 1}`,
            callback_data: `image_${idx}`
        })));
    }

    keyboard.push([{
        text: "🛠 Tools",
        url: "https://tools-amertak.vercel.app"
    }]);

    await bot.sendMessage(chatId, buildInfo(data), {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
}

// ========================
// DOWNLOAD FILE
// ========================
async function downloadFile(chatId, url, type) {
    const loading = await bot.sendMessage(chatId, `${A.loading} Downloading...`);

    try {
        const res = await axios({
            url,
            method: "GET",
            responseType: "stream"
        });

        const chunks = [];

        res.data.on("data", chunk => chunks.push(chunk));

        res.data.on("end", async () => {
            const buffer = Buffer.concat(chunks);

            if (type === "video") {
                await bot.sendVideo(chatId, buffer);
            } else if (type === "audio") {
                await bot.sendAudio(chatId, buffer);
            } else {
                await bot.sendDocument(chatId, buffer);
            }

            await bot.deleteMessage(chatId, loading.message_id);
        });

    } catch (err) {
        await bot.sendMessage(chatId, `${A.error} Failed download`);
    }
}

// ========================
// START COMMAND
// ========================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    users.add(chatId);

    await bot.sendMessage(chatId,
`${A.start} <b>Welcome to Amertak Downloader Bot</b>

Send me any link:
YouTube, TikTok, Instagram, Facebook, etc.

${A.link} Just paste URL`,
{
    parse_mode: "HTML"
});
});

// ========================
// HANDLE URL MESSAGE
// ========================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || !isValidURL(text)) return;
    if (text.startsWith("/")) return;

    try {
        const data = await fetchMedia(text);

        await sendOptions(chatId, data);

        // store temp
        global.lastData = global.lastData || {};
        global.lastData[chatId] = data;

    } catch (err) {
        await bot.sendMessage(chatId, `${A.error} Cannot process link`);
    }
});

// ========================
// CALLBACK BUTTONS
// ========================
bot.on("callback_query", async (q) => {
    const chatId = q.message.chat.id;
    const data = global.lastData?.[chatId];

    if (!data) {
        return bot.answerCallbackQuery(q.id, { text: "Expired session" });
    }

    const [type, index] = q.data.split("_");

    let media;

    if (type === "video") {
        media = data.medias.filter(m => m.type === "video")[index];
    } else if (type === "audio") {
        media = data.medias.filter(m => m.type === "audio")[index];
    } else if (type === "image") {
        media = data.medias.filter(m => m.type === "image")[index];
    }

    if (!media) {
        return bot.answerCallbackQuery(q.id, { text: "Not found" });
    }

    bot.answerCallbackQuery(q.id, { text: "Downloading..." });

    await downloadFile(chatId, media.url, media.type);
});

// ========================
// KEEP ALIVE
// ========================
setInterval(() => {
    axios.get(`http://localhost:${PORT}`).catch(() => {});
}, 5 * 60 * 1000);