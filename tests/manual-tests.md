# Manual Test Commands for nocaap

Run these tests manually to verify all functionality works correctly.

## Prerequisites

```bash
# Build the project first
cd /path/to/nocaap  # Your local clone of nocaap
pnpm run build

# Verify build succeeded
node dist/index.js --help
```

## Setup Test Environment

```bash
# Create a fresh temp directory for testing
mkdir -p /tmp/nocaap-test && cd /tmp/nocaap-test

# Set CLI path (adjust to your local path)
export NOCAAP="node /path/to/nocaap/dist/index.js"

# Or if installed globally:
# export NOCAAP="nocaap"
```

> **Note:** Replace `your-org/context-hub` in these examples with your own test repository that contains a `nocaap-registry.json` file.

---

## Test 1: Basic Add Command (SSH)

```bash
$NOCAAP add git@github.com:your-org/context-hub.git \
  --path docs/engineering \
  --alias engineering-docs
```

**Expected Results:**
- ✅ "Checking repository access..." succeeds (requires SSH keys)
- ✅ Creates `.context/` directory
- ✅ Creates `.context/packages/engineering-docs/`
- ✅ Creates `.context/context.config.json`
- ✅ Creates `.context/context.lock`
- ✅ Creates `.context/INDEX.md`

**Verify:**
```bash
ls -la .context/
cat .context/context.config.json
```

---

## Test 2: Add with Sparse Checkout

```bash
$NOCAAP add git@github.com:your-org/context-hub.git \
  --path docs/api \
  --alias api-docs
```

**Expected Results:**
- ✅ Only `docs/api` folder is downloaded (sparse checkout)
- ✅ Config shows `"path": "docs/api"`
- ✅ Package directory is `.context/packages/api-docs/`

**Verify:**
```bash
find .context/packages/api-docs -type f | head -10
cat .context/context.config.json | grep -A5 api-docs
```

---

## Test 3: Add Another Package

```bash
$NOCAAP add git@github.com:your-org/context-hub.git \
  --path docs/security \
  --alias security-docs
```

**Expected Results:**
- ✅ Downloads docs/security folder
- ✅ Creates third package in config
- ✅ INDEX.md now has 3 packages listed

---

## Test 4: List Command

```bash
$NOCAAP list
```

**Expected Results:**
- ✅ Shows all installed packages with:
  - Package alias
  - Source URL
  - Path (if sparse checkout)
  - Branch
  - Commit hash
  - Last updated date
- ✅ Shows status indicator

---

## Test 5: Update All Packages

```bash
$NOCAAP update
```

**Expected Results:**
- ✅ Checks each package for updates
- ✅ Shows "up-to-date" or "updated" for each
- ✅ Regenerates INDEX.md if updates found
- ✅ Shows summary at end

---

## Test 6: Update Single Package

```bash
$NOCAAP update engineering-docs
```

**Expected Results:**
- ✅ Only updates specified package
- ✅ Shows status for that package

---

## Test 7: Generate Index

```bash
$NOCAAP generate
```

**Expected Results:**
- ✅ Regenerates INDEX.md without network calls
- ✅ Shows file count and token estimate
- ✅ Warns if exceeds 8k token budget

**Verify:**
```bash
head -100 .context/INDEX.md
wc -c .context/INDEX.md
```

---

## Test 8: Dirty State Protection

```bash
# Make a local change to a package
echo "test modification" >> .context/packages/engineering-docs/README.md

# Try to update (should fail gracefully)
$NOCAAP update engineering-docs
```

**Expected Results:**
- ✅ Shows "Has uncommitted changes"
- ✅ Skips the package, doesn't crash
- ✅ Shows helpful message about committing/discarding

**Cleanup:**
```bash
cd .context/packages/engineering-docs && git checkout . && cd -
```

---

## Test 9: Remove Package

```bash
$NOCAAP remove security-docs
```

**Expected Results:**
- ✅ Prompts for confirmation if package has changes
- ✅ Removes package directory
- ✅ Updates config.json
- ✅ Updates lockfile
- ✅ Regenerates INDEX.md

**Verify:**
```bash
$NOCAAP list
ls .context/packages/
```

---

## Test 10: Remove with Force

```bash
$NOCAAP remove api-docs --force
```

**Expected Results:**
- ✅ Removes without prompting
- ✅ Works even if package has local changes

---

## Test 11: Invalid Repository

```bash
$NOCAAP add https://github.com/nonexistent-user/nonexistent-repo.git --alias bad
```

**Expected Results:**
- ✅ Shows "Repository access denied"
- ✅ Helpful error message with troubleshooting tips
- ✅ Exits with error code (non-zero)

---

## Test 12: Config Command (Global Registry)

```bash
# Set a registry as default (use your org's registry URL)
$NOCAAP config registry https://github.com/your-org/context-hub

# Verify it's saved
$NOCAAP config registry

# View all config
$NOCAAP config --list

# Clear registry (optional)
# $NOCAAP config registry --clear
```

**Expected Results:**
- ✅ Registry URL is saved to ~/.nocaap/config.json
- ✅ Shows "Default registry set!"
- ✅ Subsequent `nocaap setup` uses this registry automatically

---

## Test 13: Setup Wizard (with saved registry)

```bash
# First, clean up existing .context
rm -rf .context

# Run setup (should use saved registry)
$NOCAAP setup
```

