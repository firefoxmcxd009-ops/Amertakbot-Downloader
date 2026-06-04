require("dotenv").config();

const fs      = require("fs");
const express = require("express");
const axios   = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// ========================
// CONFIG
// ========================
const TOKEN    = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const API_BASE = process.env.API_BASE;
const API_KEY  = process.env.API_KEY || "amertak_super_key_2026";
const PORT     = process.env.PORT    || 3000;

// ========================
// VALIDATE ENV
// ========================
if (!TOKEN)    { console.error("[FATAL] BOT_TOKEN is missing");  process.exit(1); }
if (!OWNER_ID) { console.error("[FATAL] OWNER_ID is missing");   process.exit(1); }
if (!API_BASE) { console.error("[FATAL] API_BASE is missing");   process.exit(1); }

// ========================
// INIT BOT
// ========================
const bot = new TelegramBot(TOKEN, {
    polling: { interval: 300, autoStart: true, params: { timeout: 10 } }
});

// ========================
// INIT EXPRESS
// ========================
const app = express();
app.use(express.json());

app.get("/", (_, res) => res.json({
    status : "ok",
    bot    : "Amertak Bot",
    uptime : Math.floor(process.uptime()) + "s",
    users  : users.size
}));
app.get("/health", (_, res) => res.json({ alive: true, timestamp: new Date().toISOString() }));
app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));

// ========================
// DATABASE
// ========================
const DB_FILE    = "./users.json";
const STATS_FILE = "./stats.json";

function loadUsers() {
    try {
        if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");
        return new Set(JSON.parse(fs.readFileSync(DB_FILE, "utf-8")));
    } catch { console.warn("[DB] Could not load users."); return new Set(); }
}
function saveUsers(set) {
    try { fs.writeFileSync(DB_FILE, JSON.stringify([...set], null, 2)); }
    catch (err) { console.error("[DB] Failed to save users:", err.message); }
}
function loadStats() {
    try {
        if (!fs.existsSync(STATS_FILE))
            fs.writeFileSync(STATS_FILE, JSON.stringify({ downloads: 0, links: 0 }));
        return JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
    } catch { return { downloads: 0, links: 0 }; }
}
function saveStats(d) {
    try { fs.writeFileSync(STATS_FILE, JSON.stringify(d, null, 2)); } catch {}
}

const users = loadUsers();
const stats = loadStats();

function addUser(id) {
    id = String(id);
    if (!users.has(id)) { users.add(id); saveUsers(users); }
}
function incrementStat(key) {
    stats[key] = (stats[key] || 0) + 1;
    saveStats(stats);
}

// ========================
// STATES
// ========================
const userStates  = new Map();  // chatId -> { data, url }
const replyStates = new Map();  // chatId -> targetUserId
const rateLimiter = new Map();  // chatId -> timestamp

// ========================
// RATE LIMIT
// ========================
const RATE_LIMIT_MS = 3000;
function isRateLimited(chatId) {
    const last = rateLimiter.get(String(chatId));
    return last ? Date.now() - last < RATE_LIMIT_MS : false;
}
function setRateLimit(chatId) { rateLimiter.set(String(chatId), Date.now()); }

// ========================
// PLATFORM EMOJI MAP
// ========================
const PLATFORM_EMOJI = {
    "youtube"     : "▶️",
    "tiktok"      : "🎵",
    "instagram"   : "📸",
    "pinterest"   : "📌",
    "facebook"    : "👤",
    "twitter/x"   : "🐦",
    "twitter"     : "🐦",
    "x"           : "🐦",
    "soundcloud"  : "☁️",
    "vimeo"       : "🎞",
    "dailymotion" : "📺",
    "spotify"     : "🎧"
};

function getPlatformEmoji(platform = "") {
    return PLATFORM_EMOJI[platform.toLowerCase()] || "🌐";
}

// ========================
// HELPERS
// ========================
function isImage(url = "")     { return /\.(jpg|jpeg|png|webp|gif)/i.test(url); }
function isValidURL(text = "") { return text.startsWith("http://") || text.startsWith("https://"); }

