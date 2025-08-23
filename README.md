# Garmin MCP Server

A Model Context Protocol (MCP) server that provides access to your **real Garmin running workout data** for use with Claude Desktop and other MCP-compatible applications.

## Features

- 📊 **Real Garmin Data**: Connects directly to Garmin Connect to fetch your actual running data
- 🏃‍♂️ **Running Analytics**: Get recent runs, detailed workout data, and running statistics
- 🔐 **Secure Authentication**: Uses your Garmin Connect credentials stored locally
- 📈 **Performance Analysis**: AI-powered running performance analysis prompts
- 🎯 **MCP Compatible**: Works with Claude Desktop and other MCP clients

## What You Can Do

- Ask Claude about your recent runs and performance trends
- Get detailed analysis of specific workouts
- Track your running progress over time
- Receive personalized running insights and recommendations

## Quick Start

### 1. Setup Garmin Credentials

```bash
# Copy the environment template
cp .env.example .env

# Edit .env and add your Garmin Connect credentials
GARMIN_USERNAME=your-garmin-email@example.com
GARMIN_PASSWORD=your-garmin-password
```

### 2. Build and Test

```bash
# Install dependencies and build
npm install
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

### 3. Add to Claude Desktop

Add this configuration to your Claude Desktop MCP settings:

#### macOS

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "garmin-mcp-server": {
      "command": "node",
      "args": ["/path/to/your/ai-run-coach/dist/index.js"],
      "env": {
        "GARMIN_USERNAME": "your-garmin-email@example.com",
        "GARMIN_PASSWORD": "your-garmin-password"
      }
    }
  }
}
```

#### Windows

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "garmin-mcp-server": {
      "command": "node",
      "args": ["C:\\path\\to\\your\\ai-run-coach\\dist\\index.js"],
      "env": {
        "GARMIN_USERNAME": "your-garmin-email@example.com",
        "GARMIN_PASSWORD": "your-garmin-password"
      }
    }
  }
}
```

## Available Tools

### 🏃‍♂️ get-recent-runs

Get your latest running workouts from Garmin Connect.

- **Input**: `limit` (optional, default: 10)
- **Output**: List of recent runs with distance, time, pace, calories, heart rate

### 📊 get-run-details

Get detailed information about a specific run.

- **Input**: `runId` (from recent runs)
- **Output**: Detailed run data including splits, elevation, heart rate zones

### 📈 get-running-stats

Get aggregated running statistics for a time period.

- **Input**: `period` (week/month/quarter/year), `date` (optional)
- **Output**: Total distance, average pace, best times, trends

## Available Resources

### 📄 recent-runs

Access your recent running data as a structured resource for analysis.

## Available Prompts

### 🤖 analyze-running-performance

AI-powered analysis of your running performance with personalized insights and recommendations.

## Data Sources

This server connects to **real Garmin Connect data**:

- ✅ Fetches actual workouts from your Garmin device
- ✅ Includes real heart rate, pace, and GPS data
- ✅ Provides authentic performance metrics
- ✅ Updates automatically as you sync new workouts

## Security & Privacy

- 🔒 Credentials stored locally in `.env` file
- 🏠 All processing happens on your local machine
- 🚫 No data sent to third-party services
- 🔐 Direct authentication with Garmin Connect only

## Example Usage

Once configured, you can ask Claude questions like:

- "Show me my recent running workouts"
- "What are my running statistics for this month?"
- "Analyze my running performance and give me training recommendations"
- "Get details about my latest run"
- "How has my pace improved over the last quarter?"

## Detailed Setup

For complete setup instructions including troubleshooting, see [GARMIN_SETUP.md](./GARMIN_SETUP.md).

## Development

### Running in Development Mode

```bash
npm run dev
```

### Building

```bash
npm run build
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Requirements

- Node.js 18+
- Active Garmin Connect account
- Garmin device that syncs to Garmin Connect
- Recent running activities in your Garmin Connect account

## Troubleshooting

### Common Issues

**Authentication Errors**:

- Verify credentials in `.env` file
- Ensure no 2FA is enabled on Garmin Connect
- Check you can log in to connect.garmin.com manually

**No Data Returned**:

- Ensure your Garmin device has synced recently
- Check you have running activities in Garmin Connect
- Make sure activities are marked as "running" type

See [GARMIN_SETUP.md](./GARMIN_SETUP.md) for detailed troubleshooting.

## Alternative API Options

For production applications, consider:

- **Garmin Connect IQ API**: Official developer API
- **Garmin Health API**: For health/fitness applications
- **Garmin Developer Program**: https://developer.garmin.com/

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Disclaimer

This project is not affiliated with Garmin Ltd. Garmin is a trademark of Garmin Ltd. or its subsidiaries.
