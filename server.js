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
// ANIMATED EMOJI CONSTANTS
// ========================
const A = {
    loading  : "⏳",
    search   : "🔍",
    success  : "✅",
    error    : "❌",
    warn     : "⚠️",
    download : "⬇️",
    fire     : "🔥",
    spark    : "✨",
    wave     : "👋",
    rocket   : "🚀",
    trophy   : "🏆",
    star     : "⭐",
    bell     : "🔔",
    lock     : "🔒",
    globe    : "🌐",
    link     : "🔗",
    user     : "👤",
    id       : "🪪",
    chart    : "📊",
    folder   : "📂",
    send     : "📨",
    mic      : "🎙",
    music    : "🎵",
    video    : "🎬",
    image    : "🖼",
    tools    : "🛠",
    ban      : "⛔",
    reply    : "↩️",
    time     : "⏱",
    eyes     : "👁",
    package  : "📦",
    pin      : "📌",
    phone    : "📱",
    info     : "ℹ️",
    note     : "📝",
    broadcast: "📡",
    mega     : "📢",
    letter   : "📩",
    help     : "📖",
    done     : "🎉",
    cancel   : "🚫",
    clock    : "🕐",
    up       : "⬆️",
    ok       : "👌",
};

// ========================
// HELPERS
// ========================
function isImage(url = "")     { return /\.(jpg|jpeg|png|webp|gif)/i.test(url); }
function isValidURL(text = "") { return text.startsWith("http://") || text.startsWith("https://"); }

// FIX: Use the exact requested progress bar format
function renderProgressBar(percent) {
    const p = Math.min(percent, 100);
    return p < 20  ? "▱▱▱▱▱" :
           p < 40  ? "▰▱▱▱▱" :
           p < 60  ? "▰▰▱▱▱" :
           p < 80  ? "▰▰▰▱▱" :
           p < 100 ? "▰▰▰▰▱" : "▰▰▰▰▰";
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

function escapeHtml(text = "") {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

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
    const loading = await safeSend(chatId, `${A.search} កំពុងស្វែងរកព័ត៌មាន...`);

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

        if      (statusCode === 429) await safeSend(chatId, `${A.warn} Too many requests. Please wait a moment.`);
        else if (statusCode === 400) await safeSend(chatId, `${A.error} Unsupported platform or invalid link.\n\n${A.globe} Supported: YouTube · TikTok · Instagram · Pinterest · Facebook · Twitter/X · SoundCloud · Vimeo · Dailymotion · Spotify`);
        else if (statusCode === 404) await safeSend(chatId, `${A.error} Link not found or content is private.`);
        else                          await safeSend(chatId, `${A.error} មិនអាចទាញព័ត៌មានបាន។\n\n${A.warn} ${msg}`);
        return null;
    }
}

