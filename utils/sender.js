const axios  = require("axios");
const stream = require("stream");

const MAX_TELEGRAM_FILE = 50 * 1024 * 1024; // 50 MB

/**
 * Download remote URL into a buffer.
 */
async function fetchBuffer(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout:      60000,
    maxContentLength: MAX_TELEGRAM_FILE,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; AmertakBot/2.0)"
    }
  });
  return { buffer: Buffer.from(res.data), contentType: res.headers["content-type"] || "" };
}

/**
 * Send a video to the user by downloading it server-side first.
 * Falls back to URL button if the file is too large (>50 MB).
 */
async function sendVideo(bot, chatId, url, caption, fallbackLabel) {
  try {
    const { buffer } = await fetchBuffer(url);
    await bot.sendVideo(chatId, buffer, {
      caption,
      parse_mode: "HTML",
      supports_streaming: true
    });
    return true;
  } catch (e) {
    console.error("sendVideo error:", e.message);
    // Fallback: send as URL button
    await bot.sendMessage(chatId, caption || "⬇️ Download link", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: fallbackLabel || "📥 Download Video", url }]]
      }
    });
    return false;
  }
}

/**
 * Send an audio file to the user by downloading it server-side first.
 */
async function sendAudio(bot, chatId, url, caption, title, performer) {
  try {
    const { buffer } = await fetchBuffer(url);
    await bot.sendAudio(chatId, buffer, {
      caption,
      parse_mode: "HTML",
      title:     title     || "Audio",
      performer: performer || "Unknown"
    });
    return true;
  } catch (e) {
    console.error("sendAudio error:", e.message);
    await bot.sendMessage(chatId, caption || "⬇️ Audio link", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🎵 Download Audio", url }]]
      }
    });
    return false;
  }
}

/**
 * Send a photo to the user.
 */
async function sendPhoto(bot, chatId, url, caption) {
  try {
    await bot.sendPhoto(chatId, url, {
      caption,
      parse_mode: "HTML"
    });
    return true;
  } catch (e) {
    console.error("sendPhoto error:", e.message);
    await bot.sendMessage(chatId, caption || "⬇️ Image link", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🖼 Download Image", url }]]
      }
    });
    return false;
  }
}

module.exports = { sendVideo, sendAudio, sendPhoto };
