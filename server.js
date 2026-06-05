//////////////////////////////////////////////////////
// AMERTAK TELEGRAM BOT - ULTIMATE DOWNLOAD EDITION
//////////////////////////////////////////////////////

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

//////////////////////////////////////////////////////
// IMPORTS
//////////////////////////////////////////////////////

require("dotenv").config();

const fs          = require("fs");
const path        = require("path");
const express     = require("express");
const axios       = require("axios");
const compression = require("compression");
const helmet      = require("helmet");
const TelegramBot = require("node-telegram-bot-api");

//////////////////////////////////////////////////////
// CONFIG
//////////////////////////////////////////////////////

const TOKEN    = process.env.BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "");
const API_BASE = (process.env.API_BASE || "http://localhost:3000").replace(/\/$/, "");
const BOT_URL  = (process.env.BOT_URL || "").replace(/\/$/, "");
const PORT     = Number(process.env.PORT || 3000);

if (!TOKEN) {
    console.error("❌ BOT_TOKEN missing in .env");
    process.exit(1);
}

//////////////////////////////////////////////////////
// EXPRESS
//////////////////////////////////////////////////////

const app = express();

app.set("trust proxy", true);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

app.use(
    helmet({
        crossOriginResourcePolicy: false
    })
);

//////////////////////////////////////////////////////
// TELEGRAM BOT
//////////////////////////////////////////////////////

const bot = new TelegramBot(TOKEN, {
    polling: {
        autoStart: false,
        interval: 2000,
        params: { timeout: 10 }
    }
});

//////////////////////////////////////////////////////
// SAFE POLLING START
//////////////////////////////////////////////////////

let pollingStarted = false;

async function startPollingSafe() {
    if (pollingStarted) return;

    try {
        await bot.deleteWebHook().catch(() => {});
        await bot.startPolling();

        pollingStarted = true;

        console.log("✅ Bot polling started");
    } catch (err) {
        console.error("❌ Failed to start polling:", err.message);

        setTimeout(startPollingSafe, 10000);
    }
}

setTimeout(startPollingSafe, 4000);

//////////////////////////////////////////////////////
// PROCESS EXIT
//////////////////////////////////////////////////////

async function shutdown(signal) {
    console.log(`\n${signal} received — shutting down...`);

    try {
        await bot.stopPolling();
    } catch {}

    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

//////////////////////////////////////////////////////
// POLLING ERRORS
//////////////////////////////////////////////////////

bot.on("polling_error", (err) => {
    if (
        err.code === "ETELEGRAM" &&
        String(err.message).includes("409")
    ) {
        console.warn("⚠️ 409 Conflict detected");
        return;
    }

    console.error("Polling error:", err.message);
});

//////////////////////////////////////////////////////
// DATABASE
//////////////////////////////////////////////////////

const DB_FILE      = path.join(__dirname, "users.json");
const HISTORY_FILE = path.join(__dirname, "history.json");

function ensureDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, "[]");
        }

        if (!fs.existsSync(HISTORY_FILE)) {
            fs.writeFileSync(HISTORY_FILE, "{}");
        }
    } catch (err) {
        console.error("ensureDB error:", err.message);
    }
}

ensureDB();

function loadUsers() {
    try {
        return new Set(
            JSON.parse(fs.readFileSync(DB_FILE, "utf8"))
        );
    } catch {
        return new Set();
    }
}

function saveUsers(usersSet) {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify([...usersSet], null, 2)
        );
    } catch (err) {
        console.error("saveUsers error:", err.message);
    }
}

const users = loadUsers();

function addUser(id) {
    id = String(id);

    if (!users.has(id)) {
        users.add(id);
        saveUsers(users);
    }
}

function loadHistory(userId) {
    try {
        const all = JSON.parse(
            fs.readFileSync(HISTORY_FILE, "utf8")
        );

        return all[String(userId)] || [];
    } catch {
        return [];
    }
}

