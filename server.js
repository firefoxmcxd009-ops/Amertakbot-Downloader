const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs");
const path = require("path");
const ytdlp = require("yt-dlp-exec");

const TOKEN = process.env.BOT_TOKEN;

const bot = new TelegramBot(TOKEN, {
    polling: true
});

const app = express();

app.get("/", (req, res) => {
    res.send("Amertak Telegram Bot Running!");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

// ========================
// START COMMAND
// ========================

bot.onText(/\/start/, (msg) => {

    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";

    const name = `${firstName} ${lastName}`.trim();

    const text = `
សួរស្តី ${name} មកកាន់ Amertak Downloader!
នេះជា command សម្រាប់ប្រើ÷

/video (YourLink) - ទាញយកវីដេអូ

/mp3 (yourLink) - ទាញយកចម្រៀង mp3

/photo (YourLink) - ទាញយករូបភាព

/help - បង្ហាញវិធីប្រើប្រាស់

• បង្កើតដោយ: @Amertak_Network
`;

    bot.sendMessage(msg.chat.id, text);
});

// ========================
// HELP COMMAND
// ========================

bot.onText(/\/help/, (msg) => {

    const text = `
📌 របៀបប្រើប្រាស់

🎬 ទាញយកវីដេអូ
/video https://TikTok.com/example

🎵 ទាញយក MP3
/mp3 https://youtube.com/example

🖼 ទាញយករូបភាព
/photo https://instagram.com/example

⚠️ សូមដាក់ Link ឲ្យត្រឹមត្រូវ
`;

    bot.sendMessage(msg.chat.id, text);
});

// ========================
// VIDEO DOWNLOAD
// ========================

bot.onText(/\/video (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const link = match[1];
    const name = msg.from.first_name;

    try {

        bot.sendMessage(chatId, "⏳ កំពុងទាញយកវីដេអូ...");

        const file = `video_${Date.now()}.mp4`;

        await ytdlp(link, {
            output: file,
            format: "mp4"
        });

        await bot.sendVideo(chatId, file);

        fs.unlinkSync(file);

    } catch (err) {

        console.log(err);

        bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
        );
    }
});

// ========================
// MP3 DOWNLOAD
// ========================

bot.onText(/\/mp3 (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const link = match[1];
    const name = msg.from.first_name;

    try {

        bot.sendMessage(chatId, "⏳ កំពុងទាញយក MP3...");

        const file = `audio_${Date.now()}.mp3`;

        await ytdlp(link, {
            extractAudio: true,
            audioFormat: "mp3",
            output: file
        });

        await bot.sendAudio(chatId, file);

        fs.unlinkSync(file);

    } catch (err) {

        console.log(err);

        bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
        );
    }
});

// ========================
// PHOTO DOWNLOAD
// ========================

bot.onText(/\/photo (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const link = match[1];
    const name = msg.from.first_name;

    try {

        bot.sendMessage(chatId, "⏳ កំពុងទាញយករូបភាព...");

        const file = `photo_${Date.now()}.jpg`;

        await ytdlp(link, {
            output: file
        });

        await bot.sendPhoto(chatId, file);

        fs.unlinkSync(file);

    } catch (err) {

        console.log(err);

        bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ ;(`
        );
    }
});