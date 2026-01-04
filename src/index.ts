#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import crypto from "crypto";
import http from "http";
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

function createMcpServer(dbService: GarminDataService, syncService: GarminSyncService): McpServer {
  const server = new McpServer({
    name: "garmin-mcp-server",
    version: "1.0.0",
  });

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

        const header =
          result.newActivitiesCount > 0
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

  return server;
}

function validateApiKey(req: http.IncomingMessage): boolean {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader) return false;

  const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const providedKey = match[1].trim();
  if (!providedKey) return false;

  const expected = Buffer.from(apiKey, "utf8");
  const provided = Buffer.from(providedKey, "utf8");
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function runHttpServer(dbService: GarminDataService, syncService: GarminSyncService) {
  const port = parseInt(process.env.PORT || "3000", 10);
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const maxSessions = Math.max(1, parseInt(process.env.MAX_SESSIONS || "100", 10) || 100);

  const configuredCorsOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  function applyCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse) {
    if (configuredCorsOrigins.length === 0) return;

    const origin = req.headers.origin;
    if (!origin) return;

    if (configuredCorsOrigins.includes("*")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (configuredCorsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else {
      return;
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id");
  }

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    applyCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      applyCorsHeaders(req, res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/health") {
      sendJson(res, 200, {
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      });
      return;
    }

    if (url.pathname === "/mcp" || url.pathname === "/") {
      if (!validateApiKey(req)) {
        sendJson(res, 401, { error: "Unauthorized", message: "Invalid or missing API key" });
        return;
      }

      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (req.method === "POST") {
        let transport = sessionId ? transports.get(sessionId) : undefined;

        if (!transport) {
          if (transports.size >= maxSessions) {
            sendJson(res, 503, {
              error: "Service Unavailable",
              message: "Too many active sessions",
            });
            return;
          }

          let activeSessionId: string | null = null;
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (newSessionId) => {
              activeSessionId = newSessionId;
              transports.set(newSessionId, transport!);
            },
          });

          transport.onclose = () => {
            if (activeSessionId) transports.delete(activeSessionId);
          };

          const server = createMcpServer(dbService, syncService);
          await server.connect(transport);
        }

        await transport.handleRequest(req, res);
        return;
      }

      if (req.method === "GET") {
        if (!sessionId || !transports.has(sessionId)) {
          sendJson(res, 400, { error: "Bad Request", message: "Missing or invalid session ID" });
          return;
        }

        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      if (req.method === "DELETE") {
        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!;
          await transport.close();
          transports.delete(sessionId);
        }
        res.writeHead(204);
        res.end();
        return;
      }
    }

    sendJson(res, 404, { error: "Not Found" });
  });

  httpServer.listen(port, () => {
    console.error(`Garmin MCP Server running on http://0.0.0.0:${port}`);
    console.error("Endpoints:");
    console.error(`  MCP: POST/GET/DELETE /mcp`);
    console.error(`  Health: GET /health`);
    if (process.env.API_KEY) {
      console.error("API key authentication enabled");
    } else {
      console.error("Warning: No API_KEY set, server is unprotected");
    }
  });

  return httpServer;
}

async function runStdioServer(dbService: GarminDataService, syncService: GarminSyncService) {
  const server = createMcpServer(dbService, syncService);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Garmin MCP Server running on stdio");
  console.error("Ready to receive requests from Claude Desktop");
}

async function main() {
  try {
    loadEnvFile();
    console.error("Environment variables loaded");

    let dbService: GarminDataService;
    let syncService: GarminSyncService;
    try {
      dbService = new GarminDataService();
      syncService = new GarminSyncService();
      console.error("Database service initialized successfully");
    } catch (err) {
      console.error("Failed to initialize database service:", err);
      process.exit(1);
    }

    const useHttp = process.env.PORT || process.env.HTTP_MODE === "true";

    if (useHttp) {
      await runHttpServer(dbService, syncService);
    } else {
      await runStdioServer(dbService, syncService);
    }
  } catch (err) {
    console.error("Failed to start server:", err);
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

process.on("uncaughtException", (err) => {
  if ((err as NodeJS.ErrnoException).code === "EPIPE") {
    process.exit(0);
  } else {
    console.error("Uncaught exception:", err);
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

main().catch((err) => {
  console.error("Fatal error in main():", err);
  process.exit(1);
});
