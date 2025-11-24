/**
 * src/core/registry.ts
 * Fetches and parses the registry with federation support
 * Supports smart URL detection with HTTP-first, SSH-fallback for private repos
 */
import fs from 'fs-extra';
import os from 'os';
import {
  safeValidateRegistry,
  type Registry,
  type ContextEntry,
} from '../schemas/index.js';
import { log } from '../utils/logger.js';
import * as paths from '../utils/paths.js';
import { sparseClone, getDefaultBranch, checkAccess } from './git-engine.js';

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds

// =============================================================================
// Smart URL Normalization
// =============================================================================

interface NormalizedRegistryUrl {
  /** Original URL provided by user */
  original: string;
  /** Git SSH URL for cloning (empty if not applicable) */
  gitUrl: string;
  /** Path to registry file within repo */
  filePath: string;
  /** HTTP URL to try first (for public repos) */
  httpUrl: string | null;
  /** Provider (github, gitlab, bitbucket, unknown) */
  provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown';
  /** Branch name (if detected from URL) */
  branch: string | null;
}

/**
 * Normalize any GitHub/GitLab URL into a consistent format
 * 
 * Accepts:
 * - https://github.com/org/repo
 * - https://github.com/org/repo/blob/main/path/to/file.json
 * - https://raw.githubusercontent.com/org/repo/main/file.json
 * - git@github.com:org/repo.git
 * - git@github.com:org/repo.git#path/to/file.json
 */
