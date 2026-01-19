# SPECS.md: The Unified Vision for nocaap

**Version:** 1.1.0 (MCP & Search Integration)
**Status:** Implemented
**Date:** January 2026

---

## 1. Executive Summary

**nocaap** (Normalized Organizational Context-as-a-Package) is a developer-first infrastructure tool designed to solve the "AI Context Problem."

As AI agents (Cursor, Copilot, Claude) become integral to engineering workflows, they fail when they lack organizational context. **nocaap** treats organizational knowledge (SOPs, Design Systems, Security Standards) as **versioned, installable dependencies**.

We are building a CLI tool that leverages a **Hub-and-Spoke Git Architecture** to fetch, filter, and index documentation from across an organization into a standardized local format (`.context/`) that AI agents can consume automatically.

**The Core Mantra:** "No scattered docs. No inconsistent AI. No cap."

---

## 2. Historical Context & Evolution

To understand *what* we are building, we must record *how* we arrived here. This project evolved through three distinct architectural phases:

### Phase 1: The "Private Registry" (Discarded)
*   **Idea:** Build an npm-like ecosystem with a custom registry server, authentication tokens, and a complex ABAC policy engine.
*   **Why Discarded:** It was over-engineered. Documentation is a human problem; adding authentication friction (managing new tokens, setting up private registries) ensures zero adoption.

### Phase 2: The "Simple Clone" (Critiqued)
*   **Idea:** Just use `git clone` to pull repositories into a folder.
*   **Why Critiqued:** It leads to "Repo Sprawl." Users have to manually find and manage URLs for Engineering, HR, Design, etc. It lacks discovery and access control.

### Phase 3: The "Hub-and-Spoke" (The Winner)
*   **Idea:** Separate **Discovery** (a Registry Map) from **Storage** (Git Repositories). Use native Git SSH for security. Use Partial Clones for performance.
*   **Why Selected:** It balances the simplicity of Git with the discoverability of a registry, without requiring a single new server or auth token.

---

## 3. The Problem Statement

1.  **Context is Scattered:** Security standards live in Repo A, API specs in Repo B, and Design tokens in Repo C. AI agents cannot "see" across these boundaries.
2.  **Context is Heavy:** Cloning a 5GB Monorepo just to get the `/docs/api` folder is inefficient and slow.
3.  **Discovery is Hard:** Developers don't know which repos contain the "current" standards.
4.  **Access Control is Binary:** You either have access to the repo or you don't. Managing granular access via a CLI tool is traditionally difficult.

---

## 4. The Solution: Hub-and-Spoke Architecture

**nocaap** implements a federated knowledge network using existing Git infrastructure.

### A. The Hub (Discovery)
A simple JSON file (`nocaap-registry.json`) hosted in a widely accessible "General" repository. It maps logical names to physical Git paths.

### B. The Spokes (Storage)
Repositories organized by **Access Level**, not just topic.
*   **Tier 1 (Internal):** Readable by everyone (Eng, Design, Marketing).
*   **Tier 2 (Restricted):** Readable by specific teams (Finance, Exec), guarded by GitHub/GitLab permissions.

### C. The Engine (The CLI)
A stateless tool that:
1.  **Reads the Map:** Fetches the Registry to show a menu of available contexts.
2.  **Checks Access:** Uses `git ls-remote` to verify if the user has read-access (via SSH).
3.  **Materializes:** Uses **Partial Clones** to download *only* the requested documentation folder.

---

## 5. Technical Implementation (PoC Scope)

