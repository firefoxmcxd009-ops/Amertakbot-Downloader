require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { exec } = require("child_process");
const TelegramBot = require("node-telegram-bot-api");

/*
========================================
CLEAR OLD WEBHOOK
========================================
*/

const TOKEN = process.env.BOT_TOKEN;

(async () => {

  try {

    await fetch(
      `https://api.telegram.org/bot${TOKEN}/deleteWebhook`
    );

    console.log("✅ Old webhook removed");

  } catch (err) {

    console.log(err);

  }

})();

/*
========================================
BOT
========================================
*/

const bot = new TelegramBot(
  TOKEN,
  {
    polling: true
  }
);

/*
========================================
ANTI CRASH
========================================
*/

process.on(
  "unhandledRejection",
  console.error
);

process.on(
  "uncaughtException",
  console.error
);

/*
========================================
STOP POLLING
========================================
*/

process.on(
  "SIGINT",
  async () => {

    console.log("Stopping bot...");

    try {

      await bot.stopPolling();

    } catch {}

    process.exit(0);

  }
);

process.on(
  "SIGTERM",
  async () => {

    console.log("Stopping bot...");

    try {

      await bot.stopPolling();

    } catch {}

    process.exit(0);

  }
);

/*
========================================
DOWNLOADS
========================================
*/

const DOWNLOAD_DIR =
  path.join(
    __dirname,
    "downloads"
  );

if (
  !fs.existsSync(DOWNLOAD_DIR)
) {

  fs.mkdirSync(DOWNLOAD_DIR);

}

console.log(
  "🚀 Downloader Bot Running"
);

/*
========================================
START
========================================
*/

bot.onText(
  /\/start/,
  async (msg) => {

    bot.sendMessage(

      msg.chat.id,

`🔥 *ALL IN ONE DOWNLOADER BOT*

📥 Supported Platforms

📺 YouTube
🎬 TikTok
📌 Pinterest
🎵 Spotify

Send supported URL 🔗`,

      {
        parse_mode: "Markdown"
      }

    );

  }
);

/*
========================================
MESSAGE HANDLER
========================================
*/

bot.on(
  "message",
  async (msg) => {

    try {

      const chatId =
        msg.chat.id;

      const text =
        msg.text;

      if (!text) return;

      if (
        text.startsWith("/")
      ) return;

      /*
      ========================================
      YOUTUBE
      ========================================
      */

      if (

        text.includes("youtube.com") ||
        text.includes("youtu.be")

      ) {

        return bot.sendMessage(

          chatId,

`📺 *YouTube Downloader*

Choose format 👇`,

          {
            parse_mode:
              "Markdown",

            reply_markup: {
              inline_keyboard: [

                [
                  {
                    text:
                      "🎥 MP4 Video",

                    callback_data:
                      `yt_mp4|${text}`
                  }
                ],

                [
                  {
                    text:
                      "🎵 MP3 Audio",

                    callback_data:
                      `yt_mp3|${text}`
                  }
                ],

                [
                  {
                    text:
                      "🖼 Thumbnail",

                    callback_data:
                      `yt_thumb|${text}`
                  }
                ]

              ]
            }
          }

        );

      }

      /*
      ========================================
      TIKTOK
      ========================================
      */

      if (
        text.includes("tiktok.com")
      ) {

        return bot.sendMessage(

          chatId,

`🎬 *TikTok Downloader*

Choose format 👇`,

          {
            parse_mode:
              "Markdown",

            reply_markup: {
              inline_keyboard: [

                [
                  {
                    text:
                      "🎥 No Watermark",

                    callback_data:
                      `tt_video|${text}`
                  }
                ],

                [
                  {
                    text:
                      "🎵 MP3 Audio",

                    callback_data:
                      `tt_audio|${text}`
                  }
                ],

                [
                  {
                    text:
                      "🖼 Cover Image",

                    callback_data:
                      `tt_image|${text}`
                  }
                ]

              ]
            }
          }

        );

      }

      /*
      ========================================
      PINTEREST
      ========================================
      */

      if (

        text.includes("pinterest.com") ||
        text.includes("pin.it")

      ) {

        return bot.sendMessage(

          chatId,

`📌 *Pinterest Downloader*

Choose format 👇`,

          {
            parse_mode:
              "Markdown",

            reply_markup: {
              inline_keyboard: [

                [
                  {
                    text:
                      "🖼 Download Image",

                    callback_data:
                      `pin_image|${text}`
                  }
                ]

              ]
            }
          }

        );

      }

      /*
      ========================================
      SPOTIFY
      ========================================
      */

      if (
        text.includes("spotify.com")
      ) {

        return spotifyInfo(
          chatId,
          text
        );

      }

      /*
      ========================================
      UNSUPPORTED
      ========================================
      */

      bot.sendMessage(
        chatId,
        "❌ Unsupported URL"
      );

    } catch (err) {

      console.log(err);

    }

  }
);