function saveHistory(userId, entry) {
    try {
        let all = {};

        try {
            all = JSON.parse(
                fs.readFileSync(HISTORY_FILE, "utf8")
            );
        } catch {}

        const key = String(userId);

        if (!all[key]) {
            all[key] = [];
        }

        all[key].unshift(entry);

        if (all[key].length > 200) {
            all[key] = all[key].slice(0, 200);
        }

        fs.writeFileSync(
            HISTORY_FILE,
            JSON.stringify(all, null, 2)
        );

    } catch (err) {
        console.error("saveHistory error:", err.message);
    }
}

//////////////////////////////////////////////////////
// STATES
//////////////////////////////////////////////////////

const userStates   = new Map();
const replyStates  = new Map();
const formatStates = new Map();

//////////////////////////////////////////////////////
// HELPERS
//////////////////////////////////////////////////////

function isURL(text = "") {
    return (
        text.startsWith("http://") ||
        text.startsWith("https://")
    );
}

function detectPlatform(url = "") {
    url = url.toLowerCase();

    if (
        url.includes("youtube.com") ||
        url.includes("youtu.be")
    ) return "youtube";

    if (url.includes("spotify.com")) {
        return "spotify";
    }

    if (url.includes("tiktok.com")) {
        return "tiktok";
    }

    if (url.includes("pinterest.com")) {
        return "pinterest";
    }

    return null;
}

function platformEndpoint(platform) {
    const map = {
        youtube: "/api/youtube",
        spotify: "/api/spotify",
        tiktok: "/api/tiktok",
        pinterest: "/api/pinterest"
    };

    return map[platform] || "/api/resolve";
}

function safeFilename(title = "download") {
    return (
        "Amertak_" +
        title
            .replace(/[^\w\s\u1780-\u17FF.-]/g, "_")
            .replace(/\s+/g, "_")
            .trim()
            .substring(0, 80)
    );
}

function formatsFor(platform) {
    switch (platform) {
        case "youtube":
            return [
                { label: "ប្រូស", value: "mp4_1080", type: "video" },
                { label: "លឿន", value: "mp4_720", type: "video" },
                { label: "MP3", value: "mp3_320", type: "audio" }
            ];

        case "tiktok":
            return [
                { label: "ប្រូស", value: "mp4_hd", type: "video" },
                { label: "លឿន", value: "mp4_sd", type: "video" },
                { label: "MP3", value: "mp3", type: "audio" }
            ];

        case "spotify":
            return [
                { label: "MP3", value: "mp3_320", type: "audio" },
                { label: "FLAC", value: "flac", type: "audio" }
            ];

        case "pinterest":
            return [
                { label: "ប្រូស", value: "mp4_hd", type: "video" },
                { label: "លឿន", value: "mp4_sd", type: "video" },
                { label: "រូបភាព", value: "jpeg", type: "image" }
            ];

        default:
            return [
                { label: "MP4", value: "mp4", type: "video" },
                { label: "MP3", value: "mp3", type: "audio" }
            ];
    }
}

function buttonLabel(fmt) {
    const styles = {
        mp4_1080: "🟣 ប្រូស",
        mp4_720:  "🟢 លឿន",
        mp4_hd:   "🟣 ប្រូស",
        mp4_sd:   "🟢 លឿន",
        mp3_320:  "🔴 MP3",
        mp3:      "🔴 MP3",
        flac:     "🔵 FLAC",
        jpeg:     "🟡 រូបភាព"
    };

    return styles[fmt.value] || `▪ ${fmt.label}`;
}

