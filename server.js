//////////////////////////////////////////////////////
// AMERTAK TELEGRAM BOT - ULTIMATE DOWNLOAD EDITION
//////////////////////////////////////////////////////

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

process.on("SIGTERM", async () => {
    console.log("SIGTERM — stopping polling...");
    try { await bot.stopPolling(); } catch {}
    process.exit(0);
});
process.on("SIGINT", async () => {
    console.log("SIGINT — stopping polling...");
    try { await bot.stopPolling(); } catch {}
    process.exit(0);
});

//////////////////////////////////////////////////////
// IMPORTS
//////////////////////////////////////////////////////

require("dotenv").config();

const fs   = require("fs");
const path = require("path");
const express = require("express");
const axios   = require("axios");
const TelegramBot = require("node-telegram-bot-api");

//////////////////////////////////////////////////////
// CONFIG
//////////////////////////////////////////////////////

const TOKEN    = process.env.BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "");
const API_BASE = (process.env.API_BASE || "http://localhost:3000").replace(/\/$/, "");
// BOT_URL = public HTTPS URL of THIS bot server, e.g. https://amertak-tools.onrender.com
const BOT_URL  = (process.env.BOT_URL  || "").replace(/\/$/, "");
const PORT     = process.env.PORT || 3000;

//////////////////////////////////////////////////////
// INIT
//////////////////////////////////////////////////////

const bot = new TelegramBot(TOKEN, {
    polling: { interval: 2000, autoStart: false, params: { timeout: 10 } }
});

setTimeout(() => {
    bot.startPolling();
    console.log("✅ Bot polling started");
}, 5000);

bot.on("polling_error", (err) => {
    if (err.code === "ETELEGRAM" && err.message.includes("409")) {
        console.warn("⚠️  409 Conflict — waiting for old instance to stop...");
        return;
    }
    console.error("Polling error:", err.message);
});

const app = express();
app.use(express.json());

//////////////////////////////////////////////////////
// DATABASE
//////////////////////////////////////////////////////

const DB_FILE      = path.join(__dirname, "users.json");
const HISTORY_FILE = path.join(__dirname, "history.json");

function ensureDB() {
    if (!fs.existsSync(DB_FILE))      fs.writeFileSync(DB_FILE, "[]");
    if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, "{}");
}
ensureDB();

function loadUsers() {
    try { return new Set(JSON.parse(fs.readFileSync(DB_FILE))); }
    catch { return new Set(); }
}
function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify([...users], null, 2));
}
const users = loadUsers();
function addUser(id) {
    id = String(id);
    if (!users.has(id)) { users.add(id); saveUsers(users); }
}

function loadHistory(userId) {
    try {
        const all = JSON.parse(fs.readFileSync(HISTORY_FILE));
        return all[String(userId)] || [];
    } catch { return []; }
}
function saveHistory(userId, entry) {
    let all = {};
    try { all = JSON.parse(fs.readFileSync(HISTORY_FILE)); } catch {}
    const key = String(userId);
    if (!all[key]) all[key] = [];
    all[key].unshift(entry);
    if (all[key].length > 200) all[key] = all[key].slice(0, 200);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(all, null, 2));
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

function isURL(t = "") {
    return t.startsWith("http://") || t.startsWith("https://");
}

function detectPlatform(url = "") {
    url = url.toLowerCase();
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    if (url.includes("spotify.com"))   return "spotify";
    if (url.includes("tiktok.com"))    return "tiktok";
    if (url.includes("pinterest.com")) return "pinterest";
    return null;
}

function platformEndpoint(platform) {
    switch (platform) {
        case "youtube":   return "/api/youtube";
        case "spotify":   return "/api/spotify";
        case "tiktok":    return "/api/tiktok";
        case "pinterest": return "/api/pinterest";
        default:          return "/api/resolve";
    }
}

// Safe filename: Amertak_${title}
function safeFilename(title = "download") {
    return "Amertak_" + title.replace(/[^a-zA-Z0-9ก-๙ ._-]/g, "_").substring(0, 80);
}

