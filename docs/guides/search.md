# Search & Indexing

nocaap supports two search modes that can be combined for best results.

## Search Modes

### Fulltext Search (BM25)

Keyword-based search using the Orama engine. Fast, no setup required.

```bash
nocaap index
```

### Semantic Search (Vector)

Meaning-based search using embedding vectors. Understands synonyms and concepts.

```bash
nocaap index --semantic
```

### Hybrid Search

Combines both using Reciprocal Rank Fusion (RRF). This is the default when both indexes exist.

## Embedding Providers

| Provider | Setup | Speed | Quality |
|----------|-------|-------|---------|
| Ollama | Install Ollama + `ollama pull nomic-embed-text` | Fast | Good |
| OpenAI | Set `OPENAI_API_KEY` | Fast | Best |
| Transformers.js | None | Slow | Good |

### Setting Up Ollama

```bash
# Install (macOS/Linux)
curl -fsSL https://ollama.ai/install.sh | sh

# Pull the embedding model
ollama pull nomic-embed-text

# Verify
ollama list
```

Then build your index:

```bash
nocaap index --semantic --provider ollama
```

## Search Weights

Hybrid search weights are configurable:

```bash
# Project-level config
nocaap config --project search.fulltextWeight 0.4
nocaap config --project search.vectorWeight 0.6
```

Default: 40% fulltext, 60% vector.

## How Indexing Works

1. Scans `.context/packages/` for markdown files
2. Chunks documents into searchable segments
3. Extracts metadata from frontmatter (title, summary, type, tags)
4. Builds fulltext index via Orama
5. (With `--semantic`) Generates embedding vectors via LanceDB

## Token Budget

`INDEX.md` warns if it exceeds 8,000 tokens (~32k characters) to avoid blowing up AI context windows.
