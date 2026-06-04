require("dotenv").config();

const fs = require("fs");
const path = require("path");
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
const PORT = process.env.PORT || 3000;

// ========================
// VALIDATE ENV
// ========================
if (!TOKEN) {
    console.error("[FATAL] BOT_TOKEN is missing in .env");
    process.exit(1);
}
if (!OWNER_ID) {
    console.error("[FATAL] OWNER_ID is missing in .env");
    process.exit(1);
}
if (!API_BASE) {
    console.error("[FATAL] API_BASE is missing in .env");
    process.exit(1);
}

// ========================
// INIT BOT
// ========================
const bot = new TelegramBot(TOKEN, {
    polling: {
        interval: 300,
        autoStart: true,
        params: { timeout: 10 }
    }
});

// ========================
// INIT EXPRESS
// ========================
const app = express();

app.use(express.json());

app.get("/", (_, res) => {
    res.json({
        status: "ok",
        bot: "Amertak Bot",
        uptime: Math.floor(process.uptime()) + "s",
        users: users.size
    });
});

app.get("/health", (_, res) => {
    res.json({ alive: true, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`[SERVER] Running on port ${PORT}`);
});

// ========================
// DATABASE
// ========================
const DB_FILE = "./users.json";
const STATS_FILE = "./stats.json";

function loadUsers() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, "[]");
        }
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        return new Set(JSON.parse(raw));
    } catch {
        console.warn("[DB] Could not load users, starting fresh.");
        return new Set();
    }
}

function saveUsers(set) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify([...set], null, 2));
    } catch (err) {
        console.error("[DB] Failed to save users:", err.message);
    }
}

function loadStats() {
    try {
        if (!fs.existsSync(STATS_FILE)) {
            fs.writeFileSync(STATS_FILE, JSON.stringify({ downloads: 0, links: 0 }));
        }
        return JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
    } catch {
        return { downloads: 0, links: 0 };
    }
}

