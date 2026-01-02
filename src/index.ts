#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GarminDataService } from "./services/garmin-data-service.js";
import { GarminSyncService } from "./services/garmin-sync-service.js";
import { loadEnvFile } from "./utils/env-loader.js";

async function main() {
  try {
    loadEnvFile();
    console.error("Environment variables loaded");

    const server = new McpServer({
      name: "garmin-mcp-server",
      version: "1.0.0",
    });

    let dbService: GarminDataService;
    let syncService: GarminSyncService;
    try {
      dbService = new GarminDataService();
      syncService = new GarminSyncService();
      console.error("Database service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize database service:", error);
      process.exit(1);
    }

    server.registerTool(
      "get-schema",
      {
        title: "Get Database Schema",
        description: "Fetches the schema of the available tables in the database.",
        inputSchema: {},
      },
      async () => {
        try {
          const schema = await dbService.getSchema();
          const schemaText = schema
            .map((table: any) => `**Table: ${table.name}**\n\`\`\`sql\n${table.sql}\n\`\`\``)
            .join("\n\n");
          return {
            content: [{ type: "text", text: schemaText }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error fetching schema: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "run-query",
      {
        title: "Run SELECT Query",
        description: "Runs a SELECT query against the database.",
        inputSchema: {
          query: z.string().describe("The SELECT query to execute."),
        },
      },
      async (args) => {
        try {
          const results = await dbService.runQuery(args.query);
          if (results.length === 0) {
            return {
              content: [{ type: "text", text: "Query returned no results." }],
            };
          }
          const headers = Object.keys(results[0]);
          const headerLine = `| ${headers.join(" | ")} |`;
          const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;
          const bodyLines = results.map((row) => `| ${headers.map((h) => row[h]).join(" | ")} |`);
          const table = [headerLine, separatorLine, ...bodyLines].join("\n");

          return {
            content: [{ type: "text", text: table }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error running query: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "sync-activities",
      {
        title: "Sync Activities from Garmin",
        description: "Downloads and syncs new activities from Garmin Connect to the local database.",
        inputSchema: {},
      },
      async () => {
        try {
          const result = await syncService.syncActivities();

          if (result.error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error syncing activities: ${result.error}`,
                },
              ],
              isError: true,
            };
          }

          let message = "";
          if (result.newActivitiesCount > 0) {
            message = `Successfully synced ${result.newActivitiesCount} new activities.\n`;
            message += `Total activities in database: ${result.totalActivities}\n`;
            if (result.latestActivityDate) {
              message += `Latest activity: ${result.latestActivityDate.toLocaleDateString()}`;
            }
          } else {
            message = `No new activities found. Database is up to date.\n`;
            message += `Total activities: ${result.totalActivities}\n`;
            if (result.latestActivityDate) {
              message += `Latest activity: ${result.latestActivityDate.toLocaleDateString()}`;
            }
          }

          return {
            content: [{ type: "text", text: message }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error syncing activities: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerPrompt(
      "analyze-recent-training",
      {
        title: "Analyze Recent Training Load",
        description: "Analyze training load, intensity, and recovery over the last 7 days",
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Analyze my training over the last 7 days. Include:\n- Total training load and daily breakdown\n- Time spent in each heart rate zone\n- Average pace and total distance\n- Training effect (aerobic/anaerobic)\n- Recovery status based on training load distribution\n\nProvide insights and recommendations for the upcoming week.",
            },
          },
        ],
      })
    );

    server.registerPrompt(
      "pace-improvements",
      {
        title: "Track Pace Improvements",
        description: "Analyze how your running pace has improved over time",
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Analyze my pace improvements over the last 3 months. Compare:\n- Average pace trends over time\n- Fastest 5K, 10K splits progression\n- Pace at different heart rate zones\n- Moving pace vs. overall pace (rest time analysis)\n\nCreate a visualization or summary showing my progress.",
            },
          },
        ],
      })
    );

    server.registerPrompt(
      "heart-rate-analysis",
      {
        title: "Heart Rate Zone Distribution",
        description: "Analyze time spent in different heart rate zones and training intensity",
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Analyze my heart rate zone distribution over the last month:\n- Time spent in each HR zone (1-5)\n- Percentage breakdown of total training time\n- Correlation between HR zones and training effect\n- Whether my training is polarized (80/20 rule)\n- Recommendations for zone distribution based on training goals",
            },
          },
        ],
      })
    );

    server.registerPrompt(
      "personal-records",
      {
        title: "Find Personal Records",
        description: "Find your fastest times for different distances",
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Find my personal records:\n- Fastest 1K, 5K, 10K splits with dates\n- Highest VO2 max readings\n- Longest runs (distance and duration)\n- Most elevation gain in a single run\n- Best average pace for runs over 5K\n\nHighlight when these records were set and the conditions.",
            },
          },
        ],
      })
    );

    server.registerPrompt(
      "weekly-summary",
      {
        title: "Weekly Running Summary",
        description: "Get a comprehensive summary of the current week's running activities",
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Create a weekly summary for this week:\n- Total distance, duration, and number of runs\n- Total training load and average intensity\n- Total elevation gain\n- Average pace and heart rate\n- Time in each training zone\n- Comparison with previous week\n- Training consistency and recovery status",
            },
          },
        ],
      })
    );

    server.registerPrompt(
      "training-effect-analysis",
      {
        title: "Training Effect Analysis",
        description: "Analyze aerobic and anaerobic training effects over time",
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Analyze my training effects over the last month:\n- Distribution of aerobic vs. anaerobic training effect\n- Activities with highest training effect scores\n- Balance between aerobic base building and anaerobic intensity\n- Trends in training effect over time\n- Recommendations for balancing training stimulus",
            },
          },
        ],
      })
    );

    server.registerPrompt(
      "elevation-analysis",
      {
        title: "Elevation & Hill Running Analysis",
        description: "Analyze performance on hilly routes and elevation gain",
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Analyze my hill running and elevation performance:\n- Total elevation gain over time\n- Average elevation gain per run\n- Pace on high-elevation runs vs. flat runs\n- Maximum vertical speed achievements\n- Comparison of effort (HR) on hilly vs. flat terrain\n- Progress in climbing efficiency",
            },
          },
        ],
      })
    );

    server.registerPrompt(
      "running-form-metrics",
      {
        title: "Running Form Analysis",
        description: "Analyze running form metrics like cadence, stride length, ground contact time",
      },
      async () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Analyze my running form metrics:\n- Average and maximum cadence trends\n- Stride length patterns (avg and max)\n- Vertical oscillation analysis\n- Ground contact time\n- Vertical ratio efficiency\n- Form changes at different paces and fatigue levels\n- Recommendations for form improvements",
            },
          },
        ],
      })
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Garmin MCP Server running on stdio");
    console.error("Ready to receive requests from Claude Desktop");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

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

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
