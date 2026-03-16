# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] - 2026-03-15

### Added

- Post-setup indexing wizard to guide users through building a search index after setup
- Vitest testing framework with unit test suite and coverage reporting
- GitHub Actions CI workflow for automated testing on push and PR
- Search evaluation test suite with fixture-based queries and accuracy thresholds
- Path traversal protection in `nocaap push` command
- Deletion mirroring in push so locally-deleted files appear as deletions in PRs

### Fixed

- Push path duplication for nested sparse packages — packages with paths like `/identity/colors` no longer create doubled paths (`identity/colors/identity/colors/...`) in PRs
- PRs no longer created for unchanged packages during `nocaap push` — only packages with actual diffs get branches, commits, and PRs
- `.gitignore` pattern anchored to repo root so test fixtures are tracked in version control
- CI dependency lockfile synced for reproducible installs

## [0.0.2] - 2026-01-18

### Added

- `nocaap index` command to build INDEX.md and search index for AI agent access
- `nocaap serve` command to start the MCP (Model Context Protocol) server
- Hybrid search combining BM25 fulltext search (via Orama) and vector semantic search
- Embedding provider support: Ollama (`nomic-embed-text`), OpenAI (`text-embedding-3-small`), Transformers.js (`all-MiniLM-L6-v2`)
- Auto-detection of available embedding providers during `nocaap index --semantic`
- Reciprocal Rank Fusion (RRF) algorithm for merging fulltext and vector search results
- Dual-scope settings system — project-level (`.context/settings.json`) and global (`~/.nocaap/settings.json`)
- MCP server tools: `search`, `list-packages`, `get-context` for AI agent integration
- Markdown chunker for splitting documents into searchable chunks with metadata
- ADR-001: Chunking strategy documentation

### Changed

- Enhanced `nocaap config` command with project and global scope support
- Improved README with MCP server setup instructions and search feature documentation

## [0.0.1] - 2026-01-17

### Added

- Core CLI with commands: `setup`, `add`, `update`, `list`, `remove`, `config`, `push`
- Git engine with `--filter=blob:none --sparse --depth 1` partial clone strategy
- Sparse checkout support for fetching specific paths within repositories
- Registry system with federated loading via `imports` field (max 5 levels deep)
- INDEX.md auto-generation for AI-optimized context consumption (8000 token budget warning)
- Zod schema validation for configurations, lockfiles, and registries
- Lockfile (`context.lock`) for reproducible builds across machines
- `nocaap push` command for bidirectional sync — push local edits back upstream as PRs
- Smart URL detection for registry fetching
- npm package configuration for publishing

### Fixed

- Duplicate shebang lines in build output resolved via tsup banner configuration

[Unreleased]: https://github.com/niteshpant99/nocaap/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/niteshpant99/nocaap/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/niteshpant99/nocaap/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/niteshpant99/nocaap/releases/tag/v0.0.1
