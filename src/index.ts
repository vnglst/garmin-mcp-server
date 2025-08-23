#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  GarminService,
  RunWorkout,
  DetailedRunWorkout,
  RunningStats,
  FitnessMetrics,
  HistoricRunsQuery,
} from "./garmin-service.js";
import fs from "fs";

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

async function main() {
  try {
    // Load environment variables manually (avoid dotenv console output)
    loadEnvFile();
    console.error("Environment variables loaded");

    // Initialize the MCP server
    const server = new McpServer({
      name: "garmin-mcp-server",
      version: "1.0.0",
    });

    // Initialize Garmin service with error handling
    let garminService: GarminService;
    try {
      garminService = new GarminService();
      console.error("Garmin service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Garmin service:", error);
      process.exit(1);
    }

    // Register tools for Garmin workout data
    server.registerTool(
      "get-recent-runs",
      {
        title: "Get Recent Running Workouts",
        description: "Retrieve your recent running workouts from Garmin",
        inputSchema: {
          limit: z
            .number()
            .min(1)
            .max(50)
            .default(10)
            .optional()
            .describe("Number of recent runs to retrieve (1-50, default: 10)"),
        },
      },
      async ({ limit = 10 }) => {
        try {
          const runs = await garminService.getRecentActivities(limit);

          if (runs.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "No recent running workouts found. Make sure your Garmin device is synced and you have completed some runs.",
                },
              ],
            };
          }

          const runsText = runs
            .map(
              (run: RunWorkout) => `
**Run on ${run.date}**
- Distance: ${run.distance} km
- Duration: ${run.duration}
- Pace: ${run.pace}/km
- Calories: ${run.calories}
- Avg HR: ${run.avgHeartRate ? run.avgHeartRate + " bpm" : "N/A"}
- Max HR: ${run.maxHeartRate ? run.maxHeartRate + " bpm" : "N/A"}
${run.notes ? "- Notes: " + run.notes : ""}
        `
            )
            .join("\n---\n");

          return {
            content: [
              {
                type: "text",
                text: `Found ${runs.length} recent running workout${runs.length > 1 ? "s" : ""}:\n\n${runsText}`,
              },
            ],
          };
        } catch (error) {
          console.error("Error in get-recent-runs tool:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving runs: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "get-run-details",
      {
        title: "Get Detailed Run Information",
        description: "Get detailed information about a specific running workout",
        inputSchema: {
          runId: z.string().describe("The ID of the specific run to retrieve details for"),
        },
      },
      async ({ runId }: { runId: string }) => {
        try {
          const runDetails = await garminService.getRunDetails(runId);

          if (!runDetails) {
            return {
              content: [
                {
                  type: "text",
                  text: `Run with ID "${runId}" not found.`,
                },
              ],
              isError: true,
            };
          }

          const detailsText = `
**Detailed Run Information**

**Basic Stats:**
- Date: ${runDetails.date}
- Distance: ${runDetails.distance} km
- Duration: ${runDetails.duration}
- Average Pace: ${runDetails.pace}/km
- Calories Burned: ${runDetails.calories}

**Heart Rate:**
- Average: ${runDetails.avgHeartRate ? runDetails.avgHeartRate + " bpm" : "N/A"}
- Maximum: ${runDetails.maxHeartRate ? runDetails.maxHeartRate + " bpm" : "N/A"}
- Zones: ${runDetails.heartRateZones ? runDetails.heartRateZones : "N/A"}

**Performance:**
- Elevation Gain: ${runDetails.elevationGain ? runDetails.elevationGain + " m" : "N/A"}
- Temperature: ${runDetails.temperature ? runDetails.temperature + "°C" : "N/A"}

**GPS Data:**
- Start Location: ${runDetails.startLocation || "N/A"}
- Route: ${runDetails.route ? "Available" : "N/A"}

${runDetails.notes ? "**Notes:** " + runDetails.notes : ""}
${runDetails.splits ? "**Splits:** Available (" + runDetails.splits.length + " splits)" : ""}
        `;

          return {
            content: [
              {
                type: "text",
                text: detailsText.trim(),
              },
            ],
          };
        } catch (error) {
          console.error("Error in get-run-details tool:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving run details: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "get-running-stats",
      {
        title: "Get Running Statistics",
        description: "Get aggregated running statistics for a specified time period",
        inputSchema: {
          period: z
            .enum(["week", "month", "quarter", "year"])
            .default("month")
            .describe("Time period for statistics (week, month, quarter, year)"),
          date: z
            .string()
            .optional()
            .describe("Specific date to start the period from (YYYY-MM-DD format, defaults to current date)"),
        },
      },
      async ({ period = "month", date }: { period?: "week" | "month" | "quarter" | "year"; date?: string }) => {
        try {
          const stats = await garminService.getRunningStats(period, date);

          const statsText = `
**Running Statistics (${period})**
${date ? `Period: ${stats.periodStart} to ${stats.periodEnd}` : `Current ${period}`}

**Volume:**
- Total Runs: ${stats.totalRuns}
- Total Distance: ${stats.totalDistance} km
- Total Time: ${stats.totalTime}
- Average Distance per Run: ${stats.avgDistance} km

**Performance:**
- Average Pace: ${stats.avgPace}/km
- Best Pace: ${stats.bestPace}/km
- Total Calories: ${stats.totalCalories}

**Heart Rate:**
- Average HR: ${stats.avgHeartRate ? stats.avgHeartRate + " bpm" : "N/A"}
- Max HR: ${stats.maxHeartRate ? stats.maxHeartRate + " bpm" : "N/A"}

**Progress:**
- Longest run: ${stats.longestRun} km
- Fastest run: ${stats.fastestPace}/km
        `;

          return {
            content: [
              {
                type: "text",
                text: statsText.trim(),
              },
            ],
          };
        } catch (error) {
          console.error("Error in get-running-stats tool:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving running statistics: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "get-fitness-metrics",
      {
        title: "Get Fitness Metrics",
        description:
          "Retrieve fitness metrics including VO2 Max, fitness age, lactate threshold, and other performance indicators",
        inputSchema: {},
      },
      async () => {
        try {
          const metrics = await garminService.getFitnessMetrics();

          const metricsText = `
**Fitness Metrics**

**Aerobic Fitness:**
- VO2 Max: ${metrics.vo2Max ? metrics.vo2Max + " ml/kg/min" : "N/A"}
- Fitness Age: ${metrics.fitnessAge ? metrics.fitnessAge + " years" : "N/A"}

**Heart Rate:**
- Resting HR: ${metrics.restingHeartRate ? metrics.restingHeartRate + " bpm" : "N/A"}
- Max HR: ${metrics.maxHeartRate ? metrics.maxHeartRate + " bpm" : "N/A"}

**Performance Thresholds:**
- Lactate Threshold HR: ${metrics.lactateThreshold?.heartRate ? metrics.lactateThreshold.heartRate + " bpm" : "N/A"}
- Lactate Threshold Pace: ${metrics.lactateThreshold?.pace ? metrics.lactateThreshold.pace + "/km" : "N/A"}
- Functional Threshold Power: ${metrics.functionalThresholdPower ? metrics.functionalThresholdPower + " watts" : "N/A"}

**Last Updated:** ${metrics.lastMeasuredDate || "N/A"}
        `;

          return {
            content: [
              {
                type: "text",
                text: metricsText.trim(),
              },
            ],
          };
        } catch (error) {
          console.error("Error in get-fitness-metrics tool:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving fitness metrics: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "get-historic-runs",
      {
        title: "Get Historic Running Data",
        description: "Retrieve running activities from a specific date range with optional filters",
        inputSchema: {
          startDate: z.string().describe("Start date in YYYY-MM-DD format"),
          endDate: z.string().describe("End date in YYYY-MM-DD format"),
          activityType: z
            .enum(["all", "running", "trail_running", "treadmill_running", "track_running"])
            .optional()
            .default("running")
            .describe("Type of running activity to filter"),
          minDistance: z.number().optional().describe("Minimum distance in kilometers"),
          maxDistance: z.number().optional().describe("Maximum distance in kilometers"),
          minDuration: z.number().optional().describe("Minimum duration in seconds"),
          maxDuration: z.number().optional().describe("Maximum duration in seconds"),
          limit: z.number().min(1).max(200).optional().default(50).describe("Maximum number of results to return"),
        },
      },
      async ({
        startDate,
        endDate,
        activityType = "running",
        minDistance,
        maxDistance,
        minDuration,
        maxDuration,
        limit = 50,
      }) => {
        try {
          const query: HistoricRunsQuery = {
            startDate,
            endDate,
            activityType,
            minDistance,
            maxDistance,
            minDuration,
            maxDuration,
            limit,
          };

          const runs = await garminService.getHistoricRuns(query);

          if (runs.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No running activities found between ${startDate} and ${endDate} matching your criteria.`,
                },
              ],
            };
          }

          const runsText = runs
            .map(
              (run: RunWorkout) => `
**${run.date}** | ${run.distance}km | ${run.duration} | ${run.pace}/km | ${run.calories} cal
${run.avgHeartRate ? `❤️ ${run.avgHeartRate} bpm` : ""} ${run.notes ? `📝 ${run.notes}` : ""}
            `
            )
            .join("\n");

          const summary = `
**Historic Runs Summary**
📅 Period: ${startDate} to ${endDate}
🏃 Found: ${runs.length} runs
📏 Total Distance: ${runs.reduce((sum: number, run: RunWorkout) => sum + run.distance, 0).toFixed(2)} km
🔥 Total Calories: ${runs.reduce((sum: number, run: RunWorkout) => sum + run.calories, 0)}
${activityType !== "all" ? `🎯 Activity Type: ${activityType}` : ""}
${minDistance ? `📊 Min Distance: ${minDistance}km` : ""}
${maxDistance ? `📊 Max Distance: ${maxDistance}km` : ""}

**Activities:**
${runsText}
          `;

          return {
            content: [
              {
                type: "text",
                text: summary.trim(),
              },
            ],
          };
        } catch (error) {
          console.error("Error in get-historic-runs tool:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving historic runs: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "get-runs-by-date-range",
      {
        title: "Get Runs by Date Range",
        description: "Simple date range query for running activities (convenience method)",
        inputSchema: {
          startDate: z.string().describe("Start date in YYYY-MM-DD format"),
          endDate: z.string().describe("End date in YYYY-MM-DD format"),
          limit: z.number().min(1).max(100).optional().default(50).describe("Maximum number of results"),
        },
      },
      async ({ startDate, endDate, limit = 50 }) => {
        try {
          const runs = await garminService.getRunsByDateRange(startDate, endDate, limit);

          if (runs.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No runs found between ${startDate} and ${endDate}.`,
                },
              ],
            };
          }

          const totalDistance = runs.reduce((sum: number, run: RunWorkout) => sum + run.distance, 0);
          const totalCalories = runs.reduce((sum: number, run: RunWorkout) => sum + run.calories, 0);

          const runsText = runs
            .map(
              (run: RunWorkout) => `
**${run.date}**
- Distance: ${run.distance} km
- Duration: ${run.duration}
- Pace: ${run.pace}/km
- Calories: ${run.calories}
${run.avgHeartRate ? `- Avg HR: ${run.avgHeartRate} bpm` : ""}
${run.notes ? `- Notes: ${run.notes}` : ""}
            `
            )
            .join("\n---\n");

          const summary = `
**Runs from ${startDate} to ${endDate}**

📊 **Summary:**
- Total Runs: ${runs.length}
- Total Distance: ${totalDistance.toFixed(2)} km
- Total Calories: ${totalCalories}
- Average Distance: ${(totalDistance / runs.length).toFixed(2)} km

${runsText}
          `;

          return {
            content: [
              {
                type: "text",
                text: summary.trim(),
              },
            ],
          };
        } catch (error) {
          console.error("Error in get-runs-by-date-range tool:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving runs by date range: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "get-all-historical-runs",
      {
        title: "Get All Historical Running Data",
        description:
          "Retrieve ALL running activities going back to a specific year (for users with extensive historical data)",
        inputSchema: {
          startYear: z
            .number()
            .min(2010)
            .max(2030)
            .optional()
            .default(2020)
            .describe("Starting year to fetch data from (default: 2020)"),
          limit: z
            .number()
            .min(50)
            .max(2000)
            .optional()
            .default(500)
            .describe("Maximum number of runs to return (default: 500)"),
        },
      },
      async ({ startYear = 2020, limit = 500 }) => {
        try {
          console.error(`Fetching all historical runs from ${startYear}, this may take a while...`);

          const runs = await garminService.getAllHistoricalRuns(startYear, limit);

          if (runs.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No runs found from ${startYear} onwards. This could mean:\n- No data available from that period\n- API limitations\n- Authentication issues\n\nTry a more recent start year or check your Garmin Connect data.`,
                },
              ],
            };
          }

          const totalDistance = runs.reduce((sum: number, run: RunWorkout) => sum + run.distance, 0);
          const totalCalories = runs.reduce((sum: number, run: RunWorkout) => sum + run.calories, 0);

          // Group runs by year for summary
          const runsByYear = runs.reduce((acc: any, run: RunWorkout) => {
            const year = run.date.split("-")[0];
            if (!acc[year]) acc[year] = [];
            acc[year].push(run);
            return acc;
          }, {});

          const yearSummaries = Object.keys(runsByYear)
            .sort((a, b) => parseInt(b) - parseInt(a))
            .map((year) => {
              const yearRuns = runsByYear[year];
              const yearDistance = yearRuns.reduce((sum: number, run: RunWorkout) => sum + run.distance, 0);
              return `**${year}:** ${yearRuns.length} runs, ${yearDistance.toFixed(1)} km`;
            })
            .join("\n");

          // Show recent runs for quick reference
          const recentRuns = runs
            .slice(0, 10)
            .map((run: RunWorkout) => `${run.date} | ${run.distance}km | ${run.pace}/km`)
            .join("\n");

          const summary = `
🏃‍♂️ **Complete Historical Running Data (${startYear} onwards)**

📊 **Overall Summary:**
- Total Runs Found: ${runs.length}
- Total Distance: ${totalDistance.toFixed(2)} km
- Total Calories: ${totalCalories.toLocaleString()}
- Date Range: ${runs[runs.length - 1]?.date} to ${runs[0]?.date}
- Average Distance: ${(totalDistance / runs.length).toFixed(2)} km/run

📅 **Runs by Year:**
${yearSummaries}

🏃 **Most Recent 10 Runs:**
${recentRuns}

💡 **Note:** This data includes ALL your running activities from ${startYear}. Use other tools for specific date ranges or filtering.
          `;

          return {
            content: [
              {
                type: "text",
                text: summary.trim(),
              },
            ],
          };
        } catch (error) {
          console.error("Error in get-all-historical-runs tool:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving all historical runs: ${
                  error instanceof Error ? error.message : String(error)
                }\n\nThis could be due to:\n- Large dataset requiring more time\n- API rate limits\n- Network issues\n\nTry with a more recent start year or smaller limit.`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register resources for workout data
    server.registerResource(
      "recent-runs",
      "garmin://runs/recent",
      {
        title: "Recent Running Workouts",
        description: "JSON data of recent running workouts from Garmin",
        mimeType: "application/json",
      },
      async () => {
        try {
          console.error("Fetching recent runs resource...");
          const runs = await garminService.getRecentActivities(20);
          return {
            contents: [
              {
                uri: "garmin://runs/recent",
                mimeType: "application/json",
                text: JSON.stringify(runs, null, 2),
              },
            ],
          };
        } catch (error) {
          console.error("Error in recent-runs resource:", error);
          return {
            contents: [
              {
                uri: "garmin://runs/recent",
                mimeType: "text/plain",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      }
    );

    // Add a prompt for analyzing running performance
    server.registerPrompt(
      "analyze-running-performance",
      {
        title: "Analyze Running Performance",
        description: "Analyze running performance and provide insights and recommendations",
        argsSchema: {
          timeframe: z
            .enum(["week", "month", "quarter", "year"])
            .optional()
            .describe("Time period to analyze (week, month, quarter, year)"),
        },
      },
      async ({ timeframe = "month" }: { timeframe?: "week" | "month" | "quarter" | "year" }) => {
        try {
          console.error(`Generating performance analysis for ${timeframe} period...`);
          const stats = await garminService.getRunningStats(timeframe as "week" | "month" | "quarter" | "year");
          const recentRuns = await garminService.getRecentActivities(5);

          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Please analyze my running performance for the past ${timeframe}. Here are my statistics:

${JSON.stringify(stats, null, 2)}

Recent runs data:
${JSON.stringify(recentRuns, null, 2)}

Please provide:
1. Performance analysis and trends
2. Areas for improvement
3. Training recommendations
4. Goal suggestions based on current performance

Format the response in a clear, encouraging way with actionable insights.`,
                },
              },
            ],
          };
        } catch (error) {
          console.error("Error in analyze-running-performance prompt:", error);
          throw error;
        }
      }
    );

    console.error("Registered 7 tools, 1 resource, and 1 prompt");

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

// Handle cleanup and errors using MCP best practices
process.on("SIGINT", async () => {
  console.error("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Handle EPIPE errors (broken pipe) gracefully - common with MCP stdio transport
process.on("uncaughtException", (error) => {
  if ((error as any).code === "EPIPE") {
    // Client disconnected, exit gracefully without logging (expected behavior)
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
