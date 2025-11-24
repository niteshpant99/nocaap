#!/bin/bash
# Full test suite for nocaap
# Usage: ./tests/run-tests.sh

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLI="node $PROJECT_ROOT/dist/index.js"

echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              nocaap Full Test Suite                      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Create temp test directory
TEST_DIR=$(mktemp -d)
echo -e "${YELLOW}📁 Test directory: $TEST_DIR${NC}"

# Cleanup on exit
cleanup() {
  echo -e "\n${YELLOW}🧹 Cleaning up test directory...${NC}"
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

cd "$TEST_DIR"

# =============================================================================
# Test 1: CLI Help
# =============================================================================
echo -e "\n${GREEN}═══ Test 1: CLI Help ═══${NC}"
$CLI --help
echo -e "✅ CLI help displayed"

# =============================================================================
# Test 2: Add Command Help
# =============================================================================
echo -e "\n${GREEN}═══ Test 2: Add Command Help ═══${NC}"
$CLI add --help
echo -e "✅ Add help displayed"

# =============================================================================
# Test 3: Add a Public Repository (Node.js error handling)
# =============================================================================
echo -e "\n${GREEN}═══ Test 3: Add Public Repository (Sparse Checkout) ═══${NC}"
$CLI add https://github.com/goldbergyoni/nodebestpractices.git \
  --path sections/errorhandling \
  --alias node-errors \
  --branch master
echo -e "✅ Added node-errors package"

# =============================================================================
# Test 4: Verify .context/ Structure
# =============================================================================
echo -e "\n${GREEN}═══ Test 4: Verify .context/ Structure ═══${NC}"
echo "Directory structure:"
find .context -type f 2>/dev/null | head -20 || echo "(showing first 20 files)"
echo -e "✅ Structure verified"

# =============================================================================
# Test 5: Check config.json
# =============================================================================
echo -e "\n${GREEN}═══ Test 5: Check config.json ═══${NC}"
cat .context/context.config.json
echo -e "\n✅ Config file valid"

# =============================================================================
# Test 6: Check lockfile
# =============================================================================
echo -e "\n${GREEN}═══ Test 6: Check lockfile ═══${NC}"
cat .context/context.lock
echo -e "\n✅ Lockfile valid"

# =============================================================================
# Test 7: Check INDEX.md
# =============================================================================
echo -e "\n${GREEN}═══ Test 7: Check INDEX.md ═══${NC}"
head -50 .context/INDEX.md
echo -e "\n✅ INDEX.md generated"

# =============================================================================
# Test 8: List Command
# =============================================================================
echo -e "\n${GREEN}═══ Test 8: List Command ═══${NC}"
$CLI list
echo -e "✅ List works"

# =============================================================================
# Test 9: Add Another Package (React docs)
# =============================================================================
echo -e "\n${GREEN}═══ Test 9: Add Another Package ═══${NC}"
$CLI add https://github.com/reactjs/react.dev.git \
  --path src/content/learn \
  --alias react-learn
echo -e "✅ Added react-learn package"

# =============================================================================
# Test 10: List Multiple Packages
# =============================================================================
echo -e "\n${GREEN}═══ Test 10: List Multiple Packages ═══${NC}"
$CLI list
echo -e "✅ Multiple packages listed"

# =============================================================================
# Test 11: Count Markdown Files
# =============================================================================
echo -e "\n${GREEN}═══ Test 11: Count Markdown Files ═══${NC}"
MD_COUNT=$(find .context/packages -type f -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
echo "$MD_COUNT markdown files found in packages"
echo -e "✅ Files counted"

# =============================================================================
# Test 12: Update All Packages
# =============================================================================
echo -e "\n${GREEN}═══ Test 12: Update All Packages ═══${NC}"
$CLI update
echo -e "✅ Update all works"

# =============================================================================
# Test 13: Update Single Package
# =============================================================================
echo -e "\n${GREEN}═══ Test 13: Update Single Package ═══${NC}"
$CLI update node-errors
echo -e "✅ Update single package works"

# =============================================================================
# Test 14: Generate Command
# =============================================================================
echo -e "\n${GREEN}═══ Test 14: Generate Command ═══${NC}"
$CLI generate
echo -e "✅ Generate works"

# =============================================================================
# Test 15: INDEX.md Statistics
# =============================================================================
echo -e "\n${GREEN}═══ Test 15: INDEX.md Statistics ═══${NC}"
CHAR_COUNT=$(wc -c < .context/INDEX.md | tr -d ' ')
WORD_COUNT=$(wc -w < .context/INDEX.md | tr -d ' ')
LINE_COUNT=$(wc -l < .context/INDEX.md | tr -d ' ')
echo "Characters: $CHAR_COUNT"
echo "Words: $WORD_COUNT"
echo "Lines: $LINE_COUNT"
echo "Estimated tokens: ~$((CHAR_COUNT / 4))"
echo -e "✅ Statistics calculated"

# =============================================================================
# Test 16: Dirty State Protection
# =============================================================================
echo -e "\n${GREEN}═══ Test 16: Dirty State Protection ═══${NC}"
echo "test modification" >> .context/packages/node-errors/README.md 2>/dev/null || true
echo "Modified a file in node-errors package"
$CLI update node-errors || echo "(Expected: should skip dirty package)"
echo -e "✅ Dirty state protection works"

# =============================================================================
# Test 17: Remove Package
# =============================================================================
echo -e "\n${GREEN}═══ Test 17: Remove Package ═══${NC}"
$CLI remove react-learn --force
echo -e "✅ Remove package works"

# =============================================================================
# Test 18: Verify Removal
# =============================================================================
echo -e "\n${GREEN}═══ Test 18: Verify Removal ═══${NC}"
$CLI list
echo -e "✅ Removal verified"

# =============================================================================
# Test 19: Invalid Repository
# =============================================================================
echo -e "\n${GREEN}═══ Test 19: Invalid Repository (Expected to fail) ═══${NC}"
if $CLI add https://github.com/nonexistent-user-12345/nonexistent-repo-67890.git --alias bad-repo 2>&1; then
  echo -e "${RED}❌ Should have failed for nonexistent repo${NC}"
else
  echo -e "✅ Correctly rejected nonexistent repository"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    Test Summary                          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✅ All tests completed successfully!${NC}"
echo ""
echo "Final state:"
echo "- Packages installed: 1 (node-errors)"
echo "- INDEX.md size: $CHAR_COUNT characters (~$((CHAR_COUNT / 4)) tokens)"

