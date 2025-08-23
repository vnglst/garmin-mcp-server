# Garmin MCP Server

🏃‍♂️ A Model Context Protocol (MCP) server that connects Claude Desktop to your **real Garmin Connect running data**.

## Quick Start

### 1. Prerequisites
- Node.js 18+
- Active Garmin Connect account with running data
- Claude Desktop

### 2. Setup

```bash
# Clone and install
git clone <your-repo-url>
cd ai-run-coach
npm install

# Configure your Garmin credentials
cp .env.example .env
# Edit .env and add your Garmin Connect email and password
```

### 3. Test the Connection

```bash
# Build and test
npm run build
npm start
```

You should see:
```
Garmin MCP Server running on stdio
```

### 4. Add to Claude Desktop

#### macOS
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "garmin-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/ai-run-coach/dist/index.js"],
      "env": {
        "GARMIN_USERNAME": "your-email@example.com",
        "GARMIN_PASSWORD": "your-password"
      }
    }
  }
}
```

#### Windows
Edit `%APPDATA%\Claude\claude_desktop_config.json` with the same configuration.

### 5. Start Using with Claude!

Ask Claude questions like:
- "Show me my recent running workouts"
- "What's my average pace this month?"
- "Analyze my running performance"
- "How far did I run this week?"

## Features

✅ **Real Garmin Data** - Connects directly to Garmin Connect  
✅ **Recent Runs** - Get your latest workouts with pace, distance, heart rate  
✅ **Detailed Analysis** - Heart rate zones, splits, elevation data  
✅ **Running Statistics** - Weekly, monthly, quarterly, and yearly stats  
✅ **AI Analysis** - Performance insights and training recommendations  

## Available Tools

| Tool | Description | Example Usage |
|------|-------------|---------------|
| `get-recent-runs` | Get your latest running workouts | "Show my last 5 runs" |
| `get-run-details` | Detailed data for a specific run | "Get details for run ID 12345" |
| `get-running-stats` | Aggregate statistics for time periods | "Show my monthly running stats" |

## What Data You Get

From your actual Garmin device:
- 📏 **Distance & Time** - Exact measurements from GPS
- ❤️ **Heart Rate** - Average, max, and zone data
- 🏃‍♂️ **Pace** - Real pace per kilometer/mile
- 📈 **Elevation** - Elevation gain from barometric data
- 📊 **Splits** - Kilometer/mile splits with individual paces
- 📍 **Location** - GPS coordinates or location names

## Development

```bash
# Development mode (auto-reload)
npm run dev

# Build for production  
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Troubleshooting

### Authentication Issues
- ✅ Verify credentials in `.env` file
- ✅ Ensure you can log into connect.garmin.com manually
- ✅ Disable 2FA on Garmin Connect (not supported)

### No Data Found
- ✅ Sync your Garmin device recently
- ✅ Check you have running activities (not just other workouts)
- ✅ Verify activities appear in Garmin Connect web

### Connection Problems
- ✅ Check internet connection
- ✅ Ensure Garmin Connect is not experiencing outages
- ✅ Try again after a few minutes

## Security

🔒 **Your data stays private:**
- Credentials stored locally in `.env`
- Direct connection to Garmin Connect only
- No third-party data sharing
- All processing on your machine

## Requirements

- **Node.js 18+**
- **Garmin Connect account** with running activities
- **Garmin device** that syncs to Garmin Connect
- **Claude Desktop** for MCP integration

---

**Note:** This project is not affiliated with Garmin Ltd.
