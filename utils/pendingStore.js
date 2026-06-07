/**
 * Temporary store: userId → { url, mediaData, timestamp }
 * Holds URL + parsed media data while the user selects a format.
 * Auto-expires entries after 5 minutes.
 */
const pending = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

function set(userId, data) {
  pending.set(String(userId), { ...data, timestamp: Date.now() });
}

function get(userId) {
  const entry = pending.get(String(userId));
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL) {
    pending.delete(String(userId));
    return null;
  }
  return entry;
}

function del(userId) {
  pending.delete(String(userId));
}

// Cleanup stale entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pending.entries()) {
    if (now - val.timestamp > TTL) pending.delete(key);
  }
}, 60 * 1000);

module.exports = { set, get, del };
