#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

// Manual environment file loading to avoid console output from dotenv
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
    // Silently continue if .env file cannot be loaded
  }
}

// Simple database service for activities only
class ActivityDatabaseService {
  private dbPath: string;

  constructor(dbPath: string = "activities.db") {
    this.dbPath = path.resolve(dbPath);
  }

  private async getDatabase(): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          reject(new Error(`Failed to open database: ${err.message}`));
          return;
        }
        resolve(db);
      });
    });
  }

  private async closeDatabase(db: sqlite3.Database): Promise<void> {
    return new Promise((resolve) => {
      db.close(() => resolve());
    });
  }

  async getActivities(
    startDate?: string,
    endDate?: string,
    limit: number = 50,
    sort: "ASC" | "DESC" = "DESC"
  ): Promise<any[]> {
    const db = await this.getDatabase();

    try {
      return new Promise((resolve, reject) => {
        let sql = `
          SELECT 
            activity_id as id,
            activity_name as name,
            date(start_time_local) as date,
            activity_type_key as type,
            ROUND(distance / 1000.0, 2) as distance_km,
            CASE 
              WHEN duration >= 3600 THEN 
                printf('%d:%02d:%02d', duration / 3600, (duration % 3600) / 60, duration % 60)
              ELSE 
                printf('%d:%02d', duration / 60, duration % 60)
            END as duration,
            CASE 
              WHEN distance > 0 THEN 
                printf('%d:%02d', (duration * 1000 / distance) / 60, (duration * 1000 / distance) % 60)
              ELSE '0:00'
            END as pace_per_km,
            calories,
            average_hr as avg_heart_rate,
            max_hr as max_heart_rate,
            location_name,
            description
          FROM activities 
          WHERE 1=1
        `;

        const params: any[] = [];

        // Date filters
        if (startDate) {
          sql += ` AND date(start_time_local) >= ?`;
          params.push(startDate);
        }
        if (endDate) {
          sql += ` AND date(start_time_local) <= ?`;
          params.push(endDate);
        }

        // Sort by date and limit
        sql += ` ORDER BY start_time_local ${sort === "ASC" ? "ASC" : "DESC"} LIMIT ?`;
        params.push(limit);

        db.all(sql, params, (err, rows) => {
          if (err) {
            reject(new Error(`Database query error: ${err.message}`));
            return;
          }
          resolve(rows || []);
        });
      });
    } finally {
      await this.closeDatabase(db);
    }
  }
}

// Function to check if database needs updating
async function shouldUpdateDatabase(): Promise<boolean> {
  return new Promise((resolve) => {
    const dbPath = "activities.db";

    if (!fs.existsSync(dbPath)) {
      console.error("📁 Database not found, will create it");
      resolve(true);
      return;
    }

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error("⚠️ Cannot read database, will update");
        resolve(true);
        return;
      }

      db.get("SELECT MAX(start_time_local) as latest_date FROM activities", (err, row: any) => {
        db.close();

        if (err || !row.latest_date) {
          console.error("📊 No activities found, will download");
          resolve(true);
          return;
        }

        const latestDate = new Date(row.latest_date);
        const now = new Date();
        const hoursSinceLatest = (now.getTime() - latestDate.getTime()) / (1000 * 60 * 60);

        // Update if latest activity is more than 6 hours old
        const needsUpdate = hoursSinceLatest > 6;

        if (needsUpdate) {
          console.error(`📅 Latest activity is ${Math.round(hoursSinceLatest)} hours old, updating database`);
        } else {
          console.error(
            `✅ Database is fresh (latest activity ${Math.round(hoursSinceLatest)} hours ago), skipping update`
          );
        }

        resolve(needsUpdate);
      });
    });
  });
}

