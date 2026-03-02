import cron from "node-cron";
import { main as syncMarketData } from "./scripts/fetch-and-store-market-data";
import { refreshServerData, searchListings } from "./services/market-data";
import { SERVERS } from "./config/servers";
import { config } from "./config";
import { db } from "./db";
import { priceAlert } from "./db/schema";
import { eq } from "drizzle-orm";

const YANG_PER_WON = 100_000_000;

function formatWon(price: number): string {
  return price.toLocaleString("de-DE", { maximumFractionDigits: 4 });
}

function formatYang(wonPrice: number): string {
  const yang = wonPrice * YANG_PER_WON;
  if (yang >= 1_000_000_000) return `${(yang / 1_000_000_000).toFixed(1)} Mrd Yang`;
  if (yang >= 1_000_000) return `${(yang / 1_000_000).toFixed(1)} Mio Yang`;
  if (yang >= 1_000) return `${(yang / 1_000).toFixed(0)}K Yang`;
  return `${yang.toFixed(0)} Yang`;
}

/**
 * Send a message to a Discord channel via webhook.
 */
async function sendDiscordWebhook(content: string, embeds?: any[]) {
  if (!config.discordWebhookUrl) return;

  try {
    const body: any = {};
    if (content) body.content = content;
    if (embeds) body.embeds = embeds;

    await fetch(config.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("❌ Failed to send Discord webhook:", err);
  }
}

/**
 * Check all active price alerts against current market data.
 * Creates a message for each triggered alert + sends Discord notification.
 */
async function checkPriceAlerts() {
  const activeAlerts = await db
    .select()
    .from(priceAlert)
    .where(eq(priceAlert.active, true));

  if (activeAlerts.length === 0) return;

  console.log(`🔔 Checking ${activeAlerts.length} active price alerts...`);

  for (const alert of activeAlerts) {
    try {
      // Search current listings for this vnum on the specific server
      const result = searchListings({
        search: alert.vnum.toString(),
        serverId: alert.serverId,
        limit: 500,
      });
      if (result.items.length === 0) continue;

      // Find min price across all listings for this item on this server
      const minPrice = Math.min(...result.items.map(i => i.price));

      let triggered = false;

      if (alert.direction === "below" && minPrice <= alert.priceThreshold) {
        triggered = true;
      } else if (alert.direction === "above" && minPrice >= alert.priceThreshold) {
        triggered = true;
      }

      if (triggered) {
        // Don't spam: only trigger once per 30 minutes
        if (alert.lastTriggeredAt) {
          const msSinceLast = Date.now() - new Date(alert.lastTriggeredAt).getTime();
          if (msSinceLast < 30 * 60 * 1000) continue;
        }

        const directionText = alert.direction === "below" ? "dropped to" : "rose to";
        const serverName = SERVERS.find(s => s.id === alert.serverId)?.name || `Server ${alert.serverId}`;

        // Update last triggered timestamp
        await db
          .update(priceAlert)
          .set({ lastTriggeredAt: new Date() })
          .where(eq(priceAlert.id, alert.id));

        console.log(`  🔔 Alert triggered for ${alert.itemName} on ${serverName} — price ${directionText} ${formatWon(minPrice)} Won`);

        // Send Discord webhook notification
        const color = alert.direction === "below" ? 0x22c55e : 0xef4444; // green if below (good deal), red if above
        const emoji = alert.direction === "below" ? "📉" : "📈";

        await sendDiscordWebhook("", [
          {
            title: `${emoji} Price Alert: ${alert.itemName}`,
            description: `**${alert.itemName}** (VNUM \`${alert.vnum}\`) on **${serverName}**`,
            color,
            fields: [
              {
                name: "Current Price",
                value: `${formatWon(minPrice)} Won\n(${formatYang(minPrice)})`,
                inline: true,
              },
              {
                name: "Threshold",
                value: `${alert.direction === "below" ? "≤" : "≥"} ${formatWon(alert.priceThreshold)} Won`,
                inline: true,
              },
              {
                name: "Direction",
                value: alert.direction === "below" ? "Price dropped ↓" : "Price rose ↑",
                inline: true,
              },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: `Server: ${serverName}` },
          },
        ]);
      }
    } catch (err) {
      console.error(`  ❌ Error checking alert #${alert.id}:`, err);
    }
  }
}

/**
 * Start all cron jobs.
 * Call this once from server.ts after the server is up.
 */
export function startCronJobs() {
  // Run market sync every 5 minutes
  cron.schedule("*/10 * * * *", async () => {
    console.log(`\n⏰ [CRON] Market sync started at ${new Date().toISOString()}`);
    try {
      await syncMarketData();

      // Refresh the in-memory cache so the API serves fresh data
      for (const server of SERVERS) {
        refreshServerData(server.id);
      }

      console.log(`✅ [CRON] Market sync completed at ${new Date().toISOString()}`);

      // Check price alerts after data refresh
      await checkPriceAlerts();

      console.log(`✅ [CRON] All done at ${new Date().toISOString()}\n`);
    } catch (error) {
      console.error(`❌ [CRON] Market sync failed:`, error);
    }
  });

  console.log("🕐 Cron jobs started — market sync runs every 5 minutes");
  if (config.discordWebhookUrl) {
    console.log("📣 Discord webhook notifications enabled");
  } else {
    console.log("⚠️  No DISCORD_WEBHOOK_URL set — Discord notifications disabled");
  }
}
