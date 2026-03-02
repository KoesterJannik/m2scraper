import cron from "node-cron";
import { main as syncMarketData } from "./scripts/fetch-and-store-market-data";
import { refreshServerData } from "./services/market-data";
import { SERVERS } from "./config/servers";

/**
 * Start all cron jobs.
 * Call this once from server.ts after the server is up.
 */
export function startCronJobs() {
  // Run market sync every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    console.log(`\n⏰ [CRON] Market sync started at ${new Date().toISOString()}`);
    try {
      await syncMarketData();

      // Refresh the in-memory cache so the API serves fresh data
      for (const server of SERVERS) {
        refreshServerData(server.id);
      }

      console.log(`✅ [CRON] Market sync completed at ${new Date().toISOString()}\n`);
    } catch (error) {
      console.error(`❌ [CRON] Market sync failed:`, error);
    }
  });

  console.log("🕐 Cron jobs started — market sync runs every 5 minutes");
}
