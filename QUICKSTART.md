# Quick Start Guide - Garmin MCP Server

## What is this?

This is a Model Context Protocol (MCP) server that provides Claude Desktop with access to your Garmin running workout data. Once configured, you can ask Claude about your running performance, get workout details, and receive training insights.

## Quick Setup (5 minutes)

### 1. Build the Server

```bash
npm install
npm run build
```

### 2. Configure Claude Desktop

**macOS:** Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** Edit `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration (replace with your actual path):

```json
{
  "mcpServers": {
    "garmin-mcp-server": {
      "command": "node",
      "args": ["/FULL/PATH/TO/ai-run-coach/dist/index.js"]
    }
  }
}
```

### 3. Restart Claude Desktop

Close and reopen Claude Desktop completely.

### 4. Test It!

Start a new conversation in Claude and try:

- "Show me my recent running workouts"
- "What are my running statistics for this month?"
- "Analyze my running performance"

## What You'll See

The server currently provides **sample running data** to demonstrate the functionality. You'll see:

- Recent running workouts with distance, pace, heart rate
- Detailed workout information including splits and conditions
- Monthly/weekly/yearly running statistics
- Performance analysis and training recommendations

## Next Steps

To connect to **real Garmin data**, you would need to:

1. Set up Garmin Connect API access
2. Implement OAuth authentication
3. Replace the mock data with real API calls

See the main README.md for more details on extending to real data.

## Troubleshooting

- **"No MCP servers found"**: Check your configuration file path and syntax
- **"Server failed to start"**: Make sure you ran `npm run build` first
- **Path issues**: Use absolute paths in the configuration file

## Sample Questions to Ask Claude

Once working, try these questions:

- "What was my longest run this month?"
- "How does my pace compare to last month?"
- "Give me training recommendations based on my recent runs"
- "Show me details about my most recent workout"
- "What's my average heart rate during runs?"
