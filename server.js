require("dotenv").config();

const fs = require("fs");
const express = require("express");
const axios = require("axios");
const compression = require("compression");
const helmet = require("helmet");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

// ========================
// CONFIG
// ========================
const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const API_BASE = process.env.API_BASE;
const API_KEY = process.env.API_KEY || "amertak_super_key_2026";
const PORT = process.env.PORT || 3000;

// ========================
// VALIDATE ENV
// ========================
if (!TOKEN) {
console.error("[FATAL] BOT_TOKEN missing");
process.exit(1);
}

if (!OWNER_ID) {
console.error("[FATAL] OWNER_ID missing");
process.exit(1);
}

if (!API_BASE) {
console.error("[FATAL] API_BASE missing");
process.exit(1);
}

// ========================
// SECURITY
// ========================
app.use(helmet({
contentSecurityPolicy: false
}));

app.use(compression());

app.use(express.json({
limit: "50mb"
}));

app.use((req, res, next) => {
res.setHeader("Access-Control-Allow-Origin", "");
res.setHeader("Access-Control-Allow-Headers", "");
next();
});

// ========================
// BOT INIT
// ========================
const bot = new TelegramBot(TOKEN, {
polling: {
autoStart: true,
interval: 300,
params: {
timeout: 10
}
}
});

// ========================
// DATABASE
// ========================
const DB_FILE = "./users.json";
const STATS_FILE = "./stats.json";

function ensureJson(file, fallback) {
if (!fs.existsSync(file)) {
fs.writeFileSync(
file,
JSON.stringify(fallback, null, 2)
);
}
}

ensureJson(DB_FILE, []);
ensureJson(STATS_FILE, {
downloads: 0,
links: 0
});

function loadUsers() {
try {
return new Set(
JSON.parse(
fs.readFileSync(DB_FILE, "utf8")
)
);
} catch {
return new Set();
}
}

function saveUsers(users) {
try {
fs.writeFileSync(
DB_FILE,
JSON.stringify([...users], null, 2)
);
} catch {}
}

function loadStats() {
try {
return JSON.parse(
fs.readFileSync(STATS_FILE, "utf8")
);
} catch {
return {
downloads: 0,
links: 0
};
}
}

function saveStats(stats) {
try {
fs.writeFileSync(
STATS_FILE,
JSON.stringify(stats, null, 2)
);
} catch {}
}

const users = loadUsers();
const stats = loadStats();

function addUser(id) {
id = String(id);

if (!users.has(id)) {
    users.add(id);
    saveUsers(users);
}

}

function incrementStat(key) {
stats[key] = (stats[key] || 0) + 1;
saveStats(stats);
}

// ========================
// RATE LIMIT
// ========================
const RATE_LIMIT = new Map();
const RATE_MS = 3000;

function isRateLimited(chatId) {
const last = RATE_LIMIT.get(String(chatId));

if (!last) return false;

return Date.now() - last < RATE_MS;

}

function updateRate(chatId) {
RATE_LIMIT.set(
String(chatId),
Date.now()
);
}

// ========================
// STATES
// ========================
const userStates = new Map();

// ========================
// EMOJIS
// ========================
const A = {
loading: "⏳",
search: "🔍",
success: "✅",
error: "❌",
warn: "⚠️",
download: "⬇️",
fire: "🔥",
tools: "🛠",
video: "🎬",
music: "🎵",
image: "🖼",
user: "👤",
time: "⏱",
eyes: "👁",
folder: "📂",
chart: "📊",
id: "🪪",
link: "🔗",
phone: "📱",
info: "ℹ️",
done: "🎉",
mega: "📢",
broadcast: "📡",
help: "📖",
rocket: "🚀",
package: "📦",
wave: "👋"
};

// ========================
// PLATFORM EMOJIS
// ========================
const PLATFORM_EMOJI = {
youtube: "▶️",
tiktok: "🎵",
instagram: "📸",
facebook: "👤",
pinterest: "📌",
twitter: "🐦",
spotify: "🎧",
soundcloud: "☁️"
};

function getPlatformEmoji(platform = "") {
return PLATFORM_EMOJI[
platform.toLowerCase()
] || "🌐";
}

// ========================
// HELPERS
// ========================
function isValidURL(text = "") {
return /^https?:///i.test(text);
}

function isImage(url = "") {
return /.(jpg|jpeg|png|webp|gif)/i.test(url);
}

