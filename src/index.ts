#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GarminService, RunWorkout, DetailedRunWorkout, RunningStats } from "./garmin-service.js";

// Initialize the MCP server
const server = new McpServer({
  name: "garmin-mcp-server",
  version: "1.0.0",
});

// Initialize Garmin service
const garminService = new GarminService();

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
      const runs = await garminService.getRecentRuns(limit);

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
- Weather: ${runDetails.weather || "N/A"}

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
- Compared to previous ${period}: ${stats.comparison || "N/A"}
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
      const runs = await garminService.getRecentRuns(20);
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
    const stats = await garminService.getRunningStats(timeframe as "week" | "month" | "quarter" | "year");
    const recentRuns = await garminService.getRecentRuns(5);

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
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr since stdout is used for MCP communication
  console.error("Garmin MCP Server running on stdio");
}

// Handle cleanup
process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
