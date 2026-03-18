# nocaap serve

Start the MCP (Model Context Protocol) server for AI agent access.

## Usage

```bash
nocaap serve [options]
```

## Options

| Option | Description |
|--------|-------------|
| `--print-config` | Print Claude Desktop configuration JSON |
| `--root <path>` | Project root directory (default: current directory) |

## Examples

```bash
# Start MCP server
nocaap serve

# Print Claude Desktop config
nocaap serve --print-config
```

## MCP Tools Exposed

| Tool | Description |
|------|-------------|
| `search` | Search context packages using fulltext or hybrid search |
| `list-packages` | List all installed context packages |
| `get-context` | Retrieve full content of a specific document |

## Claude Desktop Setup

1. Run `nocaap serve --print-config` to get the JSON snippet
2. Add it to your Claude Desktop config file:
    - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
    - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. Restart Claude Desktop

Example config entry:

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
