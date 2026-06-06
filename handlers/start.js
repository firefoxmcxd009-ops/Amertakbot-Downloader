module.exports = (bot) => {
  
  bot.onText(/\/start/, async (msg) => {
    
    const text = `
🔥 ALL IN ONE DOWNLOADER BOT

Supported Platforms:
• YouTube
• TikTok
• Spotify
• Pinterest

Send any supported URL.
    `;
    
    bot.sendMessage(
      msg.chat.id,
      text
    );
  });
};