### 5.1 Tech Stack
*   **Runtime:** Node.js (Distributed via `npx`).
*   **Language:** TypeScript (Strict typing for file systems/Git).
*   **Git Client:** `simple-git` (Wraps user's local binary + SSH keys).
*   **UX:** `commander` (CLI), `inquirer` (Wizard), `ora` (Spinners).
*   **Parsing:** `gray-matter` (Frontmatter), `zod` (Validation).
*   **Utils:** `upath` (Windows path normalization).

### 5.2 Critical Mechanics

#### The "Surgical Strike" Clone
To scale to large monorepos, we do **not** perform standard clones. We use:
```bash
git clone --filter=blob:none --sparse --depth 1 <url> <temp>
git sparse-checkout set <path>
```
*   `--filter=blob:none`: Downloads file list only (no contents).
*   `--sparse`: Prepares for folder filtering.
*   `--depth 1`: No history.

#### The "Indexer" (The Brain)
We generate a single `INDEX.md` file for the AI.
*   **Input:** `.md` / `.mdx` files in `.context/packages/`.
*   **Logic:** Read Frontmatter `summary`. If missing, read top 5 lines.
*   **Output:** A consolidated markdown file with links to the full content.
*   **Budgeting:** Warning if `INDEX.md` exceeds 8,000 tokens.

### 5.3 MCP Server (AI Agent Integration)

nocaap exposes organizational context to AI agents via the Model Context Protocol (MCP).

#### Starting the Server
```bash
nocaap serve              # Start MCP server (stdio transport)
nocaap serve --root /path # Specify project root
nocaap serve --print-config  # Print Claude Desktop config JSON
```

#### MCP Resources
| Resource | URI | Description |
|----------|-----|-------------|
| **index** | `nocaap://index` | Complete INDEX.md with document summaries |
| **manifest** | `nocaap://manifest` | Installed packages and search availability |

#### MCP Tools
| Tool | Description |
|------|-------------|
| **get_overview** | Get structured overview of all organizational knowledge. *Recommended first call.* |
| **search** | Search across team directory, product docs, engineering guidelines, company strategy |
| **get_document** | Retrieve full document content by path (from search results) |
| **get_section** | Extract specific section by heading from a document |
| **list_contexts** | List available knowledge domains and installed packages |

#### Claude Desktop Integration
```json
{
  "mcpServers": {
    "nocaap": {
      "command": "nocaap",
      "args": ["serve", "--root", "/path/to/project"]
    }
  }
}
```

### 5.4 Search Engine

nocaap provides three search modes for AI agents.

#### Full-Text Search (Default)
*   **Engine:** Orama with BM25 ranking
*   **Index:** `.context/index.orama.json`
*   **Use case:** Keyword-based queries, exact matches

#### Semantic Search
*   **Engine:** LanceDB vector store
*   **Index:** `.context/index.lance/`
*   **Providers:** Ollama (local), OpenAI (API), Transformers.js (fallback)
*   **Use case:** Conceptual queries, meaning-based search

#### Hybrid Search
*   **Algorithm:** Reciprocal Rank Fusion (RRF)
*   **Weights:** fulltext=0.4, vector=0.6 (configurable)
*   **Boosting:** +15% for path matches, +25% for index files
*   **Use case:** Best overall results (default when vectors available)

```bash
nocaap index              # Build full-text index
nocaap index --semantic   # Build with vector embeddings
```

---

## 6. Data Structures

### The Registry Map (`nocaap-registry.json`)
Hosted remotely.
```typescript
type Registry = {
  contexts: {
    name: string;        // "Engineering Standards"
    description: string;
    repo: string;        // "git@github.com:acme/hub.git"
    path?: string;       // "/docs/standards"
    tags?: string[];
  }[];
  imports?: string[];    // Federation URLs
}
```

### The Local Manifest (`context.config.json`)
Local project configuration.
```typescript
type Config = {
  registryUrl?: string; 
  packages: {
    alias: string;     // "engineering"
    source: string;    // Git URL
    path?: string;     // Sparse path
    version?: string;  // "main" or Tag
  }[];
}
```

### The State Lock (`context.lock`)
Ensures reproducibility and detects drift.
```typescript
type Lockfile = {
  [alias: string]: {
    commitHash: string; // The HEAD SHA
    sparsePath: string; // To detect path config changes
    updatedAt: string;
  }
}
```

---

## 7. Safety & Edge Cases

We prioritize **Data Safety** and **UX** over feature breadth for the PoC.

| Risk | Mitigation Strategy |
| :--- | :--- |
| **Dirty State Data Loss** | Before `update` or overwrite, run `git status`. If local changes exist, **ABORT** immediately. |
| **Auth Failures** | If a user selects a "Restricted" repo they can't access, we warn and skip. We do not crash. |
| **Windows Compatibility** | All paths are passed through `upath.toUnix()` before hitting Git. |
| **Circular Registries** | The setup wizard tracks visited Registry URLs in a `Set` to prevent infinite loops. |
| **Context Drift** | Lockfile hashes both the Commit SHA *and* the Sparse Path. |

---

## 8. User Workflows

### The Setup Wizard (`npx nocaap setup`)
1.  User provides Registry URL (or CLI finds it in global config).
2.  CLI displays interactive checkbox list of contexts.
3.  User selects "Engineering" and "Finance".
4.  CLI validates access (SSH check).
5.  CLI installs accessible contexts and generates `INDEX.md`.

### The Maintenance (`npx nocaap update`)
1.  CLI reads `context.config.json`.
2.  CLI checks `context.lock`.
3.  CLI checks remote for updates OR config changes.
4.  CLI performs safe update (checking for dirty state).

### The AI Agent Connection (`npx nocaap serve`)
1.  CLI validates `.context/` directory exists.
2.  CLI loads search index (if available).
3.  CLI starts MCP server on stdio transport.
4.  AI agent (Claude Desktop) connects and discovers tools.
5.  Agent uses `get_overview` to understand available context.
6.  Agent uses `search` → `get_document` pattern for queries.

### Building Search Index (`npx nocaap index`)
1.  CLI scans `.context/packages/` for markdown files.
2.  CLI chunks documents (500 tokens, heading boundaries).
3.  CLI builds Orama full-text index.
4.  (Optional) CLI generates embeddings with selected provider.
5.  CLI saves indices to `.context/`.

---

## 9. Completed Features (Post-PoC)

The following features have been implemented since the initial PoC:

1.  **MCP Server:** Full Model Context Protocol integration for AI agents (Claude Desktop).
2.  **Full-Text Search:** Orama-based BM25 search across all context packages.
3.  **Semantic Search:** Vector embeddings via Ollama, OpenAI, or Transformers.js.
4.  **Hybrid Search:** Reciprocal Rank Fusion combining BM25 and vector results.
5.  **Two-Way Sync:** `nocaap push` command for contributing changes back via PR.
6.  **npm Published:** Available globally via `npm install -g nocaap`.
7.  **Configuration System:** Global and project-level config with merge logic.

## 10. Future Roadmap

Features planned for future releases:

1.  **`nocaap scrape`:** Scrape documentation from websites and PDFs.
2.  **`nocaap create`:** Scaffold new context packages with templates.
3.  **Post-Setup Wizard:** Guided indexing experience after setup.
4.  **Cursor/Claude Skills:** Native IDE integration beyond MCP.
5.  **Web Interface:** For non-technical users who can't use CLI.
6.  **Federated Networks:** Connect registries across organizations.

---

## 11. Conclusion

We are building the "Git" of AI Context. By remaining stateless, auth-less (relying on SSH), and leveraging the native power of `sparse-checkout`, **nocaap** provides a robust, enterprise-ready solution with zero infrastructure cost.