function saveStats(data) {
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
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
// STATES (in-memory)
// ========================
const userStates = new Map();   // chatId -> { data, url }
const replyStates = new Map();  // chatId -> targetUserId
const rateLimiter = new Map();  // chatId -> timestamp

// ========================
// RATE LIMIT
// ========================
const RATE_LIMIT_MS = 3000; // 3 seconds between requests

function isRateLimited(chatId) {
    const last = rateLimiter.get(String(chatId));
    if (!last) return false;
    return Date.now() - last < RATE_LIMIT_MS;
}

function setRateLimit(chatId) {
    rateLimiter.set(String(chatId), Date.now());
}

// ========================
// HELPERS
// ========================
function isImage(url = "") {
    return /\.(jpg|jpeg|png|webp|gif)/i.test(url);
}

function isValidURL(text = "") {
    return text.startsWith("http://") || text.startsWith("https://");
}

function renderProgressBar(percent) {
    const total = 10;
    const filled = Math.round((Math.min(percent, 100)) / 10);
    return "█".repeat(filled) + "░".repeat(total - filled);
}

function formatBytes(bytes = 0) {
    if (!bytes || bytes <= 0) return "Unknown";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

function formatDuration(seconds = 0) {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function escapeHtml(text = "") {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function getUsername(from) {
    return from?.username ? `@${from.username}` : "none";
}

function getFullName(from) {
    return `${from?.first_name || ""} ${from?.last_name || ""}`.trim() || "Unknown";
}

// ========================
// SAFE DELETE MESSAGE
// ========================
async function safeDelete(chatId, messageId) {
    try {
        await bot.deleteMessage(chatId, messageId);
    } catch {}
}

// ========================
// SAFE SEND
// ========================
async function safeSend(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (err) {
        console.error(`[SEND] Failed to ${chatId}:`, err.message);
        return null;
    }
}

// ========================
// SAFE EDIT MESSAGE
// ========================
async function safeEdit(chatId, messageId, text) {
    try {
        return await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId
        });
    } catch {}
}

// ========================
// FETCH MEDIA INFO
// ========================
async function fetchVideo(chatId, url) {
    const loading = await safeSend(chatId, "⏳ កំពុងស្វែងរកព័ត៌មាន...");

    try {
        incrementStat("links");

        const response = await axios.get(`${API_BASE}/api/download`, {
            params: { url },
            headers: { "x-api-key": API_KEY },
            timeout: 120000
        });

        await safeDelete(chatId, loading?.message_id);
        return response.data;

    } catch (err) {
        const msg = err?.response?.data?.message || err.message || "Unknown error";
        console.error(`[FETCH] Error for ${url}:`, msg);

        await safeDelete(chatId, loading?.message_id);

        const statusCode = err?.response?.status;

        if (statusCode === 429) {
            await safeSend(chatId, "⚠️ Too many requests. Please wait a moment.");
        } else if (statusCode === 404) {
            await safeSend(chatId, "❌ Link not found or unsupported platform.");
        } else {
            await safeSend(chatId, "❌ មិនអាចទាញព័ត៌មានបាន។ សូមពិនិត្យ Link ម្ដងទៀត។");
        }

        return null;
    }
}

// ========================
// FIND MEDIA
// ========================
function findMedia(data, type) {
    if (!data?.medias || !Array.isArray(data.medias)) return null;

    if (type === "video") {
        return data.medias.find(m => m.type?.toLowerCase() === "video");
    }
    if (type === "audio") {
        return data.medias.find(m => m.type?.toLowerCase() === "audio");
    }
    if (type === "image") {
        return data.medias.find(m =>
            m.type?.toLowerCase() === "image" || isImage(m.url)
        );
    }

    return null;
}

// ========================
// STREAM DOWNLOADER
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
            responseType: "stream",
            params: { url: media.url },
            timeout: 0
        });

        const total = parseInt(response.headers["content-length"] || "0", 10);
        let downloaded = 0;
        let lastUpdate = 0;
        const chunks = [];

        response.data.on("data", async (chunk) => {
            downloaded += chunk.length;
            chunks.push(chunk);

            const percent = total ? Math.floor((downloaded / total) * 100) : 0;
            const now = Date.now();

            if (now - lastUpdate < 1500) return;
            lastUpdate = now;

            const bar = renderProgressBar(percent);
            const dlSize = formatBytes(downloaded);
            const totalSize = formatBytes(total);

            await safeEdit(chatId, progressMessage.message_id,
`⬇️ កំពុងទាញយក...

[${bar}] ${percent}%
${dlSize} / ${totalSize}`
            );
        });

        response.data.on("end", async () => {
            downloadDone = true;

            const buffer = Buffer.concat(chunks);
            const caption = [
                data.title || "Downloaded",
                data.author   ? `👤 ${data.author}` : "",
                data.duration ? `⏱ ${formatDuration(data.duration)}` : "",
                data.platform ? `📱 ${data.platform}` : ""
            ].filter(Boolean).join("\n");

            try {
                const type = media.type?.toLowerCase();

                if (type === "audio") {
                    await bot.sendAudio(chatId, buffer, {
                        caption,
                        title: data.title || "Audio",
                        performer: data.author || "Amertak"
                    });
                } else if (type === "video") {
                    await bot.sendVideo(chatId, buffer, {
                        caption,
                        supports_streaming: true
                    });
                } else if (type === "image" || isImage(media.url)) {
                    await bot.sendPhoto(chatId, buffer, { caption });
                } else {
                    await bot.sendDocument(chatId, buffer, { caption });
                }

                incrementStat("downloads");

            } catch (err) {
                console.error("[SEND_FILE]", err.message);
                await safeSend(chatId, "❌ បរាជ័យក្នុងការផ្ញើឯកសារ");
            }

            await safeDelete(chatId, progressMessage.message_id);
        });

        response.data.on("error", async (err) => {
            console.error("[STREAM_ERROR]", err.message);
            if (!downloadDone) {
                await safeSend(chatId, "❌ Download Error — stream interrupted");
            }
            await safeDelete(chatId, progressMessage.message_id);
        });

    } catch (err) {
        console.error("[DOWNLOAD]", err.message);
        await safeSend(chatId, "❌ Server Error — please try again");
        await safeDelete(chatId, progressMessage.message_id);
    }
}

// ========================
// BUILD FORMAT KEYBOARD
// ========================
function buildKeyboard(data) {
    const keyboard = [];

    const row1 = [];
    if (findMedia(data, "video")) row1.push({ text: "🎬 Video", callback_data: "video" });
    if (findMedia(data, "audio")) row1.push({ text: "🎵 Audio", callback_data: "audio" });
    if (row1.length > 0) keyboard.push(row1);

    if (findMedia(data, "image")) keyboard.push([{ text: "🖼 Image", callback_data: "image" }]);

    keyboard.push([{
        text: "🛠 Tools",
        web_app: { url: "https://tools-amertak.vercel.app" }
    }]);

    return keyboard;
}

