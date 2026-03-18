# nocaap

**Normalized Organizational Context-as-a-Package**

nocaap is a developer-first CLI tool that standardizes how AI agents discover and consume organizational knowledge. It uses a Hub-and-Spoke Git architecture to fetch documentation from various repositories into a unified, AI-optimized local index.

## Why nocaap?

Your AI coding assistant is only as good as its context. Security SOPs in one repo, design tokens in another, API specs in a third — your AI is guessing.

nocaap creates a standardized `.context/` folder in your project, populated with the exact versions of the documents your team needs.

## Key Features

- **Hub-and-Spoke Discovery** — One registry file maps your entire organization's knowledge
- **Native Git Security** — Uses your existing SSH/HTTPS credentials. Zero token configuration
- **Lightning Fast** — Sparse-checkout and partial clones fetch only the docs you need
- **AI Optimized** — Auto-generates a token-conscious `INDEX.md` for AI agents
- **MCP Server** — Expose context to Claude Desktop via Model Context Protocol
- **Hybrid Search** — Full-text (BM25) and semantic (vector) search with Reciprocal Rank Fusion
- **Two-Way Sync** — Push local edits back upstream as pull requests

## Quick Start

```bash
# Install
npm install -g nocaap

# Set your org registry
nocaap config registry https://github.com/your-org/context-hub

# Install contexts in your project
nocaap setup

# Build search index
nocaap index

# Start MCP server for Claude Desktop
nocaap serve
```

For a full walkthrough, see the [Getting Started](getting-started.md) guide.

## Commands

| Command | Description |
|---------|-------------|
| [`setup`](commands/setup.md) | Interactive setup wizard |
| [`add`](commands/add.md) | Add a context package from a Git repo |
| [`update`](commands/update.md) | Update packages and regenerate index |
| [`list`](commands/list.md) | List installed packages |
| [`remove`](commands/remove.md) | Remove a package |
| [`push`](commands/push.md) | Push local changes upstream as a PR |
| [`index`](commands/index.md) | Build search index |
| [`serve`](commands/serve.md) | Start MCP server |
| [`config`](commands/config.md) | Manage configuration |

## Links

- [GitHub Repository](https://github.com/niteshpant99/nocaap)
- [npm Package](https://www.npmjs.com/package/nocaap)
- [Context Hub Template](https://github.com/niteshpant99/nocaap-context-template)