export function normalizeRegistryUrl(url: string): NormalizedRegistryUrl {
  const original = url.trim();
  
  // Default file path
  let filePath = 'nocaap-registry.json';
  let gitUrl = '';
  let httpUrl: string | null = null;
  let provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown' = 'unknown';
  let branch: string | null = null;

  // Pattern 1: Git SSH with optional file path
  // git@github.com:org/repo.git#path/to/file.json
  if (original.startsWith('git@') || original.startsWith('ssh://')) {
    const hashIndex = original.indexOf('#');
    if (hashIndex !== -1) {
      gitUrl = original.substring(0, hashIndex);
      filePath = original.substring(hashIndex + 1);
    } else {
      gitUrl = original.endsWith('.git') ? original : `${original}.git`;
    }
    
    // Detect provider
    if (original.includes('github.com')) provider = 'github';
    else if (original.includes('gitlab.com')) provider = 'gitlab';
    else if (original.includes('bitbucket.org')) provider = 'bitbucket';

    // Try to construct HTTP URL for public repos (GitHub)
    if (provider === 'github') {
      const match = gitUrl.match(/git@github\.com:(.+?)(?:\.git)?$/);
      if (match) {
        httpUrl = `https://raw.githubusercontent.com/${match[1]}/main/${filePath}`;
      }
    }

    return { original, gitUrl, filePath, httpUrl, provider, branch };
  }

  // Pattern 2: GitHub raw URL
  // https://raw.githubusercontent.com/org/repo/branch/path/to/file.json
  const rawGitHubMatch = original.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/
  );
  if (rawGitHubMatch) {
    const [, org, repo, branchName, path] = rawGitHubMatch;
    gitUrl = `git@github.com:${org}/${repo}.git`;
    filePath = path!;
    httpUrl = original;
    provider = 'github';
    branch = branchName ?? null;
    return { original, gitUrl, filePath, httpUrl, provider, branch };
  }

  // Pattern 3: GitHub blob URL
  // https://github.com/org/repo/blob/main/path/to/file.json
  const blobMatch = original.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
  );
  if (blobMatch) {
    const [, org, repo, branchName, path] = blobMatch;
    gitUrl = `git@github.com:${org}/${repo}.git`;
    filePath = path!;
    httpUrl = `https://raw.githubusercontent.com/${org}/${repo}/${branchName}/${path}`;
    provider = 'github';
    branch = branchName ?? null;
    return { original, gitUrl, filePath, httpUrl, provider, branch };
  }

  // Pattern 4: GitHub repo URL (no file specified)
  // https://github.com/org/repo
  // https://github.com/org/repo/
  const repoMatch = original.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(\/)?$/
  );
  if (repoMatch && repoMatch[1] && repoMatch[2]) {
    const org = repoMatch[1];
    const repo = repoMatch[2];
    // Remove .git suffix if present
    const cleanRepo = repo.replace(/\.git$/, '');
    gitUrl = `git@github.com:${org}/${cleanRepo}.git`;
    filePath = 'nocaap-registry.json';
    httpUrl = `https://raw.githubusercontent.com/${org}/${cleanRepo}/main/${filePath}`;
    provider = 'github';
    return { original, gitUrl, filePath, httpUrl, provider, branch };
  }

  // Pattern 5: GitLab URL
  // https://gitlab.com/org/repo
  // https://gitlab.com/org/repo/-/blob/main/file.json
  const gitlabMatch = original.match(
    /^https:\/\/gitlab\.com\/([^/]+)\/([^/]+)/
  );
  if (gitlabMatch && gitlabMatch[1] && gitlabMatch[2]) {
    const org = gitlabMatch[1];
    const repo = gitlabMatch[2];
    const cleanRepo = repo.replace(/\.git$/, '');
    gitUrl = `git@gitlab.com:${org}/${cleanRepo}.git`;
    provider = 'gitlab';
    
    // Check if it's a file URL
    const gitlabFileMatch = original.match(
      /^https:\/\/gitlab\.com\/([^/]+)\/([^/]+)\/-\/blob\/([^/]+)\/(.+)$/
    );
    if (gitlabFileMatch && gitlabFileMatch[3] && gitlabFileMatch[4]) {
      filePath = gitlabFileMatch[4];
      branch = gitlabFileMatch[3];
      httpUrl = `https://gitlab.com/${org}/${cleanRepo}/-/raw/${branch}/${filePath}`;
    } else {
      httpUrl = `https://gitlab.com/${org}/${cleanRepo}/-/raw/main/${filePath}`;
    }
    
    return { original, gitUrl, filePath, httpUrl, provider, branch };
  }

  // Pattern 6: Bitbucket URL
  const bitbucketMatch = original.match(
    /^https:\/\/bitbucket\.org\/([^/]+)\/([^/]+)/
  );
  if (bitbucketMatch && bitbucketMatch[1] && bitbucketMatch[2]) {
    const org = bitbucketMatch[1];
    const repo = bitbucketMatch[2];
    const cleanRepo = repo.replace(/\.git$/, '');
    gitUrl = `git@bitbucket.org:${org}/${cleanRepo}.git`;
    provider = 'bitbucket';
    httpUrl = `https://bitbucket.org/${org}/${cleanRepo}/raw/main/${filePath}`;
    return { original, gitUrl, filePath, httpUrl, provider, branch };
  }

  // Pattern 7: Plain HTTP URL (assume it's a direct link to JSON)
  if (original.startsWith('http://') || original.startsWith('https://')) {
    // Can't determine git URL, just use HTTP
    return {
      original,
      gitUrl: '',
      filePath: '',
      httpUrl: original,
      provider: 'unknown',
      branch: null,
    };
  }

  // Unknown format - throw helpful error
  throw new Error(
    `Unrecognized registry URL format: ${original}\n\n` +
    `Supported formats:\n` +
    `  https://github.com/org/repo\n` +
    `  https://github.com/org/repo/blob/main/nocaap-registry.json\n` +
    `  https://raw.githubusercontent.com/org/repo/main/file.json\n` +
    `  git@github.com:org/repo.git\n` +
    `  git@github.com:org/repo.git#path/to/registry.json`
  );
}

// =============================================================================
// Git-Based Registry Fetch
// =============================================================================

/**
 * Fetch registry by cloning the repo (uses SSH keys)
 * Perfect for private repositories - maintains "Zero Auth" principle
 */
