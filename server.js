require("dotenv").config();

process.on("uncaughtException", (err) => {
    console.log("UNCAUGHT EXCEPTION:");
    console.log(err);
});

process.on("unhandledRejection", (err) => {
    console.log("UNHANDLED REJECTION:");
    console.log(err);
});

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const fs = require("fs");

// ========================
// ENV CHECK
// ========================

if (!process.env.BOT_TOKEN) {
    console.log("❌ BOT_TOKEN missing");
    process.exit(1);
}

if (!process.env.RAPID_API_KEY) {
    console.log("❌ RAPID_API_KEY missing");
    process.exit(1);
}

const TOKEN = process.env.BOT_TOKEN;
const RAPID_API_KEY = process.env.RAPID_API_KEY;

// ========================
// BOT
// ========================

const bot = new TelegramBot(TOKEN, {
    polling: true
});

// ========================
// EXPRESS
// ========================

const app = express();

app.get("/", (req, res) => {
    res.send("Amertak Telegram Bot Running!");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

// ========================
// API
// ========================

const API_URL =
"https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink";

// ========================
// USERS
// ========================

const USERS_FILE = "./data/users.json";

if (!fs.existsSync("./data")) {
    fs.mkdirSync("./data");
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(
        USERS_FILE,
        JSON.stringify([])
    );
}

function loadUsers() {

    return JSON.parse(
        fs.readFileSync(
            USERS_FILE,
            "utf8"
        )
    );
}

function saveUsers(users) {

    fs.writeFileSync(
        USERS_FILE,
        JSON.stringify(users, null, 2)
    );
}

function addUser(user) {

    const users = loadUsers();

    const exists = users.find(
        u => u.id === user.id
    );

    if (!exists) {

        users.push(user);

        saveUsers(users);
    }
}

// ========================
// FETCH API
// ========================

async function fetchMedia(url) {

    const response = await axios.post(
        API_URL,
        {
            url: url
        },
        {
            headers: {
                "Content-Type":
                "application/json",

                "X-RapidAPI-Key":
                RAPID_API_KEY,

                "X-RapidAPI-Host":
                "social-download-all-in-one.p.rapidapi.com"
            }
        }
    );

    return response.data;
}

// ========================
// START
// ========================

bot.onText(/\/start/, async (msg) => {

    const firstName =
    msg.from.first_name || "";

    const lastName =
    msg.from.last_name || "";

    const username =
    msg.from.username || "no_username";

    const name =
    `${firstName} ${lastName}`.trim();

    addUser({
        id: msg.from.id,
        name,
        username
    });

    const text = `
🌟 *សួរស្តី ${name}*

ស្វាគមន៍មកកាន់ *Amertak Downloader*

━━━━━━━━━━━━━━

📥 *Command សម្រាប់ប្រើ*

\`/video link\`
🎬 ទាញយកវីដេអូ

\`/mp3 link\`
🎵 ទាញយក MP3

\`/photo link\`
🖼 ទាញយករូបភាព

\`/help\`
📖 បង្ហាញវិធីប្រើប្រាស់

━━━━━━━━━━━━━━

👑 *Owner*
@Amertak_Network
`;

    await bot.sendMessage(
        msg.chat.id,
        text,
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [

                    [
                        {
                            text:
                            "💚 Donate ខ្ញុំ",
                            callback_data:
                            "donate_qr"
                        }
                    ],

                    [
                        {
                            text:
                            "💙 More tools",
                            url:
                            "https://tools-amertak.vercel.app"
                        }
                    ]
                ]
            }
        }
    );
});

// ========================
// HELP
// ========================

bot.onText(/\/help/, async (msg) => {

    const text = `
📌 *របៀបប្រើប្រាស់*

━━━━━━━━━━━━━━

🎬 *Video*

\`/video https://tiktok.com/xxxx\`

━━━━━━━━━━━━━━

🎵 *MP3*

\`/mp3 https://youtube.com/xxxx\`

━━━━━━━━━━━━━━

🖼 *Photo*

\`/photo https://instagram.com/xxxx\`

━━━━━━━━━━━━━━

⚠️ សូមដាក់ Link ឲ្យត្រឹមត្រូវ
`;

    await bot.sendMessage(
        msg.chat.id,
        text,
        {
            parse_mode: "Markdown"
        }
    );
});

// ========================
// DONATE BUTTON
// ========================

