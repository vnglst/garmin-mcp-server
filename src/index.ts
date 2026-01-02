#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GarminDataService } from "./services/garmin-data-service.js";
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
    try {
      dbService = new GarminDataService();
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
