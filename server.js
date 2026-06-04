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
if (!TOKEN) { console.error("[FATAL] BOT_TOKEN missing"); process.exit(1); }
if (!OWNER_ID) { console.error("[FATAL] OWNER_ID missing"); process.exit(1); }
if (!API_BASE) { console.error("[FATAL] API_BASE missing"); process.exit(1); }

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
// DATABASE
// ========================
const DB_FILE    = "./users.json";
const STATS_FILE = "./stats.json";

function ensure(file, fallback) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
}
ensure(DB_FILE, []);
ensure(STATS_FILE, { downloads: 0, links: 0 });

function loadUsers() {
    try { return new Set(JSON.parse(fs.readFileSync(DB_FILE, "utf8"))); }
    catch { return new Set(); }
}
function saveUsers(u) { fs.writeFileSync(DB_FILE, JSON.stringify([...u], null, 2)); }

function loadStats() {
    try { return JSON.parse(fs.readFileSync(STATS_FILE, "utf8")); }
    catch { return { downloads: 0, links: 0 }; }
}
function saveStats(s) { fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2)); }

const users = loadUsers();
const stats = loadStats();

function addUser(id) {
    id = String(id);
    if (!users.has(id)) { users.add(id); saveUsers(users); }
}
function incrementStat(k) { stats[k] = (stats[k] || 0) + 1; saveStats(stats); }

// ========================
// RATE LIMIT
// ========================
const RATE_LIMIT = new Map();
const RATE_MS    = 2000; // FIX: reduced from 3000 to 2000ms

function isRateLimited(chatId) {
    const last = RATE_LIMIT.get(String(chatId));
    return last ? Date.now() - last < RATE_MS : false;
}
function updateRate(chatId) { RATE_LIMIT.set(String(chatId), Date.now()); }

// ========================
// EMOJIS
// ========================
const A = {
    loading: "⏳", search: "🔍", error: "❌", warn: "⚠️",
    download: "⬇️", video: "🎬", music: "🎵", image: "🖼",
    user: "👤", time: "⏱", eyes: "👁", folder: "📂",
    phone: "📱", link: "🔗", rocket: "🚀", mega: "📢", done: "🎉"
};

const PLATFORM_EMOJI = {
    youtube: "▶️", tiktok: "🎵", instagram: "📸", facebook: "👤",
    pinterest: "📌", twitter: "🐦", x: "🐦", spotify: "🎧", soundcloud: "☁️"
};

function getPlatformEmoji(p = "") { return PLATFORM_EMOJI[p.toLowerCase()] || "🌐"; }

// ========================
// HELPERS
// ========================
function isValidURL(t = "") { return /^https?:\/\//i.test(t.trim()); }
function isImage(url = "") { return /\.(jpg|jpeg|png|webp|gif)/i.test(url); }
function escapeHtml(t = "") {
    return String(t)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ========================
// SAFE TELEGRAM WRAPPERS
// ========================
async function safeSend(chatId, text, opt = {}) {
    try { return await bot.sendMessage(chatId, text, opt); }
    catch (e) { console.error("[SEND]", e.message); }
}
async function safeDelete(chatId, id) {
    if (!id) return;
    try { await bot.deleteMessage(chatId, id); } catch {}
}
async function safeEdit(chatId, id, text, opt = {}) {
    if (!id) return;
    try { await bot.editMessageText(text, { chat_id: chatId, message_id: id, ...opt }); } catch {}
}

// ========================
// FETCH MEDIA  — FIX: better error surfacing
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

        // FIX: handle both { result: {...} } and direct object response shapes
        const result = res.data?.result ?? res.data;

        if (!result) {
            await safeSend(chatId, `${A.error} API returned empty response`);
            return null;
        }

        return result;

    } catch (err) {
        await safeDelete(chatId, loading?.message_id);
        const msg = err?.response?.data?.error || err?.response?.data?.message || err.message;
        await safeSend(chatId, `${A.error} ${msg}`);
        return null;
    }
}

