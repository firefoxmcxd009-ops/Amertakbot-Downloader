require("dotenv").config();

// ========================
// CRASH GUARDS
// ========================

process.on("uncaughtException", (err) => {
    console.error("uncaughtException:", err.message || err);
});

process.on("unhandledRejection", (err) => {
    console.error("unhandledRejection:", err?.message || err);
});

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const youtubedl = require("youtube-dl-exec");

// ========================
// ENV
// ========================

const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
    console.error("BOT_TOKEN missing");
    process.exit(1);
}

// ========================
// OWNER CONFIG
// ========================

const OWNER_ID = process.env.OWNER_ID
    ? parseInt(process.env.OWNER_ID)
    : null;

function isOwner(from) {
    if (!OWNER_ID) return false;
    return from?.id === OWNER_ID;
}

// ========================
// BOT
// ========================

let bot;
let isRestarting = false;

async function deleteWebhook() {
    try {
        const res = await axios.get(
            `https://api.telegram.org/bot${TOKEN}/deleteWebhook?drop_pending_updates=true`
        );
        console.log("Webhook deleted:", res.data.result);
    } catch (err) {
        console.warn("deleteWebhook failed:", err.message);
    }
}

async function createBot() {
    if (isRestarting) return;
    isRestarting = true;

    if (bot) {
        try { await bot.stopPolling(); } catch (_) {}
        bot = null;
    }

    await deleteWebhook();
    await new Promise((r) => setTimeout(r, 4000));

    bot = new TelegramBot(TOKEN, {
        polling: {
            interval: 500,
            autoStart: true,
            params: {
                timeout: 10,
                allowed_updates: ["message", "callback_query"]
            }
        }
    });

    bot.on("polling_error", (err) => {
        const code = err?.code || "";
        const msg = err?.message || "";

        if (code === "ETELEGRAM" && msg.includes("409")) {
            console.warn("Polling conflict 409. Restarting in 8s...");
            isRestarting = false;
            setTimeout(() => createBot(), 8000);
            return;
        }

        if (code === "EFATAL" || code === "EPARSE") {
            console.warn(`Polling error [${code}]. Restarting in 8s...`);
            isRestarting = false;
            setTimeout(() => createBot(), 8000);
            return;
        }

        console.error("polling_error:", msg);
    });

    bot.on("error", (err) => {
        console.error("bot error:", err?.message || err);
    });

    registerHandlers();
    isRestarting = false;
    console.log("Bot polling started");
}

// ========================
// EXPRESS
// ========================

const app = express();

app.get("/", (_, res) => {
    res.send("Amertak YouTube Bot Running!");
});

app.get("/health", (_, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// ========================
// USER DATABASE
// ========================

if (!fs.existsSync("./data")) fs.mkdirSync("./data");
if (!fs.existsSync("./image")) fs.mkdirSync("./image");

const USERS_FILE = "./data/users.json";

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch (_) { return []; }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error("saveUsers error:", err.message);
    }
}

function addUser(user) {
    const users = loadUsers();
    const exists = users.find((u) => u.id === user.id);
    if (!exists) {
        users.push(user);
        saveUsers(users);
    }
}

// ========================
// HELPERS
// ========================

function getName(from) {
    const first = from?.first_name || "";
    const last = from?.last_name || "";
    return `${first} ${last}`.trim();
}

function esc(text) {
    return String(text).replace(/([_*[\]()~`>#+=|{}.!\\-])/g, "\\$1");
}

function isYouTubeUrl(url) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

async function sendMarkdown(chatId, text, extra = {}) {
    try {
        return await bot.sendMessage(chatId, text, {
            parse_mode: "Markdown",
            ...extra
        });
    } catch (err) {
        console.error("sendMarkdown error:", err.message);
        try {
            return await bot.sendMessage(
                chatId,
                text.replace(/[*_`\\]/g, ""),
                extra
            );
        } catch (_) {}
    }
}

// ========================
// yt-dlp FETCH INFO
// ========================

async function getYouTubeInfo(url) {
    const info = await youtubedl(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        noCheckCertificate: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true
    });
    return info;
}

// Get best video+audio format direct URL
async function getVideoUrl(url) {
    const info = await youtubedl(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificate: true,
        format: "best[ext=mp4]/best"
    });

    // Find best mp4 format
    const fmt = info.formats
        ?.filter((f) => f.ext === "mp4" && f.url)
        ?.sort((a, b) => (b.height || 0) - (a.height || 0))[0];

    return {
        url: fmt?.url || info.url,
        title: info.title,
        thumbnail: info.thumbnail,
        uploader: info.uploader || info.channel,
        duration: info.duration_string || ""
    };
}

