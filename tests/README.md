# nocaap Test Documentation

This document covers all testing approaches for nocaap.

## Test Infrastructure Overview

nocaap uses a dual-layer testing approach:

| Layer | Purpose | Location | Runs In |
|-------|---------|----------|---------|
| **Fixtures** | Public synthetic test corpus | `tests/fixtures/` | CI + Contributors |
| **Local** | Proprietary org-specific tests | `tests/local/` (gitignored) | Internal dev only |

---

## Quick Start

```bash
# Build first
npm run build

# Run unit tests (fast, no build needed)
npm run test:unit

# Run evaluation against public fixtures
npm run test:eval

# Run smoke tests (uses public repos)
./tests/smoke-test.sh

# Run full integration tests
./tests/run-tests.sh

# Run everything
npm run test:all
```

---

## 0. Unit Tests (Vitest)

Fast, isolated tests for pure functions. Run in < 5 seconds.

### Commands

| Command | Purpose |
|---------|---------|
| `npm run test:unit` | Run all unit tests once |
| `npm run test:watch` | Re-run on file changes |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:quick` | Build + typecheck + unit tests |

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `tests/unit/fusion.test.ts` | 14 | RRF algorithm, score normalization |
| `tests/unit/schemas.test.ts` | 25 | Config, Registry, Lockfile validation |

### Adding New Unit Tests

Create `tests/unit/<module>.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../../src/core/module.js';

describe('myFunction', () => {
  it('does something', () => {
    expect(myFunction('input')).toBe('output');
  });
});
```

---

## 1. Search Quality Evaluation

The evaluation framework tests search accuracy using a synthetic "Acme Labs" corpus.

### Available Commands

```bash
# Run all queries against fixture corpus (CI-friendly)
npm run test:eval

# Run core queries only
npm run test:eval:core

# Record a new baseline
npm run test:eval:baseline

# Compare against baseline (detects regressions)
npm run test:eval:compare

# Run against real .context/ data (internal dev)
npm run test:eval:local
```

### Test Corpus Structure

The fixture corpus at `tests/fixtures/context/.context/packages/`:

```
packages/
├── acme-identity/     # Company info (4 files)
│   ├── README.md      # Identity index
│   ├── about.md       # Company overview
│   ├── team.md        # Leadership roster
│   └── values.md      # Company values
├── acme-products/     # Product docs (5 files)
│   ├── README.md      # Product index
│   ├── widget-pro.md  # Production product
│   ├── dataflow.md    # Beta product
│   ├── cloudsync.md   # Development product
│   └── deprecated-tool.md
├── acme-projects/     # Current projects (4 files)
│   ├── README.md
│   ├── project-phoenix.md
│   ├── project-aurora.md
│   └── _template.md
├── acme-past-projects/  # Completed projects (3 files)
│   ├── README.md
│   ├── website-redesign.md
│   └── api-migration.md
└── acme-design/       # Design system (2 files)
    ├── colors.md
    └── typography.md
```

### Query Categories

| Category | Count | Purpose |
|----------|-------|---------|
| Core | 7 | Must pass for release |
| Edge | 5 | Should pass (edge cases) |
| Regression | 1 | Prevent known bug recurrence |

### Current Baseline

- **Accuracy@1**: 76.9% (10/13 queries)
- **MRR**: 0.825
- **Thresholds**: Accuracy ≥ 70%, MRR ≥ 0.65

### Regenerating Fixture Index

If you modify the fixture corpus, regenerate the search index:

```bash
cd tests/fixtures/context
node ../../../dist/index.js index
```

---

## 2. Smoke Tests

Quick validation after code changes. Uses public repositories.

```bash
./tests/smoke-test.sh
```

**Tests:**
1. CLI help works
2. All command helps work
3. Add a small public repo
4. Verify .context structure
5. List command
6. Update command
7. Generate command
8. Remove command
9. Verify removal

---

## 3. Integration Tests

Full test suite using public repositories.

```bash
./tests/run-tests.sh
```

**Tests (19 total):**
1. CLI help
2. Add command help
3. Add public repository (sparse checkout)
4. Verify .context structure
5. Check config.json
6. Check lockfile
7. Check INDEX.md
8. List command
9. Add another package
10. List multiple packages
11. Count markdown files
12. Update all packages
13. Update single package
14. Generate command
15. INDEX.md statistics
16. Dirty state protection
17. Remove package
18. Verify removal
19. Invalid repository handling

---

## 4. Manual CLI Tests

Run these manually to verify all functionality works correctly.

### Prerequisites

```bash
# Build the project first
npm run build