function escapeHtml(text = "") {
return String(text)
.replace(/&/g, "&")
.replace(/</g, "<")
.replace(/>/g, ">");
}

function formatBytes(bytes = 0) {
if (!bytes) return "Unknown";

const sizes = ["B","KB","MB","GB"];
const i = Math.floor(
    Math.log(bytes) / Math.log(1024)
);

return (
    bytes / Math.pow(1024, i)
).toFixed(2) + " " + sizes[i];

}

function formatDuration(seconds = 0) {
const h = Math.floor(seconds / 3600);
const m = Math.floor((seconds % 3600) / 60);
const s = Math.floor(seconds % 60);

if (h > 0) {
    return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

return `${m}:${String(s).padStart(2,"0")}`;

}

function renderBar(percent) {
return percent < 20
? "▱▱▱▱▱"
: percent < 40
? "▰▱▱▱▱"
: percent < 60
? "▰▰▱▱▱"
: percent < 80
? "▰▰▰▱▱"
: percent < 100
? "▰▰▰▰▱"
: "▰▰▰▰▰";
}

// ========================
// SAFE TELEGRAM
// ========================
async function safeSend(chatId, text, options = {}) {
try {
return await bot.sendMessage(
chatId,
text,
options
);
} catch (err) {
console.error("[SEND]", err.message);
return null;
}
}

async function safeEdit(chatId, messageId, text) {
try {
return await bot.editMessageText(
text,
{
chat_id: chatId,
message_id: messageId
}
);
} catch {}
}

async function safeDelete(chatId, messageId) {
try {
await bot.deleteMessage(
chatId,
messageId
);
} catch {}
}

// ========================
// FETCH MEDIA
// ========================
async function fetchMedia(chatId, url) {

const loading = await safeSend(
    chatId,

"${A.search} កំពុងស្វែងរកព័ត៌មាន..."
);

try {

    incrementStat("links");

    const res = await axios.get(
        `${API_BASE}/api/download`,
        {
            params: {
                url
            },
            headers: {
                "x-api-key": API_KEY
            },
            timeout: 120000
        }
    );

    await safeDelete(
        chatId,
        loading?.message_id
    );

    return res.data?.result || res.data;

} catch (err) {

    await safeDelete(
        chatId,
        loading?.message_id
    );

    const msg =
        err?.response?.data?.error ||
        err.message;

    await safeSend(
        chatId,

"${A.error} ${msg}"
);

    return null;
}

}

// ========================
// MEDIA HELPERS
// ========================
function findAllByType(data, type) {

if (!Array.isArray(data?.medias)) {
    return [];
}

return data.medias.filter(m => {

    const t = (
        m.type || ""
    ).toLowerCase();

    if (type === "video") {
        return t === "video";
    }

    if (type === "audio") {
        return (
            t === "audio" ||
            /\.(mp3|m4a|ogg|wav)/i.test(m.url || "")
        );
    }

    if (type === "image") {
        return (
            t === "image" ||
            isImage(m.url || "")
        );
    }

    return false;
});

}

function dedupeMedias(arr = []) {

const seen = new Set();

return arr.filter(m => {

    const key =
        `${m.type}_${m.quality}_${m.ext}`;

    if (seen.has(key)) {
        return false;
    }

    seen.add(key);

    return true;
});

}

function findMedia(data, type, index = 0) {
return findAllByType(
data,
type
)[index] || null;
}

// ========================
// BUILD CAPTION
// ========================
function buildCaption(data) {

const emoji = getPlatformEmoji(
    data.platform
);

const lines = [];

lines.push(

"${emoji} <b>${escapeHtml(data.title || "Untitled")}</b>"
);

if (data.author) {
    lines.push(

"${A.user} ${escapeHtml(data.author)}"
);
}

if (data.duration) {
    lines.push(

"${A.time} ${formatDuration(Number(data.duration))}"
);
}

if (data.views) {
    lines.push(

"${A.eyes} ${Number(data.views).toLocaleString()}"
);
}

if (data.platform) {
    lines.push(

"${A.phone} ${data.platform}"
);
}

return lines.join("\n");

}

// ========================
// BUILD KEYBOARD
// ========================
function buildKeyboard(data) {

const keyboard = [];

const videos = dedupeMedias(
    findAllByType(data, "video")
).slice(0,4);

const audios = dedupeMedias(
    findAllByType(data, "audio")
).slice(0,4);

const images = dedupeMedias(
    findAllByType(data, "image")
).slice(0,4);

if (videos.length) {
    keyboard.push(
        videos.map((v,i)=>({
            text: `🎬 ${v.quality || "Video"}`,
            callback_data: `dl_video_${i}`
        }))
    );
}

if (audios.length) {
    keyboard.push(
        audios.map((a,i)=>({
            text: `🎵 ${a.quality || "MP3"}`,
            callback_data: `dl_audio_${i}`
        }))
    );
}

if (images.length) {
    keyboard.push(
        images.map((a,i)=>({
            text: `🖼 ${a.quality || "Image"}`,
            callback_data: `dl_image_${i}`
        }))
    );
}

keyboard.push([
    {
        text: "🛠 Tools",
        web_app: {
            url: "https://tools-amertak.vercel.app"
        }
    }
]);

return keyboard;

}

// ========================
// SEND FILE
// ========================
async function sendFile(
chatId,
media,
data
) {

const progress = await safeSend(
    chatId,

`${A.download} កំពុងទាញយក...

[▱▱▱▱▱] 0%`
);

try {

    const streamUrl =

"${API_BASE}/api/proxy?url=${encodeURIComponent(media.url)}";

    const response = await axios.get(
        streamUrl,
        {
            responseType: "stream",
            headers: {
                "x-api-key": API_KEY
            },
            timeout: 0
        }
    );

    const total = parseInt(
        response.headers["content-length"] || "0"
    );

    let downloaded = 0;
    let lastUpdate = 0;

    const chunks = [];

    response.data.on("data", async(chunk)=>{

        chunks.push(chunk);

        downloaded += chunk.length;

        const percent = total
            ? Math.floor((downloaded/total)*100)
            : 0;

        const now = Date.now();

        if (now - lastUpdate < 1500) {
            return;
        }

        lastUpdate = now;

        await safeEdit(
            chatId,
            progress.message_id,

`${A.download} កំពុងទាញយក...

[${renderBar(percent)}] ${percent}%

${A.package} ${formatBytes(downloaded)} / ${formatBytes(total)}`
);
});

    response.data.on("end", async()=>{

        const buffer = Buffer.concat(chunks);

        const type = (
            media.type || ""
        ).toLowerCase();

        const caption = buildCaption(data);

        try {

            if (type === "video") {

                await bot.sendVideo(
                    chatId,
                    buffer,
                    {
                        caption,
                        parse_mode: "HTML",
                        supports_streaming: true
                    }
                );

            } else if (
                type === "audio" ||
                /\.(mp3|m4a|ogg|wav)/i.test(media.url || "")
            ) {

                await bot.sendAudio(
                    chatId,
                    buffer,
                    {
                        caption,
                        parse_mode: "HTML",
                        title: data.title || "Audio",
                        performer: data.author || "Amertak"
                    }
                );

            } else if (
                type === "image" ||
                isImage(media.url || "")
            ) {

                await bot.sendPhoto(
                    chatId,
                    buffer,
                    {
                        caption,
                        parse_mode: "HTML"
                    }
                );

            } else {

                await bot.sendDocument(
                    chatId,
                    buffer,
                    {
                        caption,
                        parse_mode: "HTML"
                    }
                );
            }

            incrementStat("downloads");

        } catch (err) {

            console.error(
                "[TELEGRAM_SEND]",
                err.message
            );

            await safeSend(
                chatId,

"${A.error} Failed sending media"
);
}

        await safeDelete(
            chatId,
            progress.message_id
        );
    });

} catch (err) {

    console.error(
        "[DOWNLOAD]",
        err.message
    );

    await safeSend(
        chatId,

"${A.error} Download failed"
);

    await safeDelete(
        chatId,
        progress.message_id
    );
}

}

// ========================
// HANDLE URL
// ========================
async function handleMedia(
msg,
url
) {

const chatId = msg.chat.id;

if (isRateLimited(chatId)) {
    return safeSend(
        chatId,

"${A.warn} Please wait a moment"
);
}

updateRate(chatId);

const data = await fetchMedia(
    chatId,
    url
);

if (!data) return;

userStates.set(
    String(chatId),
    {
        data,
        url,
        createdAt: Date.now()
    }
);

const caption = [
    buildCaption(data),
    "",
    `${A.folder} ជ្រើស Format ខាងក្រោម`
].join("\n");

await safeSend(
    chatId,
    caption,
    {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard:
                buildKeyboard(data)
        }
    }
);

}

