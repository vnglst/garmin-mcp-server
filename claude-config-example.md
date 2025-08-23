# Example Claude Desktop Configuration

This file shows how to configure the Garmin MCP Server in Claude Desktop.

## macOS Configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "garmin-mcp-server": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/path/to/ai-run-coach/dist/index.js"]
    }
  }
}
```

## Windows Configuration

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "garmin-mcp-server": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\path\\to\\ai-run-coach\\dist\\index.js"]
    }
  }
}
```

## Important Notes

1. Replace the path with your actual project location
2. Make sure to use the built version in the `dist/` folder
3. The server name "garmin-mcp-server" can be customized
4. Restart Claude Desktop after making configuration changes

## Testing the Configuration

After adding the configuration:

1. Restart Claude Desktop
2. Start a new conversation
3. Try asking: "Show me my recent running workouts"
4. The server should respond with sample running data
