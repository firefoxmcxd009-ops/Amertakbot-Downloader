require("dotenv").config();

const fs          = require("fs");
const express     = require("express");
const axios       = require("axios");
const compression = require("compression");
const helmet      = require("helmet");
const TelegramBot = require("node-telegram-bot-api");

const app = express();

// ========================
// CONFIG
// ========================
const TOKEN    = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const API_BASE = process.env.API_BASE;
const API_KEY  = process.env.API_KEY || "amertak_super_key_2026";
const PORT     = process.env.PORT || 3000;

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
function isAdmin(req) {
    return String(req.headers["x-admin"]) === String(OWNER_ID);
}
// ========================
// SECURITY MIDDLEWARE
// ========================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    next();
});
// ========================
// ADMIN DASHBOARD UI
// ========================
app.get("/dashboard", (req, res) => {

    const html = `
<!DOCTYPE html>
<html>
<head>
<title>Amertak Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />

<style>
body {
    margin:0;
    font-family: Arial;
    background:#0f172a;
    color:white;
}

.container {
    padding:20px;
}

.card {
    background:#1e293b;
    padding:15px;
    border-radius:12px;
    margin-bottom:10px;
}

h1 {
    color:#38bdf8;
}

button {
    padding:10px;
    border:none;
    border-radius:8px;
    background:#38bdf8;
    color:black;
    cursor:pointer;
    font-weight:bold;
}

input, textarea {
    width:100%;
    padding:10px;
    margin-top:5px;
    border-radius:8px;
    border:none;
}

.log {
    height:150px;
    overflow:auto;
    background:#0b1220;
    padding:10px;
    border-radius:10px;
    font-size:12px;
}
</style>
</head>

<body>

<div class="container">

<h1>🚀 Amertak Admin Dashboard</h1>

<div class="card">
<h3>📊 Stats</h3>
<p>👤 Users: ${users.size}</p>
<p>⬇️ Downloads: ${stats.downloads}</p>
<p>🔗 Links: ${stats.links}</p>
</div>

<div class="card">
<h3>📢 Broadcast Message</h3>

<textarea id="msg" placeholder="Type message..."></textarea>
<br><br>
<button onclick="broadcast()">Send Broadcast</button>
</div>

<div class="card">
<h3>👤 User List</h3>
<div class="log" id="usersBox">${[...users].join("<br>")}</div>
</div>

</div>

<script>

async function broadcast() {
    const msg = document.getElementById("msg").value;

    const res = await fetch("/api/broadcast", {
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body: JSON.stringify({ message: msg })
    });

    const data = await res.json();
    alert("Sent: " + data.sent);
}

</script>

</body>
</html>
`;

    res.send(html);
});

// ========================
// BOT INIT
// ========================
const bot = new TelegramBot(TOKEN, {
    polling: {
        autoStart: true,
        interval: 300,
        params: { timeout: 10 }
    }
});

// ========================
// DATABASE
// ========================
const DB_FILE = "./users.json";
const STATS_FILE = "./stats.json";

function ensure(file, fallback) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    }
}
ensure(DB_FILE, []);
ensure(STATS_FILE, { downloads: 0, links: 0 });

function loadUsers() {
    try {
        return new Set(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
    } catch {
        return new Set();
    }
}

function saveUsers(u) {
    fs.writeFileSync(DB_FILE, JSON.stringify([...u], null, 2));
}

function loadStats() {
    try {
        return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
    } catch {
        return { downloads: 0, links: 0 };
    }
}

function saveStats(s) {
    fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2));
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

function incrementStat(k) {
    stats[k] = (stats[k] || 0) + 1;
    saveStats(stats);
}

// ========================
// RATE LIMIT
// ========================
const RATE_LIMIT = new Map();
const RATE_MS = 3000;

function isRateLimited(chatId) {
    const last = RATE_LIMIT.get(String(chatId));
    return last ? Date.now() - last < RATE_MS : false;
}

function updateRate(chatId) {
    RATE_LIMIT.set(String(chatId), Date.now());
}

// ========================
// EMOJIS
// ========================
const A = {
    loading: "⏳",
    search: "🔍",
    error: "❌",
    warn: "⚠️",
    download: "⬇️",
    video: "🎬",
    music: "🎵",
    image: "🖼",
    user: "👤",
    time: "⏱",
    eyes: "👁",
    folder: "📂",
    phone: "📱",
    link: "🔗",
    rocket: "🚀",
    mega: "📢",
    done: "🎉"
};

// ========================
// PLATFORM EMOJI
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

function getPlatformEmoji(p = "") {
    return PLATFORM_EMOJI[p.toLowerCase()] || "🌐";
}

// ========================
// HELPERS (FIXED BUGS)
// ========================
function isValidURL(t = "") {
    return /^https?:\/\//i.test(t);
}

function isImage(url = "") {
    return /\.(jpg|jpeg|png|webp|gif)/i.test(url);
}

function escapeHtml(t = "") {
    return String(t)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ========================
// SAFE TELEGRAM
// ========================
async function safeSend(chatId, text, opt = {}) {
    try {
        return await bot.sendMessage(chatId, text, opt);
    } catch (e) {
        console.error("[SEND]", e.message);
    }
}

async function safeDelete(chatId, id) {
    try {
        await bot.deleteMessage(chatId, id);
    } catch {}
}

async function safeEdit(chatId, id, text) {
    try {
        await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: id
        });
    } catch {}
}