/*
========================================
BUTTON HANDLER
========================================
*/

bot.on(
  "callback_query",
  async (query) => {

    try {

      await bot.answerCallbackQuery(
        query.id
      );

      const chatId =
        query.message.chat.id;

      const data =
        query.data.split("|");

      const action =
        data[0];

      const url =
        data[1];

      /*
      ========================================
      YOUTUBE
      ========================================
      */

      if (
        action === "yt_mp4"
      ) {

        return downloadYouTubeVideo(
          chatId,
          url
        );

      }

      if (
        action === "yt_mp3"
      ) {

        return downloadYouTubeAudio(
          chatId,
          url
        );

      }

      if (
        action === "yt_thumb"
      ) {

        return downloadYouTubeThumbnail(
          chatId,
          url
        );

      }

      /*
      ========================================
      TIKTOK
      ========================================
      */

      if (
        action === "tt_video"
      ) {

        return downloadTikTokVideo(
          chatId,
          url
        );

      }

      if (
        action === "tt_audio"
      ) {

        return downloadTikTokAudio(
          chatId,
          url
        );

      }

      if (
        action === "tt_image"
      ) {

        return downloadTikTokImage(
          chatId,
          url
        );

      }

      /*
      ========================================
      PINTEREST
      ========================================
      */

      if (
        action === "pin_image"
      ) {

        return downloadPinterest(
          chatId,
          url
        );

      }

    } catch (err) {

      console.log(err);

    }

  }
);

/*
========================================
YOUTUBE VIDEO
========================================
*/

async function downloadYouTubeVideo(
  chatId,
  url
) {

  const wait =
    await bot.sendMessage(
      chatId,
      "⏳ Downloading video..."
    );

  const file =
    `${Date.now()}.mp4`;

  const output =
    path.join(
      DOWNLOAD_DIR,
      file
    );

  exec(

`yt-dlp -f mp4 -o "${output}" "${url}"`,

    async (err) => {

      if (err) {

        console.log(err);

        return bot.sendMessage(
          chatId,
          "❌ Video failed"
        );

      }

      try {

        await bot.sendVideo(
          chatId,
          output,
          {
            caption:
              "✅ YouTube Video"
          }
        );

      } catch (e) {

        console.log(e);

      }

      if (
        fs.existsSync(output)
      ) {

        fs.unlinkSync(output);

      }

      bot.deleteMessage(
        chatId,
        wait.message_id
      ).catch(() => {});

    }

  );

}

/*
========================================
YOUTUBE AUDIO
========================================
*/

async function downloadYouTubeAudio(
  chatId,
  url
) {

  const wait =
    await bot.sendMessage(
      chatId,
      "⏳ Downloading audio..."
    );

  const file =
    `${Date.now()}.m4a`;

  const output =
    path.join(
      DOWNLOAD_DIR,
      file
    );

  exec(

`yt-dlp -f bestaudio -o "${output}" "${url}"`,

    async (err) => {

      if (err) {

        console.log(err);

        return bot.sendMessage(
          chatId,
          "❌ Audio failed"
        );

      }

      try {

        await bot.sendAudio(
          chatId,
          output,
          {
            caption:
              "✅ YouTube Audio"
          }
        );

      } catch (e) {

        console.log(e);

      }

      if (
        fs.existsSync(output)
      ) {

        fs.unlinkSync(output);

      }

      bot.deleteMessage(
        chatId,
        wait.message_id
      ).catch(() => {});

    }

  );

}

/*
========================================
YOUTUBE THUMBNAIL
========================================
*/

