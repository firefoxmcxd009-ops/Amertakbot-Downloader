require("dotenv").config();

const fs = require("fs");
const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// ========================
// CONFIG
// ========================
const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

const API_BASE = process.env.API_BASE;
const API_KEY =
    process.env.API_KEY ||
    "amertak_super_key_2026";

// ========================
// INIT
// ========================
const bot = new TelegramBot(
    TOKEN,
    {
        polling: true
    }
);

const app = express();

app.get("/", (_, res) => {
    res.send("Bot Running OK");
});

app.listen(
    process.env.PORT || 3000,
    () => {
        console.log("Server Started");
    }
);

// ========================
// USERS DATABASE
// ========================
const DB_FILE = "./users.json";

function loadUsers() {

    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, "[]");
    }

    return new Set(
        JSON.parse(
            fs.readFileSync(DB_FILE)
        )
    );
}

function saveUsers(set) {

    fs.writeFileSync(
        DB_FILE,
        JSON.stringify([...set], null, 2)
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

// ========================
// STATES
// ========================
const userStates = {};
const replyStates = {};

// ========================
// HELPERS
// ========================
function isImage(url = "") {

    return /\.(jpg|jpeg|png|webp|gif)/i.test(url);
}

function isValidURL(text = "") {

    return (
        text.startsWith("http://") ||
        text.startsWith("https://")
    );
}

function renderProgressBar(percent) {

    const total = 10;

    const filled =
        Math.round(percent / 10);

    return (
        "█".repeat(filled) +
        "░".repeat(total - filled)
    );
}

function formatBytes(bytes = 0) {

    if (!bytes)
        return "Unknown";

    const sizes = [
        "B",
        "KB",
        "MB",
        "GB"
    ];

    const i = Math.floor(
        Math.log(bytes) /
        Math.log(1024)
    );

    return (
        (bytes / Math.pow(1024, i))
        .toFixed(2) +
        " " +
        sizes[i]
    );
}

// ========================
// FETCH MEDIA
// ========================
async function fetchVideo(
    chatId,
    url
) {

    const loading =
        await bot.sendMessage(
            chatId,
            "កំពុងស្វែងរកព័ត៌មាន..."
        );

    try {

        const response =
            await axios.get(
                `${API_BASE}/api/download`,
                {
                    params: {
                        url
                    },
                    headers: {
                        "x-api-key":
                            API_KEY
                    },
                    timeout: 120000
                }
            );

        await bot.deleteMessage(
            chatId,
            loading.message_id
        ).catch(() => {});

        return response.data;

    } catch (err) {

        console.error(err?.response?.data || err.message);

        await bot.deleteMessage(
            chatId,
            loading.message_id
        ).catch(() => {});

        await bot.sendMessage(
            chatId,
            "មិនអាចទាញព័ត៌មានបាន"
        );

        return null;
    }
}

// ========================
// FIND MEDIA
// ========================
function findMedia(
    data,
    type
) {

    if (!data?.medias)
        return null;

    // VIDEO
    if (type === "video") {

        return data.medias.find(
            m =>
                m.type?.toLowerCase() ===
                "video"
        );
    }

    // AUDIO
    if (type === "audio") {

        return data.medias.find(
            m =>
                m.type?.toLowerCase() ===
                "audio"
        );
    }

    // IMAGE
    if (type === "image") {

        return data.medias.find(
            m =>
                m.type?.toLowerCase() ===
                "image" ||
                isImage(m.url)
        );
    }

    return null;
}

// ========================
// REAL STREAM DOWNLOADER
// ========================
async function sendFile(
    chatId,
    media,
    data
) {

    const progressMessage =
        await bot.sendMessage(
            chatId,

`កំពុងទាញយក...

[░░░░░░░░░░] 0%`
        );

    try {

        const response =
            await axios.get(
                `${API_BASE}/api/proxy`,
                {
                    responseType: "stream",
                    params: {
                        url: media.url
                    },
                    timeout: 0
                }
            );

        const total =
            parseInt(
                response.headers["content-length"] || "0"
            );

        let downloaded = 0;
        let lastUpdate = 0;

        const chunks = [];

        response.data.on(
            "data",
            async (chunk) => {

                downloaded += chunk.length;

                chunks.push(chunk);

                const percent =
                    total
                        ? Math.floor(
                            (downloaded / total) * 100
                        )
                        : 0;

                const now = Date.now();

                // throttle update
                if (
                    now - lastUpdate < 1000
                ) return;

                lastUpdate = now;

                const bar =
                    renderProgressBar(percent);

                const downloadedSize =
                    formatBytes(downloaded);

                const totalSize =
                    formatBytes(total);

                try {

                    await bot.editMessageText(

`កំពុងទាញយក...

[${bar}] ${percent}%

${downloadedSize} / ${totalSize}`,

                        {
                            chat_id: chatId,
                            message_id:
                                progressMessage.message_id
                        }
                    );

                } catch (_) {}
            }
        );

        response.data.on(
            "end",
            async () => {

                const buffer =
                    Buffer.concat(chunks);

                const caption =
                    data.title ||
                    "Downloaded";

                try {

                    // AUDIO
                    if (
                        media.type?.toLowerCase() ===
                        "audio"
                    ) {

                        await bot.sendAudio(
                            chatId,
                            buffer,
                            {
                                caption,
                                title:
                                    data.title ||
                                    "Audio",
                                performer:
                                    data.author ||
                                    "Amertak"
                            }
                        );
                    }

                    // VIDEO
                    else if (
                        media.type?.toLowerCase() ===
                        "video"
                    ) {

                        await bot.sendVideo(
                            chatId,
                            buffer,
                            {
                                caption,
                                supports_streaming: true
                            }
                        );
                    }

                    // IMAGE
                    else if (
                        media.type?.toLowerCase() ===
                        "image" ||
                        isImage(media.url)
                    ) {

                        await bot.sendPhoto(
                            chatId,
                            buffer,
                            {
                                caption
                            }
                        );
                    }

                    // FILE
                    else {

                        await bot.sendDocument(
                            chatId,
                            buffer,
                            {
                                caption
                            }
                        );
                    }

                } catch (err) {

                    console.error(err);

                    await bot.sendMessage(
                        chatId,
                        "បរាជ័យក្នុងការផ្ញើឯកសារ"
                    );
                }

                await bot.deleteMessage(
                    chatId,
                    progressMessage.message_id
                ).catch(() => {});
            }
        );

        response.data.on(
            "error",
            async () => {

                await bot.sendMessage(
                    chatId,
                    "Download Error"
                );

                await bot.deleteMessage(
                    chatId,
                    progressMessage.message_id
                ).catch(() => {});
            }
        );

    } catch (err) {

        console.error(err.message);

        await bot.sendMessage(
            chatId,
            "Server Error"
        );

        await bot.deleteMessage(
            chatId,
            progressMessage.message_id
        ).catch(() => {});
    }
}

// ========================
// START
// ========================
bot.onText(
    /\/start/,
    async (msg) => {

        const fullName =

            `${msg.from.first_name || ""} ${msg.from.last_name || ""}`;

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
                                web_app: {
                                    url:
                                        "https://tools-amertak.vercel.app"
                                }
                            }
                        ]
                    ]
                }
            }
        );
    }
);

