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
│   └── garmin-data-service.ts       # SQLite database access layer
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
   - Handles all database operations
   - Opens database in read-only mode
   - Provides `getSchema()` and `runQuery()` methods
   - Database path: `data/garmin-data.db`

2. **MCP Server** ([src/index.ts](src/index.ts))
   - Registers two tools: `get-schema` and `run-query`
   - Uses stdio transport for communication
   - Handles graceful shutdown (SIGINT, SIGTERM, EPIPE)

3. **Data Download** ([scripts/download-data.ts](scripts/download-data.ts))
   - Connects to Garmin Connect API
   - Downloads activities with pagination
   - Stores in SQLite with INSERT OR REPLACE
   - Schema defined in `activitySchema` array

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

## Data Management

**Download new activities**:
```bash
npm run download
```

This runs [scripts/download-data.ts](scripts/download-data.ts) which:
- Loads credentials from `.env` (GARMIN_USERNAME, GARMIN_PASSWORD)
- Connects to Garmin Connect
- Downloads new activities since the last sync
- Stores them in `data/garmin-data.db`

**Database location**: Always use `data/garmin-data.db` (relative path handled by GarminDataService)

## Common Tasks

### Adding a new database field
1. Update `activitySchema` in [scripts/download-data.ts](scripts/download-data.ts)
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
