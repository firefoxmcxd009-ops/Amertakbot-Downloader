require("dotenv").config();
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");

// ========================
// CONFIG
// ========================

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

const API_URL =
  "https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink";

const API_KEY =
  "67b70b3ec3mshf2ea79c89077f81p1e76a9jsn19b5d6afc545";

const bot = new TelegramBot(TOKEN, {
  polling: true
});

// ========================
// EXPRESS
// ========================

const app = express();

app.get("/", (_, res) => {
  res.send("Bot Running");
});

app.listen(process.env.PORT || 3000);

// ========================
// USERS DB (FOR NOTIFY)
// ========================

const DB_FILE = "./users.json";

function loadUsers() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "[]");
  }

  try {
    return new Set(JSON.parse(fs.readFileSync(DB_FILE)));
  } catch {
    return new Set();
  }
}

function saveUsers(set) {
  fs.writeFileSync(DB_FILE, JSON.stringify([...set], null, 2));
}

const users = loadUsers();

function addUser(id) {
  const strId = String(id);

  if (!users.has(strId)) {
    users.add(strId);
    saveUsers(users);
  }
}

// ========================
// SAVE GROUPS + USERS
// ========================

bot.on("message", async (msg) => {
  if (!msg.chat?.id) return;

  addUser(msg.chat.id);
});

// ========================
// STATE
// ========================

const userStates = {};

// ========================
// HELPERS
// ========================

function formatQuality(q) {
  if (!q) return "Unknown";

  return q
    .split("_")
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// ========================
// FIND MEDIA
// ========================

function findMedia(data, type) {
  if (!data?.medias || !Array.isArray(data.medias)) {
    return null;
  }

  // VIDEO
  if (type === "video") {
    return data.medias.find(
      m => m.type?.toLowerCase() === "video"
    );
  }

  // AUDIO
  if (type === "mp3") {
    return data.medias.find(
      m => m.type?.toLowerCase() === "audio"
    );
  }

  // IMAGE
  if (type === "image") {
    return data.medias.find(m => {
      const ext = m.extension?.toLowerCase();

      return (
        m.type?.toLowerCase() === "image" ||
        ext === "jpg" ||
        ext === "jpeg" ||
        ext === "png" ||
        ext === "webp"
      );
    });
  }

  return null;
}

// ========================
// CHECK ONLY IMAGE POST
// ========================

function isImageOnly(data) {
  if (!data?.medias || !Array.isArray(data.medias)) {
    return false;
  }

  const hasVideo = data.medias.some(
    m => m.type?.toLowerCase() === "video"
  );

  const hasAudio = data.medias.some(
    m => m.type?.toLowerCase() === "audio"
  );

  const hasImage = data.medias.some(m => {
    const ext = m.extension?.toLowerCase();

    return (
      m.type?.toLowerCase() === "image" ||
      ext === "jpg" ||
      ext === "jpeg" ||
      ext === "png" ||
      ext === "webp"
    );
  });

  return hasImage && !hasVideo && !hasAudio;
}

// ========================
// PROGRESS BAR
// ========================

async function progressBar(chatId, msgId) {
  const steps = [
    "⬜⬜⬜⬜⬜ 0%",
    "🟩⬜⬜⬜⬜ 20%",
    "🟩🟩⬜⬜⬜ 40%",
    "🟩🟩🟩⬜⬜ 60%",
    "🟩🟩🟩🟩⬜ 80%",
    "🟩🟩🟩🟩🟩 100%"
  ];

  for (let i = 0; i < steps.length; i++) {
    await new Promise(r => setTimeout(r, 350));

    await bot.editMessageText(
      `📥 Downloading...\n\n${steps[i]}`,
      {
        chat_id: chatId,
        message_id: msgId
      }
    ).catch(() => {});
  }
}

// ========================
// FETCH VIDEO
// ========================

async function fetchVideo(chatId, url) {
  const loading = await bot.sendMessage(
    chatId,
    "⏳ Processing..."
  );

  try {
    const res = await axios.post(
      API_URL,
      { url },
      {
        headers: {
          "Content-Type": "application/json",
          "X-RapidAPI-Host":
            "social-download-all-in-one.p.rapidapi.com",
          "X-RapidAPI-Key": API_KEY
        }
      }
    );

    await bot
      .deleteMessage(chatId, loading.message_id)
      .catch(() => {});

    return res.data;

  } catch (err) {
    await bot
      .deleteMessage(chatId, loading.message_id)
      .catch(() => {});

    await bot.sendMessage(
      chatId,
      "❌ API Error"
    );

    return null;
  }
}

// ========================
// SEND FILE
// ========================

async function sendFile(chatId, media, data) {
  try {
    const msg = await bot.sendMessage(
      chatId,
      "📥 Starting...\n⬜⬜⬜⬜⬜ 0%"
    );

    await progressBar(chatId, msg.message_id);

    const stream = await axios.get(media.url, {
      responseType: "stream"
    });

    // AUDIO
    if (media.type?.toLowerCase() === "audio") {

      await bot.sendAudio(chatId, stream.data, {
        caption: `🎵 ${data.title || "Audio"}`
      });

    }

    // VIDEO
    else if (media.type?.toLowerCase() === "video") {

      await bot.sendVideo(chatId, stream.data, {
        caption: `🎬 ${data.title || "Video"}`
      });

    }

    // IMAGE
    else if (
      media.type?.toLowerCase() === "image" ||
      ["jpg", "jpeg", "png", "webp"].includes(
        media.extension?.toLowerCase()
      )
    ) {

      await bot.sendPhoto(chatId, media.url, {
        caption: `🖼 ${data.title || "Image"}`
      });

    }

    // OTHER
    else {

      await bot.sendDocument(chatId, stream.data, {
        caption: `📁 ${data.title || "File"}`
      });

    }

    await bot
      .deleteMessage(chatId, msg.message_id)
      .catch(() => {});

  } catch (err) {
    console.log(err);

    await bot.sendMessage(
      chatId,
      "❌ Failed to send file"
    );
  }
}

// ========================
// START
// ========================

bot.onText(/\/start/, async (msg) => {
  addUser(msg.chat.id);

  await bot.sendMessage(
    msg.chat.id,
`🎬 AMERTAK DOWNLOADER

Send video link`,
{
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔵 Tools",
              web_app: {
                url: "https://tools-amertak.vercel.app"
              }
            }
          ]
        ]
      }
    }
  );
});

