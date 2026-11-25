import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'castino-dev-super-secret-key',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || '*',
  ENABLE_BOT_FEED: process.env.ENABLE_BOT_FEED === 'true',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'geoadmin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'geogeo2009',
};