# Verify build succeeded
node dist/index.js --help
```

### Setup Test Environment

```bash
# Create a fresh temp directory for testing
mkdir -p /tmp/nocaap-test && cd /tmp/nocaap-test

# Set CLI path
export NOCAAP="node /path/to/nocaap/dist/index.js"
```

### Test 1: Basic Add Command

```bash
$NOCAAP add https://github.com/sindresorhus/is-online.git --alias is-online
```

**Expected:**
- ✅ Creates `.context/` directory
- ✅ Creates `.context/packages/is-online/`
- ✅ Creates config, lockfile, and INDEX.md

### Test 2: Add with Sparse Checkout

```bash
$NOCAAP add https://github.com/goldbergyoni/nodebestpractices.git \
  --path sections/errorhandling \
  --alias node-errors \
  --branch master
```

**Expected:**
- ✅ Only specified path is downloaded
- ✅ Config shows `"path": "sections/errorhandling"`

### Test 3: List Packages

```bash
$NOCAAP list
```

**Expected:**
- ✅ Shows all installed packages with alias, source, path, branch, commit

### Test 4: Update Packages

```bash
# Update all
$NOCAAP update

# Update single
$NOCAAP update node-errors
```

### Test 5: Generate Index

```bash
$NOCAAP generate
```

**Expected:**
- ✅ Regenerates INDEX.md
- ✅ Shows file count and token estimate

### Test 6: Dirty State Protection

```bash
# Modify a file
echo "test" >> .context/packages/node-errors/README.md

# Try to update (should skip)
$NOCAAP update node-errors
```

**Expected:**
- ✅ Shows warning about uncommitted changes
- ✅ Skips the dirty package

### Test 7: Remove Package

```bash
$NOCAAP remove is-online --force
```

**Expected:**
- ✅ Removes package directory
- ✅ Updates config and lockfile
- ✅ Regenerates INDEX.md

### Test 8: Invalid Repository

```bash
$NOCAAP add https://github.com/nonexistent/repo.git --alias bad
```

**Expected:**
- ✅ Shows "Repository access denied"
- ✅ Exits with error code

### Test 9: Search Command

```bash
# First, ensure index exists
$NOCAAP index

# Then search
$NOCAAP search "error handling"
```

**Expected:**
- ✅ Returns relevant results from indexed content
- ✅ Shows file paths and relevance scores

---

## 5. Adding New Tests

### Adding Evaluation Queries

Edit `tests/eval/queries.ts`:

```typescript
export const CORE_QUERIES: EvalQuery[] = [
  {
    id: 'Q_NEW',
    query: 'Your test query',
    expectedTop: /expected-file\.md/,
    category: 'core',
    description: 'What this tests',
  },
  // ...
];
```

### Adding Fixture Content

1. Add markdown files to `tests/fixtures/context/.context/packages/`
2. Update `context.config.json` if adding new packages
3. Regenerate index: `cd tests/fixtures/context && node ../../../dist/index.js index`
4. Update queries and baseline

### Local Testing (Internal)

For org-specific tests, add files to `tests/local/` (gitignored):

```
tests/local/
├── queries.ts        # Org-specific queries
└── baseline.json     # Org-specific baseline
```

Run with: `npm run test:eval:local`

---

## Test Checklist Summary

| # | Test | Command | Status |
|---|------|---------|--------|
| 0 | Unit tests | `npm run test:unit` | ☐ |
| 1 | Build | `npm run build` | ☐ |
| 2 | Smoke tests | `./tests/smoke-test.sh` | ☐ |
| 3 | Evaluation (fixtures) | `npm run test:eval` | ☐ |
| 4 | Integration tests | `./tests/run-tests.sh` | ☐ |
| 5 | Baseline comparison | `npm run test:eval:compare` | ☐ |
| 6 | Manual CLI tests | See section 5 | ☐ |

---

## CI Integration

The project includes a GitHub Actions workflow at `.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:unit      # Vitest unit tests
      - run: npm run build
      - run: npm run test:eval      # Search quality evaluation
```

---

## Troubleshooting

### "No search index found"

Regenerate the fixture index:
```bash
cd tests/fixtures/context
node ../../../dist/index.js index
```

### Evaluation failing after changes

1. Run evaluation to see what's failing
2. Adjust queries if needed, or fix search logic
3. If changes are intentional, update baseline:
   ```bash
   npm run test:eval:baseline
   ```

### Tests pass locally but fail in CI

- Ensure fixtures are committed (not in .gitignore)
- Check Node.js version matches (18+)
- Verify build step runs before tests
