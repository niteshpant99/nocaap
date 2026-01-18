/**
 * src/commands/index-search.ts
 * Build the search index from markdown files in context packages
 */
import { readConfig } from '../core/config.js';
import { chunkPackage } from '../core/chunker.js';
import { SearchEngine, getSearchIndexPath } from '../core/search-engine.js';
import * as paths from '../utils/paths.js';
import { log, withSpinner } from '../utils/logger.js';
import type { Chunk } from '../core/chunker.js';

// =============================================================================
// Types
// =============================================================================

export interface IndexSearchResult {
  chunkCount: number;
  fileCount: number;
  packages: string[];
  indexPath: string;
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Build the search index from all installed packages
 */
export async function indexSearchCommand(): Promise<IndexSearchResult> {
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

  // Create and save the search index
  const searchEngine = new SearchEngine();

  await withSpinner(
    'Building search index...',
    async () => {
      await searchEngine.createIndex(allChunks);
      await searchEngine.saveIndex(projectRoot);
    },
    { successText: 'Search index built' }
  );

  const indexPath = getSearchIndexPath(projectRoot);

  log.success(
    `Indexed ${allChunks.length} chunks from ${totalFiles} files across ${indexedPackages.length} package(s)`
  );

  return {
    chunkCount: allChunks.length,
    fileCount: totalFiles,
    packages: indexedPackages,
    indexPath,
  };
}
