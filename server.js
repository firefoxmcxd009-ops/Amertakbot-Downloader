process.on("uncaughtException", (err) => {

    console.log("UNCAUGHT EXCEPTION:");
    console.log(err);

});

process.on("unhandledRejection", (err) => {

    console.log("UNHANDLED REJECTION:");
    console.log(err);

});



const TelegramBot =
require("node-telegram-bot-api");

const express =
require("express");

const fs =
require("fs");

const path =
require("path");

const ytdlp =
require("yt-dlp-exec");



// ========================
// CHECK ENV
// ========================

if (!process.env.BOT_TOKEN) {

    console.error(
        "❌ BOT_TOKEN not found!"
    );

    process.exit(1);

}

if (!process.env.OWNER_ID) {

    console.error(
        "❌ OWNER_ID not found!"
    );

    process.exit(1);

}



const TOKEN =
process.env.BOT_TOKEN;

const OWNER_ID =
String(process.env.OWNER_ID);



// ========================
// CREATE BOT
// ========================

const bot =
new TelegramBot(TOKEN, {

    polling: {

        autoStart: true,

        interval: 300,

        params: {

            timeout: 10

        }

    }

});



// REMOVE OLD WEBHOOK
bot.deleteWebHook()
.catch(console.log);



console.log(
    "✅ Telegram Bot Started"
);



// ========================
// EXPRESS SERVER
// ========================

const app = express();

app.get("/", (req, res) => {

    res.send(
        "Amertak Telegram Bot Running!"
    );

});

const PORT =
process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        "✅ Server running on port " + PORT
    );

});



// ========================
// CREATE DATA FOLDER
// ========================

const dataFolder =
"./data";

if (!fs.existsSync(dataFolder)) {

    fs.mkdirSync(dataFolder);

}



// ========================
// DATABASE FILES
// ========================

const USERS_FILE =
path.join(
    dataFolder,
    "users.json"
);

const UPDATE_FILE =
path.join(
    dataFolder,
    "update.json"
);



// ========================
// CREATE FILES
// ========================

if (!fs.existsSync(USERS_FILE)) {

    fs.writeFileSync(
        USERS_FILE,
        "[]"
    );

}

if (!fs.existsSync(UPDATE_FILE)) {

    fs.writeFileSync(

        UPDATE_FILE,

        JSON.stringify({

            updating: false

        })

    );

}



// ========================
// GET USERS
// ========================

function getUsers() {

    try {

        return JSON.parse(

            fs.readFileSync(
                USERS_FILE
            )

        );

    }

    catch {

        return [];

    }

}



// ========================
// SAVE USER
// ========================

function saveUser(id) {

    try {

        id = String(id);

        let users =
        getUsers();

        if (!users.includes(id)) {

            users.push(id);

            fs.writeFileSync(

                USERS_FILE,

                JSON.stringify(
                    users,
                    null,
                    2
                )

            );

            console.log(
                "✅ New User:",
                id
            );

        }

    }

    catch (err) {

        console.log(err);

    }

}



// ========================
// AUTO SAVE USERS
// ========================

bot.on("message", (msg) => {

    if (msg.chat?.id) {

        saveUser(msg.chat.id);

    }

});



// ========================
// UPDATE MODE
// ========================

function isUpdating() {

    try {

        const data =
        JSON.parse(

            fs.readFileSync(
                UPDATE_FILE
            )

        );

        return data.updating;

    }

    catch {

        return false;

    }

}



function setUpdating(value) {

    fs.writeFileSync(

        UPDATE_FILE,

        JSON.stringify({

            updating: value

        })

    );

}



// ========================
// BROADCAST
// ========================

async function broadcast(text) {

    const users =
    getUsers();

    for (const id of users) {

        try {

            await bot.sendMessage(
                id,
                text
            );

        }

        catch {

            console.log(
                "Broadcast failed:",
                id
            );

        }

    }

}



// ========================
// CHECK UPDATE MODE
// ========================

async function checkUpdate(chatId) {

    if (isUpdating()) {

        await bot.sendMessage(

            chatId,

`⚠️ Bot កំពុង Update

សូមរង់ចាំបន្តិច ❤️`

        );

        return true;

    }

    return false;

}



// ========================
// START
// ========================

