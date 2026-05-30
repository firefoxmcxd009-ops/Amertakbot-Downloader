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

const OWNER_ID =
String(process.env.OWNER_ID);



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

// REMOVE OLD WEBHOOK
bot.deleteWebHook()
.catch(console.log);



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
// DATABASE FILES
// ========================

const USERS_FILE =
"./users.json";

const UPDATE_FILE =
"./update.json";



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

    return JSON.parse(

        fs.readFileSync(
            USERS_FILE
        )

    );

}



// ========================
// SAVE USER
// ========================

function saveUser(id) {

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

    }

}



// ========================
// UPDATE MODE
// ========================

function isUpdating() {

    const data =
    JSON.parse(

        fs.readFileSync(
            UPDATE_FILE
        )

    );

    return data.updating;

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

        catch (err) {

            console.log(
                "Broadcast error:",
                id
            );

        }

    }

}



// ========================
// BLOCK COMMANDS
// ========================

async function checkUpdate(chatId) {

    if (isUpdating()) {

        await bot.sendMessage(

            chatId,

`⚠️ Bot កំពុង update

សូមរង់ចាំបន្តិច ❤️`

        );

        return true;

    }

    return false;

}



// ========================
// START COMMAND
// ========================

bot.onText(/\/start/, async (msg) => {

    const chatId =
    msg.chat.id;

    saveUser(chatId);

    const firstName =
    msg.from.first_name || "";

    const lastName =
    msg.from.last_name || "";

    const name =
    `${firstName} ${lastName}`.trim();

    const text = `
សួរស្តី ${name} មកកាន់ Amertak Downloader!

🆔 Your Telegram ID:
${chatId}

នេះជា command សម្រាប់ប្រើ÷

/video (YourLink)

/mp3 (YourLink)

/photo (YourLink)

/help

• បង្កើតដោយ:
@Amertak_Network
`;

    await bot.sendMessage(

        msg.chat.id,

        text,

        {

            reply_markup: {

                inline_keyboard: [

                    [

                        {

                            text:
                            "🎁 Donate ខ្ញុំ",

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
// HELP COMMAND
// ========================

bot.onText(/\/help/, async (msg) => {

    const chatId =
    msg.chat.id;

    saveUser(chatId);

    const text = `
📌 របៀបប្រើប្រាស់

🎬 ទាញយកវីដេអូ
/video LINK

🎵 ទាញយក MP3
/mp3 LINK

🖼 ទាញយករូបភាព
/photo LINK
`;

    await bot.sendMessage(
        chatId,
        text
    );

});



// ========================
// OWNER UPDATE COMMAND
// ========================

bot.onText(/\/update/, async (msg) => {

    const chatId =
    String(msg.chat.id);

    if (chatId !== OWNER_ID) {

        return bot.sendMessage(

            msg.chat.id,

            "❌ Owner only command"

        );

    }

    setUpdating(true);

    await broadcast(

`⚠️ នៅពេលនេះ bot កំពុងធ្វើការ update ដូចនេះអ្នកនឹងមិនទាន់អាចប្រើប្រាស់បានទេ!

សូមអរគុណ ❤️`

    );

    await bot.sendMessage(

        msg.chat.id,

        "✅ Update mode enabled"

    );

});



// ========================
// OWNER UPDATED COMMAND
// ========================

bot.onText(/\/updated/, async (msg) => {

    const chatId =
    String(msg.chat.id);

    if (chatId !== OWNER_ID) {

        return bot.sendMessage(

            msg.chat.id,

            "❌ Owner only command"

        );

    }

    setUpdating(false);

    await broadcast(

`✅ Bot បាន update រួចរាល់!

ឥឡូវអ្នកអាចប្រើប្រាស់ bot បានវិញហើយ ❤️`

    );

    await bot.sendMessage(

        msg.chat.id,

        "✅ Update mode disabled"

    );

});



// ========================
// OWNER USER LIST
// ========================

bot.onText(/\/list/, async (msg) => {

    const chatId =
    String(msg.chat.id);

    if (chatId !== OWNER_ID) {

        return bot.sendMessage(

            msg.chat.id,

            "❌ Owner only command"

        );

    }

    try {

        const users =
        getUsers();

        if (users.length === 0) {

            return bot.sendMessage(

                msg.chat.id,

                "❌ No users found"

            );

        }

        let text =
`Total User: ${users.length}

`;

        for (const id of users) {

            try {

                const chat =
                await bot.getChat(id);

                const firstName =
                chat.first_name || "";

                const lastName =
                chat.last_name || "";

                const fullName =
                `${firstName} ${lastName}`.trim();

                const username =
                chat.username
                ?
                `@${chat.username}`
                :
                "none";

                text +=

`- (${fullName})[${username}] - id: ${id}

`;

            }

            catch (err) {

                text +=

`- (Unknown)[none] - id: ${id}

`;

            }

        }

        await bot.sendMessage(

            msg.chat.id,

            text

        );

    }

    catch (err) {

        console.log(err);

        await bot.sendMessage(

            msg.chat.id,

            "❌ Failed to get users"

        );

    }

});



// ========================
// VIDEO DOWNLOAD
// ========================

bot.onText(/\/video (.+)/,

async (msg, match) => {

    const chatId =
    msg.chat.id;

    saveUser(chatId);

    if (
        await checkUpdate(chatId)
    ) return;

    const link =
    match[1];

    try {

        await bot.sendMessage(

            chatId,

            "⏳ កំពុងទាញយកវីដេអូ..."

        );

        const file =
        `video_${Date.now()}.mp4`;

        await ytdlp(link, {

            output: file,

            format: "mp4"

        });

        await bot.sendVideo(

            chatId,

            fs.createReadStream(file)

        );

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

});



// ========================
// MP3 DOWNLOAD
// ========================

bot.onText(/\/mp3 (.+)/,

async (msg, match) => {

    const chatId =
    msg.chat.id;

    saveUser(chatId);

    if (
        await checkUpdate(chatId)
    ) return;

    const link =
    match[1];

    try {

        await bot.sendMessage(

            chatId,

            "⏳ កំពុងទាញយក MP3..."

        );

        const file =
        `audio_${Date.now()}.mp3`;

        await ytdlp(link, {

            extractAudio: true,

            audioFormat: "mp3",

            output: file

        });

        await bot.sendAudio(

            chatId,

            fs.createReadStream(file)

        );

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

});



// ========================
// PHOTO DOWNLOAD
// ========================

bot.onText(/\/photo (.+)/,

async (msg, match) => {

    const chatId =
    msg.chat.id;

    saveUser(chatId);

    if (
        await checkUpdate(chatId)
    ) return;

    const link =
    match[1];

    try {

        await bot.sendMessage(

            chatId,

            "⏳ កំពុងទាញយករូបភាព..."

        );

        const file =
        `photo_${Date.now()}.jpg`;

        await ytdlp(link, {

            output: file

        });

        await bot.sendPhoto(

            chatId,

            fs.createReadStream(file)

        );

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



console.log(
    "✅ Telegram Bot Started"
);