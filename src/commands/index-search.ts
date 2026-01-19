/**
 * src/commands/index-search.ts
 * Build the search index from markdown files in context packages
 * Supports both fulltext (Orama/BM25) and semantic (vector) search
 */
import { readConfig } from '../core/config.js';
import { chunkPackage } from '../core/chunker.js';
import { SearchEngine, getSearchIndexPath } from '../core/search-engine.js';
import { VectorStore, getVectorStorePath } from '../core/vector-store.js';
import {
  detectProvider,
  generateEmbeddings,
  getProviderConfig,
  setEmbeddingSettings,
  type EmbeddingProvider,
} from '../core/embeddings.js';
import { resolveEmbeddingSettings } from '../core/settings.js';
import * as paths from '../utils/paths.js';
import { log, withSpinner } from '../utils/logger.js';
import type { Chunk } from '../core/chunker.js';

// =============================================================================
// Types
// =============================================================================

export interface IndexSearchOptions {
  semantic?: boolean;
  provider?: EmbeddingProvider;
}

export interface IndexSearchResult {
  chunkCount: number;
  fileCount: number;
  packages: string[];
  indexPath: string;
  vectorIndexPath?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Build the search index from all installed packages
 */
export async function indexSearchCommand(
  options: IndexSearchOptions = {}
): Promise<IndexSearchResult> {
  const { semantic = false, provider = 'auto' } = options;
  const projectRoot = process.cwd();
  const contextDir = paths.getContextDir(projectRoot);

  // Check if .context directory exists
  if (!(await paths.exists(contextDir))) {
    throw new Error(
      'No .context directory found. Run `nocaap setup` or `nocaap add` first.'
    );
  }

  // Read config to get installed packages
  const config = await readConfig(projectRoot);
  if (!config || config.packages.length === 0) {
    throw new Error(
      'No packages configured. Run `nocaap setup` or `nocaap add` first.'
    );
  }

  // Load embedding settings from config (for semantic indexing)
  if (semantic) {
    const embeddingSettings = await resolveEmbeddingSettings(projectRoot);
    setEmbeddingSettings(embeddingSettings);
  }

  log.info(`Building search index for ${config.packages.length} package(s)...`);

  // Collect chunks from all packages
  const allChunks: Chunk[] = [];
  let totalFiles = 0;
  const indexedPackages: string[] = [];

  for (const pkg of config.packages) {
    const packagePath = paths.getPackagePath(projectRoot, pkg.alias);

    if (!(await paths.exists(packagePath))) {
      log.warn(`Package directory not found: ${pkg.alias}`);
      continue;
    }

    const chunks = await withSpinner(
      `Chunking ${pkg.alias}...`,
      async () => chunkPackage(packagePath, pkg.alias, contextDir),
      { successText: `Chunked ${pkg.alias}` }
    );

    if (chunks.length > 0) {
      allChunks.push(...chunks);
      indexedPackages.push(pkg.alias);

      // Estimate files from unique paths
      const uniquePaths = new Set(chunks.map((c) => c.path));
      totalFiles += uniquePaths.size;
    } else {
      log.warn(`No content found in package: ${pkg.alias}`);
    }
  }

  if (allChunks.length === 0) {
    throw new Error('No content to index. Check your package directories.');
  }

  // Create and save the fulltext search index
  const searchEngine = new SearchEngine();

  await withSpinner(
    'Building fulltext index...',
    async () => {
      await searchEngine.createIndex(allChunks);
      await searchEngine.saveIndex(projectRoot);
    },
    { successText: 'Fulltext index built' }
  );

  const indexPath = getSearchIndexPath(projectRoot);
  const result: IndexSearchResult = {
    chunkCount: allChunks.length,
    fileCount: totalFiles,
    packages: indexedPackages,
    indexPath,
  };

  // Build semantic/vector index if requested
  if (semantic) {
    result.vectorIndexPath = getVectorStorePath(projectRoot);
    await buildVectorIndex(allChunks, projectRoot, provider, result);
  }

  log.success(
    `Indexed ${allChunks.length} chunks from ${totalFiles} files across ${indexedPackages.length} package(s)`
  );

  if (result.embeddingProvider) {
    log.info(`Semantic search enabled (${result.embeddingProvider}/${result.embeddingModel})`);
  }

  return result;
}

// =============================================================================
// Vector Index Builder
// =============================================================================

/**
 * Build vector index for semantic search
 */
async function buildVectorIndex(
  chunks: Chunk[],
  projectRoot: string,
  providerOption: EmbeddingProvider,
  result: IndexSearchResult
): Promise<void> {
  // Detect or validate provider
  const resolvedProvider = providerOption === 'auto'
    ? await withSpinner(
        'Detecting embedding provider...',
        async () => detectProvider(),
        { successText: 'Provider detected' }
      )
    : providerOption;

  const config = getProviderConfig(resolvedProvider);
  result.embeddingProvider = resolvedProvider;
  result.embeddingModel = config.model;

  log.info(`Using ${resolvedProvider} (${config.model}, ${config.dimensions}d)`);

  // Extract text content from chunks
  const texts = chunks.map((c) => c.content);

  // Generate embeddings
  const embeddingResult = await withSpinner(
    `Generating embeddings for ${chunks.length} chunks...`,
    async () => generateEmbeddings(texts, resolvedProvider),
    { successText: 'Embeddings generated' }
  );

  // Prepare vector chunks
  const vectorChunks = chunks.map((chunk, i) => ({
    id: chunk.id,
    content: chunk.content,
    path: chunk.path,
    package: chunk.package,
    title: chunk.metadata.title,
    vector: embeddingResult.vectors[i]!,
  }));

  // Create vector store
  const vectorStore = new VectorStore(projectRoot);

  await withSpinner(
    'Creating vector index...',
    async () => {
      await vectorStore.createIndex(vectorChunks, {
        provider: resolvedProvider,
        model: embeddingResult.model,
        dimensions: embeddingResult.dimensions,
        createdAt: new Date().toISOString(),
      });
    },
    { successText: 'Vector index created' }
  );
}
