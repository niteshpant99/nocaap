/**
 * src/commands/add.ts
 * Add a context package from a Git repository
 */
import * as paths from '../utils/paths.js';
import { log, createSpinner } from '../utils/logger.js';
import {
  initContextDir,
  upsertPackage,
  updateLockEntry,
  configExists,
} from '../core/config.js';
import { checkAccess, sparseClone } from '../core/git-engine.js';
import { generateIndexWithProgress } from '../core/indexer.js';

// =============================================================================
// Types
// =============================================================================

export interface AddOptions {
  /** Sparse checkout path within the repo */
  path?: string;
  /** Local alias for the package */
  alias?: string;
  /** Branch or tag to checkout */
  branch?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract a default alias from a Git URL
 * e.g., "git@github.com:acme/docs.git" -> "docs"
 * e.g., "https://github.com/acme/my-standards" -> "my-standards"
 */
function extractAliasFromUrl(url: string): string {
  // Remove trailing .git
  const cleaned = url.replace(/\.git$/, '');

  // Extract the last segment
  const segments = cleaned.split(/[/:]/);
  const lastSegment = segments[segments.length - 1];

  // Clean up any remaining characters
  return lastSegment?.replace(/[^a-zA-Z0-9-_]/g, '') || 'context';
}

/**
 * Validate alias format
 */
function validateAlias(alias: string): boolean {
  // Must be alphanumeric with hyphens/underscores, 1-50 chars
  return /^[a-zA-Z0-9][a-zA-Z0-9-_]{0,49}$/.test(alias);
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Add a context package from a Git repository
 *
 * Flow:
 * 1. Validate inputs
 * 2. Check repository access
 * 3. Initialize .context/ if needed
 * 4. Clone with sparse checkout
 * 5. Update config and lockfile
 * 6. Regenerate INDEX.md
 */
export async function addCommand(
  repo: string,
  options: AddOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // Derive alias from URL if not provided
  const alias = options.alias || extractAliasFromUrl(repo);

  log.title('Adding context package');
  log.info(`Repository: ${repo}`);
  log.info(`Alias: ${alias}`);
  if (options.path) {
    log.info(`Path: ${options.path}`);
  }
  if (options.branch && options.branch !== 'main') {
    log.info(`Branch: ${options.branch}`);
  }
  log.newline();

  // Validate alias
  if (!validateAlias(alias)) {
    throw new Error(
      `Invalid alias '${alias}'. Must be alphanumeric (can include - or _), 1-50 characters.`
    );
  }

  // Step 1: Check repository access
  const accessSpinner = createSpinner('Checking repository access...').start();

  const hasAccess = await checkAccess(repo);
  if (!hasAccess) {
    accessSpinner.fail('Repository access denied');
    throw new Error(
      `Cannot access repository: ${repo}\n` +
        'Please check:\n' +
        '  - The URL is correct\n' +
        '  - You have SSH keys configured (for git@ URLs)\n' +
        '  - You have read access to the repository'
    );
  }
  accessSpinner.succeed('Repository access confirmed');

  // Step 2: Initialize .context/ directory if needed
  if (!(await configExists(projectRoot))) {
    const initSpinner = createSpinner('Initializing .context/ directory...').start();
    await initContextDir(projectRoot);
    initSpinner.succeed('Initialized .context/ directory');
  }

  // Step 3: Clone the repository
  const targetDir = paths.getPackagePath(projectRoot, alias);
  const cloneSpinner = createSpinner('Cloning repository...').start();

  try {
    const { commitHash } = await sparseClone({
      repoUrl: repo,
      targetDir,
      sparsePath: options.path,
      branch: options.branch,
    });

    cloneSpinner.succeed(`Cloned to .context/packages/${alias}`);

    // Step 4: Update config
    const configSpinner = createSpinner('Updating configuration...').start();

    await upsertPackage(projectRoot, {
      alias,
      source: repo,
      path: options.path,
      version: options.branch || 'main',
    });

    // Step 5: Update lockfile
    await updateLockEntry(projectRoot, alias, {
      commitHash,
      sparsePath: options.path || '',
      updatedAt: new Date().toISOString(),
    });

    configSpinner.succeed('Configuration updated');

    // Step 6: Regenerate INDEX.md
    log.newline();
    await generateIndexWithProgress(projectRoot);

    // Done!
    log.newline();
    log.success(`Package '${alias}' added successfully!`);
    log.dim(`  Location: .context/packages/${alias}`);
    log.dim(`  Commit: ${commitHash.slice(0, 8)}`);
  } catch (error) {
    cloneSpinner.fail('Clone failed');
    throw error;
  }
}
