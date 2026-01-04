#!/bin/bash

set -e

echo "=== Testing stdio mode ==="
echo ""

echo "--- Testing get-schema tool ---"
SCHEMA_OUTPUT=$(echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get-schema", "arguments": {}}}' | node dist/index.js)

echo "Schema tool output:"
echo "$SCHEMA_OUTPUT"

if [[ ! "$SCHEMA_OUTPUT" == *"activities"* ]]; then
  echo "Test FAILED: 'get-schema' output did not contain 'activities' table."
  exit 1
fi
echo "Test PASSED: 'get-schema' seems to work."

echo ""
echo "--- Testing run-query tool ---"
QUERY_OUTPUT=$(echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "run-query", "arguments": {"query": "SELECT count(*) as count FROM activities"}}}' | node dist/index.js)

echo "Query tool output:"
echo "$QUERY_OUTPUT"

if [[ ! "$QUERY_OUTPUT" == *"count"* ]]; then
  echo "Test FAILED: 'run-query' output did not contain expected 'count' column."
  exit 1
fi
echo "Test PASSED: 'run-query' seems to work."

echo ""
echo "=== Testing HTTP mode ==="
echo ""

PORT=3456
API_KEY=test-secret-key

PORT=$PORT API_KEY=$API_KEY node dist/index.js &
SERVER_PID=$!
sleep 2

cleanup() {
  kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "--- Testing health endpoint ---"
HEALTH_OUTPUT=$(curl -s http://localhost:$PORT/health)
echo "Health output: $HEALTH_OUTPUT"

if [[ ! "$HEALTH_OUTPUT" == *"ok"* ]]; then
  echo "Test FAILED: Health check did not return 'ok'."
  exit 1
fi
echo "Test PASSED: Health endpoint works."

echo ""
echo "--- Testing unauthorized request ---"
UNAUTH_OUTPUT=$(curl -s http://localhost:$PORT/mcp)
echo "Unauthorized output: $UNAUTH_OUTPUT"

if [[ ! "$UNAUTH_OUTPUT" == *"Unauthorized"* ]]; then
  echo "Test FAILED: Unauthorized request should be rejected."
  exit 1
fi
echo "Test PASSED: API key authentication works."

echo ""
echo "All tests passed!"
