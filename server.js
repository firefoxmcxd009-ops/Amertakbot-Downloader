require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

// ======================
// BOT TOKEN FROM .env ONLY
// ======================
const BOT_TOKEN = process.env.BOT_TOKEN;

// ======================
// CHECK TOKEN
// ======================
if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN missing in .env");
    process.exit(1);
}

// ======================
// RAPIDAPI KEY (HARDCODED AS REQUESTED)
// ======================
const API_KEY =
    "67b70b3ec3mshf2ea79c89077f81p1e76a9jsn19b5d6afc545";

// ======================
// API URL
// ======================
const API_URL =
    "https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink";

// ======================
// INIT BOT
// ======================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ======================
// START COMMAND
// ======================
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        "📥 Send any video URL\n(TikTok / Instagram / Facebook)\n\n⚡ I will return download links"
    );
});

// ======================
// MAIN HANDLER
// ======================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!text || text.startsWith("/")) return;
    
    const videoUrl = text.trim();
    
    bot.sendMessage(chatId, "⏳ Processing...");
    
    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-RapidAPI-Host": "social-download-all-in-one.p.rapidapi.com",
                "X-RapidAPI-Key": API_KEY,
            },
            body: JSON.stringify({ url: videoUrl }),
        });
        
        if (!res.ok) {
            throw new Error("API request failed: " + res.status);
        }
        
        const data = await res.json();
        
        if (!data || data.error) {
            throw new Error(data.message || "Invalid URL");
        }
        
        let caption =
            `🎬 ${data.title || "Untitled"}\n` +
            `👤 ${data.author || "Unknown"}\n\n` +
            `📥 Download Links:\n\n`;
        
        if (data.medias && data.medias.length) {
            data.medias.forEach((m, i) => {
                caption +=
                    `${i + 1}. ${m.type?.toUpperCase()} | ${m.extension?.toUpperCase()}\n` +
                    `🔗 ${m.url}\n\n`;
            });
        } else {
            caption += "❌ No download links found";
        }
        
        if (data.thumbnail) {
            await bot.sendPhoto(chatId, data.thumbnail, {
                caption,
            });
        } else {
            await bot.sendMessage(chatId, caption);
        }
    } catch (err) {
        bot.sendMessage(chatId, "❌ Error: " + err.message);
    }
});