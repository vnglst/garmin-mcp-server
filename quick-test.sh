#!/bin/bash

# Simple MCP Server Protocol Test
# Tests basic MCP protocol compliance

echo "=== Basic MCP Protocol Test ==="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test if server responds correctly to tools/list
echo "Testing tools/list..."
response=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | timeout 5s node dist/index.js 2>/dev/null)

if echo "$response" | jq . >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Valid JSON response${NC}"
    
    # Check JSON-RPC structure
    if echo "$response" | jq -e '.jsonrpc == "2.0"' >/dev/null; then
        echo -e "${GREEN}✅ Correct JSON-RPC version${NC}"
    else
        echo -e "${RED}❌ Wrong JSON-RPC version${NC}"
    fi
    
    if echo "$response" | jq -e '.id == 1' >/dev/null; then
        echo -e "${GREEN}✅ Correct response ID${NC}"
    else
        echo -e "${RED}❌ Wrong response ID${NC}"
    fi
    
    # Check if tools are returned
    tool_count=$(echo "$response" | jq '.result.tools | length' 2>/dev/null)
    if [ "$tool_count" -gt 0 ] 2>/dev/null; then
        echo -e "${GREEN}✅ Tools returned: $tool_count tools${NC}"
    else
        echo -e "${RED}❌ No tools returned${NC}"
    fi
    
else
    echo -e "${RED}❌ Invalid JSON response${NC}"
    echo "Response: $response"
fi

echo ""
echo "Raw response (first 200 chars):"
echo "$response" | head -c 200
echo ""

echo -e "${YELLOW}Note: Server stderr logs are hidden in this test. Run ./test-mcp-server.sh for full logs.${NC}"
