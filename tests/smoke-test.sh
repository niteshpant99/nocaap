#!/bin/bash
# Quick smoke test - run after every change
# Usage: ./tests/smoke-test.sh

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLI="node $PROJECT_ROOT/dist/index.js"

echo -e "${YELLOW}🧪 Running smoke tests...${NC}"
echo ""

# Create temp test directory
TEST_DIR=$(mktemp -d)
echo -e "📁 Test directory: $TEST_DIR"

# Cleanup on exit
cleanup() {
  echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

cd "$TEST_DIR"

# Test 1: Help works
echo -e "\n${GREEN}1️⃣  Testing --help...${NC}"
$CLI --help > /dev/null
echo "   ✅ Help works"

# Test 2: All command helps work
echo -e "\n${GREEN}2️⃣  Testing command helps...${NC}"
$CLI setup --help > /dev/null && echo "   ✅ setup --help"
$CLI add --help > /dev/null && echo "   ✅ add --help"
$CLI update --help > /dev/null && echo "   ✅ update --help"
$CLI list --help > /dev/null && echo "   ✅ list --help"
$CLI remove --help > /dev/null && echo "   ✅ remove --help"
$CLI generate --help > /dev/null && echo "   ✅ generate --help"

# Test 3: Add a small public repo
echo -e "\n${GREEN}3️⃣  Testing add command (small repo)...${NC}"
$CLI add https://github.com/sindresorhus/is-online.git --alias is-online
echo "   ✅ Add works"

# Test 4: Verify .context structure
echo -e "\n${GREEN}4️⃣  Verifying .context structure...${NC}"
[ -f ".context/context.config.json" ] && echo "   ✅ context.config.json exists"
[ -f ".context/context.lock" ] && echo "   ✅ context.lock exists"
[ -f ".context/INDEX.md" ] && echo "   ✅ INDEX.md exists"
[ -d ".context/packages/is-online" ] && echo "   ✅ packages/is-online/ exists"

# Test 5: List command
echo -e "\n${GREEN}5️⃣  Testing list command...${NC}"
$CLI list
echo "   ✅ List works"

# Test 6: Update command
echo -e "\n${GREEN}6️⃣  Testing update command...${NC}"
$CLI update
echo "   ✅ Update works"

# Test 7: Generate command
echo -e "\n${GREEN}7️⃣  Testing generate command...${NC}"
$CLI generate
echo "   ✅ Generate works"

# Test 8: Remove command
echo -e "\n${GREEN}8️⃣  Testing remove command...${NC}"
$CLI remove is-online --force
echo "   ✅ Remove works"

# Test 9: Verify removal
echo -e "\n${GREEN}9️⃣  Verifying removal...${NC}"
[ ! -d ".context/packages/is-online" ] && echo "   ✅ Package directory removed"

echo ""
echo -e "${GREEN}🎉 All smoke tests passed!${NC}"

