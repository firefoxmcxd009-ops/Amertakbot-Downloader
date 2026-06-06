module.exports = (url = "") => {
  
  url = url.toLowerCase();
  
  if (
    url.includes("youtube.com") ||
    url.includes("youtu.be")
  ) {
    return "YouTube";
  }
  
  if (url.includes("tiktok.com")) {
    return "TikTok";
  }
  
  if (url.includes("spotify.com")) {
    return "Spotify";
  }
  
  if (
    url.includes("pinterest.com") ||
    url.includes("pin.it")
  ) {
    return "Pinterest";
  }
  
  return null;
};