// Get best audio format direct URL
async function getAudioUrl(url) {
    const info = await youtubedl(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificate: true,
        format: "bestaudio[ext=m4a]/bestaudio/best"
    });

    const fmt = info.formats
        ?.filter((f) => (f.ext === "m4a" || f.ext === "webm") && f.url)
        ?.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

    return {
        url: fmt?.url || info.url,
        title: info.title,
        thumbnail: info.thumbnail,
        uploader: info.uploader || info.channel,
        duration: info.duration_string || ""
    };
}

// ========================
// REGISTER ALL HANDLERS
// ========================

function registerHandlers() {

    // ── START ──────────────────────────────────────────

    bot.onText(/^\/start$/, async (msg) => {
        const name = getName(msg.from);
        const username = msg.from?.username || "no_username";

        addUser({ id: msg.from.id, name, username });

        const text =
`\`\`\`
╔══════════════════════╗
   AMERTAK DOWNLOADER
   YouTube Only Bot
╚══════════════════════╝
\`\`\`
*សួរស្តី ${esc(name)}*

សូមជម្រាបជូនថា Bot នេះ
ដំណើរការបានតែចំពោះ
*YouTube* ប៉ុណ្ណោះ

Link ពី TikTok, Instagram
Facebook នឹងមិនដំណើរការទេ

────────────────────────

*COMMANDS*

\`/video\` link
ទាញយក Video MP4

\`/mp3\` link
ទាញយក Audio M4A

\`/help\`
វិធីប្រើប្រាស់

\`/id\`
មើល Telegram ID

────────────────────────

*Owner:* @Amertak\_Network`;

        await sendMarkdown(msg.chat.id, text, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Donate", callback_data: "donate_qr" },
                        { text: "More Tools", url: "https://tools-amertak.vercel.app" }
                    ]
                ]
            }
        });
    });

    // ── HELP ───────────────────────────────────────────

    bot.onText(/^\/help$/, async (msg) => {
        const text =
`\`\`\`
╔══════════════════════╗
      HOW TO USE
╚══════════════════════╝
\`\`\`
*របៀបប្រើប្រាស់*

────────────────────────

*Download Video MP4*

\`/video https://youtube.com/watch?v=xxxx\`

\`/video https://youtu.be/xxxx\`

────────────────────────

*Download Audio M4A*

\`/mp3 https://youtube.com/watch?v=xxxx\`

\`/mp3 https://youtu.be/xxxx\`

────────────────────────
\`\`\`
NOTE: YouTube Links Only
TikTok / IG / FB = ERROR
\`\`\``;

        await sendMarkdown(msg.chat.id, text);
    });

    // ── ID ─────────────────────────────────────────────

    bot.onText(/^\/id$/, async (msg) => {
        const name = getName(msg.from);
        const userId = msg.from?.id;
        const username = msg.from?.username
            ? `@${esc(msg.from.username)}`
            : "មិនមាន";

        const text =
`\`\`\`
╔══════════════════════╗
    YOUR TELEGRAM ID
╚══════════════════════╝
\`\`\`
*ID:*       \`${userId}\`
*Name:*     ${esc(name)}
*Username:* ${username}

────────────────────────
`;

        await sendMarkdown(msg.chat.id, text);
    });

    // ── DONATE CALLBACK ────────────────────────────────

    bot.on("callback_query", async (query) => {
        const chatId = query.message.chat.id;

        if (query.data === "donate_qr") {
            try {
                await bot.answerCallbackQuery(query.id).catch(() => {});

                const name = getName(query.from);
                const qrPath = "./image/gr.png";

                if (!fs.existsSync(qrPath)) {
                    return sendMarkdown(chatId, "QR Code មិនមានទេ");
                }

                await bot.sendPhoto(chatId, fs.createReadStream(qrPath), {
                    caption: `*${esc(name)}* អរគុណសម្រាប់ការឧបត្ថម្ភ`,
                    parse_mode: "Markdown"
                });
            } catch (err) {
                console.error("donate_qr error:", err.message);
                await sendMarkdown(chatId, "មិនអាចផ្ញើ QR បានទេ");
            }
        }
    });

    // ── VIDEO ──────────────────────────────────────────

    bot.onText(/\/video (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const url = match[1]?.trim();
        const name = getName(msg.from);

        if (!url) {
            return sendMarkdown(chatId, "URL មិនត្រឹមត្រូវ");
        }

        if (!isYouTubeUrl(url)) {
            return sendMarkdown(chatId,
`\`\`\`
[ERROR] Invalid Source
\`\`\`
*Bot នេះទទួលតែ YouTube ប៉ុណ្ណោះ*

\`/video https://youtube.com/watch?v=xxxx\``
            );
        }

        try {
            await sendMarkdown(chatId,
`\`\`\`
[PROCESSING] Fetching Video...
\`\`\`
*កំពុងទាញយក Video...*`
            );

            const data = await getVideoUrl(url);

            if (!data?.url) {
                return sendMarkdown(chatId,
`\`\`\`
[ERROR] Not Found
\`\`\`
*${esc(name)}* រកមិនឃើញ Video នេះទេ`
                );
            }

            const resultText =
`\`\`\`
[SUCCESS] Video Ready
\`\`\`
*Title:*   ${esc(data.title || "YouTube Video")}
*Channel:* ${esc(data.uploader || "Unknown")}
*Length:*  ${data.duration || "N/A"}

────────────────────────
ចុច Download ខាងក្រោម`;

            if (data.thumbnail) {
                await bot.sendPhoto(chatId, data.thumbnail, {
                    caption: resultText,
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Download Video MP4", url: data.url }]
                        ]
                    }
                });
            } else {
                await sendMarkdown(chatId, resultText, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Download Video MP4", url: data.url }]
                        ]
                    }
                });
            }

        } catch (err) {
            console.error("/video error:", err.message);
            await sendMarkdown(chatId,
`\`\`\`
[ERROR] Download Failed
\`\`\`
*${esc(name)}* រកមិនឃើញ Video នេះទេ`
            );
        }
    });

    // ── MP3 ────────────────────────────────────────────

    bot.onText(/\/mp3 (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const url = match[1]?.trim();
        const name = getName(msg.from);

        if (!url) {
            return sendMarkdown(chatId, "URL មិនត្រឹមត្រូវ");
        }

        if (!isYouTubeUrl(url)) {
            return sendMarkdown(chatId,
`\`\`\`
[ERROR] Invalid Source
\`\`\`
*Bot នេះទទួលតែ YouTube ប៉ុណ្ណោះ*

\`/mp3 https://youtube.com/watch?v=xxxx\``
            );
        }

        try {
            await sendMarkdown(chatId,
`\`\`\`
[PROCESSING] Fetching Audio...
\`\`\`
*កំពុងទាញយក Audio...*`
            );

            const data = await getAudioUrl(url);

            if (!data?.url) {
                return sendMarkdown(chatId,
`\`\`\`
[ERROR] Not Found
\`\`\`
*${esc(name)}* រកមិនឃើញ Audio នេះទេ`
                );
            }

            const resultText =
`\`\`\`
[SUCCESS] Audio Ready
\`\`\`
*Title:*   ${esc(data.title || "YouTube Audio")}
*Channel:* ${esc(data.uploader || "Unknown")}
*Length:*  ${data.duration || "N/A"}

────────────────────────
ចុច Download ខាងក្រោម`;

            await sendMarkdown(chatId, resultText, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Download Audio M4A", url: data.url }]
                    ]
                }
            });

        } catch (err) {
            console.error("/mp3 error:", err.message);
            await sendMarkdown(chatId,
`\`\`\`
[ERROR] Download Failed
\`\`\`
*${esc(name)}* រកមិនឃើញ Audio នេះទេ`
            );
        }
    });

    // ── LIST (owner only) ──────────────────────────────

    bot.onText(/^\/list$/, async (msg) => {
        if (!isOwner(msg.from)) {
            return sendMarkdown(msg.chat.id, "Owner only");
        }

        const users = loadUsers();

        let text =
`\`\`\`
╔══════════════════════╗
       USER LIST
╚══════════════════════╝
\`\`\`
*Total Users: ${users.length}*

`;

        users.forEach((user, index) => {
            text += `${index + 1}\\. ${esc(user.name)} \\- @${esc(user.username)}\n`;
        });

        await sendMarkdown(msg.chat.id, text);
    });
}

// ========================
// START
// ========================

createBot().catch((err) => {
    console.error("Failed to start bot:", err.message);
});
