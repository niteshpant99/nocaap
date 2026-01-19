/**
 * src/core/vector-store.ts
 * LanceDB wrapper for vector storage and search
 */
import fs from 'fs-extra';
import * as paths from '../utils/paths.js';
import { log } from '../utils/logger.js';
import type { EmbeddingMetadata } from './embeddings.js';

// =============================================================================
// Types
// =============================================================================

export interface VectorChunk {
  id: string;
  content: string;
  path: string;
  package: string;
  title: string;
  vector: number[];
}

export interface VectorResult {
  id: string;
  content: string;
  path: string;
  package: string;
  title: string;
  score: number;
}

interface StoredVectorMetadata {
  embedding: EmbeddingMetadata;
  chunkCount: number;
}

// =============================================================================
// Constants
// =============================================================================

const VECTOR_DIR = 'vectors.lance';
const VECTOR_TABLE = 'chunks';
const METADATA_FILE = 'vector-metadata.json';

// =============================================================================
// Vector Store Class
// =============================================================================

export class VectorStore {
  private db: unknown = null;
  private table: unknown = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Get the vector store directory path
   */
  private getVectorPath(): string {
    return paths.join(paths.getContextDir(this.projectRoot), VECTOR_DIR);
  }

  /**
   * Get the metadata file path
   */
  private getMetadataPath(): string {
    return paths.join(paths.getContextDir(this.projectRoot), METADATA_FILE);
  }

  /**
   * Check if a vector index exists
   */
  async exists(): Promise<boolean> {
    return paths.exists(this.getVectorPath());
  }

  /**
   * Initialize the vector store connection
   */
  async initialize(): Promise<boolean> {
    const vectorPath = this.getVectorPath();

    if (!(await paths.exists(vectorPath))) {
      log.debug('No vector index found');
      return false;
    }

    try {
      // Dynamic import for optional dependency
      const lancedb = await import('@lancedb/lancedb');
      this.db = await lancedb.connect(vectorPath);

      // Check if table exists
      const tableNames = await (this.db as { tableNames(): Promise<string[]> }).tableNames();
      if (tableNames.includes(VECTOR_TABLE)) {
        this.table = await (this.db as { openTable(name: string): Promise<unknown> }).openTable(VECTOR_TABLE);
        log.debug('Loaded existing vector index');
        return true;
      }

      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.debug(`Failed to initialize vector store: ${message}`);
      return false;
    }
  }

  /**
   * Create a new vector index from chunks
   */
  async createIndex(chunks: VectorChunk[], metadata: EmbeddingMetadata): Promise<void> {
    const vectorPath = this.getVectorPath();

    try {
      // Dynamic import for optional dependency
      const lancedb = await import('@lancedb/lancedb');

      // Remove existing index if present
      if (await paths.exists(vectorPath)) {
        await fs.remove(vectorPath);
      }

      // Connect to new database
      this.db = await lancedb.connect(vectorPath);

      // Create table with chunks
      this.table = await (this.db as { createTable(name: string, data: unknown[]): Promise<unknown> })
        .createTable(VECTOR_TABLE, chunks);

      // Save metadata
      const storedMetadata: StoredVectorMetadata = {
        embedding: metadata,
        chunkCount: chunks.length,
      };
      await fs.writeJson(this.getMetadataPath(), storedMetadata, { spaces: 2 });

      log.debug(`Created vector index with ${chunks.length} chunks`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create vector index: ${message}`);
    }
  }

  /**
   * Search for similar vectors
   */
  async search(queryVector: number[], limit: number = 10): Promise<VectorResult[]> {
    if (!this.table) {
      throw new Error('Vector store not initialized');
    }

    try {
      // LanceDB vector search
      const results = await (this.table as {
        vectorSearch(vector: number[]): {
          limit(n: number): { toArray(): Promise<Array<{
            id: string;
            content: string;
            path: string;
            package: string;
            title: string;
            _distance?: number;
          }>> };
        };
      }).vectorSearch(queryVector).limit(limit).toArray();

      return results.map((r) => ({
        id: r.id,
        content: r.content,
        path: r.path,
        package: r.package,
        title: r.title,
        // Convert distance to similarity score (lower distance = higher similarity)
        score: r._distance ? 1 / (1 + r._distance) : 1,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Vector search failed: ${message}`);
    }
  }

  /**
   * Get stored metadata
   */
  async getMetadata(): Promise<StoredVectorMetadata | null> {
    const metadataPath = this.getMetadataPath();

    if (!(await paths.exists(metadataPath))) {
      return null;
    }

    try {
      return await fs.readJson(metadataPath);
    } catch {
      return null;
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the vector store directory path
 */
export function getVectorStorePath(projectRoot: string): string {
  return paths.join(paths.getContextDir(projectRoot), VECTOR_DIR);
}

/**
 * Check if a vector index exists
 */
export async function vectorIndexExists(projectRoot: string): Promise<boolean> {
  return paths.exists(getVectorStorePath(projectRoot));
}
