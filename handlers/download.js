const { fetchData } = require("../utils/api");
const detectPlatform = require("../utils/detectPlatform");

module.exports = (bot) => {

  bot.on("message", async (msg) => {

    try {

      const text = msg.text;

      if (!text) return;

      if (text.startsWith("/")) return;

      const platform = detectPlatform(text);

      if (!platform) {
        return bot.sendMessage(
          msg.chat.id,
          "❌ Unsupported URL"
        );
      }

      const waitMsg = await bot.sendMessage(
        msg.chat.id,
        "⏳ Processing..."
      );

      const response = await fetchData(text);

      const data = response.data;

      const caption = `
🔥 ${data.platform}

📌 ${data.title || "No title"}

👤 ${data.author || data.artist || "Unknown"}

⏱ ${data.duration || "Unknown"}
      `;

      if (data.thumbnail) {
        await bot.sendPhoto(
          msg.chat.id,
          data.thumbnail,
          {
            caption
          }
        );
      }

      if (data.download.video_hd) {

        await bot.sendMessage(
          msg.chat.id,
          "🎥 Download Video",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "HD Video",
                    url: data.download.video_hd
                  }
                ],
                [
                  {
                    text: "SD Video",
                    url: data.download.video_sd
                  }
                ],
                [
                  {
                    text: "Audio",
                    url: data.download.audio
                  }
                ]
              ]
            }
          }
        );

      } else if (data.download.video) {

        await bot.sendMessage(
          msg.chat.id,
          "🎥 Download",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Video",
                    url: data.download.video
                  }
                ],
                [
                  {
                    text: "Audio",
                    url: data.download.audio
                  }
                ]
              ]
            }
          }
        );

      } else if (data.download.audio) {

        await bot.sendMessage(
          msg.chat.id,
          "🎵 Download Audio",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Audio",
                    url: data.download.audio
                  }
                ]
              ]
            }
          }
        );

      } else if (data.download.image) {

        await bot.sendMessage(
          msg.chat.id,
          "🖼 Download Image",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Image",
                    url: data.download.image
                  }
                ]
              ]
            }
          }
        );

      }

      await bot.deleteMessage(
        msg.chat.id,
        waitMsg.message_id
      );

    } catch (err) {

      console.error(err);

      bot.sendMessage(
        msg.chat.id,
        "❌ Failed to process URL"
      );
    }
  });
};