import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { config } from "./config";
import { account, session, user, verification } from "./db/schema";


export const auth = betterAuth({
    baseURL: config.betterAuthUrl,
    database: drizzleAdapter(db, {
        provider: "pg", // or "mysql", "sqlite",
        schema: {
            user: user,
            account: account,
            session: session,
            verification: verification,
        },
    }),
    socialProviders: { 
        discord: { 
          clientId: config.discordClientId as string, 
          clientSecret: config.discordClientSecret as string, 
        }, 
      },
      trustedOrigins: [config.frontendUrl as string],
});