bot.on(
    "callback_query",
    async (query) => {

    const chatId =
    query.message.chat.id;

    if (query.data === "donate_qr") {

        try {

            await bot.answerCallbackQuery(
                query.id
            );

            const firstName =
            query.from.first_name || "";

            const lastName =
            query.from.last_name || "";

            const name =
            `${firstName} ${lastName}`.trim();

            await bot.sendMessage(
                chatId,
                `🎁 ${name} ចាំបន្តិចមិនណា...`
            );

            const qrPath =
            "./image/gr.png";

            if (
                !fs.existsSync(qrPath)
            ) {

                return bot.sendMessage(
                    chatId,
                    "❌ QR Code not found"
                );
            }

            await bot.sendPhoto(
                chatId,
                fs.createReadStream(qrPath),
                {
                    caption:
                    "💚 អរគុណសម្រាប់ការឧបត្ថម្ភ"
                }
            );

        } catch (err) {

            console.log(err);

            await bot.sendMessage(
                chatId,
                "❌ មិនអាចផ្ញើ QR បានទេ"
            );
        }
    }
});

// ========================
// VIDEO
// ========================

bot.onText(
/\/video (.+)/,
async (msg, match) => {

    const chatId =
    msg.chat.id;

    const url =
    match[1];

    const name =
    `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();

    try {

        await bot.sendMessage(
            chatId,
            "⏳ កំពុងស្វែងរកវីដេអូ..."
        );

        const data =
        await fetchMedia(url);

        if (
            !data ||
            !data.medias ||
            data.medias.length === 0
        ) {

            return bot.sendMessage(
                chatId,
                `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
            );
        }

        const media =
        data.medias.find(
            m =>
            m.type &&
            m.type.toLowerCase()
            .includes("video")
        ) || data.medias[0];

        const caption = `
🎬 ${data.title || "Video"}

👤 ${data.author || "Unknown"}
`;

        await bot.sendPhoto(
            chatId,
            data.thumbnail ||
            media.thumbnail ||
            media.url,
            {
                caption,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text:
                                "⬇️ Download Video",
                                url:
                                media.url
                            }
                        ]
                    ]
                }
            }
        );

    } catch (err) {

        console.log(err.response?.data || err.message);

        await bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
        );
    }
});

// ========================
// MP3
// ========================

bot.onText(
/\/mp3 (.+)/,
async (msg, match) => {

    const chatId =
    msg.chat.id;

    const url =
    match[1];

    const name =
    `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();

    try {

        await bot.sendMessage(
            chatId,
            "⏳ កំពុងស្វែងរក MP3..."
        );

        const data =
        await fetchMedia(url);

        if (
            !data ||
            !data.medias ||
            data.medias.length === 0
        ) {

            return bot.sendMessage(
                chatId,
                `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
            );
        }

        const media =
        data.medias.find(
            m =>
            m.extension === "mp3" ||
            (
                m.type &&
                m.type.toLowerCase()
                .includes("audio")
            )
        );

        if (!media) {

            return bot.sendMessage(
                chatId,
                "❌ មិនមាន MP3 សម្រាប់លីងនេះទេ"
            );
        }

        await bot.sendMessage(
            chatId,
            `🎵 ${data.title || "MP3"}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text:
                                "⬇️ Download MP3",
                                url:
                                media.url
                            }
                        ]
                    ]
                }
            }
        );

    } catch (err) {

        console.log(err.response?.data || err.message);

        await bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
        );
    }
});

// ========================
// PHOTO
// ========================

bot.onText(
/\/photo (.+)/,
async (msg, match) => {

    const chatId =
    msg.chat.id;

    const url =
    match[1];

    const name =
    `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();

    try {

        await bot.sendMessage(
            chatId,
            "⏳ កំពុងស្វែងរករូបភាព..."
        );

        const data =
        await fetchMedia(url);

        if (
            !data ||
            !data.medias ||
            data.medias.length === 0
        ) {

            return bot.sendMessage(
                chatId,
                `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
            );
        }

        const media =
        data.medias.find(
            m =>
            (
                m.type &&
                (
                    m.type.toLowerCase()
                    .includes("image") ||

                    m.type.toLowerCase()
                    .includes("photo")
                )
            )
        ) || data.medias[0];

        await bot.sendPhoto(
            chatId,
            media.url,
            {
                caption:
                `🖼 ${data.title || "Photo"}`,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text:
                                "⬇️ Download Photo",
                                url:
                                media.url
                            }
                        ]
                    ]
                }
            }
        );

    } catch (err) {

        console.log(err.response?.data || err.message);

        await bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
        );
    }
});

// ========================
// LIST OWNER ONLY
// ========================

bot.onText(/\/list/, async (msg) => {

    const username =
    msg.from.username || "";

    if (
        username !==
        "Amertak_Network"
    ) {

        return bot.sendMessage(
            msg.chat.id,
            "❌ Owner only"
        );
    }

    const users = loadUsers();

    let text =
`📊 Monthly User: ${users.length}\n\n`;

    users.forEach(
    (user, index) => {

        text +=
`${index + 1}. ${user.name} [@${user.username}]\n`;
    });

    await bot.sendMessage(
        msg.chat.id,
        text
    );
});

console.log("✅ Telegram Bot Started");