// ========================
// BUILD MEDIA CAPTION
// ========================
function buildCaption(data) {
    const lines = [];
    if (data.title)    lines.push(`📌 ${data.title}`);
    if (data.author)   lines.push(`👤 ${data.author}`);
    if (data.platform) lines.push(`📱 ${data.platform}`);
    if (data.duration) lines.push(`⏱ ${formatDuration(data.duration)}`);
    if (data.views)    lines.push(`👁 ${Number(data.views).toLocaleString()} views`);
    return lines.join("\n") || "Media";
}

// ========================
// /start
// ========================
bot.onText(/\/start/, async (msg) => {
    addUser(msg.chat.id);
    const name = getFullName(msg.from);

    await safeSend(msg.chat.id,
`👋 សូមស្វាគមន៍ ${name}!

📥 របៀបប្រើ:
1. ផ្ញើ Link វីដេអូ / ក្រុម / រូបភាព
2. ជ្រើសរើស Format
3. រងចាំ Download

📋 បញ្ជា:
• /ask [សារ] — ផ្ញើសំណួរទៅ Owner
• /id — មើល User ID
• /stats — ស្ថិតិ Bot
• /cancel — បោះបង់ Action ปัจจุบัน
• /notify [សារ] — Broadcast (Owner Only)
• /users — ចំនួន Users (Owner Only)`,
        {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: "🛠 Tools",
                        web_app: { url: "https://tools-amertak.vercel.app" }
                    }
                ]]
            }
        }
    );
});

// ========================
// /id
// ========================
bot.onText(/\/id/, async (msg) => {
    await safeSend(msg.chat.id,
`🪪 ព័ត៌មានរបស់អ្នក

👤 Name: ${getFullName(msg.from)}
🆔 User ID: ${msg.from.id}
💬 Chat ID: ${msg.chat.id}
📛 Username: ${getUsername(msg.from)}`
    );
});

// ========================
// /stats
// ========================
bot.onText(/\/stats/, async (msg) => {
    await safeSend(msg.chat.id,
`📊 Bot Statistics

👥 Total Users: ${users.size}
🔗 Links Processed: ${stats.links || 0}
📥 Files Downloaded: ${stats.downloads || 0}
⏱ Uptime: ${Math.floor(process.uptime())}s`
    );
});

// ========================
// /cancel
// ========================
bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id;

    const wasReply = replyStates.has(String(chatId));
    replyStates.delete(String(chatId));
    userStates.delete(String(chatId));

    await safeSend(chatId,
        wasReply
            ? "✅ Reply mode cancelled."
            : "✅ Action cleared."
    );
});

// ========================
// /users (Owner Only)
// ========================
bot.onText(/\/users/, async (msg) => {
    if (String(msg.chat.id) !== String(OWNER_ID)) return;

    await safeSend(msg.chat.id,
`👥 Users Summary

Total: ${users.size}
IDs: ${[...users].slice(0, 20).join(", ")}${users.size > 20 ? "\n...and more" : ""}`
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
`📩 សំណួរថ្មីបានមក!

👤 Name: ${getFullName(msg.from)}
🆔 User ID: ${msg.from.id}
📛 Username: ${getUsername(msg.from)}

💬 Message:
${question}`,
        {
            reply_markup: {
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

    const userId = match[1];
    const text = match[2].trim();

    try {
        await bot.sendMessage(userId, `📨 Reply From Owner\n\n${text}`);
        await safeSend(msg.chat.id, `✅ Reply sent to ${userId}`);
    } catch {
        await safeSend(msg.chat.id, "❌ មិនអាចផ្ញើបាន — user may have blocked the bot");
    }
});

// ========================
// /notify (Owner Only)
// ========================
bot.onText(/\/notify (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(OWNER_ID)) {
        return safeSend(msg.chat.id, "⛔ Not Allowed");
    }

    const text = match[1].trim();
    if (!text) return;

    let success = 0;
    let failed = 0;
    const failedIds = [];

    const broadcastMsg = await safeSend(msg.chat.id, `📡 Broadcasting to ${users.size} users...`);

    for (const id of users) {
        try {
            await bot.sendMessage(id, `📢 Broadcast\n\n${text}`);
            success++;
        } catch {
            failed++;
            failedIds.push(id);
        }
        await new Promise(r => setTimeout(r, 50));
    }

    if (broadcastMsg) await safeDelete(msg.chat.id, broadcastMsg.message_id);

    await safeSend(msg.chat.id,
`📡 Broadcast Completed

✅ Success: ${success}
❌ Failed: ${failed}
${failedIds.length > 0 ? `\nFailed IDs: ${failedIds.slice(0, 10).join(", ")}${failedIds.length > 10 ? "..." : ""}` : ""}`
    );
});

// ========================
// CALLBACK QUERY
// ========================
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    await bot.answerCallbackQuery(query.id).catch(() => {});

    // ========================
    // REPLY MODE
    // ========================
    if (action.startsWith("reply_")) {
        if (String(chatId) !== String(OWNER_ID)) return;

        const userId = action.split("_")[1];
        replyStates.set(String(chatId), userId);

        return safeSend(chatId,
`↩️ Reply Mode Enabled

🆔 Replying to User: ${userId}

ឥឡូវវាយ Reply Message បាន
(ប្រើ /cancel ដើម្បីបោះបង់)`
        );
    }

    // ========================
    // DOWNLOAD FORMAT
    // ========================
    const state = userStates.get(String(chatId));

    if (!state?.data) {
        return safeSend(chatId, "⚠️ Session Expired — please send the link again.");
    }

    const media = findMedia(state.data, action);

    if (!media) {
        return safeSend(chatId, `❌ No ${action} found for this link.`);
    }

    // prevent double-download spam
    if (isRateLimited(chatId)) {
        return bot.answerCallbackQuery(query.id, {
            text: "Please wait before downloading again.",
            show_alert: true
        }).catch(() => {});
    }

    setRateLimit(chatId);

    return sendFile(chatId, media, state.data);
});

