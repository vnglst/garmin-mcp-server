#!/usr/bin/env node

import { GarminConnect } from "garmin-connect";
import sqlite3Pkg from "sqlite3";
const sqlite3 = sqlite3Pkg.verbose();
import fs from "fs";
import path from "path";
import { loadEnvFile } from "../src/utils/env-loader.js";

interface SchemaColumn {
  dbKey: string;
  dbType: string;
  garminKey: string;
}

const activitySchema: SchemaColumn[] = [
  { dbKey: "activity_id", dbType: "INTEGER PRIMARY KEY", garminKey: "activityId" },
  { dbKey: "activity_name", dbType: "TEXT", garminKey: "activityName" },
  { dbKey: "description", dbType: "TEXT", garminKey: "description" },
  { dbKey: "start_time_local", dbType: "TEXT", garminKey: "startTimeLocal" },
  { dbKey: "activity_type_key", dbType: "TEXT", garminKey: "activityType.typeKey" },
  { dbKey: "location_name", dbType: "TEXT", garminKey: "locationName" },
  { dbKey: "distance", dbType: "REAL", garminKey: "distance" },
  { dbKey: "duration", dbType: "INTEGER", garminKey: "duration" },
  { dbKey: "calories", dbType: "INTEGER", garminKey: "calories" },
  { dbKey: "average_hr", dbType: "INTEGER", garminKey: "averageHR" },
  { dbKey: "max_hr", dbType: "INTEGER", garminKey: "maxHR" },
  { dbKey: "vo2_max", dbType: "REAL", garminKey: "vO2MaxValue" },
  { dbKey: "avg_stride_length", dbType: "REAL", garminKey: "avgStrideLength" },
  { dbKey: "max_stride_length", dbType: "REAL", garminKey: "maxStrideLength" },
  { dbKey: "training_effect", dbType: "REAL", garminKey: "trainingEffect" },
  { dbKey: "anaerobic_training_effect", dbType: "REAL", garminKey: "anaerobicTrainingEffect" },
  { dbKey: "aerobic_training_effect", dbType: "REAL", garminKey: "aerobicTrainingEffect" },
  { dbKey: "avg_vertical_oscillation", dbType: "REAL", garminKey: "avgVerticalOscillation" },
  { dbKey: "avg_ground_contact_time", dbType: "INTEGER", garminKey: "avgGroundContactTime" },
  { dbKey: "vertical_ratio", dbType: "REAL", garminKey: "verticalRatio" },
  { dbKey: "avg_fractional_cadence", dbType: "REAL", garminKey: "avgFractionalCadence" },
  { dbKey: "max_fractional_cadence", dbType: "REAL", garminKey: "maxFractionalCadence" },
  { dbKey: "avg_power", dbType: "INTEGER", garminKey: "avgPower" },
  { dbKey: "max_power", dbType: "INTEGER", garminKey: "maxPower" },
  { dbKey: "grit", dbType: "REAL", garminKey: "grit" },
  { dbKey: "flow", dbType: "REAL", garminKey: "flow" },
  { dbKey: "avg_running_cadence_spm", dbType: "INTEGER", garminKey: "averageRunningCadenceInStepsPerMinute" },
  { dbKey: "max_running_cadence_spm", dbType: "INTEGER", garminKey: "maxRunningCadenceInStepsPerMinute" },
];

const getNested = (obj: any, path: string): any => {
  if (!path) return obj;
  const keys = path.split(".");
  return keys.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
};