function escapeHTML(text = "") {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

//////////////////////////////////////////////////////
// FETCH METADATA
//////////////////////////////////////////////////////

async function fetchMetadata(chatId, url) {

    const loading = await bot.sendMessage(
        chatId,
`//////////////////////////////////////////
0%

🔎 កំពុងស្វែងរក...`
    );

    try {

        const platform = detectPlatform(url);
        const endpoint = platformEndpoint(platform);

        await bot.editMessageText(
`//////////////////////////////////////////
25%

🌐 Connecting API...`,
            {
                chat_id: chatId,
                message_id: loading.message_id
            }
        );

        const response = await axios.get(
            `${API_BASE}${endpoint}`,
            {
                params: { url },
                timeout: 120000
            }
        );

        await bot.editMessageText(
`//////////////////////////////////////////
70%

📦 Receiving data...`,
            {
                chat_id: chatId,
                message_id: loading.message_id
            }
        );

        await new Promise((r) => setTimeout(r, 500));

        await bot.editMessageText(
`//////////////////////////////////////////
100%

✅ Completed`,
            {
                chat_id: chatId,
                message_id: loading.message_id
            }
        );

        setTimeout(() => {
            bot.deleteMessage(chatId, loading.message_id)
                .catch(() => {});
        }, 1200);

        return response.data;

    } catch (err) {

        console.error(
            "fetchMetadata error:",
            err.response?.data || err.message
        );

        await bot.editMessageText(
`//////////////////////////////////////////
0%

❌ Error: ${err.message}`,
            {
                chat_id: chatId,
                message_id: loading.message_id
            }
        ).catch(() => {});

        return null;
    }
}

//////////////////////////////////////////////////////
// DOWNLOAD + SEND FILE
//////////////////////////////////////////////////////

async function downloadAndSend(
    chatId,
    data,
    url,
    formatObj
) {

    const platform  = detectPlatform(url);
    const title     = data.title || "download";
    const filename  = safeFilename(title);
    const mediaType = formatObj.type;

    const prog = await bot.sendMessage(
        chatId,
`//////////////////////////////////////////
0%

⬇️ កំពុង Download...`
    );

    try {

        const dlRes = await axios.get(
            `${API_BASE}/api/download`,
            {
                params: {
                    url,
                    format: formatObj.value,
                    platform
                },
                timeout: 60000,
                maxRedirects: 5
            }
        );

        const directUrl =
            dlRes.data?.downloadUrl ||
            dlRes.data?.url;

        if (!directUrl) {
            throw new Error("No download URL from API");
        }

        await bot.editMessageText(
`//////////////////////////////////////////
40%

📦 Downloading file...`,
            {
                chat_id: chatId,
                message_id: prog.message_id
            }
        ).catch(() => {});

        const fileRes = await axios.get(
            directUrl,
            {
                responseType: "arraybuffer",
                timeout: 180000,
                headers: {
                    "User-Agent": "Mozilla/5.0"
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        const buffer = Buffer.from(fileRes.data);

        await bot.editMessageText(
`//////////////////////////////////////////
85%

📤 Sending to Telegram...`,
            {
                chat_id: chatId,
                message_id: prog.message_id
            }
        ).catch(() => {});

        if (mediaType === "audio") {

            const ext = formatObj.value.includes("flac")
                ? ".flac"
                : ".mp3";

            await bot.sendAudio(
                chatId,
                buffer,
                {
                    title: filename,
                    performer: "Amertak"
                },
                {
                    filename: filename + ext,
                    contentType: formatObj.value.includes("flac")
                        ? "audio/flac"
                        : "audio/mpeg"
                }
            );

        } else if (mediaType === "image") {

            await bot.sendDocument(
                chatId,
                buffer,
                {},
                {
                    filename: filename + ".jpg",
                    contentType: "image/jpeg"
                }
            );

        } else {

            await bot.sendVideo(
                chatId,
                buffer,
                {
                    supports_streaming: true
                },
                {
                    filename: filename + ".mp4",
                    contentType: "video/mp4"
                }
            );
        }

        await bot.deleteMessage(
            chatId,
            prog.message_id
        ).catch(() => {});

        saveHistory(chatId, {
            title,
            url: data.url || url,
            thumbnail: data.thumbnail || null,
            platform: data.source || platform || "unknown",
            format: formatObj.value,
            duration: data.extra?.duration || null,
            timestamp: Date.now()
        });

        await bot.sendMessage(
            chatId,
`✅ ${title}

📦 ${formatObj.value.toUpperCase()}`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: "📊 Dashboard",
                            web_app: {
                                url: `${BOT_URL}/dashboard/${chatId}`
                            }
                        }
                    ]]
                }
            }
        );

    } catch (err) {

        console.error(
            "downloadAndSend error:",
            err.response?.data || err.message
        );

        await bot.editMessageText(
`//////////////////////////////////////////
0%

❌ Download failed`,
            {
                chat_id: chatId,
                message_id: prog.message_id
            }
        ).catch(() => {});

        await bot.sendMessage(
            chatId,
`⚠️ មិនអាច download បានដោយផ្ទាល់

សូមប្រើ link ខាងក្រោម:`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: "⬇️ Download Link",
                            url: data.url || url
                        }
                    ]]
                }
            }
        );
    }
}

