# Instructions

- Don't add comments in code.
- Document code only sparingly and only in the README.md
- Don't create any additional documentation files.

## Testing

- Use `./test.sh` to run the comprehensive test suite
- This script tests all MCP server capabilities including recent runs, historical data, fitness metrics, and MCP protocol features
- Run `npm run build` before testing to ensure latest changes are compiled

## MCP Usage

- Use command line tools instead of the MCP inspector for testing MCP functionality
- The MCP inspector may not work reliably in this environment
- Use e.g. echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get-recent-runs", "arguments": {"limit": 1}}}' | node dist/index.js

## Docs

- We're using: https://github.com/Pythe1337N/garmin-connect
- Especially this page is relevant: https://github.com/Pythe1337N/garmin-connect/blob/master/src/garmin/types/weight.ts
