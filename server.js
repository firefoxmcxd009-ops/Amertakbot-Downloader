//////////////////////////////////////////////////////
// AMERTAK TELEGRAM BOT - ULTIMATE METADATA EDITION
// FULL UPGRADE FOR NEW BACKEND API
// KEEP ALL FEATURES + LOGIC
//////////////////////////////////////////////////////

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

//////////////////////////////////////////////////////
// IMPORTS
//////////////////////////////////////////////////////

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

//////////////////////////////////////////////////////
// CONFIG
//////////////////////////////////////////////////////

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "");
const API_BASE = process.env.API_BASE || "http://localhost:3000";

const PORT = process.env.PORT || 3000;

//////////////////////////////////////////////////////
// INIT
//////////////////////////////////////////////////////

const bot = new TelegramBot(TOKEN, {
    polling: true
});

const app = express();

app.use(express.json());

//////////////////////////////////////////////////////
// EXPRESS HEALTH
//////////////////////////////////////////////////////

app.get("/", (_, res) => {
    res.json({
        status: true,
        bot: "running",
        version: "ultimate-metadata-edition"
    });
});

app.listen(PORT, () => {
    console.log(`
==========================================
 AMERTAK TELEGRAM BOT RUNNING
==========================================

PORT: ${PORT}
API : ${API_BASE}

==========================================
`);
});

//////////////////////////////////////////////////////
// DATABASE
//////////////////////////////////////////////////////

const DB_FILE = path.join(__dirname, "users.json");

function ensureDB() {

    if (!fs.existsSync(DB_FILE)) {

        fs.writeFileSync(
            DB_FILE,
            "[]"
        );
    }
}

ensureDB();

function loadUsers() {

    try {

        return new Set(
            JSON.parse(
                fs.readFileSync(DB_FILE)
            )
        );

    } catch {

        return new Set();
    }
}

