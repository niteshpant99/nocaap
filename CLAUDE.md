# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nocaap** (Normalized Organizational Context-as-a-Package) is a CLI tool that standardizes how AI agents discover and consume organizational knowledge. It uses a Hub-and-Spoke Git architecture to fetch documentation from various repositories into a unified, AI-optimized local index at `.context/`.

## Development Commands

### Build & Development
```bash
npm run build        # Build the project using tsup
npm run dev          # Build in watch mode for development
npm run start        # Run the built CLI
npm run typecheck    # Type-check without emitting files
npm run lint         # Lint source files with ESLint
```

### Testing the CLI
```bash
# Run commands directly during development
node dist/index.js setup
node dist/index.js add --url <repo-url>
node dist/index.js update
node dist/index.js status
node dist/index.js index

# Or use npm link for global testing
npm link
nocaap setup
```

## Architecture

### Core Architecture Pattern: Command → Core → Utils

The codebase follows a layered architecture:

1. **Entry Point** (`src/index.ts`): Commander.js CLI definition that routes to command handlers
2. **Commands Layer** (`src/commands/`): High-level command orchestration (setup, add, update)
3. **Core Layer** (`src/core/`): Business logic modules
4. **Utilities Layer** (`src/utils/`): Pure helper functions

### Core Modules

**Config Manager** (`src/core/config.ts`)
- Manages `.context/context.config.json` (manifest of installed contexts)
- Manages `.context/context.lock` (commit SHAs for reproducibility)
- All config operations are validated via Zod schemas before read/write

**Git Engine** (`src/core/git-engine.ts`)
- Security model: Relies on native Git/SSH credentials (no token handling)
- Uses `git clone --filter=blob:none --sparse --depth 1` for partial clones
- Implements dirty state detection before updates/removals
- All Git operations use temporary directories then move contents to final location

**Registry** (`src/core/registry.ts`)
- Fetches `nocaap-registry.json` from remote URLs
- Implements federated registry loading via `imports` field
- Loop protection via visited URL set
- Max federation depth of 5 levels

**Indexer** (`src/core/indexer.ts`)
- Scans `.context/packages/` for markdown files
- Extracts metadata from frontmatter (title, summary, type)
- Generates `.context/INDEX.md` for AI consumption
- Token budget: warns if INDEX.md exceeds 8000 tokens (~32k chars)

### Data Flow: Setup Command

1. User runs `nocaap setup --registry <url>`
2. `setupCommand` fetches registry via `fetchFederatedRegistryWithProgress()`
3. User selects contexts via `@inquirer/prompts` checkboxes
4. For each selected context:
   - Check repo access via `checkAccess()` (uses `git ls-remote`)
   - Perform `partialClone()` with sparse-checkout if path specified
   - Write package entry to `context.config.json`
   - Write commit hash to `context.lock`
5. Generate `INDEX.md` via `generateIndexWithProgress()`

### Data Flow: Update Command

1. `updateCommand` reads `context.config.json` and `context.lock`
2. For each package:
   - Get remote commit hash via `getRemoteCommitHash()`
   - Compare with lockfile hash
   - If different, check dirty state with `checkDirtyState()`
   - If clean, re-clone via `partialClone()` (safest for partial clones)
   - Update lockfile with new commit hash
3. Regenerate INDEX.md

### Key Design Decisions

**Partial Clone Strategy**: Uses `--filter=blob:none` to fetch only tree structure, then sparse-checkout to materialize specific paths. This avoids downloading full repository history.

**No Git in Final Location**: Clones to temp directory, extracts content, then moves to `.context/packages/`. This keeps the `.context/` folder clean and avoids nested `.git` directories.

**Security via Native Git**: No custom token handling. If user has SSH/HTTPS access via git config, it works. If not, it skips gracefully.

**Lockfile for Reproducibility**: `context.lock` stores exact commit SHAs. Running `nocaap update` without changes pulls same content across machines.

## Schema Validation

All data structures use Zod schemas (`src/schemas/index.ts`):
- `RegistrySchema`: Validates `nocaap-registry.json` format
- `ConfigSchema`: Validates `.context/context.config.json`
- `LockfileSchema`: Validates `.context/context.lock`

Validation happens at read/write boundaries to catch corruption early.

## File Structure Conventions

```
.context/
├── context.config.json    # User's installed packages (committed)
├── context.lock           # Exact commit SHAs (committed)
├── INDEX.md              # AI-optimized index (auto-generated)
└── packages/             # Cloned content (gitignored)
    ├── engineering/
    └── design-system/
```

The `packages/` directory should be gitignored (`.context/packages/` in `.gitignore`). Config and lock files should be committed for team reproducibility.

## Path Handling

All path operations use `upath` for Windows compatibility (`src/utils/paths.ts`):
- Always normalize paths to POSIX style (forward slashes)
- Critical for Git sparse-checkout paths on Windows
- Use exported helpers: `join()`, `toUnix()`, `normalize()`

## Logging

Logging utilities (`src/utils/logger.ts`) provide:
- Chalk-styled console output: `log.info()`, `log.success()`, `log.error()`, `log.warn()`
- Ora spinners for async operations: `withSpinner(text, task, options)`
- Debug logging via `log.debug()` (enabled with `DEBUG=true` env var)

## Build Configuration

- **tsup** for bundling (ESM format, Node 18 target)
- Adds shebang `#!/usr/bin/env node` to output
- Generates TypeScript declarations and sourcemaps
- Entry point: `src/index.ts` → `dist/index.js`

# NOTE:
DO NOT WRITE MORE THAN 100 LINES OF CODE AT A TIME. I MUST REVIEW THE CODE INCREMENTALLY. 