// ========================
// ID
// ========================
bot.onText(
    /\/id/,
    async (msg) => {

        await bot.sendMessage(

            msg.chat.id,

`ព័ត៌មានរបស់អ្នក

User ID: ${msg.from.id}
Chat ID: ${msg.chat.id}
Username: @${msg.from.username || "none"}`
        );
    }
);

// ========================
// ASK SYSTEM
// ========================
bot.onText(
    /\/ask (.+)/,
    async (msg, match) => {

        const question =
            match[1];

        await bot.sendMessage(

            msg.chat.id,

            "អ្នកនឹងទទួលបានការឆ្លើយតប ពេល Owner ឃើញ"
        );

        await bot.sendMessage(

            OWNER_ID,

`សំណួរថ្មី

Name:
${msg.from.first_name}

User ID:
${msg.from.id}

Username:
@${msg.from.username || "none"}

Message:
${question}`,

            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Reply",
                                callback_data:
                                    `reply_${msg.from.id}`
                            }
                        ]
                    ]
                }
            }
        );
    }
);

// ========================
// MANUAL REPLY
// ========================
bot.onText(
    /\/reply (\d+) (.+)/,
    async (msg, match) => {

        if (
            String(msg.chat.id) !==
            String(OWNER_ID)
        ) {
            return;
        }

        const userId =
            match[1];

        const text =
            match[2];

        try {

            await bot.sendMessage(

                userId,

`Reply From Owner

${text}`
            );

            await bot.sendMessage(
                msg.chat.id,
                "បានផ្ញើ Reply"
            );

        } catch {

            await bot.sendMessage(
                msg.chat.id,
                "មិនអាចផ្ញើបាន"
            );
        }
    }
);