// ========================
// COMMANDS
// ========================
bot.onText(/^/start/, async(msg)=>{

addUser(msg.chat.id);

await safeSend(
    msg.chat.id,

`${A.wave} <b>Welcome to Amertak Downloader Bot</b>

${A.download} Download:
• YouTube
• TikTok
• Instagram
• Facebook
• Pinterest
• Twitter/X
• Spotify
• SoundCloud

${A.link} Send URL to download

${A.rocket} Powered by Amertak`,
{
parse_mode: "HTML"
}
);
});

bot.onText(/^/help/, async(msg)=>{

await safeSend(
    msg.chat.id,

`${A.help} Commands

/start
/help
/stats
/id`,
{
parse_mode: "HTML"
}
);
});

bot.onText(/^/stats/, async(msg)=>{

await safeSend(
    msg.chat.id,

`${A.chart} Stats

Users: ${users.size}
Downloads: ${stats.downloads || 0}
Links: ${stats.links || 0}`,
{
parse_mode: "HTML"
}
);
});

bot.onText(/^/id/, async(msg)=>{

await safeSend(
    msg.chat.id,

`${A.id} Your ID

<code>${msg.from.id}</code>`,
{
parse_mode: "HTML"
}
);
});

// ========================
// NOTIFY
// ========================
bot.onText(/^/notify (.+)/, async(msg, match)=>{

if (
    String(msg.from.id)
    !==
    String(OWNER_ID)
) {
    return;
}

const text = match[1];

let success = 0;
let failed = 0;

for (const uid of users) {

    try {

        await bot.sendMessage(
            uid,

"${A.mega} ${escapeHtml(text)}",
{
parse_mode: "HTML"
}
);

        success++;

    } catch {
        failed++;
    }
}

await safeSend(
    msg.chat.id,

`${A.done} Broadcast Complete

${A.success} ${success}
${A.error} ${failed}`
);
});

