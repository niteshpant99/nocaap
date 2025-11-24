/**
 * src/core/registry.ts
 * Fetches and parses the registry with federation support
 */
import {
  validateRegistry,
  safeValidateRegistry,
  type Registry,
  type ContextEntry,
} from '../schemas/index.js';
import { log } from '../utils/logger.js';

const DEFAULT_MAX_DEPTH = 3;

// =============================================================================
// Single Registry Fetch
// =============================================================================

/**
 * Fetch a single registry from a URL
 * @throws Error on network failure, invalid JSON, or schema validation failure
 */
export async function fetchRegistry(url: string): Promise<Registry> {
  log.debug(`Fetching registry from ${url}`);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch registry from ${url}: ${message}`);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch registry from ${url}: HTTP ${response.status} ${response.statusText}`
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Failed to parse registry JSON from ${url}: Invalid JSON format`);
  }

  const result = safeValidateRegistry(data);
  if (!result.success) {
    const errorMessages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid registry schema from ${url}: ${errorMessages}`);
  }

  log.debug(`Successfully fetched registry from ${url} with ${result.data.contexts.length} contexts`);
  return result.data;
}

// =============================================================================
// Federated Registry Fetch
// =============================================================================

export interface FetchOptions {
  /** Set of already visited URLs (for circular dependency detection) */
  visited?: Set<string>;
  /** Maximum recursion depth for imports (default: 3) */
  maxDepth?: number;
  /** Current recursion depth (internal use) */
  currentDepth?: number;
}

/**
 * Fetch registry with federation support (resolves `imports` recursively)
 * - Tracks visited URLs to prevent circular imports
 * - Has max depth limit to prevent infinite recursion
 * - Merges all imported registries into a single result
 */
export async function fetchRegistryWithImports(
  url: string,
  options?: FetchOptions
): Promise<Registry> {
  const visited = options?.visited ?? new Set<string>();
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const currentDepth = options?.currentDepth ?? 0;

  // Normalize URL for comparison (remove trailing slash)
  const normalizedUrl = url.replace(/\/$/, '');

  // Check for circular imports
  if (visited.has(normalizedUrl)) {
    log.warn(`Circular import detected, skipping: ${url}`);
    return { contexts: [] };
  }

  // Check max depth
  if (currentDepth >= maxDepth) {
    log.warn(`Max import depth (${maxDepth}) exceeded, skipping: ${url}`);
    return { contexts: [] };
  }

  // Mark as visited
  visited.add(normalizedUrl);

  // Fetch this registry
  const registry = await fetchRegistry(url);

  // If no imports, return as-is
  if (!registry.imports || registry.imports.length === 0) {
    return registry;
  }

  log.debug(`Registry has ${registry.imports.length} imports, fetching...`);

  // Fetch all imported registries in parallel
  const importPromises = registry.imports.map(async (importUrl) => {
    try {
      return await fetchRegistryWithImports(importUrl, {
        visited,
        maxDepth,
        currentDepth: currentDepth + 1,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.warn(`Failed to fetch imported registry ${importUrl}: ${message}`);
      return { contexts: [] } as Registry;
    }
  });

  const importedRegistries = await Promise.all(importPromises);

  // Merge all registries (current + imported)
  return mergeRegistries([registry, ...importedRegistries]);
}

// =============================================================================
// Registry Merging
// =============================================================================

/**
 * Create a unique key for deduplication based on repo + path
 */
function getContextKey(context: ContextEntry): string {
  const path = context.path ?? '';
  return `${context.repo}::${path}`;
}

/**
 * Merge multiple registries into one, deduplicating contexts by repo+path
 * Later registries take precedence over earlier ones for duplicates
 */
export function mergeRegistries(registries: Registry[]): Registry {
  const contextMap = new Map<string, ContextEntry>();

  for (const registry of registries) {
    for (const context of registry.contexts) {
      const key = getContextKey(context);
      // Later entries overwrite earlier ones
      contextMap.set(key, context);
    }
  }

  const mergedContexts = Array.from(contextMap.values());

  log.debug(`Merged ${registries.length} registries into ${mergedContexts.length} unique contexts`);

  return {
    contexts: mergedContexts,
    // Don't include imports in merged result (they've been resolved)
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Find a context entry by name (case-insensitive)
 */
export function findContextByName(
  registry: Registry,
  name: string
): ContextEntry | undefined {
  const lowerName = name.toLowerCase();
  return registry.contexts.find(
    (ctx) => ctx.name.toLowerCase() === lowerName
  );
}

/**
 * Find contexts by tag
 */
export function findContextsByTag(
  registry: Registry,
  tag: string
): ContextEntry[] {
  const lowerTag = tag.toLowerCase();
  return registry.contexts.filter(
    (ctx) => ctx.tags?.some((t) => t.toLowerCase() === lowerTag)
  );
}

/**
 * Get all unique tags from a registry
 */
export function getAllTags(registry: Registry): string[] {
  const tagSet = new Set<string>();
  
  for (const context of registry.contexts) {
    if (context.tags) {
      for (const tag of context.tags) {
        tagSet.add(tag);
      }
    }
  }

  return Array.from(tagSet).sort();
}
