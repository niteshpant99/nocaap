# nocaap index

Build `INDEX.md` and search index for AI agent access.

## Usage

```bash
nocaap index [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--semantic` | Enable semantic search with vector embeddings | off |
| `--provider <provider>` | Embedding provider | `auto` |

### Providers

| Provider | Description |
|----------|-------------|
| `ollama` | Local Ollama with `nomic-embed-text` model |
| `openai` | OpenAI `text-embedding-3-small` (requires `OPENAI_API_KEY`) |
| `tfjs` | Transformers.js — slower, no setup required |
| `auto` | Auto-detect best available provider |

## Examples

```bash
# Build fulltext-only index
nocaap index

# Build hybrid index (fulltext + semantic)
nocaap index --semantic

# Force a specific provider
nocaap index --semantic --provider ollama
```

## What It Creates

- **`INDEX.md`** — AI-optimized document listing with metadata
- **`index.orama.json`** — Full-text search index (BM25 via Orama)
- **Vector index** (with `--semantic`) — Embedding vectors via LanceDB

## After Indexing

Start the MCP server to expose search to AI agents:

```bash
nocaap serve
```