// Formats per platform — label shown on button, value used in API call
function formatsFor(platform) {
    switch (platform) {
        case "youtube":
            return [
                { label: "⚡ លឿន",    value: "mp4_720",  type: "video" },
                { label: "📺 1080p",  value: "mp4_1080", type: "video" },
                { label: "🎵 MP3",    value: "mp3_320",  type: "audio" },
            ];
        case "tiktok":
            return [
                { label: "⚡ លឿន",   value: "mp4_hd",  type: "video" },
                { label: "🎵 MP3",   value: "mp3",     type: "audio" },
            ];
        case "spotify":
            return [
                { label: "🎵 MP3",   value: "mp3_320", type: "audio" },
                { label: "🎼 FLAC",  value: "flac",    type: "audio" },
            ];
        case "pinterest":
            return [
                { label: "⚡ លឿន",   value: "mp4_hd",  type: "video" },
                { label: "🖼 Image",  value: "jpeg",    type: "image" },
            ];
        default:
            return [
                { label: "📺 MP4",   value: "mp4",     type: "video" },
                { label: "🎵 MP3",   value: "mp3",     type: "audio" },
            ];
    }
}

//////////////////////////////////////////////////////
// FETCH METADATA
//////////////////////////////////////////////////////

async function fetchMetadata(chatId, url) {
    const loading = await bot.sendMessage(chatId,
`//////////////////////////////////////////
0%

🔎 កំពុងស្វែងរក...`);

    try {
        const platform = detectPlatform(url);
        const endpoint = platformEndpoint(platform);

        await bot.editMessageText(`//////////////////////////////////////////\n25%\n\n🌐 Connecting API...`,
            { chat_id: chatId, message_id: loading.message_id });

        const response = await axios.get(`${API_BASE}${endpoint}`, {
            params: { url },
            timeout: 120000
        });

        await bot.editMessageText(`//////////////////////////////////////////\n70%\n\n📦 Receiving data...`,
            { chat_id: chatId, message_id: loading.message_id });

        await new Promise(r => setTimeout(r, 400));

        await bot.editMessageText(`//////////////////////////////////////////\n100%\n\n✅ Completed`,
            { chat_id: chatId, message_id: loading.message_id });

        setTimeout(() => bot.deleteMessage(chatId, loading.message_id).catch(() => {}), 900);

        return response.data;

    } catch (err) {
        console.error(err.message);
        await bot.editMessageText(`//////////////////////////////////////////\n0%\n\n❌ Error fetching metadata`,
            { chat_id: chatId, message_id: loading.message_id }).catch(() => {});
        return null;
    }
}

//////////////////////////////////////////////////////
// ACTUAL DOWNLOAD + SEND TO USER
//////////////////////////////////////////////////////

