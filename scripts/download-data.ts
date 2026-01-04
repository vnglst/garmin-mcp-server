#!/usr/bin/env node

import { loadEnvFile } from "../src/utils/env-loader.js";
import { GarminSyncService } from "../src/services/garmin-sync-service.js";

async function main() {
  console.log("Garmin Activities Download");
  console.log("==================================================");

  loadEnvFile();

  const syncService = new GarminSyncService();
  const result = await syncService.syncActivities();

  if (result.error) {
    console.error("Download failed:", result.error);
    process.exit(1);
  }

  if (result.newActivitiesCount > 0) {
    console.log(`Downloaded ${result.newActivitiesCount} new activities.`);
  } else {
    console.log("Activities are already up to date.");
  }

  console.log(`Database now contains ${result.totalActivities} total activities`);

  if (result.latestActivityDate) {
    const daysSinceLatest = Math.round(
      (Date.now() - result.latestActivityDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    console.log(`Latest activity: ${result.latestActivityDate.toDateString()} (${daysSinceLatest} days ago)`);
  }

  console.log("Download completed successfully");
}

main();