function initializeDatabase(): Promise<sqlite3Pkg.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database("data/garmin-data.db", (err) => {
      if (err) {
        console.error("Error opening database:", err);
        return reject(err);
      }
    });

    db.serialize(() => {
      const columns = activitySchema.map((col) => `${col.dbKey} ${col.dbType}`).join(",\n          ");
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS activities (
          ${columns}
        )
      `;

      db.run(createTableSql, (err) => {
        if (err) {
          console.error("Error creating activities table:", err);
          reject(err);
        } else {
          console.log("✅ Activities table ready");
          resolve(db);
        }
      });
    });
  });
}

function getLatestActivityDate(db: sqlite3Pkg.Database): Promise<Date | null> {
  return new Promise((resolve) => {
    db.get("SELECT MAX(start_time_local) as latest_date FROM activities", (err, row: any) => {
      if (err || !row.latest_date) {
        resolve(null);
      } else {
        resolve(new Date(row.latest_date));
      }
    });
  });
}

function getActivitiesCount(db: sqlite3Pkg.Database): Promise<number> {
  return new Promise((resolve) => {
    db.get("SELECT COUNT(*) as count FROM activities", (err, row: any) => {
      if (err) {
        resolve(0);
      } else {
        resolve(row.count || 0);
      }
    });
  });
}

function saveActivities(db: sqlite3Pkg.Database, activities: any[]): Promise<number> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION", (err) => {
        if (err) {
          return reject(new Error("Failed to begin transaction", { cause: err }));
        }

        const dbKeys = activitySchema.map((col) => col.dbKey).join(", ");
        const placeholders = activitySchema.map(() => "?").join(", ");
        const insertSql = `INSERT OR REPLACE INTO activities (${dbKeys}) VALUES (${placeholders})`;
        const stmt = db.prepare(insertSql);

        let saved = 0;
        let errors = 0;

        activities.forEach((activity) => {
          const params = activitySchema.map((col) => getNested(activity, col.garminKey));

          stmt.run(params, (err) => {
            if (err) {
              errors++;
              console.error(`Error saving activity ${activity.activityId}:`, err.message);
            } else {
              saved++;
            }
          });
        });

        stmt.finalize((err) => {
          if (err) {
            return db.run("ROLLBACK", () => {
              reject(new Error("Failed to finalize statement", { cause: err }));
            });
          }

          if (errors > 0) {
            return db.run("ROLLBACK", () => {
              reject(new Error(`${errors} activities failed to save.`));
            });
          }

          db.run("COMMIT", (commitErr) => {
            if (commitErr) {
              return db.run("ROLLBACK", () => {
                reject(new Error("Failed to commit transaction", { cause: commitErr }));
              });
            }
            console.log(`💾 Saved ${saved} activities, ${errors} errors`);
            resolve(saved);
          });
        });
      });
    });
  });
}

async function main() {
  try {
    console.log("🏃‍♂️ Garmin Activities Download - Simplified Version");
    console.log("==================================================");

    loadEnvFile();

    if (!process.env.GARMIN_USERNAME || !process.env.GARMIN_PASSWORD) {
      throw new Error("Missing GARMIN_USERNAME or GARMIN_PASSWORD in environment variables");
    }

    console.log("📊 Setting up database...");
    const db = await initializeDatabase();

    const existingCount = await getActivitiesCount(db);
    const latestDate = await getLatestActivityDate(db);

    console.log(`📈 Current database has ${existingCount} activities`);
    if (latestDate) {
      const daysSinceLatest = Math.round((new Date().getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`📅 Latest activity: ${latestDate.toDateString()} (${daysSinceLatest} days ago)`);
    }

    console.log("🔐 Connecting to Garmin Connect...");
    const gc = new GarminConnect({
      username: process.env.GARMIN_USERNAME,
      password: process.env.GARMIN_PASSWORD,
    });

    await gc.login();
    console.log("✅ Successfully logged in to Garmin Connect");

    console.log("📥 Downloading new activities with pagination...");

    let newActivities: any[] = [];
    let start = 0;
    const limit = 100;
    let keepGoing = true;

    while (keepGoing) {
      console.log(`📥 Fetching activities from index ${start}...`);
      const activities = await gc.getActivities(start, limit);

      if (activities && activities.length > 0) {
        const latestActivityDate = await getLatestActivityDate(db);
        let stopNextTime = false;

        for (const activity of activities) {
          if (latestActivityDate && new Date(activity.startTimeLocal) <= latestActivityDate) {
            stopNextTime = true;
            break;
          }
          newActivities.push(activity);
        }

        if (stopNextTime) {
          keepGoing = false;
        } else {
          start += limit;
        }
      } else {
        keepGoing = false;
      }
    }

    if (newActivities.length > 0) {
      console.log(`📦 Downloaded ${newActivities.length} new activities.`);
      await saveActivities(db, newActivities);
    } else {
      console.log("✅ Activities are already up to date.");
    }

    const finalCount = await getActivitiesCount(db);
    console.log(`📊 Database now contains ${finalCount} total activities`);

    db.close();
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
