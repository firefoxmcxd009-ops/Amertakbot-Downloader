const axios = require("axios");
require("dotenv").config();

/**
 * Fetch media metadata from the configured downloader API.
 * @param {string} url  - The social media URL to resolve
 * @returns {Promise<object>} - Normalized media data object
 */
exports.fetchData = async (url) => {
  const response = await axios.get(`${process.env.BASE_URL}/api`, {
    params:  { url },
    headers: { "x-api-key": process.env.API_KEY },
    timeout: 20000
  });
  return response.data;
};

/**
 * Normalize raw API response into a consistent shape.
 * Handles differences between platforms gracefully.
 */
exports.normalize = (raw) => {
  const data = raw?.data ?? raw;

  return {
    platform:    data.platform  || "Unknown",
    title:       data.title     || data.name  || "Untitled",
    author:      data.author    || data.artist || data.uploader || "Unknown",
    duration:    data.duration  || null,
    thumbnail:   data.thumbnail || data.cover  || data.image   || null,
    download: {
      video_hd:  data.download?.video_hd  || data.download?.hd   || null,
      video_sd:  data.download?.video_sd  || data.download?.sd   || null,
      video:     data.download?.video     || data.download?.mp4  || null,
      audio:     data.download?.audio     || data.download?.mp3  || null,
      image:     data.download?.image     || data.download?.img  || null,
      // Some APIs return images as array (e.g. Pinterest albums)
      images:    data.download?.images    || null
    }
  };
};