// ========================
// MESSAGE HANDLER
// ========================
bot.on("message", async(msg)=>{

const text = msg.text?.trim();

if (!text) return;

if (text.startsWith("/")) {
    return;
}

addUser(msg.chat.id);

if (isValidURL(text)) {
    return handleMedia(
        msg,
        text
    );
}

});

// ========================
// CALLBACKS
// ========================
bot.on("callback_query", async(query)=>{

try {
    await bot.answerCallbackQuery(
        query.id
    );
} catch {}

const chatId =
    query.message.chat.id;

const state =
    userStates.get(
        String(chatId)
    );

if (!state?.data) {

    return safeSend(
        chatId,

"${A.warn} Session expired"
);
}

const [
    action,
    type,
    indexStr
] = query.data.split("_");

if (action !== "dl") {
    return;
}

const media = findMedia(
    state.data,
    type,
    Number(indexStr || 0)
);

if (!media) {

    return safeSend(
        chatId,

"${A.error} Media not found"
);
}

await sendFile(
    chatId,
    media,
    state.data
);

});

// ========================
// EXPRESS ROUTES
// ========================
app.get("/", (_,res)=>{

res.json({
    status: "ok",
    bot: "Amertak Downloader Bot",
    users: users.size,
    uptime: process.uptime()
});

});

app.get("/health", (_,res)=>{

res.json({
    alive: true,
    timestamp: new Date().toISOString()
});

});

// ========================
// AUTO CLEAN
// ========================
setInterval(()=>{

const now = Date.now();

for (
    const [key,value]
    of userStates.entries()
) {

    if (
        now - value.createdAt
        >
        1000 * 60 * 30
    ) {

        userStates.delete(key);
    }
}

}, 1000 * 60 * 5);

// ========================
// ERRORS
// ========================
bot.on("polling_error",(err)=>{
console.error(
"[POLLING]",
err.message
);
});

process.on(
"unhandledRejection",
console.error
);

process.on(
"uncaughtException",
console.error
);

// ========================
// START SERVER
// ========================
app.listen(PORT, ()=>{

console.log("╔══════════════════════════════════════╗ ║        AMERTAK TELEGRAM BOT         ║ ║--------------------------------------║ ║  Status : ONLINE                    ║ ║  Port   : ${PORT} ║  Users  : ${users.size} ╚══════════════════════════════════════╝");
});