// ========================
// /ID
// ========================

bot.onText(/\/id/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  await bot.sendMessage(
    chatId,
`🆔 Telegram Info

👤 User ID: ${userId}
💬 Chat ID: ${chatId}
📛 Username: @${msg.from.username || "no_username"}

📌 Use User ID as OWNER_ID`
  );
});

// ========================
// /NOTIFY OWNER ONLY
// SEND TO USERS + GROUPS
// ========================

bot.onText(/\/notify (.+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);

  if (chatId !== String(OWNER_ID)) {
    return bot.sendMessage(
      msg.chat.id,
      "❌ Not allowed"
    );
  }

  const text = match[1];

  let sent = 0;
  let failed = 0;

  const allUsers = [...users];

  const progress = await bot.sendMessage(
    msg.chat.id,
    `📢 Starting broadcast...

👥 Total: ${allUsers.length}`
  );

  for (const id of allUsers) {
    try {

      await bot.sendMessage(
        id,
        `📢 ${text}`
      );

      sent++;

    } catch (e) {

      failed++;

    }

    await new Promise(r => setTimeout(r, 60));
  }

  await bot.editMessageText(
`✅ Broadcast Done

📤 Sent: ${sent}
❌ Failed: ${failed}
👥 Total: ${allUsers.length}`,
{
      chat_id: msg.chat.id,
      message_id: progress.message_id
    }
  );
});

// ========================
// MAIN HANDLER
// ========================

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) {
    return;
  }

  addUser(chatId);

  // ========================
  // URL
  // ========================

  if (text.startsWith("http")) {

    const data = await fetchVideo(chatId, text);

    if (!data) return;

    userStates[chatId] = { data };

    // THUMBNAIL
    if (data.thumbnail) {

      await bot.sendPhoto(
        chatId,
        data.thumbnail,
        {
          caption: `📌 ${data.title || "Untitled"}`
        }
      );

    }

    // ========================
    // AUTO SEND IMAGE
    // ========================

    if (isImageOnly(data)) {

      const imageMedia = findMedia(data, "image");

      if (!imageMedia) {
        return bot.sendMessage(
          chatId,
          "❌ Image not found"
        );
      }

      return sendFile(chatId, imageMedia, data);
    }

    // ========================
    // FORMAT BUTTONS
    // ========================

    return bot.sendMessage(
      chatId,
`📂 Choose format`,
{
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎬 Video",
                callback_data: "video"
              },
              {
                text: "🖼 Image",
                callback_data: "image"
              }
            ],
            [
              {
                text: "🎵 MP3",
                callback_data: "mp3"
              }
            ],
            [
              {
                text: "🔵 Tools",
                web_app: {
                  url: "https://tools-amertak.vercel.app"
                }
              }
            ],
            [
              {
                text: "🔙 Back",
                callback_data: "back"
              }
            ]
          ]
        }
      }
    );
  }

  return bot.sendMessage(
    chatId,
    "📎 Send valid URL"
  );
});

// ========================
// CALLBACK HANDLER
// ========================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  await bot.answerCallbackQuery(query.id);

  const data = userStates[chatId]?.data;

  if (!data) {
    return bot.sendMessage(
      chatId,
      "❌ Session expired"
    );
  }

  // ========================
  // BACK
  // ========================

  if (action === "back") {

    return bot.sendMessage(
      chatId,
      "📂 Choose format again",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎬 Video",
                callback_data: "video"
              },
              {
                text: "🖼 Image",
                callback_data: "image"
              }
            ],
            [
              {
                text: "🎵 MP3",
                callback_data: "mp3"
              }
            ],
            [
              {
                text: "🔵 Tools",
                web_app: {
                  url: "https://tools-amertak.vercel.app"
                }
              }
            ]
          ]
        }
      }
    );
  }

  // ========================
  // SEND MEDIA
  // ========================

  const media = findMedia(data, action);

  if (!media) {
    return bot.sendMessage(
      chatId,
      "❌ Not found"
    );
  }

  return sendFile(chatId, media, data);
});