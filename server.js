require("dotenv").config();

// ========================
// CRASH GUARDS
// ========================

process.on("uncaughtException", (err) => {
    console.error("❌ uncaughtException:", err.message || err);
});

process.on("unhandledRejection", (err) => {
    console.error("❌ unhandledRejection:", err?.message || err);
});

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const fs = require("fs");

// ========================
// ENV
// ========================

const TOKEN = process.env.BOT_TOKEN;
const RAPID_API_KEY = process.env.RAPID_API_KEY;

if (!TOKEN) {
    console.error("❌ BOT_TOKEN missing");
    process.exit(1);
}

if (!RAPID_API_KEY) {
    console.error("❌ RAPID_API_KEY missing");
    process.exit(1);
}

// ========================
// OWNER CONFIG
// ========================

// វាយ /id ក្នុង bot រួចដាក់លេខ OWNER_ID ក្នុង Render Environment
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
        console.log("✅ Webhook deleted:", res.data.result);
    } catch (err) {
        console.warn("⚠️ deleteWebhook failed:", err.message);
    }
}

async function createBot() {
    if (isRestarting) return;
    isRestarting = true;

    if (bot) {
        try {
            await bot.stopPolling();
        } catch (_) {}
        bot = null;
    }

    await deleteWebhook();

    // Wait longer so Telegram fully releases the session
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
            console.warn("⚠️ Polling conflict (409). Restarting in 8s...");
            isRestarting = false;
            setTimeout(() => createBot(), 8000);
            return;
        }

        if (code === "EFATAL" || code === "EPARSE") {
            console.warn(`⚠️ Polling error [${code}]. Restarting in 8s...`);
            isRestarting = false;
            setTimeout(() => createBot(), 8000);
            return;
        }

        console.error("❌ polling_error:", msg);
    });

    bot.on("error", (err) => {
        console.error("❌ bot error:", err?.message || err);
    });

    registerHandlers();
    isRestarting = false;
    console.log("✅ Bot polling started");
}

// ========================
// EXPRESS
// ========================

const app = express();

app.get("/", (_, res) => {
    res.send("Amertak Telegram Bot Running!");
});

