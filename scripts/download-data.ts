#!/usr/bin/env node

import { loadEnvFile } from "../src/utils/env-loader.js";
import { GarminSyncService } from "../src/services/garmin-sync-service.js";

async function main() {
  try {
    console.log("🏃‍♂️ Garmin Activities Download");
    console.log("==================================================");

    loadEnvFile();

    if (!process.env.GARMIN_USERNAME || !process.env.GARMIN_PASSWORD) {
      throw new Error("Missing GARMIN_USERNAME or GARMIN_PASSWORD in environment variables");
    }

    console.log("📊 Syncing activities from Garmin Connect...");

    const syncService = new GarminSyncService();
    const result = await syncService.syncActivities();

    if (result.error) {
      throw new Error(result.error);
    }

    if (result.newActivitiesCount > 0) {
      console.log(`📦 Downloaded ${result.newActivitiesCount} new activities.`);
    } else {
      console.log("✅ Activities are already up to date.");
    }

    console.log(`📊 Database now contains ${result.totalActivities} total activities`);
    if (result.latestActivityDate) {
      const daysSinceLatest = Math.round(
        (new Date().getTime() - result.latestActivityDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      console.log(`📅 Latest activity: ${result.latestActivityDate.toDateString()} (${daysSinceLatest} days ago)`);
    }

    console.log("✅ Download completed successfully");
  } catch (error) {
    console.error("❌ Download failed:", (error as Error).message);
    if ((error as Error).stack) {
      console.error("Stack trace:", (error as Error).stack);
    }
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  console.log("\n⚠️ Download interrupted by user");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled rejection:", reason);
  process.exit(1);
});

main();
