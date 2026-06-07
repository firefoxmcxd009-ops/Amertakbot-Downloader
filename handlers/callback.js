const pendingStore        = require("../utils/pendingStore");
const { sendVideo, sendAudio, sendPhoto } = require("../utils/sender");
const { addRecord }       = require("../db/store");
const { fetchData, normalize } = require("../utils/api");

module.exports = (bot) => {

  bot.on("callback_query", async (query) => {
    const data    = query.data || "";
    const chatId  = query.message.chat.id;
    const userId  = query.from.id;
    const msgId   = query.message.message_id;

    // ── Dashboard shortcut ─────────────────────────────────────────
    if (data.startsWith("dashboard:")) {
      await bot.answerCallbackQuery(query.id, { text: "Opening Dashboard..." });
      const webUrl = process.env.WEB_URL || `https://your-app.onrender.com`;
      return bot.sendMessage(chatId,
        `📊 <b>Dashboard</b>\n\n<a href="${webUrl}?uid=${userId}">🔗 Click ដើម្បីបើក Dashboard</a>`,
        { parse_mode: "HTML" }
      );
    }

    // ── Redownload from history ────────────────────────────────────
    if (data.startsWith("redownload:")) {
      const [, fmt, encUrl] = data.split(":");
      const url = decodeURIComponent(encUrl);
      await bot.answerCallbackQuery(query.id, { text: "⏳ Redownloading..." });
      return processDownload(bot, chatId, userId, msgId, url, fmt, true);
    }

    // ── Format selection ───────────────────────────────────────────
    if (!data.startsWith("fmt:")) return;

    const [, format, targetUserId] = data.split(":");

    // Security: only the user who sent the link can choose format
    if (String(userId) !== String(targetUserId)) {
      return bot.answerCallbackQuery(query.id, { text: "⛔ នេះមិនមែន Request របស់អ្នក!" });
    }

    if (format === "cancel") {
      pendingStore.del(userId);
      await bot.answerCallbackQuery(query.id, { text: "❌ Cancelled" });
      return bot.deleteMessage(chatId, msgId).catch(() => {});
    }

    const pending = pendingStore.get(userId);
    if (!pending) {
      await bot.answerCallbackQuery(query.id, { text: "⏰ Session Expired! Send URL again." });
      return bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId })
        .catch(() => {});
    }

    pendingStore.del(userId);

    await bot.answerCallbackQuery(query.id, { text: "⏳ Downloading..." });

    // Remove format buttons
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId })
      .catch(() => {});

    return processDownload(bot, chatId, userId, null, pending.url, format, false, pending.mediaData);
  });
};

// ── Core download + send logic ─────────────────────────────────────
async function processDownload(bot, chatId, userId, msgId, url, format, isRedownload, mediaData) {

  // If redownload, re-fetch media data
  if (isRedownload || !mediaData) {
    const waitMsg = await bot.sendMessage(chatId, "⏳ <b>Fetching media info...</b>", { parse_mode: "HTML" });
    try {
      const raw = await fetchData(url);
      mediaData  = normalize(raw);
      await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    } catch (err) {
      await bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
      return bot.sendMessage(chatId, `❌ Failed to fetch: ${err.message?.slice(0, 100)}`);
    }
  }

  const dl       = mediaData.download;
  const platform = mediaData.platform;
  const title    = mediaData.title || "Untitled";
  const author   = mediaData.author || "Unknown";

  const sendMsg = await bot.sendMessage(chatId,
    `⬇️ <b>កំពុង Download ${format.toUpperCase()}...</b>\n⏳ សូមរង់ចាំ...`,
    { parse_mode: "HTML" }
  );

  let downloadUrl = null;
  let success     = false;

  try {
    switch (format) {
      case "video_hd": {
        downloadUrl = dl.video_hd || dl.video;
        if (!downloadUrl) throw new Error("No HD video URL");
        await bot.deleteMessage(chatId, sendMsg.message_id).catch(() => {});
        success = await sendVideo(bot, chatId, downloadUrl,
          `🎬 <b>${title}</b>\n👤 ${author}\n🌐 ${platform}`,
          "📥 Download HD Video"
        );
        break;
      }
      case "video_sd": {
        downloadUrl = dl.video_sd;
        if (!downloadUrl) throw new Error("No SD video URL");
        await bot.deleteMessage(chatId, sendMsg.message_id).catch(() => {});
        success = await sendVideo(bot, chatId, downloadUrl,
          `📹 <b>${title}</b>\n👤 ${author}\n🌐 ${platform}`,
          "📥 Download SD Video"
        );
        break;
      }
      case "video": {
        downloadUrl = dl.video || dl.video_hd;
        if (!downloadUrl) throw new Error("No video URL");
        await bot.deleteMessage(chatId, sendMsg.message_id).catch(() => {});
        success = await sendVideo(bot, chatId, downloadUrl,
          `🎥 <b>${title}</b>\n👤 ${author}\n🌐 ${platform}`,
          "📥 Download Video"
        );
        break;
      }
      case "audio": {
        downloadUrl = dl.audio;
        if (!downloadUrl) throw new Error("No audio URL");
        await bot.deleteMessage(chatId, sendMsg.message_id).catch(() => {});
        success = await sendAudio(bot, chatId, downloadUrl,
          `🎵 <b>${title}</b>\n👤 ${author}\n🌐 ${platform}`,
          title, author
        );
        break;
      }
      case "image": {
        await bot.deleteMessage(chatId, sendMsg.message_id).catch(() => {});
        // Handle image arrays (e.g. Pinterest albums)
        if (dl.images && Array.isArray(dl.images) && dl.images.length) {
          downloadUrl = dl.images[0];
          for (const imgUrl of dl.images.slice(0, 10)) {
            await sendPhoto(bot, chatId, imgUrl, `🖼 <b>${title}</b>\n🌐 ${platform}`);
          }
          success = true;
        } else {
          downloadUrl = dl.image;
          if (!downloadUrl) throw new Error("No image URL");
          success = await sendPhoto(bot, chatId, downloadUrl,
            `🖼 <b>${title}</b>\n👤 ${author}\n🌐 ${platform}`
          );
        }
        break;
      }
      default:
        throw new Error(`Unknown format: ${format}`);
    }

    // Save to history
    if (downloadUrl) {
      addRecord(userId, {
        url,
        platform,
        title,
        format,
        thumbnail: mediaData.thumbnail,
        downloadUrl,
        timestamp: new Date().toISOString()
      });
    }

    // Success footer with redownload button
    if (success) {
      await bot.sendMessage(chatId,
        `✅ <b>Download Complete!</b>\n\n📌 ${title?.slice(0, 50)}\n🌐 ${platform} | 📁 ${format.toUpperCase()}`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[
              {
                text: "🔁 Download Again",
                callback_data: `redownload:${format}:${encodeURIComponent(url).slice(0, 200)}`
              }
            ]]
          }
        }
      );
    }

  } catch (err) {
    await bot.deleteMessage(chatId, sendMsg.message_id).catch(() => {});
    console.error("processDownload error:", err.message);
    bot.sendMessage(chatId,
      `❌ <b>Download Failed</b>\n\n${err.message?.slice(0, 150) || "Unknown error"}\n\nសូមព្យាយាមម្តងទៀត!`,
      { parse_mode: "HTML" }
    );
  }
}
