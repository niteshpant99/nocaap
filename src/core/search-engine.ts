/**
 * src/core/search-engine.ts
 * Orama-based search engine for full-text search over context packages
 * Extended with hybrid search (BM25 + vector) via Reciprocal Rank Fusion
 */
import fs from 'fs-extra';
import { create, insertMultiple, search, type Orama } from '@orama/orama';
import { persist, restore } from '@orama/plugin-data-persistence';
import * as paths from '../utils/paths.js';
import { log } from '../utils/logger.js';
import type { Chunk } from './chunker.js';
import { VectorStore } from './vector-store.js';
import { generateQueryEmbedding, type EmbeddingProvider } from './embeddings.js';
import { reciprocalRankFusion, normalizeScores, type RankedResult } from './fusion.js';

// =============================================================================
// Constants
// =============================================================================

/** Search index file name */
export const SEARCH_INDEX_FILE = 'index.orama.json';

/** Default search limit */
const DEFAULT_LIMIT = 10;

/** Index version for future compatibility */
const INDEX_VERSION = '1.0.0';

/** RRF weight configuration - favor semantic search to reduce keyword noise */
const RRF_FULLTEXT_WEIGHT = 0.4;
const RRF_VECTOR_WEIGHT = 0.6;

// =============================================================================
// Types
// =============================================================================

/** Orama document schema matching our chunks */
interface OramaDocument {
  id: string;
  content: string;
  path: string;
  package: string;
  headings: string[];
  title: string;
  summary: string;
  type: string;
  tags: string[];
}

/** Search result type */
export interface SearchResult {
  id: string;
  content: string;
  path: string;
  package: string;
  headings: string[];
  title: string;
  score: number;
}

/** Search mode for hybrid search */
export type SearchMode = 'fulltext' | 'semantic' | 'hybrid';

/** Hybrid search result with source info */
export interface HybridSearchResult extends SearchResult {
  sources?: {
    fulltext?: number;
    vector?: number;
  };
}

/** Index metadata for versioning */
interface IndexMetadata {
  version: string;
  createdAt: string;
  chunkCount: number;
  packages: string[];
}

/** Stored index format */
interface StoredIndex {
  metadata: IndexMetadata;
  data: unknown;
}

// =============================================================================
// Schema Definition
// =============================================================================

const oramaSchema = {
  id: 'string',
  content: 'string',
  path: 'string',
  package: 'string',
  headings: 'string[]',
  title: 'string',
  summary: 'string',
  type: 'string',
  tags: 'string[]',
} as const;

// =============================================================================
// Query Processing Helpers
// =============================================================================

/** Stop words to exclude from path matching */
const STOP_WORDS = new Set([
  'what', 'is', 'the', 'a', 'an', 'how', 'do', 'does', 'are', 'was',
  'were', 'been', 'being', 'have', 'has', 'had', 'having', 'who',
  'which', 'where', 'when', 'why', 'can', 'could', 'would', 'should',
  'of', 'on', 'in', 'to', 'for', 'with', 'by', 'from', 'at', 'about',
]);

/**
 * Extract meaningful keywords from query for path boosting
 */
function extractQueryKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

// =============================================================================
// Search Engine Class
// =============================================================================

export class SearchEngine {
  private db: Orama<typeof oramaSchema> | null = null;
  private metadata: IndexMetadata | null = null;
  private vectorStore: VectorStore | null = null;
  private projectRoot: string | null = null;
  private embeddingProvider: EmbeddingProvider = 'auto';

