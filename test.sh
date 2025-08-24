#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "--- Testing get-schema tool ---"
SCHEMA_OUTPUT=$(echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get-schema", "arguments": {}}}' | node dist/index.js)

echo "Schema tool output:"
echo "$SCHEMA_OUTPUT"

# Basic check for success
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

# Basic check for success
if [[ ! "$QUERY_OUTPUT" == *"count"* ]]; then
  echo "Test FAILED: 'run-query' output did not contain expected 'count' column."
  exit 1
fi
echo "Test PASSED: 'run-query' seems to work."

echo ""
echo "All tests passed!"