// ========================
// MAIN MESSAGE HANDLER
// ========================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    addUser(chatId);

    // skip commands
    if (text.startsWith("/")) return;

    // ========================
    // OWNER REPLY MODE
    // ========================
    if (String(chatId) === String(OWNER_ID) && replyStates.has(String(chatId))) {
        const targetUser = replyStates.get(String(chatId));

        try {
            await bot.sendMessage(targetUser, `📨 Reply From Owner\n\n${text}`);
            await safeSend(chatId, "✅ Reply sent!");
        } catch {
            await safeSend(chatId, "❌ Failed to send reply — user may have blocked the bot.");
        }

        replyStates.delete(String(chatId));
        return;
    }

    // ========================
    // VALIDATE URL
    // ========================
    if (!isValidURL(text)) {
        return safeSend(chatId, "⚠️ សូមផ្ញើ Link ត្រឹមត្រូវ (http:// ឬ https://)");
    }

    // ========================
    // RATE LIMIT
    // ========================
    if (isRateLimited(chatId)) {
        return safeSend(chatId, "⏳ Please wait a few seconds before sending another link.");
    }
    setRateLimit(chatId);

    // ========================
    // FETCH MEDIA DATA
    // ========================
    const data = await fetchVideo(chatId, text);
    if (!data) return;

    // cache state
    userStates.set(String(chatId), { data, url: text });

    // ========================
    // THUMBNAIL
    // ========================
    if (data.thumbnail) {
        try {
            await bot.sendPhoto(chatId, data.thumbnail, {
                caption: buildCaption(data)
            });
        } catch {
            // thumbnail send failed, continue silently
        }
    }

    // ========================
    // FORMAT BUTTONS
    // ========================
    const keyboard = buildKeyboard(data);

    return safeSend(chatId, "📂 ជ្រើសរើស Format ដើម្បីទាញយក:", {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ========================
// POLLING ERROR HANDLER
// ========================
bot.on("polling_error", (err) => {
    console.error("[POLLING]", err.code, err.message);
});

bot.on("error", (err) => {
    console.error("[BOT_ERROR]", err.message);
});

// ========================
// GRACEFUL SHUTDOWN
// ========================
async function shutdown(signal) {
    console.log(`\n[SHUTDOWN] Received ${signal}. Saving data and exiting...`);
    try {
        saveUsers(users);
        saveStats(stats);
        await bot.stopPolling();
    } catch (err) {
        console.error("[SHUTDOWN] Error during cleanup:", err.message);
    }
    process.exit(0);
}

// ========================
// PROCESS ERROR HANDLERS
// ========================
process.on("uncaughtException", (err) => {
    console.error("[UNCAUGHT_EXCEPTION]", err.message, err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("[UNHANDLED_REJECTION]", reason, "at:", promise);
});

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("[BOT] Amertak Bot is starting...");
