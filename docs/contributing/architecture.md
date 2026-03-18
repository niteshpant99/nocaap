# Architecture

Technical overview of nocaap's design and implementation.

## Core Philosophy

1. **Hub-and-Spoke** — Separates discovery (registry JSON) from storage (Git repos)
2. **Zero Auth** — Relies entirely on user's local Git credentials (SSH/HTTPS)
3. **Fail Safe** — Validates strictly and aborts if local data is at risk

## Tech Stack

- **Runtime:** Node.js (LTS)
- **Language:** TypeScript
- **CLI:** Commander.js + @inquirer/prompts
- **Git:** simple-git
- **Validation:** Zod
- **Search:** Orama (BM25 fulltext)
- **Vectors:** LanceDB
- **Embeddings:** Ollama, OpenAI, Transformers.js
- **MCP:** @modelcontextprotocol/sdk

## Layered Architecture

```
CLI Entry (src/index.ts)
    └── Commands (src/commands/)
        └── Core Logic (src/core/)
            └── Utilities (src/utils/)
```

### Commands Layer

Handles CLI argument parsing and orchestration. Each command file maps to one CLI command.

### Core Layer

- **config.ts** — Manages `.context/context.config.json` and `.context/context.lock`
- **git-engine.ts** — Partial clones, sparse checkout, dirty state detection
- **registry.ts** — Fetches and validates registries with federation support
- **indexer.ts** — Generates `INDEX.md` from installed packages
- **search-engine.ts** — Orama-based fulltext search with hybrid capabilities
- **vector-store.ts** — LanceDB vector storage for semantic search
- **mcp-server.ts** — MCP server exposing search/context tools
- **fusion.ts** — Reciprocal Rank Fusion algorithm

### Utilities Layer

- **paths.ts** — Cross-platform path handling via upath
- **logger.ts** — Chalk-styled output with ora spinners

## Key Design Decisions

**Partial Clone Strategy:** Uses `--filter=blob:none` and sparse-checkout to avoid downloading full repository history.

**No Git in Final Location:** Clones to temp directory, extracts content, then moves to `.context/packages/`.

**Lockfile for Reproducibility:** `context.lock` stores exact commit SHAs for deterministic installs across machines.

For the full technical specification, see `dev/ARCHITECTURE.md` in the repository.
