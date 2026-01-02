# Instructions

- Don't add comments in code.
- Document code only sparingly and only in the README.md
- Don't create any additional documentation files.

## Testing

- Use `npm run test:mcp` to run the comprehensive test suite
- This script tests all MCP server capabilities including database queries and MCP protocol features
- Run `npm run build` before testing to ensure latest changes are compiled

## MCP Usage

- Use command line tools instead of the MCP inspector for testing MCP functionality
- The MCP inspector may not work reliably in this environment
- Use e.g. `echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get-schema", "arguments": {}}}' | node dist/index.js`

## Docs

- We're using: https://github.com/Pythe1337N/garmin-connect
- Especially this page is relevant: https://github.com/Pythe1337N/garmin-connect/blob/master/src/garmin/types/weight.ts

---

# Project Overview

This is a Garmin MCP (Model Context Protocol) server that provides Claude Desktop with access to running workout data from Garmin Connect. The server exposes tools to query a SQLite database containing Garmin activities data.

## Architecture

### File Structure
```
src/
├── index.ts                          # MCP server setup and tool registration
├── services/
│   ├── garmin-data-service.ts       # SQLite database access layer (read-only)
│   └── garmin-sync-service.ts       # Garmin Connect sync service
└── utils/
    └── env-loader.ts                 # Environment variable loader

scripts/
├── download-data.ts                  # Downloads activities from Garmin Connect API
└── test-mcp.sh                       # MCP protocol testing script

data/
└── garmin-data.db                    # SQLite database (gitignored)
```

### Key Components

1. **GarminDataService** ([src/services/garmin-data-service.ts](src/services/garmin-data-service.ts))
   - Handles read-only database operations
   - Opens database in read-only mode
   - Provides `getSchema()` and `runQuery()` methods
   - Database path: `data/garmin-data.db`

2. **GarminSyncService** ([src/services/garmin-sync-service.ts](src/services/garmin-sync-service.ts))
   - Handles syncing activities from Garmin Connect
   - Manages database writes and updates
   - Used by both the MCP tool and download script
   - Returns sync results (new activities count, total activities, latest date)

3. **MCP Server** ([src/index.ts](src/index.ts))
   - Registers three tools: `get-schema`, `run-query`, and `sync-activities`
   - Uses stdio transport for communication
   - Handles graceful shutdown (SIGINT, SIGTERM, EPIPE)

4. **Data Download** ([scripts/download-data.ts](scripts/download-data.ts))
   - CLI wrapper around GarminSyncService
   - Downloads activities from Garmin Connect API
   - Can be run via `npm run download`

## Database Schema

The `activities` table contains running workout data with these key fields:
- `activity_id` (PRIMARY KEY)
- `activity_name`, `description`, `start_time_local`
- `distance`, `duration`, `calories`
- `average_hr`, `max_hr`, `vo2_max`
- `avg_stride_length`, `training_effect`, `aerobic_training_effect`
- `avg_vertical_oscillation`, `avg_ground_contact_time`
- `avg_power`, `max_power`, `grit`, `flow`
- Running cadence, fractional cadence metrics

## Available MCP Tools

### 1. get-schema
Returns the database schema (table definitions).
```json
{"name": "get-schema", "arguments": {}}
```

### 2. run-query
Executes SELECT queries on the database.
```json
{"name": "run-query", "arguments": {"query": "SELECT * FROM activities LIMIT 5"}}
```

**Security**: Only SELECT queries are allowed (enforced in code).

### 3. sync-activities
Downloads and syncs new activities from Garmin Connect to the local database.
```json
{"name": "sync-activities", "arguments": {}}
```

This tool automatically:
- Connects to Garmin Connect using credentials from `.env`
- Downloads only new activities (since the last sync)
- Saves them to the database
- Returns a summary of the sync operation (number of new activities, total activities, latest activity date)

## Data Management

**Download new activities** (two methods):

1. Via command line:
```bash
npm run download
```

2. Via MCP tool (when using with Claude Desktop):
```json
{"name": "sync-activities", "arguments": {}}
```

Both methods use [GarminSyncService](src/services/garmin-sync-service.ts) which:
- Loads credentials from `.env` (GARMIN_USERNAME, GARMIN_PASSWORD)
- Connects to Garmin Connect
- Downloads only new activities since the last sync
- Stores them in `data/garmin-data.db`
- Returns sync statistics

**Database location**: Always use `data/garmin-data.db` (relative path handled by both services)

## Common Tasks

### Adding a new database field
1. Update `activitySchema` in [src/services/garmin-sync-service.ts](src/services/garmin-sync-service.ts)
2. Delete `data/garmin-data.db` or alter the table
3. Run `npm run download` to recreate with new schema

### Adding a new MCP tool
1. Register in [src/index.ts](src/index.ts) using `server.registerTool()`
2. Add business logic to [src/services/garmin-data-service.ts](src/services/garmin-data-service.ts) if database access needed
3. Build and test with `npm run build && npm run test:mcp`

### Modifying queries
- All query execution goes through `GarminDataService.runQuery()`
- Only SELECT queries allowed (enforced)
- Results auto-formatted as markdown tables in the MCP tool handler

## External Dependencies

**Garmin Connect Library**: https://github.com/Pythe1337N/garmin-connect
- Used for authentication and API access
- Type definitions: https://github.com/Pythe1337N/garmin-connect/blob/master/src/garmin/types/weight.ts

**MCP SDK**: @modelcontextprotocol/sdk
- Server implementation: McpServer
- Transport: StdioServerTransport

## TypeScript Configuration

- Target: ES2022
- Module: Node16
- Source: `src/**/*`
- Output: `dist/`
- Strict mode enabled
- Source maps and declarations generated

## Environment Variables

Required in `.env`:
- `GARMIN_USERNAME`: Garmin Connect email
- `GARMIN_PASSWORD`: Garmin Connect password

Loaded via custom `loadEnvFile()` in [src/utils/env-loader.ts](src/utils/env-loader.ts) to avoid console output from dotenv.