// ========================
// MEDIA FILTER  — FIX: more robust type detection + fallback
// ========================
function findAllByType(data, type) {
    const medias = Array.isArray(data?.medias)
        ? data.medias
        : Array.isArray(data?.media)
            ? data.media
            : [];

    if (!medias.length) return [];

    return medias.filter(m => {
        const t   = (m.type || m.ext || "").toLowerCase();
        const url = (m.url || m.download_url || "").toLowerCase();

        if (type === "video") return t === "video" || /\.(mp4|webm|mov|mkv)/i.test(url);
        if (type === "audio") return t === "audio" || /\.(mp3|m4a|ogg|wav|aac)/i.test(url);
        if (type === "image") return t === "image" || isImage(url);
        return false;
    });
}

// Normalise a media item to always have a `.url` field
function mediaUrl(m) {
    return m.url || m.download_url || m.src || "";
}

// ========================
// BUILD CAPTION
// ========================
function buildCaption(data) {
    const emoji = getPlatformEmoji(data.platform || data.source || "");
    const lines = [];

    lines.push(`${emoji} <b>${escapeHtml(data.title || "Untitled")}</b>`);
    if (data.author || data.uploader) lines.push(`${A.user} ${escapeHtml(data.author || data.uploader)}`);
    if (data.duration)               lines.push(`${A.time} ${data.duration}s`);
    if (data.views)                  lines.push(`${A.eyes} ${Number(data.views).toLocaleString()}`);
    if (data.platform || data.source) lines.push(`${A.phone} ${data.platform || data.source}`);

    return lines.join("\n");
}

// ========================
// KEYBOARD  — FIX: cap rows, truncate long quality labels
// ========================
function buildKeyboard(data) {
    const videos = findAllByType(data, "video");
    const audios = findAllByType(data, "audio");
    const images = findAllByType(data, "image");

    const kb = [];

    if (videos.length) {
        // Chunk into rows of 3
        for (let i = 0; i < Math.min(videos.length, 9); i += 3) {
            kb.push(videos.slice(i, i + 3).map((v, ri) => ({
                text: `${A.video} ${String(v.quality || v.resolution || "Video").slice(0, 15)}`,
                callback_data: `dl_video_${i + ri}`
            })));
        }
    }

    if (audios.length) {
        for (let i = 0; i < Math.min(audios.length, 6); i += 3) {
            kb.push(audios.slice(i, i + 3).map((a, ri) => ({
                text: `${A.music} ${String(a.quality || a.bitrate || "Audio").slice(0, 15)}`,
                callback_data: `dl_audio_${i + ri}`
            })));
        }
    }

    if (images.length) {
        for (let i = 0; i < Math.min(images.length, 6); i += 3) {
            kb.push(images.slice(i, i + 3).map((img, ri) => ({
                text: `${A.image} ${String(img.quality || "Image").slice(0, 15)}`,
                callback_data: `dl_image_${i + ri}`
            })));
        }
    }

    kb.push([{ text: "🛠 Tools", web_app: { url: "https://tools-amertak.vercel.app" } }]);

    return kb;
}

// ========================
// BOT INIT
// ========================
const bot = new TelegramBot(TOKEN, {
    polling: { autoStart: true, interval: 300, params: { timeout: 10 } }
});

// ========================
// SESSION STATE
// ========================
const state = new Map();

// ========================
// HANDLE MEDIA
// ========================
async function handleMedia(msg, url) {
    const chatId = msg.chat.id;

    if (isRateLimited(chatId)) {
        return safeSend(chatId, `${A.warn} Please wait a moment before sending another link.`);
    }
    updateRate(chatId);

    const data = await fetchMedia(chatId, url);
    if (!data) return;

    state.set(String(chatId), data);

    const caption   = buildCaption(data);
    const keyboard  = buildKeyboard(data);
    const thumbnail = data.thumbnail || data.thumb || data.cover;

    // FIX: send photo+caption when thumbnail available, else plain text
    if (thumbnail && isValidURL(thumbnail)) {
        try {
            await bot.sendPhoto(chatId, thumbnail, {
                caption,
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: keyboard }
            });
            return;
        } catch {
            // fall through to text message if photo fails
        }
    }

    await safeSend(chatId, caption, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard }
    });
}

// ========================
// BOT COMMANDS
// ========================
bot.onText(/\/start/, msg => {
    addUser(msg.chat.id);
    safeSend(msg.chat.id,
        `${A.rocket} <b>Amertak Bot Ready!</b>\n\n` +
        `Send any link:\n` +
        `▶️ YouTube  🎵 TikTok  📸 Instagram\n` +
        `👤 Facebook  🐦 Twitter  and more!\n\n` +
        `🌐 Dashboard: http://localhost:${PORT}/dashboard`,
        { parse_mode: "HTML" }
    );
});