// ========================
// FETCH MEDIA (FIXED TEMPLATE STRING)
// ========================
async function fetchMedia(chatId, url) {
    const loading = await safeSend(chatId, `${A.search} កំពុងស្វែងរក...`);

    try {
        incrementStat("links");

        const res = await axios.get(`${API_BASE}/api/download`, {
            params: { url },
            headers: { "x-api-key": API_KEY },
            timeout: 120000
        });

        await safeDelete(chatId, loading?.message_id);

        return res.data?.result;
    } catch (err) {
        await safeDelete(chatId, loading?.message_id);

        const msg = err?.response?.data?.error || err.message;

        await safeSend(chatId, `${A.error} ${msg}`);
        return null;
    }
}

// ========================
// MEDIA FILTER
// ========================
function findAllByType(data, type) {
    if (!Array.isArray(data?.medias)) return [];

    return data.medias.filter(m => {
        const t = (m.type || "").toLowerCase();

        if (type === "video") return t === "video";
        if (type === "audio")
            return t === "audio" || /\.(mp3|m4a|ogg|wav)/i.test(m.url || "");
        if (type === "image")
            return t === "image" || isImage(m.url || "");

        return false;
    });
}

// ========================
// BUILD CAPTION (FIXED ${} BUG)
// ========================
function buildCaption(data) {

    const emoji = getPlatformEmoji(data.platform);

    const lines = [];

    lines.push(
        `${emoji} <b>${escapeHtml(data.title || "Untitled")}</b>`
    );

    if (data.author) {
        lines.push(`${A.user} ${escapeHtml(data.author)}`);
    }

    if (data.duration) {
        lines.push(`${A.time} ${data.duration}s`);
    }

    if (data.views) {
        lines.push(`${A.eyes} ${data.views}`);
    }

    if (data.platform) {
        lines.push(`${A.phone} ${data.platform}`);
    }

    return lines.join("\n");
}

// ========================
// KEYBOARD (FIXED)
// ========================
function buildKeyboard(data) {

    const videos = findAllByType(data, "video");
    const audios = findAllByType(data, "audio");
    const images = findAllByType(data, "image");

    const kb = [];

    if (videos.length) {
        kb.push(videos.map((v, i) => ({
            text: `🎬 ${v.quality || "Video"}`,
            callback_data: `dl_video_${i}`
        })));
    }

    if (audios.length) {
        kb.push(audios.map((a, i) => ({
            text: `🎵 ${a.quality || "Audio"}`,
            callback_data: `dl_audio_${i}`
        })));
    }

    if (images.length) {
        kb.push(images.map((i, idx) => ({
            text: `🖼 ${i.quality || "Image"}`,
            callback_data: `dl_image_${idx}`
        })));
    }

    kb.push([{
        text: "🛠 Tools",
        web_app: { url: "https://tools-amertak.vercel.app" }
    }]);

    return kb;
}

// ========================
// HANDLE MEDIA
// ========================
const state = new Map();

async function handleMedia(msg, url) {

    const chatId = msg.chat.id;

    if (isRateLimited(chatId)) {
        return safeSend(chatId, `${A.warn} Slow down`);
    }

    updateRate(chatId);

    const data = await fetchMedia(chatId, url);
    if (!data) return;

    state.set(String(chatId), data);

    await safeSend(chatId,
        buildCaption(data),
        {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: buildKeyboard(data)
            }
        }
    );
}

// ========================
// BOT EVENTS
// ========================
bot.onText(/\/start/, async msg => {
    addUser(msg.chat.id);

    safeSend(msg.chat.id,
`${A.rocket} Amertak Bot Ready
🌐 Dashboard:
http://localhost:${PORT}/dashboard

Send any link:
YouTube, TikTok, Instagram, etc.`);
});

bot.on("message", async msg => {
    const text = msg.text;
    if (!text || text.startsWith("/")) return;

    addUser(msg.chat.id);

    if (isValidURL(text)) {
        await handleMedia(msg, text);
    }
});

// ========================
// CALLBACK (FIXED)
// ========================
bot.on("callback_query", async q => {

    const chatId = q.message.chat.id;
    const data = state.get(String(chatId));

    if (!data) {
        return safeSend(chatId, `${A.warn} Session expired`);
    }

    const [, type, index] = q.data.split("_");

    let media;

    if (type === "video") media = findAllByType(data, "video")[index];
    if (type === "audio") media = findAllByType(data, "audio")[index];
    if (type === "image") media = findAllByType(data, "image")[index];

    if (!media) {
        return safeSend(chatId, `${A.error} Not found`);
    }

    const stream = await axios.get(
        `${API_BASE}/api/proxy?url=${encodeURIComponent(media.url)}`,
        { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(stream.data);

    if (type === "video") {
        await bot.sendVideo(chatId, buffer);
    } else if (type === "audio") {
        await bot.sendAudio(chatId, buffer);
    } else {
        await bot.sendPhoto(chatId, buffer);
    }

    incrementStat("downloads");
});

// ========================
// EXPRESS
// ========================
app.get("/", (_, res) => {
    res.json({
        status: "ok",
        users: users.size,
        downloads: stats.downloads
    });
});

app.get("/health", (_, res) => {
    res.json({ alive: true });
});
// ========================
// ADMIN BROADCAST API
// ========================
app.post("/api/broadcast", async (req, res) => {

    if (String(req.headers["x-admin"]) !== String(OWNER_ID)) {
        return res.status(403).json({ error: "forbidden" });
    }

    const message = req.body.message;

    if (!message) {
        return res.json({ error: "empty message" });
    }

    let sent = 0;
    let failed = 0;

    for (const uid of users) {
        try {
            await bot.sendMessage(uid, `📢 ${message}`);
            sent++;
        } catch {
            failed++;
        }
    }

    res.json({ sent, failed });
});

// ========================
// START
// ========================
app.listen(PORT, () => {
    console.log(`BOT RUNNING ON PORT ${PORT}`);
});

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);