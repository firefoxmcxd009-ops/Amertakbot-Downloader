//////////////////////////////////////////////////////
// AMERTAK TELEGRAM BOT - ULTIMATE METADATA EDITION
// FULL UPGRADE FOR NEW BACKEND API
// KEEP ALL FEATURES + LOGIC
//////////////////////////////////////////////////////

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

//////////////////////////////////////////////////////
// IMPORTS
//////////////////////////////////////////////////////

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

//////////////////////////////////////////////////////
// CONFIG
//////////////////////////////////////////////////////

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = String(process.env.OWNER_ID || "");
const API_BASE = process.env.API_BASE || "http://localhost:3000";

const PORT = process.env.PORT || 3000;

//////////////////////////////////////////////////////
// INIT
//////////////////////////////////////////////////////

const bot = new TelegramBot(TOKEN, {
    polling: true
});

const app = express();

app.use(express.json());

//////////////////////////////////////////////////////
// EXPRESS HEALTH
//////////////////////////////////////////////////////

app.get("/", (_, res) => {
    res.json({
        status: true,
        bot: "running",
        version: "ultimate-metadata-edition"
    });
});

//////////////////////////////////////////////////////
// DASHBOARD ROUTE
//////////////////////////////////////////////////////

app.get("/dashboard/:userId", (req, res) => {

    const userId = req.params.userId;

    const history = loadHistory(userId);

    const historyJSON = JSON.stringify(history);

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Dashboard — Amertak</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet"/>
<style>
  :root {
    --bg: #080b10;
    --surface: #0d1117;
    --border: #1c2333;
    --accent: #00e5ff;
    --accent2: #7c3aed;
    --text: #e6edf3;
    --muted: #8b949e;
    --success: #3fb950;
    --warn: #d29922;
    --card: #161b22;
    --glass: rgba(255,255,255,0.03);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Mono', monospace;
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* BACKGROUND GRID */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  /* GLOW BLOB */
  body::after {
    content: '';
    position: fixed;
    top: -200px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(ellipse, rgba(124,58,237,0.12) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .wrap {
    position: relative;
    z-index: 1;
    max-width: 960px;
    margin: 0 auto;
    padding: 32px 20px 80px;
  }

  /* HEADER */
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 40px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 40px;
    flex-wrap: wrap;
    gap: 16px;
  }

  .logo {
    font-family: 'Syne', sans-serif;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }

  .logo span {
    color: var(--accent);
  }

  .uid-badge {
    background: var(--glass);
    border: 1px solid var(--border);
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.5px;
  }

  .uid-badge b {
    color: var(--accent);
  }

  /* STATS ROW */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 36px;
  }

  .stat {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px 20px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .stat:hover {
    border-color: var(--accent);
  }

  .stat::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    opacity: 0;
    transition: opacity 0.2s;
  }

  .stat:hover::before { opacity: 1; }

  .stat-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
  }

  .stat-value {
    font-family: 'Syne', sans-serif;
    font-size: 28px;
    font-weight: 800;
    color: var(--text);
  }

  /* FILTER BAR */
  .filter-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }

  .filter-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 6px 14px;
    border-radius: 999px;
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .filter-btn:hover,
  .filter-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #000;
  }

  /* HISTORY GRID */
  #history-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  /* CARD */
  .dl-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
    animation: fadeUp 0.4s ease both;
  }

  .dl-card:hover {
    transform: translateY(-3px);
    border-color: rgba(0,229,255,0.3);
    box-shadow: 0 8px 32px rgba(0,229,255,0.07);
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .thumb-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    background: var(--surface);
    overflow: hidden;
  }

  .thumb-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s;
  }

  .dl-card:hover .thumb-wrap img {
    transform: scale(1.04);
  }

  .thumb-no {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    color: var(--border);
  }

  .platform-badge {
    position: absolute;
    top: 8px; left: 8px;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,0.1);
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10px;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .format-badge {
    position: absolute;
    top: 8px; right: 8px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .format-badge.mp3 { background: rgba(59,130,246,0.3); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); }
  .format-badge.mp4 { background: rgba(16,185,129,0.3); color: #34d399; border: 1px solid rgba(16,185,129,0.3); }
  .format-badge.flac { background: rgba(245,158,11,0.3); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
  .format-badge.wav { background: rgba(239,68,68,0.3); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .format-badge.default { background: rgba(107,114,128,0.3); color: #9ca3af; border: 1px solid rgba(107,114,128,0.3); }

  .card-body {
    padding: 14px 16px 16px;
  }

  .card-title {
    font-family: 'Syne', sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 10px;
    color: var(--muted);
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .card-meta span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .card-url {
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 12px;
    display: block;
    text-decoration: none;
    transition: color 0.15s;
  }

  .card-url:hover { color: var(--accent); }

  .btn-open {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 8px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .btn-open:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(0,229,255,0.05);
  }

  /* EMPTY */
  .empty {
    text-align: center;
    padding: 80px 20px;
    color: var(--muted);
    font-size: 13px;
    grid-column: 1 / -1;
  }

  .empty .icon {
    font-size: 48px;
    display: block;
    margin-bottom: 12px;
    opacity: 0.3;
  }

  /* SCROLLBAR */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }

  /* LOADING */
  .skeleton {
    background: linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    border-radius: 8px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    animation: pulse 2s infinite;
    display: inline-block;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(63,185,80,0.4); }
    50% { opacity: 0.8; box-shadow: 0 0 0 5px rgba(63,185,80,0); }
  }
</style>
</head>
<body>
<div class="wrap">

  <header>
    <div class="logo">AMERT<span>AK</span> <small style="font-size:12px;color:var(--muted);font-weight:400;">/ Dashboard</small></div>
    <div style="display:flex;align-items:center;gap:12px;">
      <span class="live-dot"></span>
      <div class="uid-badge">UID: <b>${userId}</b></div>
    </div>
  </header>

  <div class="stats" id="stats-row">
    <div class="stat">
      <div class="stat-label">Total Downloads</div>
      <div class="stat-value" id="stat-total">0</div>
    </div>
    <div class="stat">
      <div class="stat-label">YouTube</div>
      <div class="stat-value" id="stat-yt">0</div>
    </div>
    <div class="stat">
      <div class="stat-label">TikTok</div>
      <div class="stat-value" id="stat-tt">0</div>
    </div>
    <div class="stat">
      <div class="stat-label">Spotify</div>
      <div class="stat-value" id="stat-sp">0</div>
    </div>
    <div class="stat">
      <div class="stat-label">Pinterest</div>
      <div class="stat-value" id="stat-pi">0</div>
    </div>
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

  <div id="history-grid">
    <div class="empty"><span class="icon">📭</span>No downloads yet</div>
  </div>

</div>

<script>
const RAW_HISTORY = ${historyJSON};
let activeFilter = 'all';

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ' · ' +
         d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
}

function getFormatClass(fmt) {
  if (!fmt) return 'default';
  const f = fmt.toLowerCase();
  if (f.includes('mp3')) return 'mp3';
  if (f.includes('mp4')) return 'mp4';
  if (f.includes('flac')) return 'flac';
  if (f.includes('wav')) return 'wav';
  return 'default';
}

function platformIcon(p) {
  const icons = { youtube:'▶', tiktok:'◈', spotify:'♪', pinterest:'◉' };
  return icons[p] || '◎';
}

function renderCards(items) {
  const grid = document.getElementById('history-grid');

  if (!items.length) {
    grid.innerHTML = '<div class="empty"><span class="icon">🔍</span>No results for this filter</div>';
    return;
  }

  grid.innerHTML = items.map((item, i) => {
    const fmtClass = getFormatClass(item.format);
    const thumb = item.thumbnail ? \`<img src="\${item.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="thumb-no" style="display:none;">\${platformIcon(item.platform)}</div>\` : \`<div class="thumb-no">\${platformIcon(item.platform)}</div>\`;

    return \`
    <div class="dl-card" data-platform="\${item.platform || ''}" data-format="\${(item.format || '').toLowerCase()}" style="animation-delay:\${i * 0.04}s">
      <div class="thumb-wrap">
        \${thumb}
        <span class="platform-badge">\${item.platform || 'unknown'}</span>
        \${item.format ? \`<span class="format-badge \${fmtClass}">\${item.format}</span>\` : ''}
      </div>
      <div class="card-body">
        <div class="card-title">\${item.title || 'Untitled'}</div>
        <div class="card-meta">
          <span>🕐 \${formatDate(item.timestamp)}</span>
          \${item.duration ? \`<span>⏱ \${item.duration}</span>\` : ''}
        </div>
        \${item.url ? \`<a class="card-url" href="\${item.url}" target="_blank" rel="noopener">\${item.url}</a>\` : ''}
        \${item.url ? \`<a class="btn-open" href="\${item.url}" target="_blank" rel="noopener">↗ Open URL</a>\` : ''}
      </div>
    </div>\`;
  }).join('');
}

function applyFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });

  let filtered = RAW_HISTORY;
  if (filter !== 'all') {
    filtered = RAW_HISTORY.filter(item => {
      if (['youtube','tiktok','spotify','pinterest'].includes(filter))
        return item.platform === filter;
      // format filter
      return (item.format || '').toLowerCase().includes(filter);
    });
  }
  renderCards(filtered);
}

function computeStats() {
  const counts = { yt: 0, tt: 0, sp: 0, pi: 0 };
  RAW_HISTORY.forEach(item => {
    if (item.platform === 'youtube') counts.yt++;
    if (item.platform === 'tiktok') counts.tt++;
    if (item.platform === 'spotify') counts.sp++;
    if (item.platform === 'pinterest') counts.pi++;
  });
  document.getElementById('stat-total').textContent = RAW_HISTORY.length;
  document.getElementById('stat-yt').textContent = counts.yt;
  document.getElementById('stat-tt').textContent = counts.tt;
  document.getElementById('stat-sp').textContent = counts.sp;
  document.getElementById('stat-pi').textContent = counts.pi;
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
});

computeStats();
applyFilter('all');
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`
==========================================
 AMERTAK TELEGRAM BOT RUNNING
==========================================

PORT: ${PORT}
API : ${API_BASE}
DASHBOARD: http://localhost:${PORT}/dashboard/:userId

==========================================
`);
});

//////////////////////////////////////////////////////
// DATABASE
//////////////////////////////////////////////////////

const DB_FILE = path.join(__dirname, "users.json");
const HISTORY_FILE = path.join(__dirname, "history.json");

function ensureDB() {
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");
    if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, "{}");
}

ensureDB();

function loadUsers() {
    try {
        return new Set(JSON.parse(fs.readFileSync(DB_FILE)));
    } catch {
        return new Set();
    }
}

function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify([...users], null, 2));
}

const users = loadUsers();

function addUser(id) {
    id = String(id);
    if (!users.has(id)) {
        users.add(id);
        saveUsers(users);
    }
}

// History per user
function loadHistory(userId) {
    try {
        const all = JSON.parse(fs.readFileSync(HISTORY_FILE));
        return all[String(userId)] || [];
    } catch {
        return [];
    }
}

function saveHistory(userId, entry) {
    let all = {};
    try { all = JSON.parse(fs.readFileSync(HISTORY_FILE)); } catch {}
    const key = String(userId);
    if (!all[key]) all[key] = [];
    all[key].unshift(entry);               // newest first
    if (all[key].length > 200) all[key] = all[key].slice(0, 200);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(all, null, 2));
}

//////////////////////////////////////////////////////
// STATES
//////////////////////////////////////////////////////

const userStates = new Map();
const replyStates = new Map();
const formatStates = new Map();   // chatId → { data, messageId }

//////////////////////////////////////////////////////
// HELPERS
//////////////////////////////////////////////////////

function isURL(text = "") {
    return text.startsWith("http://") || text.startsWith("https://");
}

function detectPlatform(url = "") {
    url = url.toLowerCase();
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    if (url.includes("spotify.com")) return "spotify";
    if (url.includes("tiktok.com")) return "tiktok";
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

// Formats available per platform
function formatsFor(platform) {
    switch (platform) {
        case "youtube":
            return [
                { label: "MP4 1080p",  value: "mp4_1080" },
                { label: "MP4 720p",   value: "mp4_720" },
                { label: "MP4 480p",   value: "mp4_480" },
                { label: "MP3 320kbps",value: "mp3_320" },
                { label: "MP3 128kbps",value: "mp3_128" },
            ];
        case "tiktok":
            return [
                { label: "MP4 HD",     value: "mp4_hd" },
                { label: "MP4 SD",     value: "mp4_sd" },
                { label: "MP3",        value: "mp3" },
            ];
        case "spotify":
            return [
                { label: "MP3 320kbps",value: "mp3_320" },
                { label: "MP3 128kbps",value: "mp3_128" },
                { label: "FLAC",       value: "flac" },
            ];
        case "pinterest":
            return [
                { label: "MP4 HD",     value: "mp4_hd" },
                { label: "MP4 SD",     value: "mp4_sd" },
                { label: "JPEG",       value: "jpeg" },
            ];
        default:
            return [
                { label: "MP4",  value: "mp4" },
                { label: "MP3",  value: "mp3" },
            ];
    }
}

/////////////////////////////////////////////////////