# Architecture & Implementation Plan

This document outlines the technical design for the **nocaap** Proof of Concept (PoC).

## Core Philosophy
1.  **Hub-and-Spoke:** We separate **Discovery** (Registry JSON) from **Storage** (Git Repositories).
2.  **Zero Auth:** We rely entirely on the user's local Git credentials (SSH/Credential Manager). We do not manage tokens.
3.  **Fail Safe:** We validate configuration strictly and abort if local data is at risk ("Dirty State").

## Tech Stack
*   **Runtime:** Node.js (LTS)
*   **Language:** TypeScript
*   **CLI Framework:** `commander` + `@inquirer/prompts`
*   **Git Engine:** `simple-git` (Lightweight wrapper for native git)
*   **Validation:** `zod`
*   **Parsing:** `gray-matter` (Frontmatter)
*   **MCP Server:** `@modelcontextprotocol/sdk` (AI agent integration)
*   **Search Engine:** `@orama/orama` (Full-text search with BM25)
*   **Vector Store:** `lancedb` (Vector similarity search)
*   **Embeddings:** Ollama, OpenAI, or Transformers.js

## 1. Data Structures

### A. The Registry Map (`nocaap-registry.json`)
A file hosted in a "Public" (Internal) repository that acts as the menu for `nocaap setup`.

```typescript
interface Registry {
  name: string;        // Organization Name
  contexts: {
    name: string;      // "Engineering Standards"
    description: string; 
    repo: string;      // "git@github.com:acme/eng-hub.git"
    path?: string;     // "/docs/api" (Sparse path)
    tags?: string[];   // ["public", "eng"]
  }[];
  imports?: string[];  // URLs to other registries (Federation)
}
```

### B. The Local Manifest (`.context/context.config.json`)
Stores the user's *intent*.

```typescript
interface Config {
  registryUrl?: string; 
  packages: {
    alias: string;     // "engineering"
    source: string;    // Git URL
    path?: string;     // Sparse path
    version?: string;  // "main" or Tag
  }[];
}
```

### C. The State Lock (`.context/context.lock`)
Stores the *actual* installed state to prevent drift.

```typescript
interface Lockfile {
  [alias: string]: {
    commitHash: string; // The HEAD SHA of the installed repo
    sparsePath: string; // Used to detect if path config changed
    updatedAt: string;
  }
}
```

## 2. Critical Workflows (In Scope for PoC)

### A. The "Setup" Wizard (Hub Discovery)
1.  **Fetch:** Download `nocaap-registry.json`.
    *   *Loop Protection:* Maintain a `Set<URL>` of visited registries to prevent circular import crashes.
2.  **Display:** Use `inquirer` checkbox to show available contexts.
3.  **Filter:** Before adding, perform a dry-run `git ls-remote`.
    *   If `200 OK`: Add to install list.
    *   If `403 Forbidden`: Warn user ("Access Denied") and skip. **This is our security model.**

### B. The Git Engine (`add` / `update`)
To support scaling, we do **not** perform standard clones.

1.  **Normalization:** Convert all paths to POSIX style (forward slashes) using `upath` to ensure Windows compatibility.
2.  **Partial Clone:**
    ```bash
    git clone --filter=blob:none --sparse --depth 1 <url> <temp_dir>
    ```
3.  **Sparse Checkout:**
    ```bash
    git sparse-checkout set <normalized_path>
    ```
4.  **Dirty Check (Update Only):**
    Before touching an existing package, run `git status --porcelain`.
    *   If output is not empty: **ABORT**. Throw error: "Local changes detected. Please commit or stash."

### C. The Indexer (`generate`)
Generates the context file for the AI.

1.  **Scan:** Walk the `.context/packages` directory for `.md` and `.mdx` files.
2.  **Parse:** Read Frontmatter (`---`).
    *   Extract `title`, `summary`, `type`.
3.  **Budgeting:**
    *   If `INDEX.md` > 8,000 tokens (approx 32k chars): Emit Warning.
    *   Strategy: Include `summary` field. If missing, include first 5 lines of body.

## 3. Edge Case Handling (PoC Scope)

| Edge Case | Solution |
| :--- | :--- |
| **Windows Paths** | Enforce POSIX normalization on all path inputs before passing to `simple-git`. |
| **Context Drift** | Lockfile stores `SHA + Path`. If config path changes, hash mismatch forces update. |
| **User Edits** | "Dirty State" check prevents overwriting user's manual fixes. |
| **Circular Registry** | Max recursion depth + Visited URL Set. |
| **Auth Failure** | Graceful degradation. If a user selects a restricted repo, we warn & skip, don't crash. |

## 4. MCP Server Architecture

The MCP (Model Context Protocol) server exposes nocaap context to AI agents like Claude Desktop.

### Transport
*   **Protocol:** JSON-RPC 2.0 over stdio
*   **Transport:** `StdioServerTransport` from MCP SDK
*   **Critical:** No stdout logging (corrupts protocol) - errors go to stderr

### Resources (Passive Data)
| Resource | URI | Purpose |
|----------|-----|---------|
| **index** | `nocaap://index` | Full INDEX.md content for context discovery |
| **manifest** | `nocaap://manifest` | Package metadata and search availability |

### Tools (Active Operations)
| Tool | Purpose |
|------|---------|
| **get_overview** | Returns INDEX.md - recommended first call for agents |
| **search** | Full-text, semantic, or hybrid search across all packages |
| **get_document** | Retrieve full document content by path |
| **get_section** | Extract specific section by heading |
| **list_contexts** | List installed packages and their sources |

### Security
*   Path traversal protection: All paths validated to stay within `.context/`
*   Read-only: MCP server cannot modify files

## 5. Search Engine Architecture

### A. Full-Text Search (Orama)
*   **Algorithm:** BM25 ranking
*   **Index:** Stored as `.context/index.orama.json`
*   **Fields:** content, title, summary, headings, tags, package

### B. Semantic Search (Vector Store)
*   **Storage:** LanceDB (embedded vector database)
*   **Index:** Stored as `.context/index.lance/`
*   **Providers:** Ollama (default), OpenAI, Transformers.js (fallback)

### C. Hybrid Search (RRF Fusion)
Combines BM25 and vector results using Reciprocal Rank Fusion:
```
RRF_score(d) = Σ (weight_i / (k + rank_i(d)))
```
*   **Default weights:** fulltext=0.4, vector=0.6
*   **RRF constant (k):** 60 (configurable)
*   **Path boosting:** +15% per query keyword in file path
*   **Index boosting:** +25% for README.md and index.md files

### D. Chunking Strategy
*   **Target:** 500 tokens per chunk (configurable)
*   **Boundaries:** Respects markdown headings (h1-h3)
*   **Overlap:** 50 tokens between chunks
*   **Metadata:** Frontmatter extracted and attached to each chunk

## 6. Configuration System

### Priority Order
```
CLI flags > Project config > Global config > Defaults
```

### Global Config (`~/.nocaap/config.json`)
*   Default registry URL
*   Embedding provider settings
*   Push defaults (base branch)

### Project Config (`.context/context.config.json`)
*   Installed packages
*   Search weight tuning
*   Index settings

## 7. Out of Scope (Current Version)
*   Legacy Git server support (Bitbucket Server / non-partial-clone servers).
*   Interactive Merge resolution for dirty states.
*   `nocaap create` scaffolding command.
*   Complex version resolution (semver).
