#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GarminDataService } from "./services/garmin-data-service.js";
import { GarminSyncService } from "./services/garmin-sync-service.js";
import { loadEnvFile } from "./utils/env-loader.js";
import { formatError } from "./utils/format-error.js";

type ToolResponse = { content: { type: "text"; text: string }[]; isError?: boolean };

function success(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

function error(text: string): ToolResponse {
  return { content: [{ type: "text", text }], isError: true };
}

function toMarkdownTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "Query returned no results.";
  const headers = Object.keys(rows[0]);
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyLines = rows.map((row) => `| ${headers.map((h) => row[h]).join(" | ")} |`);
  return [headerLine, separatorLine, ...bodyLines].join("\n");
}

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
          const schema = dbService.getSchema();
          const schemaText = schema
            .map((table) => `**Table: ${table.name}**\n\`\`\`sql\n${table.sql}\n\`\`\``)
            .join("\n\n");
          return success(schemaText);
        } catch (err) {
          return error(`Error fetching schema: ${formatError(err)}`);
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
          const results = dbService.runQuery(args.query);
          return success(toMarkdownTable(results));
        } catch (err) {
          return error(`Error running query: ${formatError(err)}`);
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
            return error(`Error syncing activities: ${result.error}`);
          }

          const header = result.newActivitiesCount > 0
            ? `Successfully synced ${result.newActivitiesCount} new activities.`
            : "No new activities found. Database is up to date.";
          const latest = result.latestActivityDate
            ? `\nLatest activity: ${result.latestActivityDate.toLocaleDateString()}`
            : "";
          return success(`${header}\nTotal activities: ${result.totalActivities}${latest}`);
        } catch (err) {
          return error(`Error syncing activities: ${formatError(err)}`);
        }
      }
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
