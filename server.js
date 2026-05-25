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
const fs = require("fs");
const ytdlp = require("yt-dlp-exec");

// ========================
// CHECK TOKEN
// ========================

if (!process.env.BOT_TOKEN) {
    console.error("❌ BOT_TOKEN not found!");
    process.exit(1);
}

const TOKEN = process.env.BOT_TOKEN;

// ========================
// CREATE BOT
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
    console.log("✅ Server running on port " + PORT);
});

// ========================
// START COMMAND
// ========================

bot.onText(/\/start/, async (msg) => {

    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";

    const name = `${firstName} ${lastName}`.trim();

    const text = `
សួរស្តី ${name} មកកាន់ Amertak Downloader!

នេះជា command សម្រាប់ប្រើ÷

/video (YourLink) - ទាញយកវីដេអូ

/mp3 (YourLink) - ទាញយកចម្រៀង mp3

/photo (YourLink) - ទាញយករូបភាព

/help - បង្ហាញវិធីប្រើប្រាស់

• បង្កើតដោយ: @Amertak_Network
`;

    await bot.sendMessage(chatId = msg.chat.id, text, {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "🎁 Donate ខ្ញុំ",
                        callback_data: "donate_qr"
                    }
                ]
            ]
        }
    });
});

// ========================
// HELP COMMAND
// ========================

bot.onText(/\/help/, async (msg) => {

    const text = `
📌 របៀបប្រើប្រាស់

🎬 ទាញយកវីដេអូ
/video https://tiktok.com/example

🎵 ទាញយក MP3
/mp3 https://youtube.com/example

🖼 ទាញយករូបភាព
/photo https://instagram.com/example

⚠️ សូមដាក់ Link ឲ្យត្រឹមត្រូវ
`;

    await bot.sendMessage(msg.chat.id, text);
});

// ========================
// DONATE BUTTON
// ========================

bot.on("callback_query", async (query) => {

    const chatId = query.message.chat.id;

    const firstName = query.from.first_name || "";
    const lastName = query.from.last_name || "";

    const name = `${firstName} ${lastName}`.trim();

    if (query.data === "donate_qr") {

        try {

            await bot.answerCallbackQuery(query.id);

            await bot.sendMessage(
                chatId,
                `🎁 ${name} ចាំបន្តិចសិនណា...`
            );

            const qrPath = "./image/qrcode.png";

            // CHECK FILE
            if (!fs.existsSync(qrPath)) {

                return bot.sendMessage(
                    chatId,
                    "❌ មិនអាចរកឃើញ QR Code បានទេ"
                );
            }

            // SEND QR
            await bot.sendPhoto(
                chatId,
                fs.createReadStream(qrPath),
                {
                    caption: "🎉 អរគុណសម្រាប់ការឧបត្ថម្ភ"
                }
            );

        } catch (err) {

            console.log(err);

            await bot.sendMessage(
                chatId,
                "❌ មិនអាចផ្ញើ QR Code បានទេ"
            );
        }
    }
});

// ========================
// VIDEO DOWNLOAD
// ========================

bot.onText(/\/video (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const link = match[1];

    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";

    const name = `${firstName} ${lastName}`.trim();

    try {

        await bot.sendMessage(
            chatId,
            "⏳ កំពុងទាញយកវីដេអូ..."
        );

        const file = `video_${Date.now()}.mp4`;

        await ytdlp(link, {
            output: file,
            format: "mp4"
        });

        await bot.sendVideo(
            chatId,
            fs.createReadStream(file)
        );

        // DELETE FILE
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }

    } catch (err) {

        console.log(err);

        await bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ 💔🥀`
        );
    }
});

// ========================
// MP3 DOWNLOAD
// ========================

bot.onText(/\/mp3 (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const link = match[1];

    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";

    const name = `${firstName} ${lastName}`.trim();

    try {

        await bot.sendMessage(
            chatId,
            "⏳ កំពុងទាញយក MP3..."
        );

        const file = `audio_${Date.now()}.mp3`;

        await ytdlp(link, {
            extractAudio: true,
            audioFormat: "mp3",
            output: file
        });

        await bot.sendAudio(
            chatId,
            fs.createReadStream(file)
        );

        // DELETE FILE
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }

    } catch (err) {

        console.log(err);

        await bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ 💔🥀`
        );
    }
});

// ========================
// PHOTO DOWNLOAD
// ========================

bot.onText(/\/photo (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const link = match[1];

    const firstName = msg.from.first_name || "";
    const lastName = msg.from.last_name || "";

    const name = `${firstName} ${lastName}`.trim();

    try {

        await bot.sendMessage(
            chatId,
            "⏳ កំពុងទាញយករូបភាព..."
        );

        const file = `photo_${Date.now()}.jpg`;

        await ytdlp(link, {
            output: file
        });

        await bot.sendPhoto(
            chatId,
            fs.createReadStream(file)
        );

        // DELETE FILE
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }

    } catch (err) {

        console.log(err);

        await bot.sendMessage(
            chatId,
            `Sorry ${name} រកមិនឃើញតំណលីងទេ 💔🥀`
        );
    }
});

console.log("✅ Telegram Bot Started");