//////////////////////////////////////////////////////
// START COMMAND
//////////////////////////////////////////////////////

bot.onText(/^\/start$/, async (msg) => {

    const chatId = msg.chat.id;

    addUser(chatId);

    await bot.sendMessage(
        chatId,
`🔥 AMERTAK DOWNLOADER

គាំទ្រ:
• YouTube
• TikTok
• Spotify
• Pinterest

📥 ផ្ញើ link មកដើម្បី download`
    );
});

//////////////////////////////////////////////////////
// HELP COMMAND
//////////////////////////////////////////////////////

bot.onText(/^\/help$/, async (msg) => {

    await bot.sendMessage(
        msg.chat.id,
`📚 Commands

/start - Start bot
/help - Show help
/stats - Bot statistics
/dashboard - Open dashboard`
    );
});

//////////////////////////////////////////////////////
// DASHBOARD COMMAND
//////////////////////////////////////////////////////

bot.onText(/^\/dashboard$/, async (msg) => {

    const chatId = msg.chat.id;

    if (!BOT_URL) {
        return bot.sendMessage(
            chatId,
            "❌ BOT_URL missing in .env"
        );
    }

    return bot.sendMessage(
        chatId,
        "📊 Open your dashboard",
        {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: "📊 Dashboard",
                        web_app: {
                            url: `${BOT_URL}/dashboard/${chatId}`
                        }
                    }
                ]]
            }
        }
    );
});

//////////////////////////////////////////////////////
// STATS COMMAND
//////////////////////////////////////////////////////

bot.onText(/^\/stats$/, async (msg) => {

    if (String(msg.from.id) !== OWNER_ID) {
        return;
    }

    const totalUsers = users.size;

    await bot.sendMessage(
        msg.chat.id,
`📊 BOT STATS

👤 Users: ${totalUsers}
🟢 Status: Online`
    );
});

//////////////////////////////////////////////////////
// URL HANDLER
//////////////////////////////////////////////////////

