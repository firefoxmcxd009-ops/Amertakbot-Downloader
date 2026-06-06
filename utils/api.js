const axios = require("axios");

require("dotenv").config();

exports.fetchData = async (url) => {
  
  const response = await axios.get(
    `${process.env.BASE_URL}/api`,
    {
      params: { url },
      
      headers: {
        "x-api-key": process.env.API_KEY
      }
    }
  );
  
  return response.data;
};