  /**
   * Check if the search engine has been initialized
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Create a new search index from chunks
   */
  async createIndex(chunks: Chunk[]): Promise<void> {
    log.debug(`Creating search index with ${chunks.length} chunks`);

    this.db = await create({ schema: oramaSchema });

    // Convert chunks to Orama documents
    const documents: OramaDocument[] = chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      path: chunk.path,
      package: chunk.package,
      headings: chunk.headings,
      title: chunk.metadata.title,
      summary: chunk.metadata.summary ?? '',
      type: chunk.metadata.type ?? '',
      tags: chunk.metadata.tags,
    }));

    // Batch insert for performance
    await insertMultiple(this.db, documents, 500);

    // Extract unique packages
    const packages = [...new Set(chunks.map((c) => c.package))];

    this.metadata = {
      version: INDEX_VERSION,
      createdAt: new Date().toISOString(),
      chunkCount: chunks.length,
      packages,
    };

    log.debug(`Search index created with ${chunks.length} documents`);
  }

  /**
   * Save the index to a JSON file
   */
  async saveIndex(projectRoot: string): Promise<void> {
    if (!this.db || !this.metadata) {
      throw new Error('No index to save. Call createIndex first.');
    }

    const indexPath = paths.join(paths.getContextDir(projectRoot), SEARCH_INDEX_FILE);

    // Persist database to JSON format
    const data = await persist(this.db, 'json');

    const storedIndex: StoredIndex = {
      metadata: this.metadata,
      data,
    };

    await fs.writeJson(indexPath, storedIndex, { spaces: 2 });
    log.debug(`Saved search index to ${indexPath}`);
  }

  /**
   * Load an existing index from file
   */
  async loadIndex(projectRoot: string): Promise<boolean> {
    const indexPath = paths.join(paths.getContextDir(projectRoot), SEARCH_INDEX_FILE);
    this.projectRoot = projectRoot;

    if (!(await paths.exists(indexPath))) {
      log.debug('No existing search index found');
      return false;
    }

    try {
      const storedIndex: StoredIndex = await fs.readJson(indexPath);

      // Restore database from JSON (type assertion is safe since we created with same schema)
      this.db = await restore('json', storedIndex.data as string) as Orama<typeof oramaSchema>;
      this.metadata = storedIndex.metadata;

      log.debug(`Loaded search index: ${this.metadata.chunkCount} chunks`);

      // Try to initialize vector store if it exists
      await this.initializeVectorStore();

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.debug(`Failed to load search index: ${message}`);
      return false;
    }
  }

  /**
   * Initialize the vector store if available
   */
  private async initializeVectorStore(): Promise<boolean> {
    if (!this.projectRoot) return false;

    try {
      const store = new VectorStore(this.projectRoot);
      const initialized = await store.initialize();

      if (initialized) {
        this.vectorStore = store;
        const metadata = await store.getMetadata();
        if (metadata) {
          this.embeddingProvider = metadata.embedding.provider;
          log.debug(`Loaded vector store (${metadata.embedding.model})`);
        }
        return true;
      }

      // No vector index found
      this.vectorStore = null;
      return false;
    } catch {
      log.debug('Vector store not available');
      this.vectorStore = null;
      return false;
    }
  }

  /**
   * Check if vector search is available
   */
  hasVectorSearch(): boolean {
    return this.vectorStore !== null;
  }

  /**
   * Search the index
   */
  async search(options: {
    query: string;
    packages?: string[];
    tags?: string[];
    limit?: number;
  }): Promise<SearchResult[]> {
    if (!this.db) {
      throw new Error('Search engine not initialized. Call loadIndex or createIndex first.');
    }

    const { query, packages, tags, limit = DEFAULT_LIMIT } = options;

    // Build filter if needed
    let where: Record<string, unknown> | undefined;

    if (packages?.length || tags?.length) {
      where = {};
      if (packages?.length) {
        where.package = packages;
      }
      if (tags?.length) {
        where.tags = { containsAll: tags };
      }
    }

    const results = await search(this.db, {
      term: query,
      properties: ['content', 'title', 'summary', 'headings'],
      limit,
      where,
    });

    return results.hits.map((hit) => ({
      id: hit.document.id,
      content: hit.document.content,
      path: hit.document.path,
      package: hit.document.package,
      headings: hit.document.headings,
      title: hit.document.title,
      score: hit.score,
    }));
  }

  /**
   * Get index metadata
   */
  getMetadata(): IndexMetadata | null {
    return this.metadata;
  }

  /**
   * Get list of indexed packages
   */
  getPackages(): string[] {
    return this.metadata?.packages ?? [];
  }

  /**
   * Hybrid search combining fulltext (BM25) and vector (semantic) search
   */
  async hybridSearch(options: {
    query: string;
    mode?: SearchMode;
    packages?: string[];
    limit?: number;
  }): Promise<HybridSearchResult[]> {
    const { query, mode = 'fulltext', packages, limit = DEFAULT_LIMIT } = options;

    // Fulltext-only mode
    if (mode === 'fulltext') {
      return this.search({ query, packages, limit });
    }

    // Semantic or hybrid mode requires vector store
    if (!this.vectorStore) {
      if (mode === 'semantic') {
        throw new Error('Vector search not available. Run "nocaap index --semantic" first.');
      }
      // Fall back to fulltext for hybrid if no vector store
      log.debug('Vector store not available, falling back to fulltext search');
      return this.search({ query, packages, limit });
    }

    // Generate query embedding
    const queryVector = await generateQueryEmbedding(query, this.embeddingProvider);

    // Semantic-only mode
    if (mode === 'semantic') {
      const vectorResults = await this.vectorStore.search(queryVector, limit);
      return vectorResults.map((r) => ({
        id: r.id,
        content: r.content,
        path: r.path,
        package: r.package,
        headings: [],
        title: r.title,
        score: r.score,
        sources: { vector: 1 },
      }));
    }

    // Hybrid mode: combine BM25 and vector results with RRF
    const [fulltextResults, vectorResults] = await Promise.all([
      this.search({ query, packages, limit: limit * 2 }),
      this.vectorStore.search(queryVector, limit * 2),
    ]);

    // Convert to RankedResult format for fusion
    const ftRanked: RankedResult[] = fulltextResults.map((r) => ({
      id: r.id,
      content: r.content,
      path: r.path,
      package: r.package,
      title: r.title,
      score: r.score,
    }));

    const vecRanked: RankedResult[] = vectorResults.map((r) => ({
      id: r.id,
      content: r.content,
      path: r.path,
      package: r.package,
      title: r.title,
      score: r.score,
    }));

    // Apply Reciprocal Rank Fusion with weighted scoring
    const fused = reciprocalRankFusion(ftRanked, vecRanked, {
      fulltextWeight: RRF_FULLTEXT_WEIGHT,
      vectorWeight: RRF_VECTOR_WEIGHT,
    });

    // Apply path-based boost (keywords in query matching folder/file names)
    const queryKeywords = extractQueryKeywords(query);
    for (const result of fused) {
      const pathLower = result.path.toLowerCase();
      let boost = 1.0;
      for (const keyword of queryKeywords) {
        if (pathLower.includes(keyword)) {
          boost *= 1.15; // 15% boost per keyword match in path
        }
      }
      result.score *= boost;
    }

    // Boost index documents (README.md, index.md)
    for (const result of fused) {
      const pathLower = result.path.toLowerCase();
      if (pathLower.endsWith('readme.md') || pathLower.endsWith('index.md')) {
        result.score *= 1.25; // 25% boost for index documents
      }
    }

    // Re-sort after boosting
    fused.sort((a, b) => b.score - a.score);

    const normalized = normalizeScores(fused);

    // Convert back to HybridSearchResult format
    return normalized.slice(0, limit).map((r) => ({
      id: r.id,
      content: r.content,
      path: r.path,
      package: r.package,
      headings: [],
      title: r.title,
      score: r.score,
      sources: r.sources,
    }));
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the search index file path
 */
export function getSearchIndexPath(projectRoot: string): string {
  return paths.join(paths.getContextDir(projectRoot), SEARCH_INDEX_FILE);
}

/**
 * Check if a search index exists
 */
export async function searchIndexExists(projectRoot: string): Promise<boolean> {
  return paths.exists(getSearchIndexPath(projectRoot));
}
