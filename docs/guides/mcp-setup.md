# MCP Server Setup

Set up nocaap as an MCP server so Claude Desktop (or other MCP-compatible AI agents) can search and retrieve your organization's context.

## Prerequisites

- nocaap installed (`npm install -g nocaap`)
- Context packages installed (`nocaap setup`)
- Search index built (`nocaap index`)

## 1. Build the Search Index

```bash
# Fulltext only (fast, no dependencies)
nocaap index

# Hybrid search (fulltext + semantic)
nocaap index --semantic
```

For semantic search, you need one of:

- **Ollama** running locally with `nomic-embed-text`
- **OpenAI API key** set as `OPENAI_API_KEY`
- **Transformers.js** (no setup, but slower)

## 2. Get Claude Desktop Config

```bash
nocaap serve --print-config
```

This prints a JSON snippet for your Claude Desktop config.

## 3. Add to Claude Desktop

Edit your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the nocaap server entry:

```json
{
  "mcpServers": {
    "nocaap": {
      "command": "nocaap",
      "args": ["serve", "--root", "/path/to/your/project"]
    }
  }
}
```

## 4. Restart Claude Desktop

After saving the config, restart Claude Desktop. You should see nocaap listed as an available MCP server.

## Available Tools

Once connected, Claude can use these tools:

| Tool | What It Does |
|------|-------------|
| `search` | Search your context packages by query |
| `list-packages` | List all installed packages |
| `get-context` | Retrieve full content of a document |

## Troubleshooting

- **Server not appearing:** Check the config file path and JSON syntax
- **Search returns no results:** Run `nocaap index` to rebuild the index
- **Permission errors:** Ensure nocaap is on your `PATH`
