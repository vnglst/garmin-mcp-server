#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";

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
class GarminDataService {
  private dbPath: string;

  constructor(dbPath: string = "garmin-data.db") {
    // Resolve the database path relative to this script's directory
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    this.dbPath = path.resolve(scriptDir, "..", dbPath);

    if (!fs.existsSync(this.dbPath)) {
      throw new Error(`Database file not found at ${this.dbPath}. Please run the download script first.`);
    }
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

  async getSchema(): Promise<any[]> {
    const db = await this.getDatabase();
    try {
      return new Promise((resolve, reject) => {
        const sql = `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`;
        db.all(sql, [], (err, rows) => {
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

  async runQuery(query: string): Promise<any[]> {
    if (!query.trim().toLowerCase().startsWith("select")) {
      throw new Error("Only SELECT queries are allowed.");
    }

    const db = await this.getDatabase();
    try {
      return new Promise((resolve, reject) => {
        db.all(query, [], (err, rows) => {
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

async function main() {
  try {
    // Load environment variables manually
    loadEnvFile();
    console.error("Environment variables loaded");

    // Initialize the MCP server
    const server = new McpServer({
      name: "garmin-mcp-server",
      version: "1.0.0",
    });

    // Initialize database service
    let dbService: GarminDataService;
    try {
      dbService = new GarminDataService();
      console.error("Database service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize database service:", error);
      process.exit(1);
    }

    // Tool 1: Get database schema
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

    // Tool 2: Run a SELECT query
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
          // A simple way to format as a markdown table
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
