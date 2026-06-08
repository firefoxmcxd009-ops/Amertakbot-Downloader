require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { exec } = require("child_process");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(
  process.env.BOT_TOKEN,
  {
    polling: true
  }
);

const DOWNLOAD_DIR =
  path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

console.log("🚀 Downloader Bot Running");

/*
===================================
START
===================================
*/

bot.onText(/\/start/, async (msg) => {

  bot.sendMessage(
    msg.chat.id,

`🔥 *ALL IN ONE DOWNLOADER BOT*

📥 Supported Platforms

🎵 Spotify
📺 YouTube
🎬 TikTok
📌 Pinterest

Send any supported link 🔗`,

    {
      parse_mode: "Markdown"
    }
  );

});

/*
===================================
MESSAGE HANDLER
===================================
*/

bot.on("message", async (msg) => {

  try {

    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;
    if (text.startsWith("/")) return;

    /*
    ===============================
    YOUTUBE
    ===============================
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
          parse_mode: "Markdown",

          reply_markup: {
            inline_keyboard: [

              [
                {
                  text: "🎥 MP4 Video",
                  callback_data:
                    `yt_mp4|${text}`
                }
              ],

              [
                {
                  text: "🎵 MP3 Audio",
                  callback_data:
                    `yt_mp3|${text}`
                }
              ]

            ]
          }
        }
      );
    }

    /*
    ===============================
    TIKTOK
    ===============================
    */

    if (
      text.includes("tiktok.com")
    ) {

      return bot.sendMessage(
        chatId,

        `🎬 *TikTok Downloader*

Choose option 👇`,

        {
          parse_mode: "Markdown",

          reply_markup: {
            inline_keyboard: [

              [
                {
                  text: "🎥 Video No Watermark",
                  callback_data:
                    `tt_video|${text}`
                }
              ],

              [
                {
                  text: "🎵 Audio MP3",
                  callback_data:
                    `tt_audio|${text}`
                }
              ]

            ]
          }
        }
      );
    }

    /*
    ===============================
    PINTEREST
    ===============================
    */

    if (
      text.includes("pinterest.com") ||
      text.includes("pin.it")
    ) {

      return downloadPinterest(
        chatId,
        text
      );
    }

    /*
    ===============================
    SPOTIFY
    ===============================
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
    ===============================
    UNSUPPORTED
    ===============================
    */

    bot.sendMessage(
      chatId,
      "❌ Unsupported link"
    );

  } catch (err) {

    console.log(err);

  }

});

/*
===================================
BUTTON HANDLER
===================================
*/

bot.on("callback_query", async (query) => {

  try {

    const chatId =
      query.message.chat.id;

    const data =
      query.data.split("|");

    const action = data[0];
    const url = data[1];

    /*
    ===============================
    YOUTUBE MP4
    ===============================
    */

    if (action === "yt_mp4") {

      return downloadYouTubeVideo(
        chatId,
        url
      );

    }

    /*
    ===============================
    YOUTUBE MP3
    ===============================
    */

    if (action === "yt_mp3") {

      return downloadYouTubeMP3(
        chatId,
        url
      );

    }

    /*
    ===============================
    TIKTOK VIDEO
    ===============================
    */

    if (action === "tt_video") {

      return downloadTikTokVideo(
        chatId,
        url
      );

    }

    /*
    ===============================
    TIKTOK AUDIO
    ===============================
    */

    if (action === "tt_audio") {

      return downloadTikTokAudio(
        chatId,
        url
      );

    }

  } catch (err) {

    console.log(err);

  }

});

/*
===================================
YOUTUBE VIDEO
===================================
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
          "❌ Failed download"
        );
      }

      try {

        await bot.sendVideo(
          chatId,
          output,
          {
            caption:
              "✅ YouTube Video Downloaded"
          }
        );

        fs.unlinkSync(output);

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
===================================
YOUTUBE MP3
===================================
*/

async function downloadYouTubeMP3(
  chatId,
  url
) {

  const wait =
    await bot.sendMessage(
      chatId,
      "⏳ Downloading audio..."
    );

  const file =
    `${Date.now()}.mp3`;

  const output =
    path.join(
      DOWNLOAD_DIR,
      file
    );

  exec(

`yt-dlp -x --audio-format mp3 -o "${output}" "${url}"`,

    async (err) => {

      if (err) {

        console.log(err);

        return bot.sendMessage(
          chatId,
          "❌ Failed download"
        );
      }

      try {

        await bot.sendAudio(
          chatId,
          output,
          {
            caption:
              "✅ MP3 Downloaded"
          }
        );

        fs.unlinkSync(output);

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
===================================
TIKTOK VIDEO
===================================
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
          "✅ TikTok Downloaded"
      }
    );

  } catch (err) {

    console.log(err);

    bot.sendMessage(
      chatId,
      "❌ Failed download"
    );

  }

  bot.deleteMessage(
    chatId,
    wait.message_id
  ).catch(() => {});

}

/*
===================================
TIKTOK AUDIO
===================================
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
          "✅ TikTok MP3 Downloaded"
      }
    );

  } catch (err) {

    console.log(err);

    bot.sendMessage(
      chatId,
      "❌ Failed download"
    );

  }

  bot.deleteMessage(
    chatId,
    wait.message_id
  ).catch(() => {});

}

/*
===================================
PINTEREST
===================================
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
          "✅ Pinterest Downloaded"
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
===================================
SPOTIFY
===================================
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