async function fetchRegistryViaGit(
  repoUrl: string, 
  filePath: string,
  branchHint?: string | null
): Promise<Registry> {
  log.debug(`Fetching registry via Git: ${repoUrl} -> ${filePath}`);

  // First check access
  let hasAccess: boolean;
  try {
    hasAccess = await checkAccess(repoUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Check if Git is installed
    if (message.includes('ENOENT') || message.includes('not found')) {
      throw new Error(
        `Git is not installed or not in PATH.\n\n` +
        'To use private repositories, you need:\n' +
        '  1. Git installed (https://git-scm.com)\n' +
        '  2. SSH keys configured for your Git host'
      );
    }
    throw new Error(`Failed to check repository access: ${message}`);
  }

  if (!hasAccess) {
    throw new Error(
      `Cannot access repository via SSH: ${repoUrl}\n\n` +
      'Please check:\n' +
      '  • You have SSH keys configured (run: ssh -T git@github.com)\n' +
      '  • You have read access to the repository\n' +
      '  • The repository URL is correct'
    );
  }

  // Create temp directory
  const tempDir = paths.join(os.tmpdir(), `nocaap-registry-${Date.now()}`);
  
  try {
    // Determine the sparse path (directory containing the file)
    const fileDir = paths.dirname(filePath);
    const sparsePath = fileDir === '.' || fileDir === '' ? undefined : fileDir;
    
    // Use branch hint if provided, otherwise detect
    const branch = branchHint || await getDefaultBranch(repoUrl);
    
    // Clone with sparse checkout (just the directory containing the registry file)
    await sparseClone({
      repoUrl,
      targetDir: tempDir,
      sparsePath,
      branch,
    });

    // Read the registry file
    const registryPath = paths.join(tempDir, filePath);
    
    if (!(await paths.exists(registryPath))) {
      throw new Error(
        `Registry file not found: ${filePath}\n\n` +
        'Please check:\n' +
        '  • The file path is correct\n' +
        '  • The file exists in the repository\n' +
        `  • Try: git@...#${filePath}`
      );
    }

    const content = await fs.readFile(registryPath, 'utf-8');
    
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in registry file: ${filePath}`);
    }

    const result = safeValidateRegistry(data);
    if (!result.success) {
      const errorMessages = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new Error(`Invalid registry schema: ${errorMessages}`);
    }

    log.debug(`Successfully fetched registry via Git with ${result.data.contexts.length} contexts`);
    return result.data;
  } finally {
    // Cleanup temp directory
    await fs.remove(tempDir).catch(() => {
      log.debug(`Failed to cleanup temp directory: ${tempDir}`);
    });
  }
}

// =============================================================================
// HTTP-Based Registry Fetch
// =============================================================================

/** Custom error class for HTTP fetch failures that may warrant SSH fallback */
class HttpFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly shouldTrySSH: boolean
  ) {
    super(message);
    this.name = 'HttpFetchError';
  }
}

/**
 * Fetch registry via HTTP (for public repos or URLs with tokens)
 * @throws HttpFetchError with shouldTrySSH=true if SSH fallback is recommended
 */
async function fetchRegistryViaHttp(url: string): Promise<Registry> {
  log.debug(`Fetching registry via HTTP: ${url}`);

  let response: Response;
  try {
    // Add timeout to prevent hanging on slow/unresponsive servers
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpFetchError(
        `Registry fetch timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`,
        null,
        false
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpFetchError(`Network error: ${message}`, null, false);
  }

  if (!response.ok) {
    const isGitHub = url.includes('githubusercontent.com') || url.includes('github.com');
    const isGitLab = url.includes('gitlab.com');
    
    // 404/403 on GitHub/GitLab often means private repo - suggest SSH
    const shouldTrySSH = (response.status === 404 || response.status === 403) && 
                         (isGitHub || isGitLab);
    
    throw new HttpFetchError(
      `HTTP ${response.status} ${response.statusText}`,
      response.status,
      shouldTrySSH
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new HttpFetchError('Invalid JSON response', null, false);
  }

  const result = safeValidateRegistry(data);
  if (!result.success) {
    const errorMessages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid registry schema: ${errorMessages}`);
  }

  log.debug(`Successfully fetched registry via HTTP with ${result.data.contexts.length} contexts`);
  return result.data;
}