// ========================
// FIND MEDIA HELPERS
// ========================
function findAllByType(data, type) {
    if (!data?.medias || !Array.isArray(data.medias)) return [];
    if (type === "video") return data.medias.filter(m => m.type?.toLowerCase() === "video");

    // FIX: broaden audio detection — also catch undefined/null type with audio extensions
    if (type === "audio") return data.medias.filter(m => {
        const t = m.type?.toLowerCase() || "";
        const ext = (m.ext || m.extension || "").toLowerCase();
        const url = (m.url || "").toLowerCase();
        return ["audio", "audio_preview", "mp3", "m4a", "ogg", "wav"].includes(t)
            || ["mp3", "m4a", "ogg", "wav", "flac", "aac"].includes(ext)
            || /\.(mp3|m4a|ogg|wav|flac|aac)(\?|$)/.test(url);
    });

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
// EXTRACT VIDEO ID from URL (for filename)
// ========================
function extractVideoId(url = "", platform = "") {
    try {
        const u = new URL(url);
        const p = platform.toLowerCase();

        if (p === "youtube") {
            return u.searchParams.get("v")
                || u.pathname.split("/").filter(Boolean).pop()
                || "video";
        }
        if (p === "tiktok") {
            const parts = u.pathname.split("/").filter(Boolean);
            return parts[parts.length - 1] || "tiktok";
        }
        if (p === "instagram") {
            const m = u.pathname.match(/\/p\/([^/]+)/);
            return m ? m[1] : "ig";
        }
        if (p === "pinterest") {
            const parts = u.pathname.split("/").filter(Boolean);
            return parts[parts.length - 1] || "pin";
        }
        if (p === "spotify") {
            return u.pathname.split("/").filter(Boolean).pop() || "spotify";
        }
        return u.pathname.split("/").filter(Boolean).pop()
            || String(Date.now());
    } catch {
        return String(Date.now());
    }
}

// ========================
// BUILD INFO CAPTION (text only — NO thumbnail)
// ========================
function buildInfoCaption(data) {
    const emoji = getPlatformEmoji(data.platform);
    const lines = [];

    lines.push(`${emoji} <b>${escapeHtml(data.title || "Untitled")}</b>`);

    if (data.author)   lines.push(`${A.user} ${escapeHtml(data.author)}`);
    if (data.platform) lines.push(`${A.phone} ${data.platform}`);

    const meta = [];
    if (data.duration) meta.push(`${A.time} ${formatDuration(Number(data.duration))}`);
    if (data.views)    meta.push(`${A.eyes} ${Number(data.views).toLocaleString()} views`);
    if (meta.length)   lines.push(meta.join("  ·  "));

    if (data.note)     lines.push(`\n${A.info} <i>${escapeHtml(data.note)}</i>`);

    return lines.join("\n");
}

// ========================
// BUILD FORMAT KEYBOARD
// FIX: All buttons in ONE horizontal row per type, truly flat
// ========================
function buildFormatKeyboard(data) {
    const keyboard = [];

    const videos = dedupeMedias(findAllByType(data, "video")).slice(0, 4);
    const audios  = dedupeMedias(findAllByType(data, "audio")).slice(0, 4);
    const images  = dedupeMedias(findAllByType(data, "image")).slice(0, 4);

    // All video qualities in ONE horizontal row
    if (videos.length) {
        keyboard.push(
            videos.map((v, i) => ({
                text          : `🎬 ${v.quality || (videos.length > 1 ? `Vid ${i + 1}` : "Video")}`,
                callback_data : `dl_video_${i}`
            }))
        );
    }

    // All audio options in ONE horizontal row
    if (audios.length) {
        keyboard.push(
            audios.map((a, i) => ({
                text          : `🎵 ${a.quality || (audios.length > 1 ? `MP3 ${i + 1}` : "MP3")}`,
                callback_data : `dl_audio_${i}`
            }))
        );
    }

    // All image options in ONE horizontal row
    if (images.length) {
        keyboard.push(
            images.map((img, i) => ({
                text          : `🖼 ${img.quality || (images.length > 1 ? `Img ${i + 1}` : "Image")}`,
                callback_data : `dl_image_${i}`
            }))
        );
    }

    // Tools always last
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

    const lines = [`${A.folder} <b>ជ្រើសរើស Format ដើម្បីទាញយក:</b>\n`];

    if (videos.length) {
        lines.push(`${A.video} <b>Video</b> — ${videos.map(v => v.quality || "?").join(" · ")}`);
    }
    if (audios.length) {
        lines.push(`${A.music} <b>Audio</b> — ${audios.map(a => a.quality || "MP3").join(" · ")}`);
    }
    if (images.length) {
        lines.push(`${A.image} <b>Image</b> — ${images.length} option${images.length > 1 ? "s" : ""}`);
    }

    lines.push(`\n• ចុច ${A.video}${A.music}${A.image} → Upload ទៅ Telegram`);

    return lines.join("\n");
}

// ========================
// RESOLVE ACTUAL AUDIO URL
// FIX: For platforms like Spotify/YouTube/Pinterest that may return
// a preview URL or need the proxy endpoint, resolve before streaming.
// ========================
async function resolveMediaUrl(media) {
    // If the media url already looks like a direct audio/video file, use it
    if (media.url && isValidURL(media.url)) return media.url;
    return null;
}

// ========================
// STREAM & SEND FILE
// FIX: Filename = Amertak_${videoId}, no browser fallback for audio,
//      correct progress bar, broad audio type detection
// ========================
async function sendFile(chatId, media, data, sourceUrl = "") {
    // FIX: Build filename from video ID, not a browser URL
    const videoId  = extractVideoId(sourceUrl || data.url || "", data.platform || "");
    const mediaType = media.type?.toLowerCase() || "";
    const ext = (media.ext || media.extension || (
        ["audio","audio_preview","mp3","m4a"].includes(mediaType) ? "mp3" :
        mediaType === "video" ? "mp4" :
        mediaType === "image" ? "jpg" : "bin"
    )).replace(/^\./, "");

    // FIX: filename must never be a URL — plain name only
    const filename = `Amertak_${videoId}.${ext}`;

    const progressMessage = await safeSend(chatId,
`${A.download} កំពុងទាញយក...

[▱▱▱▱▱] 0%`
    );
    if (!progressMessage) return;

    let downloadDone = false;

    try {
        const streamUrl = `${API_BASE}/api/proxy?url=${encodeURIComponent(media.url)}`;

        const response = await axios.get(streamUrl, {
            responseType : "stream",
            headers      : { "x-api-key": API_KEY },
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

            // FIX: Exact requested progress bar style
            const bar =
                percent < 20  ? "▱▱▱▱▱" :
                percent < 40  ? "▰▱▱▱▱" :
                percent < 60  ? "▰▰▱▱▱" :
                percent < 80  ? "▰▰▰▱▱" :
                percent < 100 ? "▰▰▰▰▱" : "▰▰▰▰▰";

            await safeEdit(chatId, progressMessage.message_id,
`${A.download} កំពុងទាញយក...

[${bar}] ${percent}%
${A.package} ${formatBytes(downloaded)} / ${formatBytes(total)}`
            );
        });

        response.data.on("end", async () => {
            downloadDone = true;
            const buffer  = Buffer.concat(chunks);
            const emoji   = getPlatformEmoji(data.platform);
            const caption = [
                `${emoji} ${escapeHtml(data.title || "Downloaded")}`,
                data.author   ? `${A.user} ${escapeHtml(data.author)}`                   : "",
                data.duration ? `${A.time} ${formatDuration(Number(data.duration))}` : "",
                data.platform ? `${A.phone} ${data.platform}`                         : "",
                media.quality ? `🎚 ${media.quality}`                                 : ""
            ].filter(Boolean).join("\n");

            try {
                // FIX: Detect audio broadly — includes audio_preview, mp3, m4a etc.
                const isAudioType = ["audio", "audio_preview", "mp3", "m4a", "ogg", "wav", "flac", "aac"]
                    .includes(mediaType)
                    || /\.(mp3|m4a|ogg|wav|flac|aac)(\?|$)/i.test(media.url || "")
                    || ["mp3","m4a","ogg","wav","flac","aac"].includes(ext);

                if (isAudioType) {
                    // FIX: Pass filename so Telegram shows "Amertak_xxxx.mp3" — no browser open
                    await bot.sendAudio(chatId, buffer, {
                        caption,
                        title     : data.title  || "Audio",
                        performer : data.author || "Amertak",
                        parse_mode: "HTML"
                    }, {
                        filename,
                        contentType: `audio/${ext === "mp3" ? "mpeg" : ext}`
                    });

                } else if (mediaType === "video") {
                    await bot.sendVideo(chatId, buffer, {
                        caption,
                        supports_streaming: true,
                        parse_mode: "HTML"
                    }, {
                        filename,
                        contentType: "video/mp4"
                    });

                } else if (mediaType === "image" || isImage(media.url || "")) {
                    await bot.sendPhoto(chatId, buffer, {
                        caption,
                        parse_mode: "HTML"
                    });

                } else {
                    await bot.sendDocument(chatId, buffer, {
                        caption,
                        parse_mode: "HTML"
                    }, {
                        filename,
                        contentType: "application/octet-stream"
                    });
                }

                incrementStat("downloads");

            } catch (err) {
                console.error("[SEND_FILE]", err.message);
                // FIX: For oversized files, only show a plain error — no browser link for audio
                if (err.message?.includes("Request Entity Too Large") || err.message?.includes("413")) {
                    await safeSend(chatId,
`${A.warn} ឯកសារធំពេក — Telegram មិនអនុញ្ញាត (>50MB)

${A.info} សូមព្យាយាមជ្រើស Quality ទាប ឬ Format ផ្សេង`
                    );
                } else {
                    await safeSend(chatId, `${A.error} បរាជ័យក្នុងការផ្ញើឯកសារ\n${A.warn} ${err.message}`);
                }
            }
            await safeDelete(chatId, progressMessage.message_id);
        });

        response.data.on("error", async (err) => {
            console.error("[STREAM_ERROR]", err.message);
            if (!downloadDone) await safeSend(chatId, `${A.error} Download Error — stream interrupted`);
            await safeDelete(chatId, progressMessage.message_id);
        });

    } catch (err) {
        console.error("[DOWNLOAD]", err.message);
        await safeSend(chatId, `${A.error} Server Error — please try again`);
        await safeDelete(chatId, progressMessage.message_id);
    }
}

// ========================
// HANDLE LINK — sends text info + format keyboard (NO thumbnail photo)
// FIX: Use sendMessage (text only), not sendPhoto
// ========================
async function handleLink(chatId, url) {
    if (isRateLimited(chatId)) {
        await safeSend(chatId, `${A.warn} សូមរង់ចាំបន្តិច មុននឹងស្នើម្តងទៀត`);
        return;
    }
    setRateLimit(chatId);

    const data = await fetchMedia(chatId, url);
    if (!data) return;

    // Save state for callback use
    userStates.set(String(chatId), { data, url });

    const caption   = buildInfoCaption(data);
    const summary   = buildSelectionSummary(data);
    const keyboard  = buildFormatKeyboard(data);

    // FIX: Send as plain text message (NO photo/thumbnail)
    await safeSend(chatId,
        `${caption}\n\n${summary}`,
        {
            parse_mode   : "HTML",
            reply_markup : { inline_keyboard: keyboard }
        }
    );
}

// ========================
// CALLBACK QUERY HANDLER
// ========================
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data   = query.data;

    await bot.answerCallbackQuery(query.id).catch(() => {});

    const state = userStates.get(String(chatId));
    if (!state) {
        await safeSend(chatId, `${A.warn} Session expired. Please send the link again.`);
        return;
    }

    const { data: mediaData, url: sourceUrl } = state;

    const match = data.match(/^dl_(video|audio|image)_(\d+)$/);
    if (!match) return;

    const [, type, indexStr] = match;
    const index = parseInt(indexStr, 10);
    const media = findMediaByIndex(mediaData, type, index);

    if (!media || !media.url) {
        await safeSend(chatId, `${A.error} មិនមាន media សម្រាប់ format នេះ`);
        return;
    }

    await sendFile(chatId, media, mediaData, sourceUrl);
});

