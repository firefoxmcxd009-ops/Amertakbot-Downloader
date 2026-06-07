const { fetchData, normalize } = require("../utils/api");
const detectPlatform            = require("../utils/detectPlatform");
const pendingStore               = require("../utils/pendingStore");

const URL_REGEX = /https?:\/\/[^\s]+/i;

module.exports = (bot) => {

  bot.on("message", async (msg) => {
    try {
      const text = msg?.text?.trim();
      if (!text || text.startsWith("/")) return;

      // Only process if it looks like a URL
      const match = text.match(URL_REGEX);
      if (!match) return;

      const url      = match[0];
      const platform = detectPlatform(url);
      const chatId   = msg.chat.id;
      const userId   = msg.from.id;

      if (!platform) {
        return bot.sendMessage(chatId, [
          "❌ <b>URL មិន Support</b>",
          "",
          "Platforms ដែល Support:",
          "YouTube, TikTok, Instagram, Twitter/X,",
          "Facebook, Spotify, SoundCloud, Pinterest, Reddit, Vimeo, Twitch"
        ].join("\n"), { parse_mode: "HTML" });
      }

      // Show "processing" message
      const waitMsg = await bot.sendMessage(chatId, `⏳ <b>កំពុង Processing...</b>\n🔍 Platform: <b>${platform}</b>`, {
        parse_mode: "HTML"
      });

      let mediaData;
      try {
        const raw = await fetchData(url);
        mediaData  = normalize(raw);
      } catch (err) {
        await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
        console.error("API Error:", err.message);
        return bot.sendMessage(chatId, [
          "❌ <b>API Error</b>",
          "",
          `Platform: ${platform}`,
          `Error: ${err.message?.slice(0, 100) || "Unknown error"}`
        ].join("\n"), { parse_mode: "HTML" });
      }

      // Store pending data for callback handler
      pendingStore.set(userId, { url, mediaData });

      // Build format buttons based on what's available
      const dl = mediaData.download;
      const buttons = [];

      if (dl.video_hd || dl.video) {
        buttons.push({ text: "🎬 Video HD", callback_data: `fmt:video_hd:${userId}` });
      }
      if (dl.video_sd) {
        buttons.push({ text: "📹 Video SD", callback_data: `fmt:video_sd:${userId}` });
      }
      if (dl.video && !dl.video_hd) {
        buttons.push({ text: "🎥 Video",    callback_data: `fmt:video:${userId}` });
      }
      if (dl.audio) {
        buttons.push({ text: "🎵 Audio MP3", callback_data: `fmt:audio:${userId}` });
      }
      if (dl.image || dl.images) {
        buttons.push({ text: "🖼 Image",    callback_data: `fmt:image:${userId}` });
      }

      if (!buttons.length) {
        await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
        return bot.sendMessage(chatId, "⚠️ រកមើល Download URL មិនឃើញ។ URL ប្រហែលជាPrivate ឬ Expired។");
      }

      // Split into rows of 2
      const keyboard = [];
      for (let i = 0; i < buttons.length; i += 2) {
        keyboard.push(buttons.slice(i, i + 2));
      }
      keyboard.push([{ text: "❌ Cancel", callback_data: `fmt:cancel:${userId}` }]);

      // Delete wait message
      await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});

      // Show media info + format selector
      const caption = [
        `🔥 <b>${mediaData.platform}</b>`,
        `📌 <b>${mediaData.title?.slice(0, 60) || "No title"}</b>`,
        `👤 ${mediaData.author || "Unknown"}`,
        mediaData.duration ? `⏱ ${mediaData.duration}` : null,
        "",
        "👇 <b>ជ្រើសរើស Format:</b>"
      ].filter(Boolean).join("\n");

      if (mediaData.thumbnail) {
        await bot.sendPhoto(chatId, mediaData.thumbnail, {
          caption,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: keyboard }
        });
      } else {
        await bot.sendMessage(chatId, caption, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: keyboard }
        });
      }

    } catch (err) {
      console.error("Download handler error:", err.message);
      bot.sendMessage(msg.chat.id, "❌ មានបញ្ហាកើតឡើង។ សូមព្យាយាមម្តងទៀត!")
        .catch(() => {});
    }
  });
};
