/**
 * src/utils/paths.ts
* Path normalization utilities using upath
 * Ensures Windows compatibility by converting all paths to POSIX style
 */
import upath from 'upath';
import path from 'node:path';
import fs from 'fs-extra';

// =============================================================================
// Constants
// =============================================================================

export const CONTEXT_DIR = '.context';
export const PACKAGES_DIR = 'packages';
export const CONFIG_FILE = 'context.config.json';
export const LOCK_FILE = 'context.lock';
export const INDEX_FILE = 'INDEX.md';

// =============================================================================
// Path Normalization
// =============================================================================

/**
 * Convert any path to POSIX style (forward slashes)
 * Critical for Windows compatibility with Git
 */
export function toUnix(filePath: string): string {
  return upath.toUnix(filePath);
}

/**
 * Normalize a path (resolve . and .., remove trailing slashes)
 */
export function normalize(filePath: string): string {
  return upath.normalize(filePath);
}

/**
 * Join path segments and normalize to POSIX
 */
export function join(...segments: string[]): string {
  return upath.join(...segments);
}

/**
 * Resolve path segments to an absolute path (POSIX style)
 */
export function resolve(...segments: string[]): string {
  return toUnix(path.resolve(...segments));
}

/**
 * Get the directory name from a path
 */
export function dirname(filePath: string): string {
  return upath.dirname(filePath);
}

/**
 * Get the base name from a path
 */
export function basename(filePath: string, ext?: string): string {
  return upath.basename(filePath, ext);
}

/**
 * Get the extension from a path
 */
export function extname(filePath: string): string {
  return upath.extname(filePath);
}

// =============================================================================
// Project Path Helpers
// =============================================================================

/**
 * Get the .context directory path for a project
 */
export function getContextDir(projectRoot: string): string {
  return join(projectRoot, CONTEXT_DIR);
}

/**
 * Get the packages directory path
 */
export function getPackagesDir(projectRoot: string): string {
  return join(getContextDir(projectRoot), PACKAGES_DIR);
}

/**
 * Get the config file path
 */
export function getConfigPath(projectRoot: string): string {
  return join(getContextDir(projectRoot), CONFIG_FILE);
}

/**
 * Get the lockfile path
 */
export function getLockfilePath(projectRoot: string): string {
  return join(getContextDir(projectRoot), LOCK_FILE);
}

/**
 * Get the INDEX.md file path
 */
export function getIndexPath(projectRoot: string): string {
  return join(getContextDir(projectRoot), INDEX_FILE);
}

/**
 * Get a specific package directory path
 */
export function getPackagePath(projectRoot: string, alias: string): string {
  return join(getPackagesDir(projectRoot), alias);
}

// =============================================================================
// Path Validation
// =============================================================================

/**
 * Check if a path is absolute
 */
export function isAbsolute(filePath: string): boolean {
  return upath.isAbsolute(filePath);
}

/**
 * Get relative path from one path to another
 */
export function relative(from: string, to: string): string {
  return upath.relative(from, to);
}

/**
 * Ensure a path is within a given directory (security check)
 */
export function isWithin(parent: string, child: string): boolean {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);

  // Ensure we're comparing full path segments
  const normalizedParent = resolvedParent.endsWith('/')
    ? resolvedParent
    : `${resolvedParent}/`;

  return resolvedChild === resolvedParent || resolvedChild.startsWith(normalizedParent);
}

// =============================================================================
// Filesystem Helpers
// =============================================================================

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

/**
 * Check if a path exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