async function downloadYouTubeThumbnail(
  chatId,
  url
) {

  const wait =
    await bot.sendMessage(
      chatId,
      "⏳ Fetching thumbnail..."
    );

  exec(

`yt-dlp --get-thumbnail "${url}"`,

    async (err, stdout) => {

      if (err) {

        console.log(err);

        return bot.sendMessage(
          chatId,
          "❌ Thumbnail failed"
        );

      }

      try {

        await bot.sendPhoto(
          chatId,
          stdout.trim(),
          {
            caption:
              "🖼 YouTube Thumbnail"
          }
        );

      } catch (e) {

        console.log(e);

      }

      bot.deleteMessage(
        chatId,
        wait.message_id
      ).catch(() => {});

    }

  );

}

/*
========================================
TIKTOK VIDEO
========================================
*/

async function downloadTikTokVideo(
  chatId,
  url
) {

  const wait =
    await bot.sendMessage(
      chatId,
      "⏳ Downloading TikTok..."
    );

  try {

    const api =
`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;

    const { data } =
      await axios.get(api);

    await bot.sendVideo(
      chatId,
      data.data.play,
      {
        caption:
          "✅ TikTok Video"
      }
    );

  } catch (err) {

    console.log(err);

    bot.sendMessage(
      chatId,
      "❌ TikTok failed"
    );

  }

  bot.deleteMessage(
    chatId,
    wait.message_id
  ).catch(() => {});

}

/*
========================================
TIKTOK AUDIO
========================================
*/

async function downloadTikTokAudio(
  chatId,
  url
) {

  const wait =
    await bot.sendMessage(
      chatId,
      "⏳ Downloading audio..."
    );

  try {

    const api =
`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;

    const { data } =
      await axios.get(api);

    await bot.sendAudio(
      chatId,
      data.data.music,
      {
        caption:
          "✅ TikTok Audio"
      }
    );

  } catch (err) {

    console.log(err);

    bot.sendMessage(
      chatId,
      "❌ Audio failed"
    );

  }

  bot.deleteMessage(
    chatId,
    wait.message_id
  ).catch(() => {});

}

/*
========================================
TIKTOK IMAGE
========================================
*/

async function downloadTikTokImage(
  chatId,
  url
) {

  const wait =
    await bot.sendMessage(
      chatId,
      "⏳ Fetching image..."
    );

  try {

    const api =
`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;

    const { data } =
      await axios.get(api);

    await bot.sendPhoto(
      chatId,
      data.data.cover,
      {
        caption:
          "🖼 TikTok Cover"
      }
    );

  } catch (err) {

    console.log(err);

    bot.sendMessage(
      chatId,
      "❌ Image failed"
    );

  }

  bot.deleteMessage(
    chatId,
    wait.message_id
  ).catch(() => {});

}

/*
========================================
PINTEREST
========================================
*/

async function downloadPinterest(
  chatId,
  url
) {

  const wait =
    await bot.sendMessage(
      chatId,
      "⏳ Downloading Pinterest..."
    );

  try {

    const api =
`https://pinterestdownloader.io/frontendService/DownloaderService?url=${encodeURIComponent(url)}`;

    const { data } =
      await axios.get(api);

    const media =
      data.medias[0].url;

    await bot.sendPhoto(
      chatId,
      media,
      {
        caption:
          "✅ Pinterest Image"
      }
    );

  } catch (err) {

    console.log(err);

    bot.sendMessage(
      chatId,
      "❌ Pinterest failed"
    );

  }

  bot.deleteMessage(
    chatId,
    wait.message_id
  ).catch(() => {});

}

/*
========================================
SPOTIFY
========================================
*/

async function spotifyInfo(
  chatId,
  url
) {

  const wait =
    await bot.sendMessage(
      chatId,
      "⏳ Fetching Spotify..."
    );

  try {

    const api =
`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;

    const { data } =
      await axios.get(api);

    await bot.sendPhoto(
      chatId,
      data.thumbnail_url,
      {
        caption:

`🎵 Spotify Track

📌 ${data.title}

👤 ${data.author_name}`

      }
    );

  } catch (err) {

    console.log(err);

    bot.sendMessage(
      chatId,
      "❌ Spotify failed"
    );

  }

  bot.deleteMessage(
    chatId,
    wait.message_id
  ).catch(() => {});

}
const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("Bot Running ✅");
});

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `🌐 Server running on port ${PORT}`
  );
});