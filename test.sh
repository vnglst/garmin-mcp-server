#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Testing Simplified Garmin MCP Server${NC}"
echo "======================================="

# Build the project
echo -e "${YELLOW}📦 Building project...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build successful${NC}"
echo

# Test 1: Get recent activities (default)
echo -e "${BLUE}Test 1: Get Recent Activities (Default)${NC}"
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get-activities", "arguments": {"limit": 5}}}' | node dist/index.js
echo
echo "---"
echo

# Test 2: Get activities with date range
echo -e "${BLUE}Test 2: Get Activities with Date Range${NC}"
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get-activities", "arguments": {"startDate": "2024-01-01", "endDate": "2024-12-31", "limit": 3}}}' | node dist/index.js
echo
echo "---"
echo

# Test 3: Get activities from specific start date
echo -e "${BLUE}Test 3: Get Activities from Specific Start Date${NC}"
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get-activities", "arguments": {"startDate": "2024-11-01", "limit": 10}}}' | node dist/index.js
echo
echo "---"
echo

# Test 4: Get activities up to specific end date  
echo -e "${BLUE}Test 4: Get Activities up to Specific End Date${NC}"
echo '{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "get-activities", "arguments": {"endDate": "2024-06-30", "limit": 5}}}' | node dist/index.js
echo
echo "---"
echo

# Test 5: List available tools
echo -e "${BLUE}Test 5: List Available Tools${NC}"
echo '{"jsonrpc": "2.0", "id": 5, "method": "tools/list", "params": {}}' | node dist/index.js
echo
echo "---"
echo

# Test 6: Get large number of activities
echo -e "${BLUE}Test 6: Get Large Number of Activities${NC}"
echo '{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "get-activities", "arguments": {"limit": 25}}}' | node dist/index.js
echo
echo "---"
echo

echo -e "${GREEN}🎉 All simplified tests completed!${NC}"
echo -e "${YELLOW}📝 The MCP server now has only one tool: get-activities${NC}"
echo -e "${YELLOW}   It supports startDate, endDate, and limit parameters${NC}"
