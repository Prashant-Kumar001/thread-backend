import dotenv from 'dotenv';
dotenv.config();

export const {
  PORT,
  MONGO_URI,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_EXPIRES = '15m',
  REFRESH_EXPIRES = '7d',
  HMAC_REFRESH_SALT,
  OPENAI_API_KEY,
} = process.env;

export const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; 
// Pʀᴀsʜᴀɴᴛ