async function downloadAndSend(chatId, data, url, formatObj) {
    const platform  = detectPlatform(url);
    const title     = data.title || "download";
    const filename  = safeFilename(title);
    const mediaType = formatObj.type;   // video | audio | image

    // Show progress
    const prog = await bot.sendMessage(chatId,
`//////////////////////////////////////////
0%

⬇️ កំពុង Download...`);

    try {
        // Call download endpoint on backend API
        // Expected: API returns { downloadUrl, directUrl } or streams file
        const dlRes = await axios.get(`${API_BASE}/api/download`, {
            params: { url, format: formatObj.value, platform },
            timeout: 180000
        });

        await bot.editMessageText(`//////////////////////////////////////////\n50%\n\n📦 Sending file...`,
            { chat_id: chatId, message_id: prog.message_id }).catch(() => {});

        const directUrl = dlRes.data?.downloadUrl || dlRes.data?.url || dlRes.data?.directUrl;

        if (!directUrl) throw new Error("No download URL from API");

        // Download the file buffer
        const fileRes = await axios.get(directUrl, {
            responseType: "arraybuffer",
            timeout: 180000,
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const buffer = Buffer.from(fileRes.data);

        await bot.editMessageText(`//////////////////////////////////////////\n90%\n\n📤 Uploading to Telegram...`,
            { chat_id: chatId, message_id: prog.message_id }).catch(() => {});

        // Choose send method by type
        const caption = `🎬 ${title}\n📦 ${formatObj.value.toUpperCase()}\n\n✅ @AmertakBot`;

        if (mediaType === "audio") {
            await bot.sendAudio(chatId, buffer, {
                caption,
                title:     filename,
                performer: "Amertak",
                filename:  filename + (formatObj.value.includes("flac") ? ".flac" : ".mp3")
            }, { filename: filename + ".mp3", contentType: "audio/mpeg" });

        } else if (mediaType === "image") {
            await bot.sendDocument(chatId, buffer, {
                caption
            }, { filename: filename + ".jpg", contentType: "image/jpeg" });

        } else {
            // video
            await bot.sendVideo(chatId, buffer, {
                caption,
                supports_streaming: true
            }, { filename: filename + ".mp4", contentType: "video/mp4" });
        }

        await bot.deleteMessage(chatId, prog.message_id).catch(() => {});

        // Save to history
        saveHistory(chatId, {
            title,
            url:       data.url || url,
            thumbnail: data.thumbnail || null,
            platform:  data.source || platform || "unknown",
            format:    formatObj.value,
            duration:  data.extra?.duration || null,
            timestamp: Date.now()
        });

    } catch (err) {
        console.error("Download error:", err.message);

        await bot.editMessageText(`//////////////////////////////////////////\n0%\n\n❌ Download failed`,
            { chat_id: chatId, message_id: prog.message_id }).catch(() => {});

        // Fallback: send direct link button
        await bot.sendMessage(chatId,
`⚠️ មិនអាច download បានដោយផ្ទាល់
សូមប្រើ link ខាងក្រោម:`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "⬇️ Download Link", url: data.url || url }
                    ]]
                }
            }
        );
    }
}

//////////////////////////////////////////////////////
// HEALTH CHECK
//////////////////////////////////////////////////////

app.get("/", (_, res) => {
    res.json({ status: true, bot: "running", version: "ultimate-download-edition" });
});

//////////////////////////////////////////////////////
// DASHBOARD ROUTE
//////////////////////////////////////////////////////

