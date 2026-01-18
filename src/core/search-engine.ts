/**
 * src/core/search-engine.ts
 * Orama-based search engine for full-text search over context packages
 */
import fs from 'fs-extra';
import { create, insertMultiple, search, type Orama } from '@orama/orama';
import { persist, restore } from '@orama/plugin-data-persistence';
import * as paths from '../utils/paths.js';
import { log } from '../utils/logger.js';
import type { Chunk } from './chunker.js';

// =============================================================================
// Constants
// =============================================================================

/** Search index file name */
export const SEARCH_INDEX_FILE = 'index.orama.json';

/** Default search limit */
const DEFAULT_LIMIT = 10;

/** Index version for future compatibility */
const INDEX_VERSION = '1.0.0';

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
// Search Engine Class
// =============================================================================

export class SearchEngine {
  private db: Orama<typeof oramaSchema> | null = null;
  private metadata: IndexMetadata | null = null;

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
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.debug(`Failed to load search index: ${message}`);
      return false;
    }
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
