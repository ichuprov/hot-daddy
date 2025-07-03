import 'dotenv/config';

// Validate that all necessary environment variables are set
const requiredEnv = [
    'TOKEN', 
    'CLIENT_ID', 
    'GUILD_ID', 
    'ANNOUNCE_CHANNEL_ID', 
    'WELCOME_CHANNEL_ID', 
    'GROUP_CATEGORY_ID'
];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const config = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  announceChannelId: process.env.ANNOUNCE_CHANNEL_ID,
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID,
  groupCategoryId: process.env.GROUP_CATEGORY_ID,
};

export default config;