function renderProgressBar(percent) {
    const filled = Math.round(Math.min(percent, 100) / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}
function formatBytes(bytes = 0) {
    if (!bytes || bytes <= 0) return "Unknown";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}
function formatDuration(seconds = 0) {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${m}:${String(s).padStart(2,"0")}`;
}
function getUsername(from) { return from?.username ? `@${from.username}` : "none"; }
function getFullName(from) { return `${from?.first_name || ""} ${from?.last_name || ""}`.trim() || "Unknown"; }

// ========================
// SAFE HELPERS
// ========================
async function safeDelete(chatId, messageId) {
    try { await bot.deleteMessage(chatId, messageId); } catch {}
}
async function safeSend(chatId, text, options = {}) {
    try { return await bot.sendMessage(chatId, text, options); }
    catch (err) { console.error(`[SEND] Failed to ${chatId}:`, err.message); return null; }
}
async function safeEdit(chatId, messageId, text) {
    try { return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId }); } catch {}
}

// ========================
// FETCH MEDIA INFO
// ========================
async function fetchMedia(chatId, url) {
    const loading = await safeSend(chatId, "⏳ កំពុងស្វែងរកព័ត៌មាន...");

    try {
        incrementStat("links");
        const res = await axios.get(`${API_BASE}/api/download`, {
            params  : { url },
            headers : { "x-api-key": API_KEY },
            timeout : 120000
        });
        await safeDelete(chatId, loading?.message_id);
        return res.data?.result || res.data;

    } catch (err) {
        const statusCode = err?.response?.status;
        const msg        = err?.response?.data?.message || err.message || "Unknown error";
        console.error(`[FETCH] Error for ${url}:`, msg);
        await safeDelete(chatId, loading?.message_id);

        if      (statusCode === 429) await safeSend(chatId, "⚠️ Too many requests. Please wait a moment.");
        else if (statusCode === 400) await safeSend(chatId, "❌ Unsupported platform or invalid link.\n\n🌐 Supported: YouTube · TikTok · Instagram · Pinterest · Facebook · Twitter/X · SoundCloud · Vimeo · Dailymotion · Spotify");
        else if (statusCode === 404) await safeSend(chatId, "❌ Link not found or content is private.");
        else                          await safeSend(chatId, `❌ មិនអាចទាញព័ត៌មានបាន។\n\n⚠️ ${msg}`);
        return null;
    }
}

// ========================
// FIND MEDIA HELPERS
// ========================
function findAllByType(data, type) {
    if (!data?.medias || !Array.isArray(data.medias)) return [];
    if (type === "video") return data.medias.filter(m => m.type?.toLowerCase() === "video");
    if (type === "audio") return data.medias.filter(m =>
        ["audio", "audio_preview"].includes(m.type?.toLowerCase())
    );
    if (type === "image") return data.medias.filter(m =>
        m.type?.toLowerCase() === "image" || isImage(m.url || "")
    );
    return [];
}

function findMediaByIndex(data, type, index = 0) {
    return findAllByType(data, type)[index] || null;
}

// Deduplicate medias by quality+type
function dedupeMedias(medias = []) {
    const seen = new Set();
    return medias.filter(m => {
        const key = `${m.type}_${m.quality}_${m.ext || m.extension || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ========================
// BUILD INFO CAPTION (thumbnail message)
// ========================
function buildInfoCaption(data) {
    const emoji = getPlatformEmoji(data.platform);
    const lines = [];

    lines.push(`${emoji} <b>${escapeHtml(data.title || "Untitled")}</b>`);

    if (data.author)   lines.push(`👤 ${escapeHtml(data.author)}`);
    if (data.platform) lines.push(`📱 ${data.platform}`);

    const meta = [];
    if (data.duration) meta.push(`⏱ ${formatDuration(Number(data.duration))}`);
    if (data.views)    meta.push(`👁 ${Number(data.views).toLocaleString()} views`);
    if (meta.length)   lines.push(meta.join("  ·  "));

    if (data.note)     lines.push(`\nℹ️ <i>${escapeHtml(data.note)}</i>`);

    return lines.join("\n");
}

function escapeHtml(text = "") {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ========================
// BUILD FORMAT KEYBOARD
// Layout per format:
//   [🎬 720p]  [🔗 Link]    ← video row
//   [🎵 MP3]   [🔗 Link]    ← audio row
//   [🖼 Image] [🔗 Link]    ← image row
//   [🛠 Tools]              ← always last
// ========================
function buildFormatKeyboard(data) {
    const keyboard = [];

    const videos = dedupeMedias(findAllByType(data, "video")).slice(0, 4);
    const audios  = dedupeMedias(findAllByType(data, "audio")).slice(0, 3);
    const images  = dedupeMedias(findAllByType(data, "image")).slice(0, 3);

    videos.forEach((v, i) => {
        const label = v.quality || (videos.length > 1 ? `Video ${i + 1}` : "Video");
        const row   = [{ text: `🎬 ${label}`, callback_data: `dl_video_${i}` }];
        if (v.downloadUrl) row.push({ text: "🔗 Link", url: v.downloadUrl });
        keyboard.push(row);
    });

    audios.forEach((a, i) => {
        const label = a.quality || (audios.length > 1 ? `Audio ${i + 1}` : "MP3");
        const row   = [{ text: `🎵 ${label}`, callback_data: `dl_audio_${i}` }];
        if (a.downloadUrl) row.push({ text: "🔗 Link", url: a.downloadUrl });
        keyboard.push(row);
    });

    images.forEach((img, i) => {
        const label = img.quality || (images.length > 1 ? `Image ${i + 1}` : "Image");
        const row   = [{ text: `🖼 ${label}`, callback_data: `dl_image_${i}` }];
        if (img.downloadUrl) row.push({ text: "🔗 Link", url: img.downloadUrl });
        keyboard.push(row);
    });

    keyboard.push([{
        text    : "🛠 Tools",
        web_app : { url: "https://tools-amertak.vercel.app" }
    }]);

    return keyboard;
}

// ========================
// BUILD SELECTION SUMMARY
// ========================
function buildSelectionSummary(data) {
    const videos = dedupeMedias(findAllByType(data, "video"));
    const audios  = dedupeMedias(findAllByType(data, "audio"));
    const images  = dedupeMedias(findAllByType(data, "image"));

    const lines = ["📂 <b>ជ្រើសរើស Format ដើម្បីទាញយក:</b>\n"];

    if (videos.length) {
        lines.push(`🎬 <b>Video</b> — ${videos.map(v => v.quality || "?").join(" · ")}`);
    }
    if (audios.length) {
        lines.push(`🎵 <b>Audio</b> — ${audios.map(a => a.quality || "MP3").join(" · ")}`);
    }
    if (images.length) {
        lines.push(`🖼 <b>Image</b> — ${images.length} option${images.length > 1 ? "s" : ""}`);
    }

    lines.push("\n• ចុច 🎬🎵🖼 → Upload ទៅ Telegram");
    lines.push("• ចុច 🔗 Link → Download ដោយ Browser");

    return lines.join("\n");
}

// ========================
// STREAM & SEND FILE
// ========================
async function sendFile(chatId, media, data) {
    const progressMessage = await safeSend(chatId,
`⬇️ កំពុងទាញយក...

[░░░░░░░░░░] 0%`
    );
    if (!progressMessage) return;

    let downloadDone = false;

    try {
        const response = await axios.get(`${API_BASE}/api/proxy`, {
            responseType : "stream",
            params       : { url: media.url },
            timeout      : 0
        });

        const total    = parseInt(response.headers["content-length"] || "0", 10);
        let downloaded = 0;
        let lastUpdate = 0;
        const chunks   = [];

        response.data.on("data", async (chunk) => {
            downloaded += chunk.length;
            chunks.push(chunk);
            const percent = total ? Math.floor((downloaded / total) * 100) : 0;
            const now     = Date.now();
            if (now - lastUpdate < 1500) return;
            lastUpdate = now;
            await safeEdit(chatId, progressMessage.message_id,
`⬇️ កំពុងទាញយក...

[${renderProgressBar(percent)}] ${percent}%
📦 ${formatBytes(downloaded)} / ${formatBytes(total)}`
            );
        });

        response.data.on("end", async () => {
            downloadDone = true;
            const buffer  = Buffer.concat(chunks);
            const emoji   = getPlatformEmoji(data.platform);
            const caption = [
                `${emoji} ${data.title || "Downloaded"}`,
                data.author   ? `👤 ${data.author}`                  : "",
                data.duration ? `⏱ ${formatDuration(Number(data.duration))}` : "",
                data.platform ? `📱 ${data.platform}`                 : "",
                media.quality ? `🎚 ${media.quality}`                 : ""
            ].filter(Boolean).join("\n");

            try {
                const type = media.type?.toLowerCase();
                if (type === "audio" || type === "audio_preview") {
                    await bot.sendAudio(chatId, buffer, {
                        caption,
                        title     : data.title  || "Audio",
                        performer : data.author || "Amertak"
                    });
                } else if (type === "video") {
                    await bot.sendVideo(chatId, buffer, { caption, supports_streaming: true });
                } else if (type === "image" || isImage(media.url || "")) {
                    await bot.sendPhoto(chatId, buffer, { caption });
                } else {
                    await bot.sendDocument(chatId, buffer, { caption });
                }
                incrementStat("downloads");
            } catch (err) {
                console.error("[SEND_FILE]", err.message);
                // File too large for Telegram (50MB bot limit) — send link instead
                if (err.message?.includes("Request Entity Too Large") || err.message?.includes("413")) {
                    const fallbackUrl = media.downloadUrl
                        || `${API_BASE}/api/proxy?url=${encodeURIComponent(media.url)}`;
                    await safeSend(chatId,
`⚠️ ឯកសារធំពេក — Telegram មិនអនុញ្ញាត (>50MB)

🔗 ចុចទីនេះដើម្បី Download ដោយ Browser:
${fallbackUrl}`
                    );
                } else {
                    await safeSend(chatId, "❌ បរាជ័យក្នុងការផ្ញើឯកសារ");
                }
            }
            await safeDelete(chatId, progressMessage.message_id);
        });

        response.data.on("error", async (err) => {
            console.error("[STREAM_ERROR]", err.message);
            if (!downloadDone) await safeSend(chatId, "❌ Download Error — stream interrupted");
            await safeDelete(chatId, progressMessage.message_id);
        });

    } catch (err) {
        console.error("[DOWNLOAD]", err.message);
        await safeSend(chatId, "❌ Server Error — please try again");
        await safeDelete(chatId, progressMessage.message_id);
    }
}

// ========================
// /start
// ========================
bot.onText(/\/start/, async (msg) => {
    addUser(msg.chat.id);
    await safeSend(msg.chat.id,
`👋 សូមស្វាគមន៍ <b>${escapeHtml(getFullName(msg.from))}</b>!

📥 <b>របៀបប្រើ:</b>
1. ផ្ញើ Link វីដេអូ / តន្ត្រី / រូបភាព
2. ជ្រើសរើស Format ដែលចង់បាន
3. ចុច 🎬🎵🖼 → Upload ទៅ Telegram
   ចុច 🔗 Link → Download ដោយ Browser

🌐 <b>Platform ដែលគាំទ្រ:</b>
▶️ YouTube  🎵 TikTok  📸 Instagram
📌 Pinterest  👤 Facebook  🐦 Twitter/X
☁️ SoundCloud  🎞 Vimeo  📺 Dailymotion  🎧 Spotify

📋 <b>បញ្ជា:</b>
• /ask [សារ] — ផ្ញើសំណួរទៅ Owner
• /id — មើល User ID
• /stats — ស្ថិតិ Bot
• /cancel — បោះបង់ Action បច្ចុប្បន្ន
• /help — បង្ហាញជំនួយ
• /notify [សារ] — Broadcast (Owner Only)
• /users — ចំនួន Users (Owner Only)`,
        {
            parse_mode  : "HTML",
            reply_markup: {
                inline_keyboard: [[{
                    text    : "🛠 Tools",
                    web_app : { url: "https://tools-amertak.vercel.app" }
                }]]
            }
        }
    );
});

// ========================
// /help
// ========================
bot.onText(/\/help/, async (msg) => {
    await safeSend(msg.chat.id,
`📖 <b>Amertak Bot — Help</b>

<b>ចម្លង Link ហើយ Paste ក្នុង Bot:</b>
Bot នឹងទទួល Link ហើយ fetch media info ស្វ័យប្រវត្តិ

<b>Format Buttons:</b>
🎬 Video — ទាញ video ដោយ quality ជ្រើស
🎵 Audio/MP3 — ទាញ audio
🖼 Image — ទាញ image
🔗 Link — Direct link ទៅ browser download

<b>Platform Support:</b>
▶️ YouTube (multi-quality)
🎵 TikTok (no watermark)
📸 Instagram (posts, reels, stories)
📌 Pinterest (video + image)
👤 Facebook (public videos)
🐦 Twitter/X (video + image)
☁️ SoundCloud (audio)
🎞 Vimeo (video)
📺 Dailymotion (video)
🎧 Spotify (metadata + preview)

<b>Commands:</b>
/ask — ផ្ញើ message ទៅ Owner
/id — មើល User ID
/stats — Bot statistics
/cancel — Cancel current action`,
        { parse_mode: "HTML" }
    );
});

// ========================
// /id
// ========================
bot.onText(/\/id/, async (msg) => {
    await safeSend(msg.chat.id,
`🪪 <b>ព័ត៌មានរបស់អ្នក</b>

👤 Name: ${escapeHtml(getFullName(msg.from))}
🆔 User ID: <code>${msg.from.id}</code>
💬 Chat ID: <code>${msg.chat.id}</code>
📛 Username: ${getUsername(msg.from)}`,
        { parse_mode: "HTML" }
    );
});

// ========================
// /stats
// ========================
bot.onText(/\/stats/, async (msg) => {
    await safeSend(msg.chat.id,
`📊 <b>Bot Statistics</b>

👥 Total Users: <b>${users.size}</b>
🔗 Links Processed: <b>${stats.links || 0}</b>
📥 Files Downloaded: <b>${stats.downloads || 0}</b>
⏱ Uptime: ${Math.floor(process.uptime())}s`,
        { parse_mode: "HTML" }
    );
});

// ========================
// /cancel
// ========================
bot.onText(/\/cancel/, async (msg) => {
    const chatId   = String(msg.chat.id);
    const wasReply = replyStates.has(chatId);
    replyStates.delete(chatId);
    userStates.delete(chatId);
    await safeSend(msg.chat.id, wasReply ? "✅ Reply mode cancelled." : "✅ Action cleared.");
});

// ========================
// /users (Owner Only)
// ========================
bot.onText(/\/users/, async (msg) => {
    if (String(msg.chat.id) !== String(OWNER_ID)) return;
    await safeSend(msg.chat.id,
`👥 <b>Users Summary</b>

Total: <b>${users.size}</b>
IDs: <code>${[...users].slice(0, 20).join(", ")}</code>${users.size > 20 ? "\n...and more" : ""}`,
        { parse_mode: "HTML" }
    );
});

// ========================
// /ask
// ========================
bot.onText(/\/ask (.+)/, async (msg, match) => {
    const question = match[1].trim();
    if (!question) return;
    await safeSend(msg.chat.id, "✅ សំណួររបស់អ្នកត្រូវបានផ្ញើ។ Owner នឹងឆ្លើយតបក្នុងពេលឆាប់ៗ។");
    await bot.sendMessage(OWNER_ID,
`📩 <b>សំណួរថ្មីបានមក!</b>

👤 Name: ${escapeHtml(getFullName(msg.from))}
🆔 User ID: <code>${msg.from.id}</code>
📛 Username: ${getUsername(msg.from)}

💬 Message:
${escapeHtml(question)}`,
        {
            parse_mode   : "HTML",
            reply_markup : {
                inline_keyboard: [[
                    { text: "↩️ Reply", callback_data: `reply_${msg.from.id}` }
                ]]
            }
        }
    );
});

// ========================
// /reply (Owner Only)
// ========================
bot.onText(/\/reply (\d+) (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(OWNER_ID)) return;
    try {
        await bot.sendMessage(match[1], `📨 <b>Reply From Owner</b>\n\n${escapeHtml(match[2].trim())}`, { parse_mode: "HTML" });
        await safeSend(msg.chat.id, `✅ Reply sent to ${match[1]}`);
    } catch {
        await safeSend(msg.chat.id, "❌ មិនអាចផ្ញើបាន — user may have blocked the bot");
    }
});

// ========================
// /notify (Owner Only)
// ========================
bot.onText(/\/notify (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(OWNER_ID)) return safeSend(msg.chat.id, "⛔ Not Allowed");
    const text = match[1].trim();
    if (!text) return;

    let success = 0, failed = 0;
    const failedIds = [];
    const broadcastMsg = await safeSend(msg.chat.id, `📡 Broadcasting to ${users.size} users...`);

    for (const id of users) {
        try {
            await bot.sendMessage(id, `📢 <b>Broadcast</b>\n\n${escapeHtml(text)}`, { parse_mode: "HTML" });
            success++;
        } catch { failed++; failedIds.push(id); }
        await new Promise(r => setTimeout(r, 50));
    }

    if (broadcastMsg) await safeDelete(msg.chat.id, broadcastMsg.message_id);
    await safeSend(msg.chat.id,
`📡 <b>Broadcast Completed</b>

✅ Success: <b>${success}</b>
❌ Failed: <b>${failed}</b>
${failedIds.length > 0 ? `\nFailed IDs: <code>${failedIds.slice(0,10).join(", ")}${failedIds.length > 10 ? "..." : ""}</code>` : ""}`,
        { parse_mode: "HTML" }
    );
});

// ========================
// CALLBACK QUERY
// ========================
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;
    await bot.answerCallbackQuery(query.id).catch(() => {});

    // REPLY MODE
    if (action.startsWith("reply_")) {
        if (String(chatId) !== String(OWNER_ID)) return;
        const userId = action.split("_")[1];
        replyStates.set(String(chatId), userId);
        return safeSend(chatId,
`↩️ <b>Reply Mode Enabled</b>

🆔 Replying to User: <code>${userId}</code>

ឥឡូវវាយ Reply Message បាន
(ប្រើ /cancel ដើម្បីបោះបង់)`,
            { parse_mode: "HTML" }
        );
    }

    // DOWNLOAD: dl_<type>_<index>
    if (action.startsWith("dl_")) {
        const parts = action.split("_");
        const type  = parts[1];
        const index = parseInt(parts[2] || "0", 10);

        const state = userStates.get(String(chatId));
        if (!state?.data) {
            return safeSend(chatId, "⚠️ Session Expired — please send the link again.");
        }

        const media = findMediaByIndex(state.data, type, index);
        if (!media?.url) {
            return safeSend(chatId, `❌ No ${type} found for this link.`);
        }

        if (isRateLimited(chatId)) {
            return bot.answerCallbackQuery(query.id, {
                text: "Please wait before downloading again.", show_alert: true
            }).catch(() => {});
        }

        setRateLimit(chatId);
        return sendFile(chatId, media, state.data);
    }
});