bot.on("message", async (msg) => {

    try {

        const chatId = msg.chat.id;
        const text   = msg.text;

        if (!text || text.startsWith("/")) {
            return;
        }

        if (!isURL(text)) {
            return bot.sendMessage(
                chatId,
                "❌ សូមផ្ញើ URL ត្រឹមត្រូវ"
            );
        }

        addUser(chatId);

        const platform = detectPlatform(text);

        if (!platform) {
            return bot.sendMessage(
                chatId,
                "❌ Platform មិនគាំទ្រ"
            );
        }

        const data = await fetchMetadata(chatId, text);

        if (!data) {
            return bot.sendMessage(
                chatId,
                "❌ មិនអាចទាញព័ត៌មានបាន"
            );
        }

        const formats = formatsFor(platform);

        formatStates.set(chatId, {
            url: text,
            data,
            formats
        });

        const keyboard = formats.map((fmt, i) => ([
            {
                text: buttonLabel(fmt),
                callback_data: `fmt_${i}`
            }
        ]));

        if (BOT_URL) {
            keyboard.push([
                {
                    text: "📊 Dashboard",
                    web_app: {
                        url: `${BOT_URL}/dashboard/${chatId}`
                    }
                }
            ]);
        }

        const caption =
`🎬 ${escapeHTML(data.title || "Unknown")}

🌐 Platform: ${platform}
📦 Formats available: ${formats.length}`;

        if (data.thumbnail) {

            await bot.sendPhoto(
                chatId,
                data.thumbnail,
                {
                    caption,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );

        } else {

            await bot.sendMessage(
                chatId,
                caption,
                {
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                }
            );
        }

    } catch (err) {

        console.error(
            "Message handler error:",
            err.message
        );

        bot.sendMessage(
            msg.chat.id,
            "❌ Error processing request"
        ).catch(() => {});
    }
});

//////////////////////////////////////////////////////
// CALLBACK HANDLER
//////////////////////////////////////////////////////

bot.on("callback_query", async (query) => {

    try {

        const chatId = query.message.chat.id;
        const data   = query.data;

        if (!data.startsWith("fmt_")) {
            return;
        }

        const index = Number(
            data.replace("fmt_", "")
        );

        const state = formatStates.get(chatId);

        if (!state) {

            return bot.answerCallbackQuery(
                query.id,
                {
                    text: "❌ Session expired"
                }
            );
        }

        const formatObj = state.formats[index];

        if (!formatObj) {

            return bot.answerCallbackQuery(
                query.id,
                {
                    text: "❌ Invalid format"
                }
            );
        }

        await bot.answerCallbackQuery(
            query.id,
            {
                text: `⬇️ ${formatObj.label}`
            }
        );

        await downloadAndSend(
            chatId,
            state.data,
            state.url,
            formatObj
        );

    } catch (err) {

        console.error(
            "callback_query error:",
            err.message
        );

        bot.answerCallbackQuery(
            query.id,
            {
                text: "❌ Error"
            }
        ).catch(() => {});
    }
});

//////////////////////////////////////////////////////
// HEALTH
//////////////////////////////////////////////////////

app.get("/", (_, res) => {

    res.json({
        status: true,
        bot: "running",
        version: "ultimate-download-edition",
        users: users.size,
        uptime: process.uptime()
    });
});

//////////////////////////////////////////////////////
// DASHBOARD ROUTE
//////////////////////////////////////////////////////

app.get("/dashboard/:userId", (req, res) => {

    const userId = req.params.userId;

    const history = loadHistory(userId);

    const historyJSON = JSON.stringify(history);

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Dashboard — Amertak</title>

<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet"/>

<style>
:root{
    --bg:#080b10;
    --surface:#0d1117;
    --border:#1c2333;
    --accent:#00e5ff;
    --accent2:#7c3aed;
    --text:#e6edf3;
    --muted:#8b949e;
    --success:#3fb950;
    --card:#161b22;
    --glass:rgba(255,255,255,0.03);
}

*{
    margin:0;
    padding:0;
    box-sizing:border-box;
}

body{
    background:var(--bg);
    color:var(--text);
    font-family:'DM Mono',monospace;
    min-height:100vh;
    overflow-x:hidden;
}

.wrap{
    max-width:1200px;
    margin:auto;
    padding:30px 20px 100px;
}

header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:40px;
    gap:20px;
    flex-wrap:wrap;
}

.logo{
    font-size:28px;
    font-weight:800;
    font-family:'Syne',sans-serif;
}

.logo span{
    color:var(--accent);
}

.uid{
    color:var(--muted);
    font-size:13px;
}

.stats{
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
    gap:15px;
    margin-bottom:35px;
}

.card{
    background:var(--card);
    border:1px solid var(--border);
    border-radius:14px;
    padding:20px;
}

.card .label{
    color:var(--muted);
    font-size:12px;
    margin-bottom:10px;
}

.card .value{
    font-size:30px;
    font-weight:800;
}

.filter{
    display:flex;
    gap:10px;
    margin-bottom:25px;
    flex-wrap:wrap;
}

.filter button{
    border:none;
    background:#161b22;
    color:#fff;
    border:1px solid var(--border);
    padding:10px 16px;
    border-radius:999px;
    cursor:pointer;
}

.filter button.active{
    background:var(--accent);
    color:#000;
    font-weight:700;
}

.grid{
    display:grid;
    grid-template-columns:repeat(auto-fill,minmax(300px,1fr));
    gap:20px;
}

.item{
    background:var(--card);
    border:1px solid var(--border);
    border-radius:16px;
    overflow:hidden;
}

.item img{
    width:100%;
    aspect-ratio:16/9;
    object-fit:cover;
    display:block;
}

.item-body{
    padding:16px;
}

.item-title{
    font-weight:700;
    margin-bottom:10px;
}

.meta{
    color:var(--muted);
    font-size:12px;
    margin-bottom:14px;
}

.btn{
    width:100%;
    border:none;
    background:var(--accent);
    color:#000;
    padding:12px;
    border-radius:10px;
    font-weight:700;
    cursor:pointer;
    text-decoration:none;
    display:inline-flex;
    justify-content:center;
}

.empty{
    text-align:center;
    color:var(--muted);
    padding:60px 20px;
}
</style>
</head>

<body>

<div class="wrap">

<header>
    <div>
        <div class="logo">
            AMERT<span>AK</span>
        </div>

        <div class="uid">
            USER ID: ${userId}
        </div>
    </div>

    <div>
        <span style="color:#3fb950">●</span>
        ONLINE
    </div>
</header>

<div class="stats">
    <div class="card">
        <div class="label">TOTAL DOWNLOADS</div>
        <div class="value" id="total">0</div>
    </div>

    <div class="card">
        <div class="label">YOUTUBE</div>
        <div class="value" id="yt">0</div>
    </div>

    <div class="card">
        <div class="label">TIKTOK</div>
        <div class="value" id="tt">0</div>
    </div>

    <div class="card">
        <div class="label">SPOTIFY</div>
        <div class="value" id="sp">0</div>
    </div>

    <div class="card">
        <div class="label">PINTEREST</div>
        <div class="value" id="pi">0</div>
    </div>
</div>

<div class="filter">
    <button class="active" data-filter="all">
        ALL
    </button>

    <button data-filter="youtube">
        YOUTUBE
    </button>

    <button data-filter="tiktok">
        TIKTOK
    </button>

    <button data-filter="spotify">
        SPOTIFY
    </button>

    <button data-filter="pinterest">
        PINTEREST
    </button>
</div>

<div class="grid" id="grid"></div>

</div>

<script>

const history = ${historyJSON};

const grid = document.getElementById("grid");

const stats = {
    total: history.length,
    yt: history.filter(x => x.platform === "youtube").length,
    tt: history.filter(x => x.platform === "tiktok").length,
    sp: history.filter(x => x.platform === "spotify").length,
    pi: history.filter(x => x.platform === "pinterest").length
};

document.getElementById("total").innerText = stats.total;
document.getElementById("yt").innerText    = stats.yt;
document.getElementById("tt").innerText    = stats.tt;
document.getElementById("sp").innerText    = stats.sp;
document.getElementById("pi").innerText    = stats.pi;

function render(filter = "all") {

    grid.innerHTML = "";

    let items = history;

    if (filter !== "all") {
        items = items.filter(
            x => x.platform === filter
        );
    }

    if (!items.length) {

        grid.innerHTML =
        '<div class="empty">No downloads found</div>';

        return;
    }

    items.forEach(item => {

        const el = document.createElement("div");

        el.className = "item";

        el.innerHTML = \`
            \${item.thumbnail
                ? \`<img src="\${item.thumbnail}" alt="">\`
                : ""
            }

            <div class="item-body">

                <div class="item-title">
                    \${item.title || "Unknown"}
                </div>

                <div class="meta">
                    \${item.platform} •
                    \${item.format || "unknown"}
                </div>

                <a
                    class="btn"
                    href="\${item.url}"
                    target="_blank"
                >
                    OPEN
                </a>

            </div>
        \`;

        grid.appendChild(el);
    });
}

render();

document
.querySelectorAll(".filter button")
.forEach(btn => {

    btn.onclick = () => {

        document
        .querySelectorAll(".filter button")
        .forEach(b => b.classList.remove("active"));

        btn.classList.add("active");

        render(btn.dataset.filter);
    };
});

</script>

</body>
</html>
`);
});

//////////////////////////////////////////////////////
// START EXPRESS
//////////////////////////////////////////////////////

app.listen(PORT, () => {
    console.log(\`
==========================================
 AMERTAK BOT RUNNING
==========================================
 PORT      : \${PORT}
 API BASE  : \${API_BASE}
 BOT URL   : \${BOT_URL || "NOT SET"}
 USERS     : \${users.size}
==========================================
\`);
});