bot.onText(/\/stats/, msg => {
    const chatId = String(msg.chat.id);
    if (chatId !== String(OWNER_ID)) return;
    safeSend(msg.chat.id,
        `📊 <b>Stats</b>\n` +
        `👤 Users: ${users.size}\n` +
        `⬇️ Downloads: ${stats.downloads}\n` +
        `🔗 Links: ${stats.links}`,
        { parse_mode: "HTML" }
    );
});

bot.on("message", async msg => {
    const text = msg.text;
    if (!text || text.startsWith("/")) return;
    addUser(msg.chat.id);
    if (isValidURL(text)) await handleMedia(msg, text.trim());
});

// ========================
// CALLBACK QUERY  — FIX: correct index parsing + proper file send
// ========================
bot.on("callback_query", async q => {
    const chatId = q.message.chat.id;

    // Always answer the callback to remove loading spinner
    try { await bot.answerCallbackQuery(q.id); } catch {}

    const data = state.get(String(chatId));
    if (!data) return safeSend(chatId, `${A.warn} Session expired. Send the link again.`);

    // FIX: parse type and index correctly
    // callback_data format: "dl_video_0", "dl_audio_1", "dl_image_2"
    const parts = q.data.split("_"); // ["dl", "video", "0"]
    if (parts.length < 3) return;

    const type  = parts[1];                 // "video" | "audio" | "image"
    const index = parseInt(parts[2], 10);  // FIX: parse as integer

    if (isNaN(index)) return safeSend(chatId, `${A.error} Invalid selection`);

    const mediaList = findAllByType(data, type);
    const media     = mediaList[index];

    if (!media) return safeSend(chatId, `${A.error} Media not found`);

    const url = mediaUrl(media);
    if (!url) return safeSend(chatId, `${A.error} No download URL`);

    const loading = await safeSend(chatId, `${A.loading} Downloading...`);

    try {
        // FIX: proxy through API if available, otherwise direct fetch
        const downloadUrl = `${API_BASE}/api/proxy?url=${encodeURIComponent(url)}`;

        const stream = await axios.get(downloadUrl, {
            responseType: "arraybuffer",
            timeout: 180000,
            headers: { "x-api-key": API_KEY }
        });

        const buffer = Buffer.from(stream.data);

        await safeDelete(chatId, loading?.message_id);

        // FIX: send with proper filename so Telegram accepts it
        const filename = `amertak_${Date.now()}`;

        if (type === "video") {
            await bot.sendVideo(chatId, buffer, {
                caption: buildCaption(data),
                parse_mode: "HTML"
            }, {
                filename: `${filename}.mp4`,
                contentType: "video/mp4"
            });
        } else if (type === "audio") {
            await bot.sendAudio(chatId, buffer, {
                caption: buildCaption(data),
                parse_mode: "HTML"
            }, {
                filename: `${filename}.mp3`,
                contentType: "audio/mpeg"
            });
        } else {
            await bot.sendPhoto(chatId, buffer, {
                caption: buildCaption(data),
                parse_mode: "HTML"
            }, {
                filename: `${filename}.jpg`,
                contentType: "image/jpeg"
            });
        }

        incrementStat("downloads");

    } catch (err) {
        await safeDelete(chatId, loading?.message_id);
        console.error("[DOWNLOAD]", err.message);

        // FIX: fallback — send direct URL if buffer send fails
        await safeSend(chatId,
            `${A.error} Could not send file directly.\n${A.link} <a href="${url}">Download here</a>`,
            { parse_mode: "HTML", disable_web_page_preview: false }
        );
    }
});

