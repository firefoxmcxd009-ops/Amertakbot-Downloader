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

const API_BASE =
    process.env.API_BASE;

const API_KEY =
    process.env.API_KEY ||
    "amertak_super_key_2026";

const PORT =
    process.env.PORT || 3000;

// ========================
// INIT
// ========================
const app = express();

const bot = new TelegramBot(
    TOKEN,
    {
        polling: true
    }
);

// ========================
// EXPRESS
// ========================
app.get("/", (_, res) => {
    res.send("Amertak Downloader Running");
});

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});

// ========================
// DATABASE
// ========================
const DB_FILE =
    path.join(__dirname, "users.json");

function loadUsers() {

    try {

        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, "[]");
        }

        return new Set(
            JSON.parse(
                fs.readFileSync(DB_FILE)
            )
        );

    } catch {

        return new Set();

    }

}

function saveUsers(set) {

    try {

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify([...set])
        );

    } catch (err) {

        console.log(err);

    }

}

const users = loadUsers();

function addUser(id) {

    if (!users.has(id)) {

        users.add(id);

        saveUsers(users);

    }

}

// ========================
// STATES
// ========================
const userStates = {};

// ========================
// HELPERS
// ========================
function isValidURL(url = "") {

    try {

        new URL(url);

        return true;

    } catch {

        return false;

    }

}

function isImage(url = "") {

    return /\.(jpg|jpeg|png|webp)$/i.test(url);

}

function formatBytes(bytes = 0) {

    if (!bytes) return "Unknown";

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

function renderProgressBar(percent) {

    const size = 10;

    const done =
        Math.round(
            (percent / 100) * size
        );

    return (
        "█".repeat(done) +
        "░".repeat(size - done)
    );

}

// ========================
// FETCH MEDIA INFO
// ========================
async function fetchMediaInfo(
    chatId,
    url
) {

    const loading =
        await bot.sendMessage(
            chatId,
            "🔎 កំពុងស្វែងរក..."
        );

    try {

        const res =
            await axios.get(
                `${API_BASE}/api/download`,
                {
                    params: { url },
                    headers: {
                        "x-api-key":
                            API_KEY
                    },
                    timeout: 60000
                }
            );

        await bot.deleteMessage(
            chatId,
            loading.message_id
        ).catch(() => {});

        return res.data;

    } catch (err) {

        await bot.deleteMessage(
            chatId,
            loading.message_id
        ).catch(() => {});

        console.log(err?.response?.data || err);

        await bot.sendMessage(
            chatId,
            "❌ មិនអាចទាញព័ត៌មានបាន"
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

    if (type === "video") {

        return data.medias.find(
            m =>
                m.type?.toLowerCase() ===
                "video"
        );

    }

    if (type === "audio") {

        return data.medias.find(
            m =>
                m.type?.toLowerCase() ===
                "audio"
        );

    }

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
// REAL DOWNLOADER
// ========================
async function sendFile(
    chatId,
    media,
    data
) {

    const progressMsg =
        await bot.sendMessage(
            chatId,
            "📥 កំពុងចាប់ផ្ដើម..."
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
                response.headers[
                    "content-length"
                ] || "0"
            );

        let downloaded = 0;
        let lastEdit = 0;

        const chunks = [];

        response.data.on(
            "data",
            async chunk => {

            downloaded += chunk.length;

            chunks.push(chunk);

            const percent =
                total
                    ? Math.floor(
                        (downloaded / total) * 100
                    )
                    : 0;

            const now = Date.now();

            if (
                now - lastEdit < 1000
            ) return;

            lastEdit = now;

            const bar =
                renderProgressBar(percent);

            const current =
                formatBytes(downloaded);

            const full =
                formatBytes(total);

            await bot.editMessageText(

`📥 កំពុងទាញយក...

[${bar}] ${percent}%

${current} / ${full}`,

                {
                    chat_id: chatId,
                    message_id:
                        progressMsg.message_id
                }

            ).catch(() => {});

        });

        response.data.on(
            "end",
            async () => {

            const buffer =
                Buffer.concat(chunks);

            const caption =

`${data.title || "Media"}

🌐 ${data.platform || "Unknown"}`;

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
                                "Audio"
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

                console.log(err);

                await bot.sendMessage(
                    chatId,
                    "❌ មិនអាចផ្ញើឯកសារ"
                );

            }

            await bot.deleteMessage(
                chatId,
                progressMsg.message_id
            ).catch(() => {});

        });

        response.data.on(
            "error",
            async () => {

            await bot.sendMessage(
                chatId,
                "❌ Download error"
            );

        });

    } catch (err) {

        console.log(err);

        await bot.sendMessage(
            chatId,
            "❌ Server error"
        );

    }

}

// ========================
// START
// ========================
bot.onText(
    /\/start/,
    async msg => {

    addUser(msg.chat.id);

    const name =

`${msg.from.first_name || ""}
${msg.from.last_name || ""}`;

    await bot.sendMessage(

        msg.chat.id,

`សូមស្វាគមន៍ ${name}

📌 របៀបប្រើ

1. ផ្ញើ link
2. ជ្រើស format
3. រងចាំ download

💬 Support:
/ask សាររបស់អ្នក`,

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

});

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
        "⏳ អ្នកនឹងទទួលបានការឆ្លើយតប ពេល owner ឃើញ"
    );

    await bot.sendMessage(

        OWNER_ID,

`📩 NEW ASK

👤 Name:
${msg.from.first_name || "Unknown"}

🆔 User ID:
${msg.from.id}

📛 Username:
@${msg.from.username || "none"}

💬 Message:
${question}`,

{
    reply_markup: {
        force_reply: true,
        inline_keyboard: [[
            {
                text: "Reply",
                callback_data:
                    `reply_${msg.from.id}`
            }
        ]]
    }
}

    );

});

