module.exports = (bot) => {

  bot.onText(/\/start/, async (msg) => {
    const userId   = msg.from.id;
    const userName = msg.from.first_name || "User";
    const webUrl   = process.env.WEB_URL || `https://${process.env.RENDER_SERVICE_NAME || "your-app"}.onrender.com`;

    const text = `
🔥 <b>AMERTAK DOWNLOADER BOT</b>
━━━━━━━━━━━━━━━━━━━━━━

👋 សួស្តី <b>${userName}</b>! ស្វាគមន៍មកកាន់ Bot!

<b>📌 របៀបប្រើប្រាស់:</b>
<b>1.</b> ចម្លង Link (YouTube, TikTok, IG...)
<b>2.</b> បិទភ្ជាប់ Link ក្នុង Chat នេះ
<b>3.</b> ជ្រើសរើស Format (Video / Image / Audio)
<b>4.</b> Bot ផ្ញើ File ដោយផ្ទាល់! ✅

<b>🌐 Platforms ដែល Support:</b>
├ 🎬 YouTube
├ 🎵 TikTok
├ 📸 Instagram
├ 🐦 Twitter / X
├ 📘 Facebook
├ 🎧 Spotify
├ 🎤 SoundCloud
├ 📌 Pinterest
├ 👽 Reddit
└ 🎮 Twitch, Vimeo, Dailymotion

<b>⚡ Commands:</b>
<code>/start</code> — ចាប់ផ្តើម Bot
<code>/history</code> — ប្រវត្តិ Download
<code>/help</code> — ជំនួយ

<i>💡 Bot Download File ដោយផ្ទាល់ — មិនចាំបាច់ចូល Browser!</i>
━━━━━━━━━━━━━━━━━━━━━━
`.trim();

    await bot.sendMessage(msg.chat.id, text, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🛠 Tools & Platforms",
              url: "https://t.me/share/url?url=https://github.com"
            },
            {
              text: "📊 Dashboard",
              web_app: { url: `${webUrl}?uid=${userId}` }
            }
          ]
        ]
      }
    });
  });

  // /help alias
  bot.onText(/\/help/, async (msg) => {
    const text = `
<b>❓ ជំនួយ / Help</b>
━━━━━━━━━━━━━━━━━━

<b>ផ្ញើ Link</b> → Bot រកប្រើ Format ឲ្យ
<b>ជ្រើស Format</b> → Video / Image / Audio
<b>Bot ផ្ញើ File</b> → ដោយផ្ទាល់ ✅

<b>📝 Note:</b>
• File >50MB → Bot ផ្ញើ Link Download
• Spotify → Audio Only (MP3)
• Pinterest → Image Download

<b>❌ Problems?</b>
ប្រាប់ Admin: @YourAdminUsername
`.trim();

    await bot.sendMessage(msg.chat.id, text, { parse_mode: "HTML" });
  });

  // /history shortcut
  bot.onText(/\/history/, async (msg) => {
    const { getHistory } = require("../db/store");
    const userId = msg.from.id;
    const records = getHistory(userId).slice(0, 10);

    if (!records.length) {
      return bot.sendMessage(msg.chat.id, "📭 មិនទាន់មាន Download History នៅឡើយ!");
    }

    const lines = records.map((r, i) => {
      const date = new Date(r.timestamp).toLocaleDateString("km-KH");
      return `<b>${i + 1}.</b> [${r.platform}] ${r.format?.toUpperCase()} — <i>${r.title?.slice(0, 30) || "No title"}</i>\n📅 ${date}`;
    });

    await bot.sendMessage(
      msg.chat.id,
      `<b>📂 Download History (10 ចុងក្រោយ)</b>\n━━━━━━━━━━━━━━\n\n` + lines.join("\n\n"),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "📊 Open Full Dashboard", callback_data: `dashboard:${userId}` }
          ]]
        }
      }
    );
  });
};