// ========================
// MESSAGE HANDLER — detect URLs
// ========================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text   = msg.text?.trim() || "";

    addUser(chatId);

    // Skip commands
    if (text.startsWith("/")) return;

    // Handle reply states (admin reply feature)
    if (replyStates.has(String(chatId))) {
        const targetId = replyStates.get(String(chatId));
        replyStates.delete(String(chatId));
        await safeSend(targetId, `${A.reply} <b>Reply from Owner:</b>\n${escapeHtml(text)}`, { parse_mode: "HTML" });
        await safeSend(chatId, `${A.success} ផ្ញើទៅ User ${targetId} រួចរាល់`);
        return;
    }

    if (isValidURL(text)) {
        await handleLink(chatId, text);
        return;
    }

    await safeSend(chatId, `${A.info} សូមផ្ញើ Link ដើម្បី Download\n\nវាយ /help សម្រាប់ព័ត៌មានបន្ថែម`);
});

// ========================
// /start
// ========================
bot.onText(/\/start/, async (msg) => {
    addUser(msg.chat.id);
    await safeSend(msg.chat.id,
`${A.wave} សូមស្វាគមន៍ <b>${escapeHtml(getFullName(msg.from))}</b>!

${A.download} <b>របៀបប្រើ:</b>
1. ផ្ញើ Link វីដេអូ / តន្ត្រី / រូបភាព
2. ជ្រើសរើស Format ដែលចង់បាន
3. ចុច ${A.video}${A.music}${A.image} → Upload ទៅ Telegram

${A.globe} <b>Platform ដែលគាំទ្រ:</b>
▶️ YouTube  ${A.music} TikTok  📸 Instagram
${A.pin} Pinterest  ${A.user} Facebook  🐦 Twitter/X
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
`${A.help} <b>Amertak Bot — Help</b>

<b>ចម្លង Link ហើយ Paste ក្នុង Bot:</b>
${A.rocket} Bot នឹងទទួល Link ហើយ fetch media info ស្វ័យប្រវត្តិ

<b>Format Buttons:</b>
${A.video} Video — ទាញ video ដោយ quality ជ្រើស
${A.music} Audio/MP3 — ទាញ audio
${A.image} Image — ទាញ image

<b>Platform Support:</b>
▶️ YouTube (multi-quality)
${A.music} TikTok (no watermark)
📸 Instagram (posts, reels, stories)
${A.pin} Pinterest (video + image)
${A.user} Facebook (public videos)
🐦 Twitter/X (video + gif)
☁️ SoundCloud (audio)
🎞 Vimeo (video)
📺 Dailymotion (video)
🎧 Spotify (preview/audio)`,
        { parse_mode: "HTML" }
    );
});

// ========================
// /id
// ========================
bot.onText(/\/id/, async (msg) => {
    await safeSend(msg.chat.id,
`${A.id} <b>Your Info:</b>
• ID: <code>${msg.from.id}</code>
• Name: ${escapeHtml(getFullName(msg.from))}
• Username: ${getUsername(msg.from)}`,
        { parse_mode: "HTML" }
    );
});

// ========================
// /stats
// ========================
bot.onText(/\/stats/, async (msg) => {
    await safeSend(msg.chat.id,
`${A.chart} <b>Bot Statistics:</b>
• ${A.user} Users: <b>${users.size}</b>
• ${A.link} Links processed: <b>${stats.links || 0}</b>
• ${A.download} Downloads: <b>${stats.downloads || 0}</b>
• ${A.time} Uptime: <b>${Math.floor(process.uptime())}s</b>`,
        { parse_mode: "HTML" }
    );
});

// ========================
// /cancel
// ========================
bot.onText(/\/cancel/, async (msg) => {
    const chatId = String(msg.chat.id);
    userStates.delete(chatId);
    replyStates.delete(chatId);
    await safeSend(msg.chat.id, `${A.cancel} Action បានបោះបង់`);
});

// ========================
// /ask
// ========================
bot.onText(/\/ask (.+)/, async (msg, match) => {
    const question = match[1];
    await safeSend(OWNER_ID,
`${A.letter} <b>Question from User:</b>
• ID: <code>${msg.from.id}</code>
• Name: ${escapeHtml(getFullName(msg.from))}
• Username: ${getUsername(msg.from)}

${A.note} <i>${escapeHtml(question)}</i>`,
        {
            parse_mode   : "HTML",
            reply_markup : {
                inline_keyboard: [[{
                    text          : `${A.reply} Reply`,
                    callback_data : `reply_${msg.from.id}`
                }]]
            }
        }
    );
    await safeSend(msg.chat.id, `${A.success} សំណួររបស់អ្នកបានផ្ញើទៅ Owner រួចរាល់`);
});

// ========================
// /users (Owner only)
// ========================
bot.onText(/\/users/, async (msg) => {
    if (String(msg.from.id) !== String(OWNER_ID)) return;
    await safeSend(msg.chat.id, `${A.user} Total users: <b>${users.size}</b>`, { parse_mode: "HTML" });
});

// ========================
// /notify (Owner only broadcast)
// ========================
bot.onText(/\/notify (.+)/, async (msg, match) => {
    if (String(msg.from.id) !== String(OWNER_ID)) return;
    const text    = match[1];
    let sent      = 0;
    let failed    = 0;

    const progress = await safeSend(msg.chat.id, `${A.broadcast} Broadcasting to ${users.size} users...`);

    for (const userId of users) {
        try {
            await bot.sendMessage(userId,
                `${A.mega} <b>Announcement:</b>\n\n${escapeHtml(text)}`,
                { parse_mode: "HTML" }
            );
            sent++;
        } catch {
            failed++;
        }
        // Small delay to avoid flood
        await new Promise(r => setTimeout(r, 50));
    }

    await safeDelete(msg.chat.id, progress?.message_id);
    await safeSend(msg.chat.id,
`${A.done} Broadcast complete!
• ${A.success} Sent: ${sent}
• ${A.error} Failed: ${failed}`,
        { parse_mode: "HTML" }
    );
});

// ========================
// OWNER REPLY CALLBACK
// ========================
bot.on("callback_query", async (query) => {
    if (!query.data?.startsWith("reply_")) return;
    if (String(query.from.id) !== String(OWNER_ID)) return;

    const targetId = query.data.replace("reply_", "");
    replyStates.set(String(OWNER_ID), targetId);
    await bot.answerCallbackQuery(query.id).catch(() => {});
    await safeSend(OWNER_ID, `${A.reply} វាយ Reply របស់អ្នក — វានឹងត្រូវបញ្ជូនទៅ User <code>${targetId}</code>`, { parse_mode: "HTML" });
});

console.log("[BOT] Amertak Bot started ✅");