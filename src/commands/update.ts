/**
 * src/commands/update.ts
 * Update context packages from remote repositories
 */
import * as paths from '../utils/paths.js';
import { log, createSpinner, style } from '../utils/logger.js';
import {
  readConfig,
  readLockfile,
  updateLockEntry,
  getLockEntry,
} from '../core/config.js';
import {
  pull,
  getHeadCommit,
  isDirty,
  isGitRepo,
} from '../core/git-engine.js';
import { generateIndexWithProgress } from '../core/indexer.js';
import type { PackageEntry, LockEntry } from '../schemas/index.js';

// =============================================================================
// Types
// =============================================================================

export interface UpdateOptions {
  /** Force update even if clean */
  force?: boolean;
}

interface UpdateResult {
  alias: string;
  status: 'updated' | 'up-to-date' | 'skipped' | 'error';
  oldCommit?: string;
  newCommit?: string;
  error?: string;
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Update context packages and regenerate index
 *
 * Flow:
 * 1. Read config and lockfile
 * 2. For each package (or specified alias):
 *    a. Check if dirty (abort if dirty)
 *    b. Pull latest changes
 *    c. Update lockfile
 * 3. Regenerate INDEX.md
 */
export async function updateCommand(
  alias: string | undefined,
  options: UpdateOptions
): Promise<void> {
  const projectRoot = process.cwd();

  log.title('Updating context packages');

  // Read config
  const config = await readConfig(projectRoot);
  if (!config || config.packages.length === 0) {
    throw new Error(
      'No packages configured. Run `nocaap setup` or `nocaap add <repo>` first.'
    );
  }

  // Filter to specific package if alias provided
  const packagesToUpdate = alias
    ? config.packages.filter((p) => p.alias === alias)
    : config.packages;

  if (alias && packagesToUpdate.length === 0) {
    throw new Error(`Package '${alias}' not found in configuration.`);
  }

  log.info(`Updating ${packagesToUpdate.length} package(s)...`);
  log.newline();

  // Update each package
  const results: UpdateResult[] = [];

  for (const pkg of packagesToUpdate) {
    const result = await updatePackage(projectRoot, pkg, options);
    results.push(result);
  }

  // Summary
  log.newline();
  log.hr();
  log.newline();

  const updated = results.filter((r) => r.status === 'updated');
  const upToDate = results.filter((r) => r.status === 'up-to-date');
  const skipped = results.filter((r) => r.status === 'skipped');
  const errors = results.filter((r) => r.status === 'error');

  if (updated.length > 0) {
    log.success(`${updated.length} package(s) updated`);
    for (const r of updated) {
      log.dim(`  ${r.alias}: ${r.oldCommit?.slice(0, 8)} → ${r.newCommit?.slice(0, 8)}`);
    }
  }

  if (upToDate.length > 0) {
    log.info(`${upToDate.length} package(s) already up-to-date`);
  }

  if (skipped.length > 0) {
    log.warn(`${skipped.length} package(s) skipped`);
    for (const r of skipped) {
      log.dim(`  ${r.alias}: ${r.error}`);
    }
  }

  if (errors.length > 0) {
    log.error(`${errors.length} package(s) failed`);
    for (const r of errors) {
      log.dim(`  ${r.alias}: ${r.error}`);
    }
  }

  // Regenerate INDEX.md if any updates occurred
  if (updated.length > 0) {
    log.newline();
    await generateIndexWithProgress(projectRoot);
  }

  // Exit with error if any failures
  if (errors.length > 0) {
    throw new Error(`${errors.length} package(s) failed to update`);
  }
}

/**
 * Update a single package
 */
async function updatePackage(
  projectRoot: string,
  pkg: PackageEntry,
  options: UpdateOptions
): Promise<UpdateResult> {
  const packagePath = paths.getPackagePath(projectRoot, pkg.alias);
  const spinner = createSpinner(`Updating ${style.bold(pkg.alias)}...`).start();

  try {
    // Check if package directory exists
    if (!(await paths.exists(packagePath))) {
      spinner.warn(`${pkg.alias}: Package directory not found`);
      return {
        alias: pkg.alias,
        status: 'skipped',
        error: 'Directory not found',
      };
    }

    // Check if it's a git repo
    if (!(await isGitRepo(packagePath))) {
      spinner.warn(`${pkg.alias}: Not a git repository`);
      return {
        alias: pkg.alias,
        status: 'skipped',
        error: 'Not a git repository',
      };
    }

    // Check for dirty state
    if (await isDirty(packagePath)) {
      spinner.warn(`${pkg.alias}: Has uncommitted changes`);
      return {
        alias: pkg.alias,
        status: 'skipped',
        error: 'Uncommitted changes (commit or discard first)',
      };
    }

    // Check for config drift (sparse path changed)
    const lockEntry = await getLockEntry(projectRoot, pkg.alias);
    if (lockEntry && lockEntry.sparsePath !== (pkg.path || '')) {
      spinner.warn(`${pkg.alias}: Sparse path changed in config`);
      log.dim(`    Config: ${pkg.path || '(root)'}`);
      log.dim(`    Locked: ${lockEntry.sparsePath || '(root)'}`);
      return {
        alias: pkg.alias,
        status: 'skipped',
        error: 'Sparse path changed (run `nocaap remove` then `nocaap add` to re-clone)',
      };
    }

    // Get current commit
    const oldCommit = await getHeadCommit(packagePath);

    // Pull latest
    const { commitHash: newCommit } = await pull(packagePath);

    // Check if actually updated
    if (oldCommit === newCommit && !options.force) {
      spinner.info(`${pkg.alias}: Already up-to-date`);
      return {
        alias: pkg.alias,
        status: 'up-to-date',
        oldCommit,
        newCommit,
      };
    }

    // Update lockfile
    await updateLockEntry(projectRoot, pkg.alias, {
      commitHash: newCommit,
      sparsePath: pkg.path || '',
      updatedAt: new Date().toISOString(),
    });

    spinner.succeed(`${pkg.alias}: Updated`);
    return {
      alias: pkg.alias,
      status: 'updated',
      oldCommit,
      newCommit,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    spinner.fail(`${pkg.alias}: Failed`);
    return {
      alias: pkg.alias,
      status: 'error',
      error: message,
    };
  }
}
