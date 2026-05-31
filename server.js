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
// TELEGRAM BOT
// ========================

const bot = new TelegramBot(TOKEN, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

// ========================
// EXPRESS SERVER
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
// API CONFIG
// ========================

const API_URL =
"https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink";

// ========================
// USER DATABASE
// ========================

const USERS_FILE = "./data/users.json";

function loadUsers() {

    if (!fs.existsSync("./data")) {
        fs.mkdirSync("./data");
    }

    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(
            USERS_FILE,
            JSON.stringify([])
        );
    }

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
// FETCH MEDIA
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
// FORMAT FILE SIZE
// ========================

function formatFileSize(bytes) {

    if (!bytes || bytes === 0) {
        return "Unknown";
    }

    const k = 1024;

    const sizes = [
        "Bytes",
        "KB",
        "MB",
        "GB"
    ];

    const i = Math.floor(
        Math.log(bytes) / Math.log(k)
    );

    return parseFloat(
        (bytes / Math.pow(k, i)).toFixed(2)
    ) + " " + sizes[i];
}

// ========================
// FORMAT QUALITY
// ========================

function formatQuality(quality) {

    if (!quality) return "Unknown";

    return quality
        .split("_")
        .map(word =>
            word.charAt(0).toUpperCase() +
            word.slice(1)
        )
        .join(" ");
}

// ========================
// START COMMAND
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

    // SAVE USER
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

/video (link)
🎬 ទាញយកវីដេអូ

/mp3 (link)
🎵 ទាញយក MP3

/photo (link)
🖼 ទាញយករូបភាព

/help
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
// HELP COMMAND
// ========================

bot.onText(/\/help/, async (msg) => {

    const text = `
📌 *របៀបប្រើប្រាស់*

━━━━━━━━━━━━━━

🎬 *ទាញយកវីដេអូ*

\`/video https://tiktok.com/xxxx\`

━━━━━━━━━━━━━━

🎵 *ទាញយក MP3*

\`/mp3 https://youtube.com/xxxx\`

━━━━━━━━━━━━━━

🖼 *ទាញយករូបភាព*

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

    const firstName =
    query.from.first_name || "";

    const lastName =
    query.from.last_name || "";

    const name =
    `${firstName} ${lastName}`.trim();

    if (query.data === "donate_qr") {

        try {

            await bot.answerCallbackQuery(
                query.id
            );

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
// VIDEO COMMAND
// ========================

bot.onText(
/\/video (.+)/,
async (msg, match) => {

    const chatId =
    msg.chat.id;

    const url =
    match[1];

    const firstName =
    msg.from.first_name || "";

    const lastName =
    msg.from.last_name || "";

    const name =
    `${firstName} ${lastName}`.trim();

    try {

        await bot.sendMessage(
            chatId,
            "⏳ កំពុងស្វែងរកវីដេអូ..."
        );

        const data =
        await fetchMedia(url);

        if (
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
            m => m.type === "video"
        ) || data.medias[0];

        let caption = `
🎬 ${data.title || "Untitled"}

👤 ${data.author || "Unknown"}

📦 ${formatFileSize(media.data_size)}

🎞 ${formatQuality(media.quality)}
`;

        if (data.thumbnail) {

            await bot.sendPhoto(
                chatId,
                data.thumbnail,
                {
                    caption
                }
            );
        }

        await bot.sendVideo(
            chatId,
            media.url
        );

    } catch (err) {

        console.log(err.response?.data || err);

        await bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
        );
    }
});

// ========================
// MP3 COMMAND
// ========================

bot.onText(
/\/mp3 (.+)/,
async (msg, match) => {

    const chatId =
    msg.chat.id;

    const url =
    match[1];

    const firstName =
    msg.from.first_name || "";

    const lastName =
    msg.from.last_name || "";

    const name =
    `${firstName} ${lastName}`.trim();

    try {

        await bot.sendMessage(
            chatId,
            "⏳ កំពុងស្វែងរក MP3..."
        );

        const data =
        await fetchMedia(url);

        if (
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
            m.type === "audio"
        );

        if (!media) {

            return bot.sendMessage(
                chatId,
                "❌ មិនមាន MP3 សម្រាប់លីងនេះទេ"
            );
        }

        await bot.sendAudio(
            chatId,
            media.url,
            {
                caption:
                `🎵 ${data.title || "Unknown"}`
            }
        );

    } catch (err) {

        console.log(err.response?.data || err);

        await bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
        );
    }
});

// ========================
// PHOTO COMMAND
// ========================

bot.onText(
/\/photo (.+)/,
async (msg, match) => {

    const chatId =
    msg.chat.id;

    const url =
    match[1];

    const firstName =
    msg.from.first_name || "";

    const lastName =
    msg.from.last_name || "";

    const name =
    `${firstName} ${lastName}`.trim();

    try {

        await bot.sendMessage(
            chatId,
            "⏳ កំពុងស្វែងរករូបភាព..."
        );

        const data =
        await fetchMedia(url);

        if (
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
            m.type === "photo" ||
            m.type === "image"
        ) || data.medias[0];

        await bot.sendPhoto(
            chatId,
            media.url,
            {
                caption:
                `🖼 ${data.title || "Photo"}`
            }
        );

    } catch (err) {

        console.log(err.response?.data || err);

        await bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
        );
    }
});

// ========================
// OWNER LIST
// ========================

bot.onText(/\/list/, async (msg) => {

    const username =
    msg.from.username || "";

    // OWNER ONLY
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