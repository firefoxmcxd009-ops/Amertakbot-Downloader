require("dotenv").config();

// ========================
// CRASH GUARDS
// ========================
process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

// ========================
// MODULES
// ========================
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");

// ========================
// ENV
// ========================
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error("BOT_TOKEN missing");
    process.exit(1);
}

// ========================
// API
// ========================
const API_URL =
    "https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink";

const API_KEY =
    "67b70b3ec3mshf2ea79c89077f81p1e76a9jsn19b5d6afc545";

// ========================
// BOT
// ========================
const bot = new TelegramBot(TOKEN, { polling: true });
console.log("Bot running");

// ========================
// EXPRESS
// ========================
const app = express();
app.get("/", (_, res) => res.send("Bot Running"));
app.listen(process.env.PORT || 3000);

// ========================
// STORAGE
// ========================
const userData = {};
const history = {};

// ========================
// HELPERS
// ========================
function saveHistory(chatId, item) {
    if (!history[chatId]) history[chatId] = [];
    history[chatId].unshift(item);
    history[chatId] = history[chatId].slice(0, 10);
}

function findMedia(data, type) {
    if (!data?.medias) return null;

    if (type === "video")
        return data.medias.find(m => m.type === "video");

    if (type === "image")
        return data.medias.find(m =>
            m.type === "image" ||
            m.extension === "jpg" ||
            m.extension === "png"
        );

    if (type === "mp3")
        return data.medias.find(m => m.type === "audio");

    return null;
}

// ========================
// UI
// ========================
function mainMenu() {
    return {
        reply_markup: {
            keyboard: [
                [
                    { text: "🎬 Video" },
                    { text: "🖼 Image" },
                    { text: "🎵 MP3" }
                ],
                [
                    { text: "🏠 Home" },
                    { text: "📂 History" }
                ]
            ],
            resize_keyboard: true
        }
    };
}

// ========================
// FETCH API
// ========================
async function fetchData(url) {
    const res = await axios.post(
        API_URL,
        { url },
        {
            headers: {
                "Content-Type": "application/json",
                "X-RapidAPI-Key": API_KEY,
                "X-RapidAPI-Host":
                    "social-download-all-in-one.p.rapidapi.com"
            }
        }
    );
    return res.data;
}

// ========================
// START LOGIC (REUSABLE)
// ========================
async function startUI(chatId, name = "User") {
    return bot.sendMessage(
        chatId,
        `👋 សួស្តី ${name}\n\nផ្ញើ Link ដើម្បីទាញយក`,
        mainMenu()
    );
}

// ========================
// START
// ========================
bot.onText(/\/start/, async (msg) => {
    await startUI(msg.chat.id, msg.from.first_name);
});

// ========================
// HISTORY
// ========================
bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id;

    const items = history[chatId] || [];

    if (!items.length) {
        return bot.sendMessage(chatId, "📭 No history");
    }

    let text = "📂 DOWNLOAD HISTORY\n\n";

    items.forEach((h, i) => {
        text += `${i + 1}. ${h.title}\n`;
    });

    bot.sendMessage(chatId, text);
});

// ========================
// MESSAGE HANDLER
// ========================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith("/")) return;

    // ========================
    // HOME BUTTON (CALL /start LOGIC ONLY)
    // ========================
    if (text === "🏠 Home") {
        return startUI(chatId, msg.from.first_name);
    }

    // ========================
    // HISTORY BUTTON
    // ========================
    if (text === "📂 History") {
        return bot.emit("text", { ...msg, text: "/history" });
    }

    // ========================
    // TOOLS → WEBAPP
    // ========================
    if (text === "🔵 Tools") {
        return bot.sendMessage(chatId, "Open Tools", {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🌐 Open Tools",
                            web_app: {
                                url: "https://tools-amertak.vercel.app"
                            }
                        }
                    ]
                ]
            }
        });
    }

    // ========================
    // VIDEO
    // ========================
    if (text === "🎬 Video" || text === "🖼 Image" || text === "🎵 MP3") {

        const data = userData[chatId];

        if (!data) {
            return bot.sendMessage(chatId, "Send URL first");
        }

        let type =
            text === "🎬 Video"
                ? "video"
                : text === "🖼 Image"
                ? "image"
                : "mp3";

        const media = findMedia(data, type);

        if (!media) {
            return bot.sendMessage(chatId, "❌ Can't fetch URL.");
        }

        saveHistory(chatId, {
            title: data.title,
            url: media.url
        });

        if (data.thumbnail) {
            await bot.sendPhoto(chatId, data.thumbnail, {
                caption: `🎉 រួចរាល់ហើយ\n\n📌 ${data.title}`
            });
        }

        return bot.sendMessage(chatId, "📥 ទាញយកខាងក្រោម", {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "📥 Download",
                            url: media.url
                        }
                    ]
                ]
            }
        });
    }

    // ========================
    // URL DETECT
    // ========================
    if (
        text.startsWith("http://") ||
        text.startsWith("https://")
    ) {
        try {
            const data = await fetchData(text);

            userData[chatId] = data;

            if (data.thumbnail) {
                await bot.sendPhoto(chatId, data.thumbnail);
            }

            return bot.sendMessage(
                chatId,
                "📂 ជ្រើសរើសប្រភេទ file",
                {
                    reply_markup: {
                        keyboard: [
                            [
                                { text: "🎬 Video" },
                                { text: "🖼 Image" },
                                { text: "🎵 MP3" }
                            ],
                            [
                                { text: "🏠 Home" },
                                { text: "📂 History" }
                            ]
                        ],
                        resize_keyboard: true
                    }
                }
            );
        } catch (e) {
            return bot.sendMessage(
                chatId,
                "❌ Can't fetch URL."
            );
        }
    }
});