**Expected Results:**
- ✅ Shows "Using default registry: https://..."
- ✅ Asks "Use this registry?" (default: yes)
- ✅ Fetches and shows available contexts from registry
- ✅ Interactive checkbox selection
- ✅ Installs selected contexts
- ✅ Generates INDEX.md

---

## Test 14: Setup with Explicit Registry

```bash
rm -rf .context
$NOCAAP setup --registry https://github.com/your-org/context-hub
```

**Expected Results:**
- ✅ Uses provided registry URL directly
- ✅ Shows all contexts from registry
- ✅ Offers to save as default if not already set

---

## Test 15: Config Drift Detection

```bash
# First, add a package
$NOCAAP add git@github.com:your-org/context-hub.git \
  --path docs/guides \
  --alias guides

# Manually edit the config to change the path (simulating drift)
# Edit .context/context.config.json and change "docs/guides" to "docs/other"

# Then try to update
$NOCAAP update guides
```

**Expected Results:**
- ✅ Detects path mismatch between config and lockfile
- ✅ Shows warning about sparse path changed
- ✅ Suggests re-running add command

---

## Test 16: Debug Mode

```bash
export NOCAAP_DEBUG=true
$NOCAAP add git@github.com:your-org/context-hub.git \
  --path docs/examples \
  --alias examples
unset NOCAAP_DEBUG
```

**Expected Results:**
- ✅ Shows verbose debug output
- ✅ Shows internal operations (paths, git commands)

---

## Test 17: Add Multiple Packages (Batch)

```bash
rm -rf .context

# Add multiple related contexts
$NOCAAP add git@github.com:your-org/context-hub.git --path docs/api --alias api
$NOCAAP add git@github.com:your-org/context-hub.git --path docs/guides --alias guides

$NOCAAP list
```

**Expected Results:**
- ✅ Both packages installed
- ✅ INDEX.md includes both sections
- ✅ List shows 2 packages

---

## Test 18: Add Multiple Packages (Different Paths)

```bash
rm -rf .context

# Add contexts from different paths
$NOCAAP add git@github.com:your-org/context-hub.git --path standards/code --alias code-standards
$NOCAAP add git@github.com:your-org/context-hub.git --path standards/security --alias security-standards
$NOCAAP add git@github.com:your-org/context-hub.git --path standards/docs --alias doc-standards

$NOCAAP list
```

**Expected Results:**
- ✅ All 3 packages installed
- ✅ INDEX.md includes all sections

---

## Test 19: Smart URL Parsing

Test that various URL formats are accepted:

```bash
rm -rf .context

# GitHub repo URL (auto-detects registry file)
$NOCAAP config registry https://github.com/your-org/context-hub
$NOCAAP setup

# GitHub blob URL (extracts raw URL)
$NOCAAP config registry https://github.com/your-org/context-hub/blob/main/nocaap-registry.json
$NOCAAP setup

# SSH URL (uses SSH directly)
$NOCAAP config registry git@github.com:your-org/context-hub.git
$NOCAAP setup
```

**Expected Results:**
- ✅ All URL formats are accepted
- ✅ HTTP URLs try raw fetch first, fallback to SSH for private repos
- ✅ SSH URLs use SSH directly

---

## Cleanup

```bash
# Remove test directory when done
cd ~
rm -rf /tmp/nocaap-test

# Optionally clear global config
# $NOCAAP config registry --clear
```

---

## Test Checklist Summary

| # | Test | Command | Status |
|---|------|---------|--------|
| 1 | Basic add (SSH) | `add git@...` | ☐ |
| 2 | Add with sparse checkout | `add ... --path <path>` | ☐ |
| 3 | Add another package | `add ... --path <path>` | ☐ |
| 4 | List packages | `list` | ☐ |
| 5 | Update all | `update` | ☐ |
| 6 | Update single | `update <alias>` | ☐ |
| 7 | Generate index | `generate` | ☐ |
| 8 | Dirty state protection | modify file, then update | ☐ |
| 9 | Remove package | `remove <alias>` | ☐ |
| 10 | Remove with force | `remove <alias> --force` | ☐ |
| 11 | Invalid repository | add nonexistent repo | ☐ |
| 12 | Config command | `config registry <url>` | ☐ |
| 13 | Setup with saved registry | `setup` | ☐ |
| 14 | Setup with explicit registry | `setup --registry <url>` | ☐ |
| 15 | Config drift | change config, then update | ☐ |
| 16 | Debug mode | `NOCAAP_DEBUG=true` | ☐ |
| 17 | Multiple packages (batch) | add multiple contexts | ☐ |
| 18 | Multiple packages (paths) | add from different paths | ☐ |
| 19 | Smart URL parsing | various URL formats | ☐ |

---

## Creating a Test Registry

To run these tests, you need a repository with a `nocaap-registry.json` file. Here's a minimal example:

```json
{
  "name": "My Org Context Hub",
  "contexts": [
    {
      "name": "Engineering Docs",
      "description": "Engineering standards and guides",
      "repo": "git@github.com:your-org/context-hub.git",
      "path": "docs/engineering",
      "tags": ["engineering", "docs"]
    },
    {
      "name": "API Docs",
      "description": "API documentation",
      "repo": "git@github.com:your-org/context-hub.git",
      "path": "docs/api",
      "tags": ["api", "docs"]
    }
  ]
}
```

Place this file at the root of your test repository as `nocaap-registry.json`.
