//////////////////////////////////////////////////////
// AMERTAK TELEGRAM BOT - FULL WORKING VERSION
//////////////////////////////////////////////////////

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

require("dotenv").config();

const fs          = require("fs");
const path        = require("path");
const express     = require("express");
const axios       = require("axios");
const compression = require("compression");
const helmet      = require("helmet");
const TelegramBot = require("node-telegram-bot-api");

//////////////////////////////////////////////////////
// CONFIG
//////////////////////////////////////////////////////

const TOKEN    = process.env.BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "");
const API_BASE = (process.env.API_BASE || "http://localhost:3000").replace(/\/$/, "");
const BOT_URL  = (process.env.BOT_URL || "").replace(/\/$/, "");
const PORT     = Number(process.env.PORT || 3000);

if (!TOKEN) {
    console.error("❌ BOT_TOKEN missing");
    process.exit(1);
}

//////////////////////////////////////////////////////
// EXPRESS
//////////////////////////////////////////////////////

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

app.use(
    helmet({
        crossOriginResourcePolicy: false
    })
);

app.get("/", (_, res) => {
    res.json({
        status: "online",
        bot: "amertak"
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Server running on ${PORT}`);
});

//////////////////////////////////////////////////////
// TELEGRAM BOT
//////////////////////////////////////////////////////

const bot = new TelegramBot(TOKEN, {
    polling: false,
    filepath: false,
    request: {
        agentOptions: {
            keepAlive: true,
            family: 4
        }
    }
});

//////////////////////////////////////////////////////
// SAFE START
//////////////////////////////////////////////////////

let started = false;

async function startBot() {

    if (started) return;

    try {

        await bot.deleteWebHook({
            drop_pending_updates: true
        }).catch(() => {});

        try {
            await bot.stopPolling();
        } catch {}

        await bot.startPolling({
            restart: true,
            polling: {
                interval: 300,
                autoStart: true,
                params: {
                    timeout: 10
                }
            }
        });

        started = true;

        console.log("✅ BOT ONLINE");

    } catch (err) {

        console.error(
            "❌ BOT START ERROR:",
            err.message
        );

        setTimeout(startBot, 10000);
    }
}

setTimeout(startBot, 2000);

//////////////////////////////////////////////////////
// POLLING ERRORS
//////////////////////////////////////////////////////

bot.on("polling_error", async (err) => {

    const msg = String(err.message || "");

    console.error("Polling error:", msg);

    if (
        msg.includes("409") ||
        msg.includes("terminated by other getUpdates")
    ) {

        try {
            await bot.stopPolling();
        } catch {}

        started = false;

        return setTimeout(startBot, 5000);
    }
});

//////////////////////////////////////////////////////
// DATABASE
//////////////////////////////////////////////////////

const DB_FILE      = path.join(__dirname, "users.json");
const HISTORY_FILE = path.join(__dirname, "history.json");

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "[]");
}

if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, "{}");
}

function loadUsers() {
    try {
        return new Set(
            JSON.parse(fs.readFileSync(DB_FILE, "utf8"))
        );
    } catch {
        return new Set();
    }
}

function saveUsers(usersSet) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify([...usersSet], null, 2)
    );
}

const users = loadUsers();

function addUser(id) {

    id = String(id);

    if (!users.has(id)) {

        users.add(id);

        saveUsers(users);
    }
}

//////////////////////////////////////////////////////
// STATES
//////////////////////////////////////////////////////

const formatStates = new Map();
const userStates   = new Map();

//////////////////////////////////////////////////////
// HELPERS
//////////////////////////////////////////////////////

function isURL(text = "") {

    return (
        text.startsWith("http://") ||
        text.startsWith("https://")
    );
}

function detectPlatform(url = "") {

    url = url.toLowerCase();

    if (
        url.includes("youtube.com") ||
        url.includes("youtu.be")
    ) return "youtube";

    if (url.includes("spotify.com")) {
        return "spotify";
    }

    if (url.includes("tiktok.com")) {
        return "tiktok";
    }

    if (url.includes("pinterest.com")) {
        return "pinterest";
    }

    return null;
}

function platformEndpoint(platform) {

    const map = {
        youtube: "/api/youtube",
        spotify: "/api/spotify",
        tiktok: "/api/tiktok",
        pinterest: "/api/pinterest"
    };

    return map[platform] || "/api/resolve";
}

function safeFilename(title = "download") {

    return (
        "Amertak_" +
        title
            .replace(/[^\w\s.-]/g, "_")
            .replace(/\s+/g, "_")
            .substring(0, 80)
    );
}

function formatsFor(platform) {

    switch (platform) {

        case "youtube":
            return [
                { label: "HD",  value: "mp4_1080", type: "video" },
                { label: "SD",  value: "mp4_720",  type: "video" },
                { label: "MP3", value: "mp3_320",  type: "audio" }
            ];

        case "tiktok":
            return [
                { label: "HD",  value: "mp4_hd", type: "video" },
                { label: "SD",  value: "mp4_sd", type: "video" },
                { label: "MP3", value: "mp3",    type: "audio" }
            ];

        case "spotify":
            return [
                { label: "MP3", value: "mp3_320", type: "audio" }
            ];

        case "pinterest":
            return [
                { label: "HD", value: "mp4_hd", type: "video" },
                { label: "SD", value: "mp4_sd", type: "video" }
            ];

        default:
            return [
                { label: "MP4", value: "mp4", type: "video" }
            ];
    }
}

//////////////////////////////////////////////////////
// FETCH METADATA
//////////////////////////////////////////////////////

async function fetchMetadata(chatId, url) {

    const loading = await bot.sendMessage(
        chatId,
        "🔎 Loading..."
    );

    try {

        const platform = detectPlatform(url);

        const response = await axios.get(
            `${API_BASE}${platformEndpoint(platform)}`,
            {
                params: { url },
                timeout: 120000
            }
        );

        await bot.deleteMessage(
            chatId,
            loading.message_id
        ).catch(() => {});

        return response.data;

    } catch (err) {

        console.error(
            "Metadata error:",
            err.message
        );

        await bot.editMessageText(
            "❌ Failed",
            {
                chat_id: chatId,
                message_id: loading.message_id
            }
        ).catch(() => {});

        return null;
    }
}

//////////////////////////////////////////////////////
// DOWNLOAD + SEND
//////////////////////////////////////////////////////

async function downloadAndSend(
    chatId,
    data,
    url,
    formatObj
) {

    const progress = await bot.sendMessage(
        chatId,
        "⬇️ Downloading..."
    );

    try {

        const platform = detectPlatform(url);

        const dlRes = await axios.get(
            `${API_BASE}/api/download`,
            {
                params: {
                    url,
                    platform,
                    format: formatObj.value
                },
                timeout: 120000
            }
        );

        const directUrl =
            dlRes.data?.downloadUrl ||
            dlRes.data?.url;

        if (!directUrl) {
            throw new Error("No URL");
        }

        await bot.editMessageText(
            "📦 Fetching file...",
            {
                chat_id: chatId,
                message_id: progress.message_id
            }
        ).catch(() => {});

        const file = await axios.get(
            directUrl,
            {
                responseType: "arraybuffer",
                timeout: 300000,
                headers: {
                    "User-Agent": "Mozilla/5.0"
                }
            }
        );

        const buffer = Buffer.from(file.data);

        await bot.editMessageText(
            "📤 Sending...",
            {
                chat_id: chatId,
                message_id: progress.message_id
            }
        ).catch(() => {});

        const filename = safeFilename(
            data.title || "download"
        );

        //////////////////////////////////////////////////////
        // AUDIO
        //////////////////////////////////////////////////////

        if (formatObj.type === "audio") {

            await bot.sendAudio(
                chatId,
                buffer,
                {
                    title: filename,
                    performer: "Amertak"
                },
                {
                    filename: filename + ".mp3",
                    contentType: "audio/mpeg"
                }
            );
        }

        //////////////////////////////////////////////////////
        // VIDEO
        //////////////////////////////////////////////////////

        else {

            await bot.sendVideo(
                chatId,
                buffer,
                {
                    supports_streaming: true
                },
                {
                    filename: filename + ".mp4",
                    contentType: "video/mp4"
                }
            );
        }

        await bot.deleteMessage(
            chatId,
            progress.message_id
        ).catch(() => {});

        await bot.sendMessage(
            chatId,
            `✅ ${data.title || "Completed"}`
        );

    } catch (err) {

        console.error(
            "Download error:",
            err.message
        );

        await bot.editMessageText(
            "❌ Download failed",
            {
                chat_id: chatId,
                message_id: progress.message_id
            }
        ).catch(() => {});
    }
}

//////////////////////////////////////////////////////
// START
//////////////////////////////////////////////////////

bot.onText(/^\/start$/, async (msg) => {

    addUser(msg.chat.id);

    await bot.sendMessage(
        msg.chat.id,
`🔥 AMERTAK DOWNLOADER

✅ YouTube
✅ TikTok
✅ Spotify
✅ Pinterest

📥 Send URL`
    );
});

//////////////////////////////////////////////////////
// HELP
//////////////////////////////////////////////////////

bot.onText(/^\/help$/, async (msg) => {

    await bot.sendMessage(
        msg.chat.id,
`📚 Commands

/start
/help
/stats`
    );
});

//////////////////////////////////////////////////////
// STATS
//////////////////////////////////////////////////////

bot.onText(/^\/stats$/, async (msg) => {

    if (String(msg.from.id) !== OWNER_ID) {
        return;
    }

    await bot.sendMessage(
        msg.chat.id,
`📊 BOT STATS

👤 Users: ${users.size}
🟢 Online`
    );
});

//////////////////////////////////////////////////////
// MESSAGE HANDLER
//////////////////////////////////////////////////////

bot.on("message", async (msg) => {

    try {

        const chatId = msg.chat.id;
        const text   = msg.text;

        if (!text || text.startsWith("/")) {
            return;
        }

        if (!isURL(text)) {

            return bot.sendMessage(
                chatId,
                "❌ Invalid URL"
            );
        }

        const platform = detectPlatform(text);

        if (!platform) {

            return bot.sendMessage(
                chatId,
                "❌ Unsupported platform"
            );
        }

        addUser(chatId);

        const data = await fetchMetadata(
            chatId,
            text
        );

        if (!data) {

            return bot.sendMessage(
                chatId,
                "❌ Cannot fetch metadata"
            );
        }

        const formats = formatsFor(platform);

        formatStates.set(chatId, {
            url: text,
            data,
            formats
        });

        const keyboard = formats.map((fmt, i) => ([{
            text:
                fmt.type === "audio"
                    ? "🎵 MP3"
                    : fmt.value.includes("1080") ||
                      fmt.value.includes("hd")
                    ? "🎬 HD"
                    : "📹 SD",

            callback_data: `fmt_${i}`
        }]));

        const caption =
`🎬 ${data.title || "Unknown"}

🌐 ${platform.toUpperCase()}`;

        if (data.thumbnail) {

            await bot.sendPhoto(
                chatId,
                data.thumbnail,
                {
                    caption,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );

        } else {

            await bot.sendMessage(
                chatId,
                caption,
                {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );
        }

    } catch (err) {

        console.error(
            "Message error:",
            err.message
        );
    }
});

//////////////////////////////////////////////////////
// CALLBACK HANDLER
//////////////////////////////////////////////////////

bot.on("callback_query", async (query) => {

    try {

        const chatId    = query.message.chat.id;
        const messageId = query.message.message_id;
        const data      = query.data;

        if (!data.startsWith("fmt_")) {
            return;
        }

        const state = formatStates.get(chatId);

        if (!state) {

            return bot.answerCallbackQuery(
                query.id,
                {
                    text: "Expired"
                }
            );
        }

        const index = Number(
            data.replace("fmt_", "")
        );

        const formatObj = state.formats[index];

        if (!formatObj) {
            return;
        }

        //////////////////////////////////////////////////////
        // LOCK
        //////////////////////////////////////////////////////

        if (userStates.get(chatId)) {

            return bot.answerCallbackQuery(
                query.id,
                {
                    text: "⏳ Processing..."
                }
            );
        }

        userStates.set(chatId, true);

        //////////////////////////////////////////////////////
        // REMOVE BUTTONS
        //////////////////////////////////////////////////////

        await bot.editMessageReplyMarkup(
            {
                inline_keyboard: []
            },
            {
                chat_id: chatId,
                message_id: messageId
            }
        ).catch(() => {});

        //////////////////////////////////////////////////////
        // ANSWER
        //////////////////////////////////////////////////////

        await bot.answerCallbackQuery(
            query.id,
            {
                text: `⬇️ ${formatObj.label}`
            }
        ).catch(() => {});

        //////////////////////////////////////////////////////
        // DELETE PREVIEW
        //////////////////////////////////////////////////////

        setTimeout(() => {

            bot.deleteMessage(
                chatId,
                messageId
            ).catch(() => {});

        }, 500);

        //////////////////////////////////////////////////////
        // DOWNLOAD
        //////////////////////////////////////////////////////

        await downloadAndSend(
            chatId,
            state.data,
            state.url,
            formatObj
        );

        //////////////////////////////////////////////////////
        // CLEANUP
        //////////////////////////////////////////////////////

        userStates.delete(chatId);
        formatStates.delete(chatId);

    } catch (err) {

        console.error(
            "Callback error:",
            err.message
        );

        userStates.delete(
            query.message.chat.id
        );
    }
});

//////////////////////////////////////////////////////
// EXIT
//////////////////////////////////////////////////////

async function shutdown(signal) {

    console.log(`${signal} received`);

    try {
        await bot.stopPolling();
    } catch {}

    process.exit(0);
}

process.once(
    "SIGINT",
    () => shutdown("SIGINT")
);

process.once(
    "SIGTERM",
    () => shutdown("SIGTERM")
);