// Function to run the download script
async function updateDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.error("🔄 Updating activity database...");

    const downloadScript = path.resolve("download-activities.js");
    if (!fs.existsSync(downloadScript)) {
      console.error("⚠️ Download script not found, skipping database update");
      resolve();
      return;
    }

    const child = spawn("node", [downloadScript], {
      stdio: ["inherit", "pipe", "pipe"], // Capture stdout and stderr to prevent mixing with MCP output
      cwd: process.cwd(),
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.error("✅ Database update completed successfully");
        resolve();
      } else {
        console.error(`⚠️ Database update failed with code ${code}, continuing with existing data`);
        resolve(); // Don't reject - continue with existing data
      }
    });

    child.on("error", (error) => {
      console.error(`⚠️ Database update error: ${error.message}, continuing with existing data`);
      resolve(); // Don't reject - continue with existing data
    });
  });
}

async function main() {
  try {
    // Load environment variables manually
    loadEnvFile();
    console.error("Environment variables loaded");

    // Check if database needs updating and update if necessary
    if (await shouldUpdateDatabase()) {
      await updateDatabase();
    }

    // Initialize the MCP server
    const server = new McpServer({
      name: "garmin-mcp-server",
      version: "1.0.0",
    });

    // Initialize database service
    let dbService: ActivityDatabaseService;
    try {
      dbService = new ActivityDatabaseService();
      console.error("Database service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize database service:", error);
      process.exit(1);
    }

    // Single tool: Get activities with date filtering
    server.registerTool(
      "get-activities",
      {
        title: "Get Activities",
        description: "Retrieve activities with optional date filtering",
        inputSchema: {
          startDate: z.string().optional().describe("Start date in YYYY-MM-DD format"),
          endDate: z.string().optional().describe("End date in YYYY-MM-DD format"),
          limit: z.number().min(1).max(500).optional().default(50).describe("Maximum number of results"),
          sort: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Sort order for activities"),
        },
      },
      async (args) => {
        try {
          const activities = await dbService.getActivities(
            args.startDate,
            args.endDate,
            args.limit || 50,
            args.sort || "DESC"
          );

          if (activities.length === 0) {
            return {
              content: [{ type: "text", text: "No activities found for the specified criteria." }],
            };
          }

          const totalDistance = activities.reduce((sum: number, activity: any) => sum + (activity.distance_km || 0), 0);
          const totalCalories = activities.reduce((sum: number, activity: any) => sum + (activity.calories || 0), 0);

          // Group activities by type for summary
          const typeGroups = activities.reduce((groups: any, activity: any) => {
            const type = activity.type || "unknown";
            if (!groups[type]) groups[type] = [];
            groups[type].push(activity);
            return groups;
          }, {});

          const activitiesText = activities
            .map((activity: any) => {
              const parts = [
                `**${activity.date}**`,
                activity.name || activity.type,
                activity.distance_km ? `${activity.distance_km}km` : null,
                activity.duration || null,
                activity.pace_per_km && activity.distance_km > 0 ? `${activity.pace_per_km}/km` : null,
                activity.calories ? `${activity.calories} cal` : null,
                activity.avg_heart_rate ? `❤️ ${activity.avg_heart_rate} bpm` : null,
                activity.location_name || null,
              ].filter(Boolean);

              return parts.join(" | ");
            })
            .join("\n");

          const typesSummary = Object.entries(typeGroups)
            .map(([type, activities]: [string, any]) => `${type}: ${activities.length}`)
            .join(", ");

          const dateRange =
            activities.length > 0 ? `${activities[activities.length - 1].date} to ${activities[0].date}` : "N/A";

          const summary = `
🏃‍♂️ **Activities Summary**
📅 Date Range: ${dateRange}
📊 Found: ${activities.length} activities
📏 Total Distance: ${totalDistance.toFixed(2)} km
🔥 Total Calories: ${totalCalories}
📈 Average Distance: ${activities.length > 0 ? (totalDistance / activities.length).toFixed(2) : 0} km
🏃 Activity Types: ${typesSummary}

**Activities:**
${activitiesText}
          `;

          return {
            content: [{ type: "text", text: summary.trim() }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving activities: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    console.error("Registered 1 tool: get-activities");

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Garmin MCP Server running on stdio");
    console.error("Ready to receive requests from Claude Desktop");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle cleanup and errors
process.on("SIGINT", async () => {
  console.error("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  if ((error as any).code === "EPIPE") {
    process.exit(0);
  } else {
    console.error("Uncaught exception:", error);
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