bot.onText(/\/start/, async (msg) => {

    const chatId =
    msg.chat.id;

    const firstName =
    msg.from.first_name || "";

    const lastName =
    msg.from.last_name || "";

    const name =
    `${firstName} ${lastName}`.trim();

    const text =

`សួរស្តី ${name}

ស្វាគមន៍មកកាន់
Amertak Downloader ❤️

Commands:

/video LINK
/mp3 LINK
/photo LINK
/help`;

    await bot.sendMessage(

        chatId,

        text,

        {

            reply_markup: {

                inline_keyboard: [

                    [

                        {

                            text:
                            "🎁 Donate",

                            callback_data:
                            "donate_qr"

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

    await bot.sendMessage(

        msg.chat.id,

`📌 Commands

/video LINK
/mp3 LINK
/photo LINK`

    );

});



// ========================
// OWNER UPDATE
// ========================

bot.onText(/\/update/, async (msg) => {

    const chatId =
    String(msg.chat.id);

    if (chatId !== OWNER_ID) {

        return bot.sendMessage(

            msg.chat.id,

            "❌ Owner only"

        );

    }

    setUpdating(true);

    await broadcast(

`⚠️ Bot កំពុង Update

សូមរង់ចាំ ❤️`

    );

    await bot.sendMessage(

        msg.chat.id,

        "✅ Update mode ON"

    );

});



// ========================
// OWNER UPDATED
// ========================

bot.onText(/\/updated/, async (msg) => {

    const chatId =
    String(msg.chat.id);

    if (chatId !== OWNER_ID) {

        return bot.sendMessage(

            msg.chat.id,

            "❌ Owner only"

        );

    }

    setUpdating(false);

    await broadcast(

`✅ Bot បាន Update រួចរាល់ ❤️`

    );

    await bot.sendMessage(

        msg.chat.id,

        "✅ Update mode OFF"

    );

});



// ========================
// USER LIST
// ========================

bot.onText(/\/list/, async (msg) => {

    const chatId =
    String(msg.chat.id);

    if (chatId !== OWNER_ID) {

        return bot.sendMessage(

            msg.chat.id,

            "❌ Owner only"

        );

    }

    const users =
    getUsers();

    await bot.sendMessage(

        msg.chat.id,

        `👥 Total Users: ${users.length}`

    );

});



// ========================
// DOWNLOAD FUNCTION
// ========================

async function downloadMedia(

    chatId,
    link,
    type

) {

    try {

        if (
            await checkUpdate(chatId)
        ) return;



        let file = "";



        if (type === "video") {

            file =
            `video_${Date.now()}.mp4`;

            await bot.sendMessage(

                chatId,

                "⏳ Downloading video..."

            );



            await ytdlp(link, {

                output: file,

                format: "mp4"

            });



            await bot.sendVideo(

                chatId,

                fs.createReadStream(file)

            );

        }



        if (type === "mp3") {

            file =
            `audio_${Date.now()}.mp3`;

            await bot.sendMessage(

                chatId,

                "⏳ Downloading mp3..."

            );



            await ytdlp(link, {

                extractAudio: true,

                audioFormat: "mp3",

                output: file

            });



            await bot.sendAudio(

                chatId,

                fs.createReadStream(file)

            );

        }



        if (type === "photo") {

            file =
            `photo_${Date.now()}.jpg`;

            await bot.sendMessage(

                chatId,

                "⏳ Downloading photo..."

            );



            await ytdlp(link, {

                output: file

            });



            await bot.sendPhoto(

                chatId,

                fs.createReadStream(file)

            );

        }



        if (
            fs.existsSync(file)
        ) {

            fs.unlinkSync(file);

        }

    }

    catch (err) {

        console.log(err);

        await bot.sendMessage(

            chatId,

            "❌ Download failed"

        );

    }

}



// ========================
// VIDEO
// ========================

bot.onText(

/\/video (.+)/,

async (msg, match) => {

    downloadMedia(

        msg.chat.id,

        match[1],

        "video"

    );

});



// ========================
// MP3
// ========================

bot.onText(

/\/mp3 (.+)/,

async (msg, match) => {

    downloadMedia(

        msg.chat.id,

        match[1],

        "mp3"

    );

});



// ========================
// PHOTO
// ========================

bot.onText(

/\/photo (.+)/,

async (msg, match) => {

    downloadMedia(

        msg.chat.id,

        match[1],

        "photo"

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

    if (
        query.data === "donate_qr"
    ) {

        try {

            await bot.answerCallbackQuery(
                query.id
            );

            const qrPath =
            "./image/qrcode.png";

            if (
                !fs.existsSync(qrPath)
            ) {

                return bot.sendMessage(

                    chatId,

                    "❌ QR not found"

                );

            }

            await bot.sendPhoto(

                chatId,

                fs.createReadStream(qrPath),

                {

                    caption:
                    "🎉 អរគុណសម្រាប់ការឧបត្ថម្ភ ❤️"

                }

            );

        }

        catch (err) {

            console.log(err);

            await bot.sendMessage(

                chatId,

                "❌ Failed to send QR"

            );

        }

    }

});