function saveUsers(users) {

    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(
            [...users],
            null,
            2
        )
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

const userStates = new Map();
const replyStates = new Map();

//////////////////////////////////////////////////////
// HELPERS
//////////////////////////////////////////////////////

function isURL(text = "") {

    return (
        text.startsWith("http://") ||
        text.startsWith("https://")
    );
}

function progressBar(percent = 0) {

    const filled =
        Math.floor(percent / 5);

    return (
        "/".repeat(filled) +
        "-".repeat(20 - filled)
    );
}

function detectPlatform(url = "") {

    url = url.toLowerCase();

    if (
        url.includes("youtube.com") ||
        url.includes("youtu.be")
    ) {
        return "youtube";
    }

    if (
        url.includes("spotify.com")
    ) {
        return "spotify";
    }

    if (
        url.includes("tiktok.com")
    ) {
        return "tiktok";
    }

    if (
        url.includes("pinterest.com")
    ) {
        return "pinterest";
    }

    return null;
}

function platformEndpoint(platform) {

    switch (platform) {

        case "youtube":
            return "/api/youtube";

        case "spotify":
            return "/api/spotify";

        case "tiktok":
            return "/api/tiktok";

        case "pinterest":
            return "/api/pinterest";

        default:
            return "/api/resolve";
    }
}

//////////////////////////////////////////////////////
// API FETCHER
//////////////////////////////////////////////////////

async function fetchMetadata(chatId, url) {

    const loading =
        await bot.sendMessage(

            chatId,

`//////////////////////////////////////////
0%

🔎 កំពុងស្វែងរក...`
        );

    try {

        const platform =
            detectPlatform(url);

        const endpoint =
            platformEndpoint(platform);

        await bot.editMessageText(

`//////////////////////////////////////////
25%

🌐 Connecting API...`,

            {
                chat_id: chatId,
                message_id:
                    loading.message_id
            }
        );

        const response =
            await axios.get(
                `${API_BASE}${endpoint}`,
                {
                    params: {
                        url
                    },
                    timeout: 120000
                }
            );

        await bot.editMessageText(

`//////////////////////////////////////////
70%

📦 Receiving data...`,

            {
                chat_id: chatId,
                message_id:
                    loading.message_id
            }
        );

        await new Promise(
            r => setTimeout(r, 500)
        );

        await bot.editMessageText(

`//////////////////////////////////////////
100%

✅ Completed`,

            {
                chat_id: chatId,
                message_id:
                    loading.message_id
            }
        );

        setTimeout(() => {

            bot.deleteMessage(
                chatId,
                loading.message_id
            ).catch(() => {});

        }, 1000);

        return response.data;

    } catch (err) {

        console.error(err.message);

        await bot.editMessageText(

`//////////////////////////////////////////
0%

❌ Error fetching metadata`,

            {
                chat_id: chatId,
                message_id:
                    loading.message_id
            }
        ).catch(() => {});

        return null;
    }
}

//////////////////////////////////////////////////////
// START
//////////////////////////////////////////////////////

bot.onText(
    /\/start/,
    async (msg) => {

        addUser(msg.chat.id);

        const fullName =

`${msg.from.first_name || ""}
${msg.from.last_name || ""}`;

        await bot.sendMessage(

            msg.chat.id,

`👋 សូមស្វាគមន៍ ${fullName}

🔥 Supported:
• YouTube
• TikTok
• Pinterest
• Spotify

📌 Usage:
1. Send URL
2. Bot fetches metadata
3. View thumbnail + info

Commands:
/id
/ask
/notify

🚀 Ultimate Metadata Edition`,

            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "🛠 Tools",
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

//////////////////////////////////////////////////////
// ID
//////////////////////////////////////////////////////

bot.onText(
    /\/id/,
    async (msg) => {

        await bot.sendMessage(

            msg.chat.id,

`🆔 USER INFO

User ID:
${msg.from.id}

Chat ID:
${msg.chat.id}

Username:
@${msg.from.username || "none"}`
        );
    }
);

//////////////////////////////////////////////////////
// ASK
//////////////////////////////////////////////////////

bot.onText(
    /\/ask (.+)/,
    async (msg, match) => {

        const question =
            match[1];

        await bot.sendMessage(

            msg.chat.id,

            "📩 Sent to owner"
        );

        await bot.sendMessage(

            OWNER_ID,

`❓ NEW QUESTION

👤 User:
${msg.from.first_name}

🆔 ID:
${msg.from.id}

💬 Message:
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

//////////////////////////////////////////////////////
// REPLY
//////////////////////////////////////////////////////

bot.onText(
    /\/reply (\d+) (.+)/,
    async (msg, match) => {

        if (
            String(msg.chat.id) !==
            OWNER_ID
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

`📩 OWNER REPLY

${text}`
            );

            await bot.sendMessage(
                msg.chat.id,
                "✅ Reply sent"
            );

        } catch {

            await bot.sendMessage(
                msg.chat.id,
                "❌ Failed"
            );
        }
    }
);

//////////////////////////////////////////////////////
// NOTIFY
//////////////////////////////////////////////////////

bot.onText(
    /\/notify (.+)/,
    async (msg, match) => {

        if (
            String(msg.chat.id) !==
            OWNER_ID
        ) {
            return;
        }

        let success = 0;
        let failed = 0;

        for (const id of users) {

            try {

                await bot.sendMessage(

                    id,

`📢 BROADCAST

${match[1]}`
                );

                success++;

            } catch {

                failed++;
            }

            await new Promise(
                r => setTimeout(r, 50)
            );
        }

        await bot.sendMessage(

            msg.chat.id,

`📊 BROADCAST COMPLETE

✅ Success:
${success}

❌ Failed:
${failed}`
        );
    }
);

//////////////////////////////////////////////////////
// CALLBACK
//////////////////////////////////////////////////////

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

        //////////////////////////////////////////////////
        // REPLY MODE
        //////////////////////////////////////////////////

        if (
            action.startsWith("reply_")
        ) {

            if (
                String(chatId) !==
                OWNER_ID
            ) {
                return;
            }

            const userId =
                action.split("_")[1];

            replyStates.set(
                chatId,
                userId
            );

            return bot.sendMessage(

                chatId,

`✍ Reply Mode

Target:
${userId}

Send message now`
            );
        }

        //////////////////////////////////////////////////
        // URL BUTTON
        //////////////////////////////////////////////////

        if (
            action.startsWith("open_")
        ) {

            const url =
                action.replace(
                    "open_",
                    ""
                );

            return bot.sendMessage(
                chatId,
                url
            );
        }
    }
);

//////////////////////////////////////////////////////
// MAIN MESSAGE
//////////////////////////////////////////////////////

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

        //////////////////////////////////////////////////
        // SKIP COMMAND
        //////////////////////////////////////////////////

        if (
            text.startsWith("/")
        ) {
            return;
        }

        //////////////////////////////////////////////////
        // OWNER REPLY MODE
        //////////////////////////////////////////////////

        if (
            String(chatId) ===
            OWNER_ID &&
            replyStates.has(chatId)
        ) {

            const target =
                replyStates.get(chatId);

            try {

                await bot.sendMessage(

                    target,

`📩 OWNER REPLY

${text}`
                );

                await bot.sendMessage(
                    chatId,
                    "✅ Sent"
                );

            } catch {

                await bot.sendMessage(
                    chatId,
                    "❌ Failed"
                );
            }

            replyStates.delete(chatId);

            return;
        }

        //////////////////////////////////////////////////
        // INVALID URL
        //////////////////////////////////////////////////

        if (
            !isURL(text)
        ) {

            return bot.sendMessage(

                chatId,

                "❌ Invalid URL"
            );
        }

        //////////////////////////////////////////////////
        // FETCH
        //////////////////////////////////////////////////

        const data =
            await fetchMetadata(
                chatId,
                text
            );

        if (!data)
            return;

        userStates.set(
            chatId,
            data
        );

        //////////////////////////////////////////////////
        // THUMBNAIL
        //////////////////////////////////////////////////

        if (
            data.thumbnail
        ) {

            try {

                await bot.sendPhoto(

                    chatId,

                    data.thumbnail,

                    {
                        caption:

`🎬 ${data.title || "Unknown"}

🌐 Platform:
${data.source || "Unknown"}

🔗 URL:
${data.url || "N/A"}`
                    }
                );

            } catch {

                await bot.sendMessage(

                    chatId,

`🎬 ${data.title || "Unknown"}

🌐 ${data.source || "Unknown"}`
                );
            }
        }

        //////////////////////////////////////////////////
        // EXTRA DETAILS
        //////////////////////////////////////////////////

        if (
            data.extra
        ) {

            let extraText =
                "📦 EXTRA INFO\n\n";

            for (const key in data.extra) {

                const value =
                    data.extra[key];

                if (
                    typeof value ===
                    "object"
                ) continue;

                extraText +=
`${key}: ${value}\n`;
            }

            await bot.sendMessage(
                chatId,
                extraText
            );
        }

        //////////////////////////////////////////////////
        // BUTTONS
        //////////////////////////////////////////////////

        const keyboard = [];

        keyboard.push([
            {
                text: "🌐 Open URL",
                url: data.url
            }
        ]);

        keyboard.push([
            {
                text: "🛠 Tools",
                web_app: {
                    url:
"https://tools-amertak.vercel.app"
                }
            }
        ]);

        //////////////////////////////////////////////////
        // SEND FINAL
        //////////////////////////////////////////////////

        await bot.sendMessage(

            chatId,

            "✅ Metadata fetched successfully",

            {
                reply_markup: {
                    inline_keyboard:
                        keyboard
                }
            }
        );
    }
);

//////////////////////////////////////////////////////
// AUTO CLEANUP
//////////////////////////////////////////////////////

setInterval(() => {

    if (
        userStates.size > 1000
    ) {

        userStates.clear();

        console.log(
            "🧹 Cleared userStates"
        );
    }

}, 1000 * 60 * 30);

//////////////////////////////////////////////////////
// READY
//////////////////////////////////////////////////////

console.log(`
==========================================
 BOT ONLINE
==========================================

FEATURES:
✔ YouTube Metadata
✔ Spotify Metadata
✔ TikTok Metadata
✔ Pinterest Metadata
✔ Ask System
✔ Reply System
✔ Broadcast
✔ Progress UI
✔ User Database
✔ WebApp Buttons
✔ Auto Cleanup
✔ Render Ready

==========================================
`);