// ========================
// NOTIFY
// ========================
bot.onText(
    /\/notify (.+)/,
    async (msg, match) => {

    if (
        String(msg.chat.id) !==
        String(OWNER_ID)
    ) {

        return bot.sendMessage(
            msg.chat.id,
            "❌ មិនអនុញ្ញាត"
        );

    }

    const text =
        match[1];

    let sent = 0;
    let failed = 0;

    for (const id of users) {

        try {

            await bot.sendMessage(
                id,
                `📢 ${text}`
            );

            sent++;

        } catch {

            failed++;

        }

    }

    await bot.sendMessage(
        msg.chat.id,

`✅ Broadcast Completed

📤 Sent:
${sent}

❌ Failed:
${failed}`

    );

});

// ========================
// CALLBACK
// ========================
bot.on(
    "callback_query",
    async query => {

    const chatId =
        query.message.chat.id;

    const action =
        query.data;

    await bot.answerCallbackQuery(
        query.id
    );

    // REPLY SYSTEM
    if (
        action.startsWith("reply_")
    ) {

        return bot.sendMessage(
            chatId,
            "✍️ Reply ទៅ message ខាងលើ"
        );

    }

    const data =
        userStates[chatId]?.data;

    if (!data) {

        return bot.sendMessage(
            chatId,
            "❌ Session expired"
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
            "❌ រកមិនឃើញ media"
        );

    }

    return sendFile(
        chatId,
        media,
        data
    );

});

// ========================
// AI AUTO REPLY ENGINE
// ========================
bot.on(
    "message",
    async msg => {

    // OWNER ONLY
    if (
        String(msg.chat.id) !==
        String(OWNER_ID)
    ) return;

    // MUST REPLY
    if (!msg.reply_to_message)
        return;

    const repliedText =

        msg.reply_to_message.text || "";

    const match =
        repliedText.match(
            /User ID:\s*(\d+)/i
        );

    if (!match) return;

    const userId =
        match[1];

    if (!msg.text) return;

    try {

        await bot.sendMessage(

            userId,

`📩 Reply From Owner

━━━━━━━━━━━━━━━

${msg.text}`

        );

        await bot.sendMessage(
            OWNER_ID,
            "✅ Reply sent"
        );

    } catch {

        await bot.sendMessage(
            OWNER_ID,
            "❌ Failed to send"
        );

    }

});

// ========================
// MAIN MESSAGE
// ========================
bot.on(
    "message",
    async msg => {

    const chatId =
        msg.chat.id;

    const text =
        msg.text;

    if (!text) return;

    if (
        text.startsWith("/")
    ) return;

    addUser(chatId);

    // VALID URL
    if (!isValidURL(text)) {

        return bot.sendMessage(
            chatId,
            "❌ សូមផ្ញើ URL ត្រឹមត្រូវ"
        );

    }

    // FETCH DATA
    const data =
        await fetchMediaInfo(
            chatId,
            text
        );

    if (!data) return;

    userStates[chatId] = {
        data
    };

    // THUMBNAIL
    if (data.thumbnail) {

        await bot.sendPhoto(
            chatId,
            data.thumbnail,
            {
                caption:

`${data.title || "Untitled"}

👤 ${data.author || "Unknown"}

🌐 ${data.platform || "Unknown"}`
            }
        );

    }

    // BUTTONS
    const keyboard = [];

    if (
        findMedia(
            data,
            "video"
        )
    ) {

        keyboard.push([
            {
                text: "Video",
                callback_data:
                    "video"
            }
        ]);

    }

    if (
        findMedia(
            data,
            "image"
        )
    ) {

        keyboard.push([
            {
                text: "Image",
                callback_data:
                    "image"
            }
        ]);

    }

    if (
        findMedia(
            data,
            "audio"
        )
    ) {

        keyboard.push([
            {
                text: "Audio",
                callback_data:
                    "audio"
            }
        ]);

    }

    keyboard.push([
        {
            text: "Tools",
            web_app: {
                url:
"https://tools-amertak.vercel.app"
            }
        }
    ]);

    await bot.sendMessage(

        chatId,
        "📂 ជ្រើសរើស format",

{
    reply_markup: {
        inline_keyboard:
            keyboard
    }
}

    );

});