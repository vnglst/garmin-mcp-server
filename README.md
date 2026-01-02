# Garmin MCP Server

A Model Context Protocol (MCP) server that connects Claude Desktop to your **real Garmin Connect running data** stored in a local SQLite database.

## Setup for Claude Desktop

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Garmin Credentials

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Garmin Connect credentials:

```
GARMIN_USERNAME=your-email@example.com
GARMIN_PASSWORD=your-password
```

### 3. Download Your Garmin Data

```bash
npm run download
```

This downloads all your activities from Garmin Connect to a local SQLite database at `data/garmin-data.db`.

### 4. Configure Claude Desktop

First, get the absolute path to this project:

```bash
pwd
```

This will output something like `/Users/yourusername/Code/ai-run-coach`.

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "garmin-mcp-server": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/yourusername/Code/ai-run-coach/src/index.ts"],
      "cwd": "/Users/yourusername/Code/ai-run-coach"
    }
  }
}
```

Replace `/Users/yourusername/Code/ai-run-coach` with the path from the `pwd` command.

For Windows, run `cd` to get the path, then edit `%APPDATA%\Claude\claude_desktop_config.json` instead.

### 5. Restart Claude Desktop

After restarting, you can ask Claude:

- "Sync my latest Garmin activities"
- "Show me my 5 most recent runs"
- "What's my average pace this month?"
- "Analyze my running performance trends"
- "How many kilometers did I run this year?"

## Features

- **Local SQLite Database** - Your data stored locally for fast access
- **Auto-Sync** - Update your data from Garmin Connect directly through Claude
- **SQL Queries** - Run custom queries to analyze your training data
- **Comprehensive Metrics** - Heart rate, pace, cadence, power, VO2 max, and more
- **AI Analysis** - Let Claude analyze your running trends and performance
- **Privacy-First** - All data stays on your machine

## Available MCP Tools

The server exposes three tools that Claude can use:

### 1. `get-schema`

Get the database schema to understand available data fields.

**Example usage in Claude:**

- "What data fields are available in my running database?"
- "Show me the database schema"

### 2. `run-query`

Execute SELECT queries against your activities database.

**Example usage in Claude:**

- "Show me my 10 most recent runs"
- "What's my average heart rate this month?"
- "Find all runs longer than 10km"
- "Calculate my total distance this year"

**Security:** Only SELECT queries are allowed - no data modification.

### 3. `sync-activities`

Download and sync new activities from Garmin Connect to the local database.

**Example usage in Claude:**

- "Sync my latest Garmin activities"
- "Update my running data"
- "Check for new workouts"

Returns a summary showing:

- Number of new activities downloaded
- Total activities in the database
- Date of your latest activity

## Built-in Analysis Prompts

The server includes 8 pre-configured prompts to help you analyze your running data. In Claude Desktop, you can use these prompts to quickly get insights:

### Training Analysis

- **Analyze Recent Training Load** - Review last 7 days of training, load distribution, and recovery status
- **Track Pace Improvements** - Analyze pace progression over 3 months
- **Training Effect Analysis** - Balance between aerobic and anaerobic training

### Performance Insights

- **Personal Records** - Find your fastest times and best performances
- **Heart Rate Zone Distribution** - Analyze time in each HR zone and training intensity
- **Elevation & Hill Running Analysis** - Performance on hilly terrain and climbing efficiency

### Regular Summaries

- **Weekly Running Summary** - Complete overview of the current week's activities
- **Running Form Analysis** - Cadence, stride length, ground contact time, and form metrics

Simply select a prompt in Claude Desktop to automatically generate a comprehensive analysis using your Garmin data!

## What Data You Get

All data from your Garmin device stored in a SQLite database (58+ fields):

**Basic Metrics:**

- Activity ID, name, description, timestamps (local & GMT)
- Activity type, location name
- Distance, duration, elapsed duration, moving duration
- Calories, steps, lap count

**Heart Rate Data:**

- Average/max heart rate
- Lactate threshold BPM
- Time in each HR zone (1-5)
- VO2 Max value

**Speed & Pace:**

- Average/max speed
- Fastest splits (1K, 5K, 10K, mile)

**Running Dynamics:**

- Average/max stride length
- Average/max cadence (including double cadence)
- Average vertical oscillation
- Average ground contact time
- Vertical ratio, vertical speed

**Training Load & Intensity:**

- Activity training load
- Training effect (aerobic/anaerobic)
- Vigorous/moderate intensity minutes

**Elevation:**

- Elevation gain/loss
- Min/max elevation

**Power Metrics:**

- Average/max power
- Grit and Flow scores

## How It Works

1. **Initial Setup:** Run `npm run download` to download all your activities from Garmin Connect into a local SQLite database
2. **Claude Integration:** The MCP server exposes tools that Claude can use to query your data
3. **Stay Updated:** Use the `sync-activities` tool in Claude to download new activities anytime
4. **Flexible Queries:** Claude can run SQL queries to analyze your data in any way you want

## Development

```bash
# Download/update activities from Garmin
npm run download

# Build TypeScript to JavaScript
npm run build

# Test MCP server manually
npm run test:mcp

# Run server directly (for testing)
npm start
```

**Note:** When using with Claude Desktop via the tsx configuration, you don't need to build - changes to TypeScript files are automatically picked up.

## Troubleshooting

### Authentication Issues

- Verify credentials in `.env` file (GARMIN_USERNAME and GARMIN_PASSWORD)
- Ensure you can log into connect.garmin.com manually
- Try logging in via web browser first
- Check that your password doesn't contain special characters that need escaping

### Database Not Found

- Run `npm run download` first to create the database
- Check that `data/garmin-data.db` exists in your project directory
- Verify the database file isn't corrupted (try deleting and re-downloading)

### Sync Not Working in Claude

- Restart Claude Desktop after configuration changes
- Check Claude Desktop logs for error messages
- Verify the paths in `claude_desktop_config.json` are absolute, not relative
- Ensure `.env` file exists in the project root directory

### Query Errors

- Only SELECT queries are allowed (INSERT, UPDATE, DELETE are blocked)
- Use the `get-schema` tool to see available table columns
- Check SQL syntax is correct

## Security & Privacy

**Your data stays completely private:**

- Credentials stored locally in `.env` file only
- Direct connection to Garmin Connect (no intermediary servers)
- All data stored in local SQLite database on your machine
- No third-party data sharing or cloud uploads
- Database queries run locally
- Only SELECT queries allowed (read-only access for Claude)

## Technical Details

**Architecture:**

- TypeScript-based MCP server
- SQLite database for local storage
- Direct integration with Garmin Connect API (via `garmin-connect` library)
- Runs via `tsx` for development (no build step needed with Claude Desktop)
- MCP SDK for Claude Desktop integration

**Database:**

- Location: `data/garmin-data.db`
- Format: SQLite 3
- Updates: Incremental (only new activities downloaded)
- Contains: All activity data from Garmin Connect

## Requirements

- **Node.js 18+**
- **npm** (comes with Node.js)
- **Garmin Connect account** with running/fitness activities
- **Claude Desktop** for MCP integration
- **Garmin device** that syncs to Garmin Connect (watch, bike computer, etc.)

## Contributing

Feel free to open issues or submit pull requests for:

- Bug fixes
- New data fields to track
- Additional MCP tools
- Documentation improvements

## License

MIT

---

**Note:** This project is not affiliated with, endorsed by, or sponsored by Garmin Ltd. or Garmin International, Inc.
