const fs   = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "history.json");

// ─── Load persisted data ───────────────────────────────────────────
let store = {};

try {
  if (fs.existsSync(DB_FILE)) {
    store = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  }
} catch (e) {
  store = {};
}

// ─── Persist to disk ──────────────────────────────────────────────
function save() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error("DB save error:", e.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Save a download record for a user.
 * @param {string|number} userId
 * @param {object}        record  { url, platform, title, format, thumbnail, downloadUrl, timestamp }
 */
function addRecord(userId, record) {
  const id = String(userId);
  if (!store[id]) store[id] = [];

  // Avoid exact-url duplicates within last 5 records
  const recent = store[id].slice(-5);
  const isDup = recent.some(
    (r) => r.url === record.url && r.format === record.format
  );

  if (!isDup) {
    store[id].unshift({ ...record, id: Date.now() });
    // Keep last 50 per user
    store[id] = store[id].slice(0, 50);
    save();
  }
}

/**
 * Get download history for a user (newest first).
 */
function getHistory(userId) {
  return store[String(userId)] || [];
}

/**
 * Basic stats for a user.
 */
function getStats(userId) {
  const records = getHistory(userId);
  const platforms = {};
  const formats   = {};

  records.forEach((r) => {
    platforms[r.platform] = (platforms[r.platform] || 0) + 1;
    formats[r.format]     = (formats[r.format]     || 0) + 1;
  });

  return {
    total:     records.length,
    platforms,
    formats,
    lastActive: records[0]?.timestamp || null
  };
}

module.exports = { addRecord, getHistory, getStats };