// =============================================================================
// Main Fetch Function with Smart Fallback
// =============================================================================

/**
 * Fetch a registry with smart URL detection and fallback
 * 
 * Flow:
 * 1. Parse and normalize the URL (detect GitHub, GitLab, etc.)
 * 2. Try HTTP first if available (fast, works for public repos)
 * 3. If HTTP fails with 404/403, try Git SSH (works for private repos)
 * 4. Provide helpful error messages at each step
 * 
 * @example
 * // All of these work - just paste what you copy from GitHub:
 * fetchRegistry('https://github.com/org/repo')
 * fetchRegistry('https://github.com/org/repo/blob/main/nocaap-registry.json')
 * fetchRegistry('https://raw.githubusercontent.com/org/repo/main/file.json')
 * fetchRegistry('git@github.com:org/repo.git')
 */
export async function fetchRegistry(registryUrl: string): Promise<Registry> {
  const normalized = normalizeRegistryUrl(registryUrl);
  
  log.debug(`Normalized registry URL: ${JSON.stringify(normalized, null, 2)}`);

  // If it's explicitly a Git URL (no HTTP available), go directly to Git
  if (!normalized.httpUrl && normalized.gitUrl) {
    log.debug('No HTTP URL available, using Git directly');
    return fetchRegistryViaGit(normalized.gitUrl, normalized.filePath, normalized.branch);
  }

  // Try HTTP first if available (faster for public repos)
  if (normalized.httpUrl) {
    try {
      log.debug(`Trying HTTP fetch: ${normalized.httpUrl}`);
      const registry = await fetchRegistryViaHttp(normalized.httpUrl);
      return registry;
    } catch (error) {
      // If HTTP failed and we have a Git URL, consider SSH fallback
      if (error instanceof HttpFetchError && error.shouldTrySSH && normalized.gitUrl) {
        log.debug(`HTTP failed (${error.status}), trying SSH fallback`);
        
        try {
          return await fetchRegistryViaGit(
            normalized.gitUrl, 
            normalized.filePath,
            normalized.branch
          );
        } catch (sshError) {
          // Both failed - provide comprehensive error message
          const sshMessage = sshError instanceof Error ? sshError.message : 'Unknown error';
          throw new Error(
            `Could not fetch registry from: ${registryUrl}\n\n` +
            `HTTP attempt: ${error.message}\n` +
            `SSH attempt: ${sshMessage}\n\n` +
            'Possible solutions:\n' +
            '  • Check the URL is correct\n' +
            '  • For private repos: ensure SSH keys are configured\n' +
            '  • Run: ssh -T git@github.com (to test SSH access)'
          );
        }
      }
      
      // HTTP failed and no SSH fallback available
      if (error instanceof HttpFetchError) {
        const hint = error.shouldTrySSH 
          ? '\n\nThis might be a private repository. Try using SSH:\n' +
            `  nocaap config registry ${normalized.gitUrl || 'git@github.com:org/repo.git'}`
          : '';
        throw new Error(
          `Failed to fetch registry: ${error.message}${hint}`
        );
      }
      
      throw error;
    }
  }

  // No HTTP URL and no Git URL - shouldn't happen but handle gracefully
  throw new Error(`Could not determine how to fetch registry from: ${registryUrl}`);
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
 * - Supports both HTTP and Git URLs for imports
 */
export async function fetchRegistryWithImports(
  url: string,
  options?: FetchOptions
): Promise<Registry> {
  const visited = options?.visited ?? new Set<string>();
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const currentDepth = options?.currentDepth ?? 0;

  // Normalize URL for comparison (remove trailing slash and hash)
  const normalizedUrl = url.replace(/\/$/, '').replace(/#.*$/, '');

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

  // Fetch this registry (auto-detects HTTP vs Git URL with fallback)
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
 * Preserves the name of the first (root) registry
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
    name: registries[0]?.name, // Preserve root registry name
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