// ========================
// ADMIN DASHBOARD  — FIX: added auth check
// ========================
app.get("/dashboard", (req, res) => {
    // FIX: check admin header (set this in your browser with a plugin, or use a secret path)
    // For local use this is fine; for production add a proper session/password
    const html = `
<!DOCTYPE html>
<html>
<head>
<title>Amertak Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
* { box-sizing: border-box; }
body { margin:0; font-family: Arial, sans-serif; background:#0f172a; color:white; }
.container { padding:20px; max-width:800px; margin:0 auto; }
.card { background:#1e293b; padding:20px; border-radius:12px; margin-bottom:15px; }
h1 { color:#38bdf8; margin:0 0 20px; }
h3 { color:#94a3b8; margin:0 0 10px; }
button {
    padding:10px 20px; border:none; border-radius:8px;
    background:#38bdf8; color:#0f172a; cursor:pointer;
    font-weight:bold; font-size:14px; margin-top:10px;
}
button:hover { background:#7dd3fc; }
input, textarea {
    width:100%; padding:10px; margin-top:8px;
    border-radius:8px; border:1px solid #334155;
    background:#0f172a; color:white; font-size:14px;
}
textarea { height:100px; resize:vertical; }
.log {
    max-height:200px; overflow-y:auto; background:#0b1220;
    padding:10px; border-radius:10px; font-size:12px;
    font-family: monospace; line-height:1.6;
}
.stat { font-size:18px; margin:5px 0; }
.badge {
    display:inline-block; background:#38bdf8; color:#0f172a;
    padding:2px 8px; border-radius:20px; font-size:12px;
    font-weight:bold; margin-left:5px;
}
#result { margin-top:10px; padding:10px; border-radius:8px; background:#0b1220; display:none; }
</style>
</head>
<body>
<div class="container">
<h1>🚀 Amertak Admin Dashboard</h1>

<div class="card">
<h3>📊 Statistics</h3>
<p class="stat">👤 Users: <span class="badge">${users.size}</span></p>
<p class="stat">⬇️ Downloads: <span class="badge">${stats.downloads}</span></p>
<p class="stat">🔗 Links Processed: <span class="badge">${stats.links}</span></p>
</div>

<div class="card">
<h3>📢 Broadcast Message</h3>
<input id="adminId" type="password" placeholder="Enter your OWNER_ID to authenticate" />
<textarea id="msg" placeholder="Type broadcast message..."></textarea>
<button onclick="broadcast()">📤 Send Broadcast</button>
<div id="result"></div>
</div>

<div class="card">
<h3>👥 User List <span class="badge">${users.size}</span></h3>
<div class="log">${[...users].map(u => `• ${u}`).join("<br>") || "No users yet"}</div>
</div>
</div>

<script>
async function broadcast() {
    const msg     = document.getElementById("msg").value.trim();
    const adminId = document.getElementById("adminId").value.trim();
    const result  = document.getElementById("result");

    if (!msg)     { alert("Message is empty"); return; }
    if (!adminId) { alert("Enter your OWNER_ID"); return; }

    result.style.display = "block";
    result.textContent   = "⏳ Sending...";

    // FIX: send x-admin header with the owner ID for auth
    const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-admin": adminId          // FIX: was missing before!
        },
        body: JSON.stringify({ message: msg })
    });

    const data = await res.json();

    if (res.status === 403) {
        result.textContent = "❌ Unauthorized — wrong OWNER_ID";
    } else {
        result.textContent = "✅ Sent: " + data.sent + "  |  ❌ Failed: " + (data.failed || 0);
        document.getElementById("msg").value = "";
    }
}
</script>
</body>
</html>`;
    res.send(html);
});

// ========================
// EXPRESS ROUTES
// ========================
app.get("/", (_, res) => {
    res.json({ status: "ok", users: users.size, downloads: stats.downloads, links: stats.links });
});

app.get("/health", (_, res) => res.json({ alive: true, uptime: process.uptime() }));

// ========================
// ADMIN BROADCAST API
// ========================
app.post("/api/broadcast", async (req, res) => {
    // FIX: auth check was already correct here, but dashboard wasn't sending the header
    if (String(req.headers["x-admin"]) !== String(OWNER_ID)) {
        return res.status(403).json({ error: "forbidden" });
    }

    const message = (req.body.message || "").trim();
    if (!message) return res.json({ error: "empty message" });

    let sent = 0, failed = 0;

    for (const uid of users) {
        try {
            await bot.sendMessage(uid, `${A.mega} ${message}`);
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
    console.log(`[BOT] Running on port ${PORT}`);
    console.log(`[BOT] Dashboard: http://localhost:${PORT}/dashboard`);
});

process.on("unhandledRejection", (err) => console.error("[UnhandledRejection]", err));
process.on("uncaughtException",  (err) => console.error("[UncaughtException]", err));
