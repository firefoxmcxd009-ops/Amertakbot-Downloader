require("dotenv").config();

process.on("uncaughtException", (err) => {
    console.error("uncaughtException:", err.message || err);
});

process.on("unhandledRejection", (err) => {
    console.error("unhandledRejection:", err?.message || err);
});

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
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("Bot running...");

// ========================
// EXPRESS
// ========================
const app = express();
app.get("/", (_, res) => res.send("Bot Running"));
app.listen(process.env.PORT || 3000);

// ========================
// UI BUILD (CARD STYLE)
// ========================
function buildUI(data) {
    return `
━━━━━━━━━━━━━━━━━━━━
🎬 VIDEO DOWNLOADER
━━━━━━━━━━━━━━━━━━━━

📌 Title: ${data.title || "Untitled"}
👤 Author: ${data.author || "Unknown"}

━━━━━━━━━━━━━━━━━━━━
📥 DOWNLOAD READY
━━━━━━━━━━━━━━━━━━━━`;
}

// ========================
// LOADER
// ========================
function showLoader(chatId) {
    return bot.sendMessage(chatId, "⏳ Processing...");
}

// ========================
// ERROR MESSAGE (CUSTOM REQUEST)
// ========================
function showError(chatId) {
    return bot.sendMessage(chatId, "❌ Can't fetch URL");
}

// ========================
// FETCH API
// ========================
async function fetchVideo(chatId, url) {
    let loading;

    try {
        loading = await showLoader(chatId);

        const res = await axios.post(
            API_URL,
            { url },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-RapidAPI-Host":
                        "social-download-all-in-one.p.rapidapi.com",
                    "X-RapidAPI-Key": API_KEY,
                },
            }
        );

        const data = res.data;

        if (!data || data.error) {
            throw new Error("API error");
        }

        if (loading) {
            bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        }

        await sendResult(chatId, data);

    } catch (err) {
        if (loading) {
            bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        }

        showError(chatId);
    }
}

// ========================
// ALWAYS BLUE STYLE BUTTON PANEL
// ========================
function getButtons(data) {
    const buttons = [];

    // ALWAYS SHOW MAIN BUTTONS
    buttons.push([
        {
            text: "🔵 Tools (WebApp)",
            web_app: {
                url: "https://tools-amertak.vercel.app"
            }
        }
    ]);

    buttons.push([
        {
            text: "📥 Download Page",
            url: "https://tools-amertak.vercel.app"
        }
    ]);

    // MEDIA BUTTONS
    if (data?.medias?.length) {
        data.medias.forEach((m, i) => {
            buttons.push([
                {
                    text: `⬇ Download ${i + 1}`,
                    url: m.url
                }
            ]);
        });
    }

    return {
        inline_keyboard: buttons
    };
}

// ========================
// RESULT MESSAGE (ALWAYS BUTTONS)
// ========================
async function sendResult(chatId, data) {
    if (data.thumbnail) {
        await bot.sendPhoto(chatId, data.thumbnail);
    }

    await bot.sendMessage(chatId, buildUI(data));

    await bot.sendMessage(chatId, "👇 Choose option below", {
        reply_markup: getButtons(data)
    });
}

// ========================
// START MESSAGE (WELCOME + BUTTONS ALWAYS)
// ========================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    const welcome =
`━━━━━━━━━━━━━━━━━━━━
🎬 AMERTAK DOWNLOADER
━━━━━━━━━━━━━━━━━━━━

👋 Welcome!

Send any video link:
YouTube / TikTok / Facebook / Instagram

━━━━━━━━━━━━━━━━━━━━
⚡ FEATURES
━━━━━━━━━━━━━━━━━━━━
• Fast download
• HD quality
• Multiple formats
• Web Tools UI

━━━━━━━━━━━━━━━━━━━━`;

    await bot.sendMessage(chatId, welcome, {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "🔵 Tools for Download",
                        web_app: {
                            url: "https://tools-amertak.vercel.app"
                        }
                    }
                ],
                [
                    {
                        text: "📥 Open Tools",
                        url: "https://tools-amertak.vercel.app"
                    }
                ]
            ]
        }
    });
});

// ========================
// INPUT HANDLER
// ========================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    await fetchVideo(chatId, text.trim());
});