// ========================
// NOTIFY ALL
// ========================
bot.onText(
    /\/notify (.+)/,
    async (msg, match) => {

        // owner only
        if (
            String(msg.chat.id) !==
            String(OWNER_ID)
        ) {

            return bot.sendMessage(
                msg.chat.id,
                "Not Allowed"
            );
        }

        const text =
            match[1];

        let success = 0;
        let failed = 0;

        for (const id of users) {

            try {

                await bot.sendMessage(
                    id,
                    `Broadcast

${text}`
                );

                success++;

            } catch (err) {

                failed++;
            }

            // anti flood
            await new Promise(
                r => setTimeout(r, 50)
            );
        }

        await bot.sendMessage(

            msg.chat.id,

`Broadcast Completed

Success:
${success}

Failed:
${failed}`
        );
    }
);

// ========================
// CALLBACK QUERY
// ========================
bot.on(
    "callback_query",
    async (query) => {

        const chatId =
            query.message.chat.id;

        const action =
            query.data;

        await bot.answerCallbackQuery(
            query.id
        );

        // ========================
        // REPLY MODE
        // ========================
        if (
            action.startsWith("reply_")
        ) {

            // owner only
            if (
                String(chatId) !==
                String(OWNER_ID)
            ) {
                return;
            }

            const userId =
                action.split("_")[1];

            replyStates[chatId] =
                userId;

            return bot.sendMessage(

                chatId,

`Reply Mode Enabled

User ID:
${userId}

ឥឡូវអ្នកអាចវាយសារ Reply បាន`
            );
        }

        // ========================
        // DOWNLOAD
        // ========================
        const data =
            userStates[chatId]?.data;

        if (!data) {

            return bot.sendMessage(
                chatId,
                "Session Expired"
            );
        }

        const media =
            findMedia(
                data,
                action
            );

        if (!media) {

            return bot.sendMessage(
                chatId,
                "រកមិនឃើញ Media"
            );
        }

        return sendFile(
            chatId,
            media,
            data
        );
    }
);

// ========================
// MAIN MESSAGE
// ========================
bot.on(
    "message",
    async (msg) => {

        const chatId =
            msg.chat.id;

        const text =
            msg.text;

        if (!text)
            return;

        addUser(chatId);

        // ========================
        // SKIP COMMANDS
        // ========================
        if (
            text.startsWith("/")
        ) return;

        // ========================
        // OWNER REPLY MODE
        // ========================
        if (
            String(chatId) ===
            String(OWNER_ID) &&
            replyStates[chatId]
        ) {

            const targetUser =
                replyStates[chatId];

            try {

                await bot.sendMessage(

                    targetUser,

`Reply From Owner

${text}`
                );

                await bot.sendMessage(
                    chatId,
                    "បានផ្ញើ Reply"
                );

            } catch {

                await bot.sendMessage(
                    chatId,
                    "មិនអាចផ្ញើបាន"
                );
            }

            delete replyStates[chatId];

            return;
        }

        // ========================
        // INVALID URL
        // ========================
        if (
            !isValidURL(text)
        ) {

            return bot.sendMessage(
                chatId,
                "សូមផ្ញើ Link ត្រឹមត្រូវ"
            );
        }

        // ========================
        // FETCH DATA
        // ========================
        const data =
            await fetchVideo(
                chatId,
                text
            );

        if (!data)
            return;

        userStates[chatId] = {
            data
        };

        // ========================
        // THUMBNAIL
        // ========================
        if (
            data.thumbnail
        ) {

            await bot.sendPhoto(
                chatId,
                data.thumbnail,
                {
                    caption:

`${data.title || "Untitled"}

${data.author || "Unknown"}

${data.platform || ""}`
                }
            );
        }

        // ========================
        // BUTTONS
        // ========================
        const keyboard = [];

        // VIDEO
        if (
            findMedia(data, "video")
        ) {

            keyboard.push([
                {
                    text: "Video",
                    callback_data:
                        "video"
                }
            ]);
        }

        // IMAGE
        if (
            findMedia(data, "image")
        ) {

            keyboard.push([
                {
                    text: "Image",
                    callback_data:
                        "image"
                }
            ]);
        }

        // AUDIO
        if (
            findMedia(data, "audio")
        ) {

            keyboard.push([
                {
                    text: "Audio",
                    callback_data:
                        "audio"
                }
            ]);
        }

        // TOOLS
        keyboard.push([
            {
                text: "Tools",
                web_app: {
                    url:
                        "https://tools-amertak.vercel.app"
                }
            }
        ]);

        return bot.sendMessage(

            chatId,

            "ជ្រើសរើស Format",

            {
                reply_markup: {
                    inline_keyboard:
                        keyboard
                }
            }
        );
    }
);

// ========================
// ERROR HANDLER
// ========================
process.on(
    "unhandledRejection",
    console.error
);

process.on(
    "uncaughtException",
    console.error
);