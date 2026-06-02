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

// Ensure temporary downloads folder exists for large file handling
const TMP_DIR = path.join(__dirname, "tmp");
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ========================
// INIT
// ========================
const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();

app.get("/", (_, res) => {
    res.send("Bot Running OK");
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Server Started Successfully");
});

// ========================
// USERS DATABASE
// ========================
const DB_FILE = "./users.json";

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, "[]");
    }
    try {
        return new Set(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
    } catch (e) {
        return new Set();
    }
}

function saveUsers(set) {
    fs.writeFileSync(DB_FILE, JSON.stringify([...set], null, 2));
}

const users = loadUsers();

function addUser(id) {
    id = String(id);
    if (!users.has(id)) {
        users.add(id);
        saveUsers(users);
    }
}

// ========================
// STATES & CACHE CLEANUP
// ========================
const userStates = {};
const replyStates = {};

// Simple TTL Cache cleaner to prevent RAM leakage
setInterval(() => {
    const now = Date.now();
    for (const chatId in userStates) {
        if (userStates[chatId].timestamp && (now - userStates[chatId].timestamp > 1800000)) { // 30 mins
            delete userStates[chatId];
        }
    }
}, 600000);

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
    const filled = Math.min(10, Math.max(0, Math.round(percent / 10)));
    return "█".repeat(filled) + "░".repeat(total - filled);
}

function formatBytes(bytes = 0) {
    if (!bytes || isNaN(bytes)) return "Unknown";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

// ========================
// FETCH MEDIA
// ========================
async function fetchVideo(chatId, url) {
    const loading = await bot.sendMessage(chatId, "កំពុងស្វែងរកព័ត៌មាន...");
    try {
        const response = await axios.get(`${API_BASE}/api/download`, {
            params: { url },
            headers: { "x-api-key": API_KEY },
            timeout: 120000
        });

        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        return response.data;
    } catch (err) {
        console.error(err?.response?.data || err.message);
        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        await bot.sendMessage(chatId, "មិនអាចទាញព័ត៌មានបាន");
        return null;
    }
}

// ========================
// FIND MEDIA
// ========================
function findMedia(data, type) {
    if (!data?.medias) return null;

    if (type === "video") {
        return data.medias.find(m => m.type?.toLowerCase() === "video");
    }
    if (type === "audio") {
        return data.medias.find(m => m.type?.toLowerCase() === "audio");
    }
    if (type === "image") {
        return data.medias.find(m => m.type?.toLowerCase() === "image" || isImage(m.url));
    }
    return null;
}

// ========================
// PRO STREAM DOWNLOADER (Disk Buffered for >50MB Files)
// ========================
async function sendFile(chatId, media, data) {
    const progressMessage = await bot.sendMessage(chatId, `កំពុងទាញយក...\n\n[░░░░░░░░░░] 0%`);
    
    // Create unique dynamic file name inside temp workspace
    const tempFileName = `dl_${Date.now()}_${chatId}_file`;
    const tempFilePath = path.join(TMP_DIR, tempFileName);

    try {
        const response = await axios.get(`${API_BASE}/api/proxy`, {
            responseType: "stream",
            params: { url: media.url },
            timeout: 0
        });

        const total = parseInt(response.headers["content-length"] || "0");
        let downloaded = 0;
        let lastUpdate = 0;

        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        response.data.on("data", async (chunk) => {
            downloaded += chunk.length;
            const percent = total ? Math.floor((downloaded / total) * 100) : 0;
            const now = Date.now();

            // Throttle protection: updates at most once every 1.5 seconds to bypass 429 errors
            if (now - lastUpdate < 1500) return;
            lastUpdate = now;

            const bar = renderProgressBar(percent);
            const downloadedSize = formatBytes(downloaded);
            const totalSize = formatBytes(total);

            try {
                await bot.editMessageText(
                    `កំពុងទាញយក...\n\n[${bar}] ${percent}%\n\n${downloadedSize} / ${totalSize}`,
                    {
                        chat_id: chatId,
                        message_id: progressMessage.message_id
                    }
                );
            } catch (_) {}
        });

        // Promise orchestration to wait until data is fully flushed to file path
        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
            response.data.on("error", reject);
        });

        const caption = data.title || "Downloaded";
        const fileStream = fs.createReadStream(tempFilePath);

        // AUDIO
        if (media.type?.toLowerCase() === "audio") {
            await bot.sendAudio(chatId, fileStream, {
                caption,
                title: data.title || "Audio",
                performer: data.author || "Amertak"
            });
        }
        // VIDEO
        else if (media.type?.toLowerCase() === "video") {
            await bot.sendVideo(chatId, fileStream, {
                caption,
                supports_streaming: true
            });
        }
        // IMAGE
        else if (media.type?.toLowerCase() === "image" || isImage(media.url)) {
            await bot.sendPhoto(chatId, fileStream, { caption });
        }
        // FILE / DOCUMENT FALLBACK
        else {
            await bot.sendDocument(chatId, fileStream, { caption });
        }

    } catch (err) {
        console.error("Download execution error:", err.message);
        await bot.sendMessage(chatId, "បរាជ័យក្នុងការផ្ញើឬទាញយកឯកសារ");
    } finally {
        // Absolute clean up: delete temporary file instantly to safeguard space
        if (fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, () => {});
        }
        await bot.deleteMessage(chatId, progressMessage.message_id).catch(() => {});
    }
}

