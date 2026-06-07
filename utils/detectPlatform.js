/**
 * Detect social/media platform from a URL string.
 * Returns platform key or null if unsupported.
 */
module.exports = (url = "") => {
  const u = url.toLowerCase().trim();

  if (u.includes("youtube.com") || u.includes("youtu.be"))  return "YouTube";
  if (u.includes("tiktok.com")  || u.includes("vm.tiktok")) return "TikTok";
  if (u.includes("instagram.com"))                           return "Instagram";
  if (u.includes("twitter.com") || u.includes("x.com"))     return "Twitter/X";
  if (u.includes("facebook.com")|| u.includes("fb.watch"))  return "Facebook";
  if (u.includes("spotify.com"))                             return "Spotify";
  if (u.includes("soundcloud.com"))                          return "SoundCloud";
  if (u.includes("pinterest.com")|| u.includes("pin.it"))   return "Pinterest";
  if (u.includes("reddit.com")  || u.includes("redd.it"))   return "Reddit";
  if (u.includes("twitch.tv"))                               return "Twitch";
  if (u.includes("dailymotion.com"))                         return "Dailymotion";
  if (u.includes("vimeo.com"))                               return "Vimeo";

  return null;
};
