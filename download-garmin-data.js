#!/usr/bin/env node

import pkg from "garmin-connect";
const { GarminConnect } = pkg;
import sqlite3Pkg from "sqlite3";
const sqlite3 = sqlite3Pkg.verbose();
import fs from "fs";
import path from "path";

// Load environment variables manually
function loadEnvFile() {
  try {
    const envPath = ".env";
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, "utf8");
      const lines = envFile.split("\n");

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith("#")) {
          const [key, ...valueParts] = trimmedLine.split("=");
          if (key && valueParts.length > 0) {
            const value = valueParts.join("=").replace(/^["']|["']$/g, "");
            process.env[key.trim()] = value;
          }
        }
      }
    }
  } catch (error) {
    console.error("Warning: Could not load .env file:", error.message);
  }
}

// Database setup
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database("garmin-data.db", (err) => {
      if (err) {
        console.error("Error opening database:", err);
        return reject(err);
      }
    });

    db.serialize(() => {
      // Create activities table
      db.run(
        `
        CREATE TABLE IF NOT EXISTS activities (
          activity_id INTEGER PRIMARY KEY,
          activity_name TEXT,
          description TEXT,
          start_time_local TEXT,
          activity_type_key TEXT,
          distance REAL,
          duration INTEGER,
          average_hr INTEGER,
          max_hr INTEGER,
          calories INTEGER,
          location_name TEXT
        )
      `,
        (err) => {
          if (err) {
            console.error("Error creating activities table:", err);
            reject(err);
          } else {
            console.log("✅ Activities table ready");
            resolve(db);
          }
        }
      );
    });
  });
}

// Check if activities already exist in database
function getLatestActivityDate(db) {
  return new Promise((resolve) => {
    db.get("SELECT MAX(start_time_local) as latest_date FROM activities", (err, row) => {
      if (err || !row.latest_date) {
        resolve(null);
      } else {
        resolve(new Date(row.latest_date));
      }
    });
  });
}

// Get activities count
function getActivitiesCount(db) {
  return new Promise((resolve) => {
    db.get("SELECT COUNT(*) as count FROM activities", (err, row) => {
      if (err) {
        resolve(0);
      } else {
        resolve(row.count || 0);
      }
    });
  });
}

// Save activities to database
function saveActivities(db, activities) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION", (err) => {
        if (err) {
          return reject(new Error("Failed to begin transaction", { cause: err }));
        }

        const stmt = db.prepare(`
          INSERT OR REPLACE INTO activities (
            activity_id, activity_name, description, start_time_local,
            activity_type_key, distance, duration, average_hr, max_hr, calories, location_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let saved = 0;
        let errors = 0;

        activities.forEach((activity) => {
          stmt.run(
            [
              activity.activityId,
              activity.activityName,
              activity.description,
              activity.startTimeLocal,
              activity.activityType?.typeKey,
              activity.distance,
              activity.duration,
              activity.averageHR,
              activity.maxHR,
              activity.calories,
              activity.locationName,
            ],
            (err) => {
              if (err) {
                errors++;
                console.error(`Error saving activity ${activity.activityId}:`, err.message);
              } else {
                saved++;
              }
            }
          );
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

    // Load environment variables
    loadEnvFile();

    // Check for required credentials
    if (!process.env.GARMIN_USERNAME || !process.env.GARMIN_PASSWORD) {
      throw new Error("Missing GARMIN_USERNAME or GARMIN_PASSWORD in environment variables");
    }

    // Initialize database
    console.log("📊 Setting up database...");
    const db = await initializeDatabase();

    // Check existing data
    const existingCount = await getActivitiesCount(db);
    const latestDate = await getLatestActivityDate(db);

    console.log(`📈 Current database has ${existingCount} activities`);
    if (latestDate) {
      const daysSinceLatest = Math.round((new Date() - latestDate) / (1000 * 60 * 60 * 24));
      console.log(`📅 Latest activity: ${latestDate.toDateString()} (${daysSinceLatest} days ago)`);
    }

    // Connect to Garmin
    console.log("🔐 Connecting to Garmin Connect...");
    const gc = new GarminConnect({
      username: process.env.GARMIN_USERNAME,
      password: process.env.GARMIN_PASSWORD,
    });

    await gc.login();
    console.log("✅ Successfully logged in to Garmin Connect");

    // Download activities
    console.log("📥 Downloading new activities with pagination...");

    let newActivities = [];
    let start = 0;
    const limit = 100; // Sensible limit for each page
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
            break; // Stop processing this page
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

    // Final count
    const finalCount = await getActivitiesCount(db);
    console.log(`📊 Database now contains ${finalCount} total activities`);

    db.close();
    console.log("✅ Download completed successfully");
  } catch (error) {
    console.error("❌ Download failed:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
}

// Handle cleanup
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

// Start the download
main();