app.get("/health", (_, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
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
// USER DATABASE
// ========================

if (!fs.existsSync("./data")) {
    fs.mkdirSync("./data");
}

if (!fs.existsSync("./image")) {
    fs.mkdirSync("./image");
}

const USERS_FILE = "./data/users.json";

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

function loadUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch (_) {
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error("❌ saveUsers error:", err.message);
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

// Escape special chars for Markdown V1
function esc(text) {
    return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

async function sendMarkdown(chatId, text, extra = {}) {
    try {
        return await bot.sendMessage(chatId, text, {
            parse_mode: "Markdown",
            ...extra
        });
    } catch (err) {
        console.error("❌ sendMarkdown error:", err.message);
        // Fallback: send as plain text
        try {
            return await bot.sendMessage(chatId, text.replace(/[*_`]/g, ""), extra);
        } catch (_) {}
    }
}

// ========================
// FETCH API
// ========================

async function fetchMedia(url) {
    const response = await axios({
        method: "POST",
        url: API_URL,
        headers: {
            "Content-Type": "application/json",
            "X-RapidAPI-Key": RAPID_API_KEY,
            "X-RapidAPI-Host":
                "social-download-all-in-one.p.rapidapi.com"
        },
        data: { url },
        timeout: 20000
    });
    return response.data;
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

        // Use esc() on dynamic values to avoid Markdown parse errors
        const text = `
🌟 *សួរស្តី ${esc(name)}*

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
@Amertak\_Network
`;

        await sendMarkdown(msg.chat.id, text, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "💚 Donate ខ្ញុំ",
                            callback_data: "donate_qr"
                        }
                    ],
                    [
                        {
                            text: "💙 More tools",
                            url: "https://tools-amertak.vercel.app"
                        }
                    ]
                ]
            }
        });
    });

    // ── HELP ───────────────────────────────────────────

    bot.onText(/^\/help$/, async (msg) => {
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
        await sendMarkdown(msg.chat.id, text);
    });

    // ── ID ─────────────────────────────────────────────

    bot.onText(/^\/id$/, async (msg) => {
        const name = getName(msg.from);
        const userId = msg.from?.id;
        const username = msg.from?.username
            ? `@${esc(msg.from.username)}`
            : "មិនមាន";

        const text = `
👤 *ព័ត៌មានរបស់អ្នក*

━━━━━━━━━━━━━━

🪪 *ID:* \`${userId}\`
📛 *ឈ្មោះ:* ${esc(name)}
🔗 *Username:* ${username}

━━━━━━━━━━━━━━

💡 Copy លេខ ID ខាងលើ ហើយដាក់ជា \`OWNER\\_ID\` ក្នុង Render Environment
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

                await sendMarkdown(
                    chatId,
                    `🎁 *${esc(name)}* ចាំបន្តិចមិនណា...`
                );

                const qrPath = "./image/gr.png";

                if (!fs.existsSync(qrPath)) {
                    return sendMarkdown(chatId, "❌ QR Code not found");
                }

                await bot.sendPhoto(
                    chatId,
                    fs.createReadStream(qrPath),
                    {
                        caption: "💚 អរគុណសម្រាប់ការឧបត្ថម្ភ",
                        parse_mode: "Markdown"
                    }
                );
            } catch (err) {
                console.error("❌ donate_qr error:", err.message);
                await sendMarkdown(chatId, "❌ មិនអាចផ្ញើ QR បានទេ");
            }
        }
    });

    // ── VIDEO ──────────────────────────────────────────

    bot.onText(/\/video (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const url = match[1]?.trim();
        const name = getName(msg.from);

        if (!url) {
            return sendMarkdown(chatId, "❌ Invalid URL");
        }

        try {
            await sendMarkdown(chatId, "⏳ *កំពុងស្វែងរកវីដេអូ...*");

            const data = await fetchMedia(url);

            if (!data?.medias?.length) {
                return sendMarkdown(
                    chatId,
                    `❌ Sorry *${esc(name)}* រកមិនឃើញតំណលីងទេ ;(`
                );
            }

            const media =
                data.medias.find(
                    (m) => m.type?.toLowerCase().includes("video")
                ) || data.medias[0];

            const caption = `🎬 *${esc(data.title || "Video")}*\n\n👤 ${esc(data.author || "Unknown")}`;

            if (data.thumbnail) {
                await bot.sendPhoto(chatId, data.thumbnail, {
                    caption,
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "⬇️ Download Video", url: media.url }]
                        ]
                    }
                });
            } else {
                await sendMarkdown(chatId, caption, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "⬇️ Download Video", url: media.url }]
                        ]
                    }
                });
            }
        } catch (err) {
            console.error("❌ /video error:", err.response?.data || err.message);
            await sendMarkdown(
                chatId,
                `❌ Sorry *${esc(name)}* រកមិនឃើញតំណលីងទេ ;(`
            );
        }
    });

    // ── MP3 ────────────────────────────────────────────

    bot.onText(/\/mp3 (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const url = match[1]?.trim();
        const name = getName(msg.from);

        if (!url) {
            return sendMarkdown(chatId, "❌ Invalid URL");
        }

        try {
            await sendMarkdown(chatId, "⏳ *កំពុងស្វែងរក MP3...*");

            const data = await fetchMedia(url);

            if (!data?.medias?.length) {
                return sendMarkdown(
                    chatId,
                    `❌ Sorry *${esc(name)}* រកមិនឃើញតំណលីងទេ ;(`
                );
            }

            const media = data.medias.find(
                (m) =>
                    m.extension === "mp3" ||
                    m.type?.toLowerCase().includes("audio")
            );

            if (!media) {
                return sendMarkdown(chatId, "❌ មិនមាន MP3");
            }

            await sendMarkdown(
                chatId,
                `🎵 *${esc(data.title || "MP3")}*`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "⬇️ Download MP3", url: media.url }]
                        ]
                    }
                }
            );
        } catch (err) {
            console.error("❌ /mp3 error:", err.response?.data || err.message);
            await sendMarkdown(
                chatId,
                `❌ Sorry *${esc(name)}* រកមិនឃើញតំណលីងទេ ;(`
            );
        }
    });

    // ── PHOTO ──────────────────────────────────────────

    bot.onText(/\/photo (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const url = match[1]?.trim();
        const name = getName(msg.from);

        if (!url) {
            return sendMarkdown(chatId, "❌ Invalid URL");
        }

        try {
            await sendMarkdown(chatId, "⏳ *កំពុងស្វែងរករូបភាព...*");

            const data = await fetchMedia(url);

            if (!data?.medias?.length) {
                return sendMarkdown(
                    chatId,
                    `❌ Sorry *${esc(name)}* រកមិនឃើញតំណលីងទេ ;(`
                );
            }

            const media =
                data.medias.find(
                    (m) =>
                        m.type?.toLowerCase().includes("image") ||
                        m.type?.toLowerCase().includes("photo")
                ) || data.medias[0];

            await bot.sendPhoto(chatId, media.url, {
                caption: `🖼 *${esc(data.title || "Photo")}*`,
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "⬇️ Download Photo", url: media.url }]
                    ]
                }
            });
        } catch (err) {
            console.error("❌ /photo error:", err.response?.data || err.message);
            await sendMarkdown(
                chatId,
                `❌ Sorry *${esc(name)}* រកមិនឃើញតំណលីងទេ ;(`
            );
        }
    });

    // ── LIST (owner only) ──────────────────────────────

    bot.onText(/^\/list$/, async (msg) => {
        if (!isOwner(msg.from)) {
            return sendMarkdown(msg.chat.id, "❌ Owner only");
        }

        const users = loadUsers();

        let text = `📊 *Total Users: ${users.length}*\n\n`;

        users.forEach((user, index) => {
            text += `${index + 1}\\. ${esc(user.name)} \\[@${esc(user.username)}\\]\n`;
        });

        await sendMarkdown(msg.chat.id, text);
    });
}

// ========================
// START
// ========================

createBot().catch((err) => {
    console.error("❌ Failed to start bot:", err.message);
});