app.get("/dashboard/:userId", (req, res) => {
    const userId  = req.params.userId;
    const history = loadHistory(userId);
    const historyJSON = JSON.stringify(history);

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Dashboard — Amertak</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet"/>
<style>
  :root{--bg:#080b10;--surface:#0d1117;--border:#1c2333;--accent:#00e5ff;--accent2:#7c3aed;--text:#e6edf3;--muted:#8b949e;--success:#3fb950;--card:#161b22;--glass:rgba(255,255,255,0.03)}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:'DM Mono',monospace;min-height:100vh;overflow-x:hidden}
  body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,229,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
  body::after{content:'';position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:600px;height:400px;background:radial-gradient(ellipse,rgba(124,58,237,0.12) 0%,transparent 70%);pointer-events:none;z-index:0}
  .wrap{position:relative;z-index:1;max-width:960px;margin:0 auto;padding:32px 20px 80px}
  header{display:flex;align-items:center;justify-content:space-between;padding:0 0 40px;border-bottom:1px solid var(--border);margin-bottom:40px;flex-wrap:wrap;gap:16px}
  .logo{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px}
  .logo span{color:var(--accent)}
  .uid-badge{background:var(--glass);border:1px solid var(--border);padding:6px 14px;border-radius:999px;font-size:11px;color:var(--muted);letter-spacing:0.5px}
  .uid-badge b{color:var(--accent)}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:36px}
  .stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 20px;position:relative;overflow:hidden;transition:border-color 0.2s}
  .stat:hover{border-color:var(--accent)}
  .stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),var(--accent2));opacity:0;transition:opacity 0.2s}
  .stat:hover::before{opacity:1}
  .stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
  .stat-value{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:var(--text)}
  .filter-bar{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}
  .filter-btn{background:transparent;border:1px solid var(--border);color:var(--muted);padding:6px 14px;border-radius:999px;font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;transition:all 0.15s;letter-spacing:0.5px;text-transform:uppercase}
  .filter-btn:hover,.filter-btn.active{background:var(--accent);border-color:var(--accent);color:#000}
  #history-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .dl-card{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:transform 0.2s,border-color 0.2s,box-shadow 0.2s;animation:fadeUp 0.4s ease both}
  .dl-card:hover{transform:translateY(-3px);border-color:rgba(0,229,255,0.3);box-shadow:0 8px 32px rgba(0,229,255,0.07)}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  .thumb-wrap{position:relative;width:100%;aspect-ratio:16/9;background:var(--surface);overflow:hidden}
  .thumb-wrap img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.3s}
  .dl-card:hover .thumb-wrap img{transform:scale(1.04)}
  .thumb-no{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;color:var(--border)}
  .platform-badge{position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.1);padding:3px 10px;border-radius:999px;font-size:10px;color:var(--text);text-transform:uppercase;letter-spacing:0.8px}
  .format-badge{position:absolute;top:8px;right:8px;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.8px}
  .format-badge.mp3{background:rgba(59,130,246,0.3);color:#60a5fa;border:1px solid rgba(59,130,246,0.3)}
  .format-badge.mp4{background:rgba(16,185,129,0.3);color:#34d399;border:1px solid rgba(16,185,129,0.3)}
  .format-badge.flac{background:rgba(245,158,11,0.3);color:#fbbf24;border:1px solid rgba(245,158,11,0.3)}
  .format-badge.jpeg,.format-badge.image{background:rgba(236,72,153,0.3);color:#f472b6;border:1px solid rgba(236,72,153,0.3)}
  .format-badge.default{background:rgba(107,114,128,0.3);color:#9ca3af;border:1px solid rgba(107,114,128,0.3)}
  .card-body{padding:14px 16px 16px}
  .card-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card-meta{display:flex;align-items:center;gap:10px;font-size:10px;color:var(--muted);margin-bottom:12px;flex-wrap:wrap}
  .card-url{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:10px;display:block;text-decoration:none;transition:color 0.15s}
  .card-url:hover{color:var(--accent)}
  .btn-dl{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:9px;background:linear-gradient(135deg,rgba(0,229,255,0.15),rgba(124,58,237,0.15));border:1px solid rgba(0,229,255,0.3);border-radius:8px;color:var(--accent);font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;transition:all 0.15s;text-decoration:none;text-transform:uppercase;letter-spacing:0.5px;font-weight:500}
  .btn-dl:hover{background:linear-gradient(135deg,rgba(0,229,255,0.25),rgba(124,58,237,0.25));border-color:var(--accent);box-shadow:0 0 16px rgba(0,229,255,0.2)}
  .empty{text-align:center;padding:80px 20px;color:var(--muted);font-size:13px;grid-column:1/-1}
  .empty .icon{font-size:48px;display:block;margin-bottom:12px;opacity:0.3}
  ::-webkit-scrollbar{width:6px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:var(--border);border-radius:999px}
  .live-dot{width:7px;height:7px;border-radius:50%;background:var(--success);animation:pulse 2s infinite;display:inline-block}
  @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(63,185,80,0.4)}50%{opacity:0.8;box-shadow:0 0 0 5px rgba(63,185,80,0)}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">AMERT<span>AK</span> <small style="font-size:12px;color:var(--muted);font-weight:400;">/ Dashboard</small></div>
    <div style="display:flex;align-items:center;gap:12px">
      <span class="live-dot"></span>
      <div class="uid-badge">UID: <b>${userId}</b></div>
    </div>
  </header>
  <div class="stats" id="stats-row">
    <div class="stat"><div class="stat-label">Total Downloads</div><div class="stat-value" id="stat-total">0</div></div>
    <div class="stat"><div class="stat-label">YouTube</div><div class="stat-value" id="stat-yt">0</div></div>
    <div class="stat"><div class="stat-label">TikTok</div><div class="stat-value" id="stat-tt">0</div></div>
    <div class="stat"><div class="stat-label">Spotify</div><div class="stat-value" id="stat-sp">0</div></div>
    <div class="stat"><div class="stat-label">Pinterest</div><div class="stat-value" id="stat-pi">0</div></div>
  </div>
  <div class="filter-bar">
    <button class="filter-btn active" data-filter="all">All</button>
    <button class="filter-btn" data-filter="youtube">YouTube</button>
    <button class="filter-btn" data-filter="tiktok">TikTok</button>
    <button class="filter-btn" data-filter="spotify">Spotify</button>
    <button class="filter-btn" data-filter="pinterest">Pinterest</button>
    <button class="filter-btn" data-filter="mp3">MP3</button>
    <button class="filter-btn" data-filter="mp4">MP4</button>
  </div>
  <div id="history-grid"><div class="empty"><span class="icon">📭</span>No downloads yet</div></div>
</div>
<script>
const RAW_HISTORY=${historyJSON};
function formatDate(ts){if(!ts)return'—';const d=new Date(ts);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});}
function getFmtClass(fmt){if(!fmt)return'default';const f=fmt.toLowerCase();if(f.includes('mp3'))return'mp3';if(f.includes('mp4'))return'mp4';if(f.includes('flac'))return'flac';if(f.includes('jpeg')||f.includes('jpg')||f.includes('image'))return'image';return'default';}
function pIcon(p){return{youtube:'▶',tiktok:'◈',spotify:'♪',pinterest:'◉'}[p]||'◎';}
function renderCards(items){
  const grid=document.getElementById('history-grid');
  if(!items.length){grid.innerHTML='<div class="empty"><span class="icon">🔍</span>No results</div>';return;}
  grid.innerHTML=items.map((item,i)=>{
    const fc=getFmtClass(item.format);
    const thumb=item.thumbnail?
      \`<img src="\${item.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'"/><div class="thumb-no" style="display:none">\${pIcon(item.platform)}</div>\`:
      \`<div class="thumb-no">\${pIcon(item.platform)}</div>\`;
    return \`<div class="dl-card" data-platform="\${item.platform||''}" data-format="\${(item.format||'').toLowerCase()}" style="animation-delay:\${i*0.04}s">
      <div class="thumb-wrap">\${thumb}<span class="platform-badge">\${item.platform||'unknown'}</span>\${item.format?\`<span class="format-badge \${fc}">\${item.format}</span>\`:''}
      </div>
      <div class="card-body">
        <div class="card-title">\${item.title||'Untitled'}</div>
        <div class="card-meta"><span>🕐 \${formatDate(item.timestamp)}</span>\${item.duration?\`<span>⏱ \${item.duration}</span>\`:''}</div>
        \${item.url?\`<a class="card-url" href="\${item.url}" target="_blank" rel="noopener">\${item.url}</a>\`:''}
        \${item.url?\`<a class="btn-dl" href="\${item.url}" target="_blank" rel="noopener">⬇ Download Again</a>\`:''}
      </div>
    </div>\`;
  }).join('');
}
function applyFilter(f){
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
  let list=RAW_HISTORY;
  if(f!=='all'){list=RAW_HISTORY.filter(item=>['youtube','tiktok','spotify','pinterest'].includes(f)?item.platform===f:(item.format||'').toLowerCase().includes(f));}
  renderCards(list);
}
function computeStats(){
  const c={yt:0,tt:0,sp:0,pi:0};
  RAW_HISTORY.forEach(item=>{if(item.platform==='youtube')c.yt++;if(item.platform==='tiktok')c.tt++;if(item.platform==='spotify')c.sp++;if(item.platform==='pinterest')c.pi++;});
  document.getElementById('stat-total').textContent=RAW_HISTORY.length;
  document.getElementById('stat-yt').textContent=c.yt;document.getElementById('stat-tt').textContent=c.tt;
  document.getElementById('stat-sp').textContent=c.sp;document.getElementById('stat-pi').textContent=c.pi;
}
document.querySelectorAll('.filter-btn').forEach(btn=>btn.addEventListener('click',()=>applyFilter(btn.dataset.filter)));
computeStats();applyFilter('all');
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`
==========================================
 AMERTAK BOT RUNNING
 PORT     : ${PORT}
 API      : ${API_BASE}
 DASHBOARD: ${BOT_URL}/dashboard/:userId
==========================================`);
});

//////////////////////////////////////////////////////
// /start
//////////////////////////////////////////////////////

bot.onText(/\/start/, async (msg) => {
    addUser(msg.chat.id);
    const fullName = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();

    await bot.sendMessage(msg.chat.id,
`👋 សូមស្វាគមន៍ ${fullName}

🔥 Supported:
• YouTube  • TikTok
• Spotify  • Pinterest

📌 Send a URL to download

Commands: /id  /ask  /notify`,
        {
            reply_markup: {
                inline_keyboard: [[
                    { text: "🛠 Tools",     web_app: { url: "https://tools-amertak.vercel.app" } },
                    { text: "📊 Dashboard", web_app: { url: `${BOT_URL}/dashboard/${msg.from.id}` } }
                ]]
            }
        }
    );
});

//////////////////////////////////////////////////////
// /id
//////////////////////////////////////////////////////

bot.onText(/\/id/, async (msg) => {
    await bot.sendMessage(msg.chat.id,
`🆔 USER INFO

User ID : ${msg.from.id}
Chat ID : ${msg.chat.id}
Username: @${msg.from.username || "none"}`);
});

//////////////////////////////////////////////////////
// /ask
//////////////////////////////////////////////////////

bot.onText(/\/ask (.+)/, async (msg, match) => {
    await bot.sendMessage(msg.chat.id, "📩 Sent to owner");
    await bot.sendMessage(OWNER_ID,
`❓ NEW QUESTION
👤 ${msg.from.first_name}  🆔 ${msg.from.id}
💬 ${match[1]}`,
        { reply_markup: { inline_keyboard: [[{ text: "Reply", callback_data: `reply_${msg.from.id}` }]] } }
    );
});

//////////////////////////////////////////////////////
// /reply
//////////////////////////////////////////////////////

bot.onText(/\/reply (\d+) (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== OWNER_ID) return;
    try {
        await bot.sendMessage(match[1], `📩 OWNER REPLY\n\n${match[2]}`);
        await bot.sendMessage(msg.chat.id, "✅ Reply sent");
    } catch { await bot.sendMessage(msg.chat.id, "❌ Failed"); }
});

//////////////////////////////////////////////////////
// /notify
//////////////////////////////////////////////////////

bot.onText(/\/notify (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== OWNER_ID) return;
    let success = 0, failed = 0;
    for (const id of users) {
        try { await bot.sendMessage(id, `📢 BROADCAST\n\n${match[1]}`); success++; }
        catch { failed++; }
        await new Promise(r => setTimeout(r, 50));
    }
    await bot.sendMessage(msg.chat.id, `📊 BROADCAST COMPLETE\n\n✅ Success: ${success}\n❌ Failed: ${failed}`);
});

//////////////////////////////////////////////////////
// CALLBACK
//////////////////////////////////////////////////////

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;
    await bot.answerCallbackQuery(query.id);

    // REPLY MODE
    if (action.startsWith("reply_")) {
        if (String(chatId) !== OWNER_ID) return;
        const userId = action.split("_")[1];
        replyStates.set(chatId, userId);
        return bot.sendMessage(chatId, `✍ Reply Mode\nTarget: ${userId}\n\nSend message now`);
    }

    // FORMAT CHOSEN
    if (action.startsWith("fmt_")) {
        // fmt_{chatId}_{index}
        const parts      = action.split("_");
        const targetChat = parts[1];
        const fmtIndex   = parseInt(parts[2], 10);

        if (String(chatId) !== String(targetChat)) return;

        const state = formatStates.get(chatId);
        if (!state) return;

        const { data, url, formats } = state;
        const formatObj = formats[fmtIndex];
        if (!formatObj) return;

        formatStates.delete(chatId);
        bot.deleteMessage(chatId, query.message.message_id).catch(() => {});

        // Start actual download + send
        await downloadAndSend(chatId, data, url, formatObj);
        return;
    }
});

//////////////////////////////////////////////////////
// MAIN MESSAGE
//////////////////////////////////////////////////////

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text   = msg.text;
    if (!text) return;

    addUser(chatId);
    if (text.startsWith("/")) return;

    // OWNER REPLY MODE
    if (String(chatId) === OWNER_ID && replyStates.has(chatId)) {
        const target = replyStates.get(chatId);
        try {
            await bot.sendMessage(target, `📩 OWNER REPLY\n\n${text}`);
            await bot.sendMessage(chatId, "✅ Sent");
        } catch { await bot.sendMessage(chatId, "❌ Failed"); }
        replyStates.delete(chatId);
        return;
    }

    if (!isURL(text)) {
        return bot.sendMessage(chatId, "❌ Invalid URL");
    }

    // FETCH METADATA
    const data = await fetchMetadata(chatId, text);
    if (!data) return;

    userStates.set(chatId, data);

    const platform = detectPlatform(text);
    const formats  = formatsFor(platform);

    formatStates.set(chatId, { data, url: text, formats });

    // BUILD FORMAT KEYBOARD — styled buttons with emoji colors
    // Layout: all formats in one row if ≤3, else 2 per row
    const fmtRows = [];

    // Spotify fix: use Spotify-specific display
    const isSpotify = platform === "spotify";

    for (let i = 0; i < formats.length; i += 3) {
        const row = [];
        for (let j = i; j < Math.min(i + 3, formats.length); j++) {
            row.push({
                text: formats[j].label,
                callback_data: `fmt_${chatId}_${j}`
            });
        }
        fmtRows.push(row);
    }

    // Metadata caption
    const platform_display = isSpotify ? "Spotify 🎵" : (data.source || platform || "Unknown");
    const extra_info = isSpotify && data.extra?.artist
        ? `\n👤 ${data.extra.artist}`
        : (data.extra?.duration ? `\n⏱ ${data.extra.duration}` : "");

    await bot.sendMessage(chatId,
`🎬 ${data.title || "Unknown"}
🌐 ${platform_display}${extra_info}

📦 ជ្រើស Format:`,
        { reply_markup: { inline_keyboard: fmtRows } }
    );
});

//////////////////////////////////////////////////////
// AUTO CLEANUP
//////////////////////////////////////////////////////

setInterval(() => {
    if (userStates.size > 1000)   { userStates.clear();   console.log("🧹 userStates cleared"); }
    if (formatStates.size > 1000) { formatStates.clear(); console.log("🧹 formatStates cleared"); }
}, 1000 * 60 * 30);

//////////////////////////////////////////////////////
// READY LOG
//////////////////////////////////////////////////////

console.log(`
==========================================
 BOT ONLINE — ULTIMATE DOWNLOAD EDITION
==========================================
✔ Real file download + send to user
✔ Filename: Amertak_\${title}
✔ YouTube / TikTok / Spotify / Pinterest
✔ MP3 / MP4 / FLAC / Image support
✔ Spotify fix (artist + dedicated API)
✔ Dashboard with Download button
✔ Colored format buttons
✔ History per user
✔ Broadcast / Ask / Reply
✔ 409 Conflict fix
==========================================
`);
