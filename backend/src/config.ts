import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    PORT: z.coerce.number(),
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: z.string(),
    DATABASE_URL: z.string(),
    DISCORD_CLIENT_ID: z.string(),
    DISCORD_CLIENT_SECRET: z.string(),
    FRONTEND_URL: z.string(),
    DISCORD_WEBHOOK_URL: z.string(),
});

const env = envSchema.parse(process.env);

export const config = {
    port: env.PORT,
    betterAuthSecret: env.BETTER_AUTH_SECRET,
    betterAuthUrl: env.BETTER_AUTH_URL,
    databaseUrl: env.DATABASE_URL,
    discordClientId: env.DISCORD_CLIENT_ID,
    discordClientSecret: env.DISCORD_CLIENT_SECRET,
    frontendUrl: env.FRONTEND_URL,
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
};