// ========================
// START COMMAND
// ========================
bot.onText(/\/start/, async (msg) => {
    const fullName = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();
    addUser(msg.chat.id);

    await bot.sendMessage(
        msg.chat.id,
`សូមស្វាគមន៍ ${fullName}

របៀបប្រើ:
1. ផ្ញើ Link
2. ជ្រើសរើស Format
3. រងចាំ Download

បញ្ជា:
/ask សារ
/id
/notify សារ (Owner Only)`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "Tools",
                            web_app: { url: "https://tools-amertak.vercel.app" }
                        }
                    ]
                ]
            }
        }
    );
});

// ========================
// ID COMMAND
// ========================
bot.onText(/\/id/, async (msg) => {
    await bot.sendMessage(
        msg.chat.id,
`ព័ត៌មានរបស់អ្នក

User ID: ${msg.from.id}
Chat ID: ${msg.chat.id}
Username: @${msg.from.username || "none"}`
    );
});

// ========================
// ASK SYSTEM
// ========================
bot.onText(/\/ask (.+)/, async (msg, match) => {
    const question = match[1];
    await bot.sendMessage(msg.chat.id, "អ្នកនឹងទទួលបានការឆ្លើយតប ពេល Owner ឃើញ");

    await bot.sendMessage(
        OWNER_ID,
`សំណួរថ្មី

Name: ${msg.from.first_name || ""}
User ID: ${msg.from.id}
Username: @${msg.from.username || "none"}

Message:
${question}`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "Reply",
                            callback_data: `reply_${msg.from.id}`
                        }
                    ]
                ]
            }
        }
    );
});

// ========================
// MANUAL REPLY
// ========================
bot.onText(/\/reply (\d+) (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(OWNER_ID)) return;

    const userId = match[1];
    const text = match[2];

    try {
        await bot.sendMessage(userId, `Reply From Owner\n\n${text}`);
        await bot.sendMessage(msg.chat.id, "បានផ្ញើ Reply");
    } catch {
        await bot.sendMessage(msg.chat.id, "មិនអាចផ្ញើបាន");
    }
});

// ========================
// NOTIFY ALL
// ========================
bot.onText(/\/notify (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== String(OWNER_ID)) {
        return bot.sendMessage(msg.chat.id, "Not Allowed");
    }

    const text = match[1];
    let success = 0;
    let failed = 0;

    for (const id of users) {
        try {
            await bot.sendMessage(id, `Broadcast\n\n${text}`);
            success++;
        } catch (err) {
            failed++;
        }
        // Anti-flood dynamic execution block
        await new Promise(r => setTimeout(r, 60));
    }

    await bot.sendMessage(msg.chat.id, `Broadcast Completed\n\nSuccess: ${success}\nFailed: ${failed}`);
});

// ========================
// CALLBACK QUERY
// ========================
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    await bot.answerCallbackQuery(query.id);

    // REPLY OPERATION
    if (action.startsWith("reply_")) {
        if (String(chatId) !== String(OWNER_ID)) return;

        const userId = action.split("_")[1];
        replyStates[chatId] = userId;

        return bot.sendMessage(
            chatId,
`Reply Mode Enabled\n\nUser ID: ${userId}\n\nឥឡូវអ្នកអាចវាយសារ Reply បាន`
        );
    }

    // PROCESSING CACHE DATA DOWNLOAD
    const session = userStates[chatId];
    if (!session || !session.data) {
        return bot.sendMessage(chatId, "Session Expired");
    }

    const media = findMedia(session.data, action);
    if (!media) {
        return bot.sendMessage(chatId, "រកមិនឃើញ Media");
    }

    return sendFile(chatId, media, session.data);
});

// ========================
// MAIN ROUTER MESSAGE HANDLER
// ========================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;
    addUser(chatId);

    if (text.startsWith("/")) return;

    // OWNER DIRECT REPLIES
    if (String(chatId) === String(OWNER_ID) && replyStates[chatId]) {
        const targetUser = replyStates[chatId];
        try {
            await bot.sendMessage(targetUser, `Reply From Owner\n\n${text}`);
            await bot.sendMessage(chatId, "បានផ្ញើ Reply");
        } catch {
            await bot.sendMessage(chatId, "មិនអាចផ្ញើបាន");
        }
        delete replyStates[chatId];
        return;
    }

    // URL VALIDATOR
    if (!isValidURL(text)) {
        return bot.sendMessage(chatId, "សូមផ្ញើ Link ត្រឹមត្រូវ");
    }

    const data = await fetchVideo(chatId, text);
    if (!data) return;

    // Cache with timestamp validation metric tracking
    userStates[chatId] = {
        data: data,
        timestamp: Date.now()
    };

    // THUMBNAIL PRESENTATION LAYER
    if (data.thumbnail) {
        await bot.sendPhoto(chatId, data.thumbnail, {
            caption: `${data.title || "Untitled"}\n\n${data.author || "Unknown"}\n\n${data.platform || ""}`
        }).catch(() => {});
    }

    // EXECUTING INTERACTION KEYBOARDS
    const keyboard = [];
    if (findMedia(data, "video")) {
        keyboard.push([{ text: "Video", callback_data: "video" }]);
    }
    if (findMedia(data, "image")) {
        keyboard.push([{ text: "Image", callback_data: "image" }]);
    }
    if (findMedia(data, "audio")) {
        keyboard.push([{ text: "Audio", callback_data: "audio" }]);
    }

    keyboard.push([{ text: "Tools", web_app: { url: "https://tools-amertak.vercel.app" } }]);

    return bot.sendMessage(chatId, "ជ្រើសរើស Format", {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// ========================
// ERROR HANDLERS
// ========================
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