// ========================
// MAIN MESSAGE HANDLER
// ========================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text   = msg.text;
    if (!text) return;

    addUser(chatId);
    if (text.startsWith("/")) return;

    // OWNER REPLY MODE
    if (String(chatId) === String(OWNER_ID) && replyStates.has(String(chatId))) {
        const targetUser = replyStates.get(String(chatId));
        try {
            await bot.sendMessage(targetUser,
                `📨 <b>Reply From Owner</b>\n\n${escapeHtml(text)}`,
                { parse_mode: "HTML" }
            );
            await safeSend(chatId, "✅ Reply sent!");
        } catch {
            await safeSend(chatId, "❌ Failed to send reply — user may have blocked the bot.");
        }
        replyStates.delete(String(chatId));
        return;
    }

    // VALIDATE URL
    if (!isValidURL(text)) {
        return safeSend(chatId,
`⚠️ សូមផ្ញើ Link ត្រឹមត្រូវ

ឧទាហរណ៍:
• https://youtube.com/watch?v=...
• https://tiktok.com/@user/video/...
• https://instagram.com/p/...`
        );
    }

    // RATE LIMIT
    if (isRateLimited(chatId)) {
        return safeSend(chatId, "⏳ Please wait a few seconds before sending another link.");
    }
    setRateLimit(chatId);

    // FETCH MEDIA
    const data = await fetchMedia(chatId, text);
    if (!data) return;

    // Dedupe medias before caching
    if (data.medias) data.medias = dedupeMedias(data.medias);

    userStates.set(String(chatId), { data, url: text });

    // THUMBNAIL + INFO
    const caption = buildInfoCaption(data);

    if (data.thumbnail) {
        try {
            await bot.sendPhoto(chatId, data.thumbnail, {
                caption    : caption,
                parse_mode : "HTML"
            });
        } catch {
            await safeSend(chatId, caption, { parse_mode: "HTML" });
        }
    } else {
        await safeSend(chatId, caption, { parse_mode: "HTML" });
    }

    // FORMAT KEYBOARD + SUMMARY
    const keyboard = buildFormatKeyboard(data);
    const summary  = buildSelectionSummary(data);

    return safeSend(chatId, summary, {
        parse_mode   : "HTML",
        reply_markup : { inline_keyboard: keyboard }
    });
});

// ========================
// ERROR HANDLERS
// ========================
bot.on("polling_error", (err) => console.error("[POLLING]",   err.code, err.message));
bot.on("error",         (err) => console.error("[BOT_ERROR]", err.message));

async function shutdown(signal) {
    console.log(`\n[SHUTDOWN] ${signal} received. Saving data...`);
    try { saveUsers(users); saveStats(stats); await bot.stopPolling(); } catch {}
    process.exit(0);
}

process.on("uncaughtException",  (err) => console.error("[UNCAUGHT]",  err.message, err.stack));
process.on("unhandledRejection", (r)   => console.error("[REJECTION]", r));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("[BOT] Amertak Bot starting...");
