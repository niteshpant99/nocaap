# ADR-001: Chunking Strategy for Search

## Status
Accepted

## Context
Documentation files need to be chunked for search indexing. Different file types
require different strategies for optimal search relevance. Initial evaluation
showed 50% accuracy (2/4 queries) with issues including:

- BM25 keyword blindness causing irrelevant results
- README files being split into fragments, losing overview context
- No consideration of document path in relevance scoring

## Decision

### 1. README/Index files: Keep as single chunks (up to 2000 chars)
- These are authoritative overview documents
- Splitting loses important context about what a package contains
- Files named `README.md` or `index.md` are detected automatically

### 2. Regular markdown files: Split by H2 sections (~500 char target)
- Maintains semantic boundaries
- Compatible with embedding model token limits
- Further splits paragraphs if section exceeds target size

### 3. Index documents get search boost: 1.25x multiplier
- Users searching "projects" should find `projects/README.md` first
- Applied after RRF fusion, before final ranking

### 4. Path-based boosting: 1.15x per keyword match
- Query keywords matching folder/file path get boosted
- Example: "projects" query boosts results with "projects" in path
- Stop words filtered to avoid false matches

### 5. Weighted RRF: 60% vector / 40% fulltext
- Semantic search favored over keyword matching
- Reduces BM25 keyword noise affecting hybrid results
- Configurable via constants for future tuning

## Consequences

### Positive
- README files maintain context as overview documents
- Path-relevant results rank higher
- Semantic understanding weighted over keyword matching

### Negative
- README files may exceed embedding token limits (truncated to 2000 chars)
- Index documents may dominate results for broad queries
- Non-README overview documents won't get the boost

### Trade-offs Accepted
- Truncation acceptable since most READMEs have key content at top
- Index document dominance is acceptable for overview queries
- Custom overview documents can be addressed in future iterations
