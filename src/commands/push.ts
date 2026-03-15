/**
 * src/commands/push.ts
 * Push local context changes back upstream as a PR
 */
import { checkbox } from '@inquirer/prompts';
import fs from 'fs-extra';
import * as paths from '../utils/paths.js';
import { log, createSpinner, style } from '../utils/logger.js';
import { readConfig, readLockfile } from '../core/config.js';
import { resolvePushSettings } from '../core/settings.js';
import {
  cloneToTemp,
  getRemoteCommitHash,
  createBranch,
  commitAll,
  pushBranch,
  getDefaultBranch,
  isDirty,
} from '../core/git-engine.js';
import { parseRepoInfo, buildNewPrUrl } from '../utils/providers.js';
import { createPr } from '../core/github.js';

// =============================================================================
// Types
// =============================================================================

export interface PushOptions {
  /** Custom commit message */
  message?: string;
  /** Push all packages with changes */
  all?: boolean;
}

interface PackageInfo {
  alias: string;
  source: string;
  path?: string;
  localCommit: string;
}

type PushStatus = 'pushed' | 'skipped' | 'failed';
type SkipReason = 'no_changes' | 'nothing_to_commit';

interface PushResult {
  status: PushStatus;
  prUrl?: string;
  error?: string;
  skipReason?: SkipReason;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the date string for branch naming (YYYYMMDD)
 */
function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Generate branch name: nocaap/{alias}-{YYYYMMDD}
 */
function generateBranchName(alias: string): string {
  return `nocaap/${alias}-${getDateString()}`;
}

/**
 * Get list of all configured packages with their info
 */
async function getAllPackages(projectRoot: string): Promise<PackageInfo[]> {
  const config = await readConfig(projectRoot);
  const lockfile = await readLockfile(projectRoot);

  if (!config) {
    return [];
  }

  return config.packages.map((pkg) => ({
    alias: pkg.alias,
    source: pkg.source,
    path: pkg.path,
    localCommit: lockfile[pkg.alias]?.commitHash || '',
  }));
}

/**
 * Interactive package picker for push
 */
async function selectPackagesToPush(packages: PackageInfo[]): Promise<string[]> {
  if (packages.length === 0) {
    return [];
  }

  const choices = packages.map((pkg) => ({
    name: `${pkg.alias} (${pkg.source})`,
    value: pkg.alias,
    checked: false,
  }));

  const selected = await checkbox({
    message: 'Select packages to push:',
    choices,
    pageSize: 15,
  });

  return selected;
}

// =============================================================================
// Single Package Push
// =============================================================================

/**
 * Push a single package to upstream
 */
async function pushSinglePackage(
  projectRoot: string,
  pkg: PackageInfo,
  commitMessage: string
): Promise<PushResult> {
  const packagePath = paths.getPackagePath(projectRoot, pkg.alias);
  const branchName = generateBranchName(pkg.alias);
  const repoInfo = parseRepoInfo(pkg.source);

  // Resolve push settings (uses configured baseBranch if set, otherwise auto-detect)
  const pushSettings = await resolvePushSettings(projectRoot);
  const baseBranch = pushSettings.baseBranch ?? await getDefaultBranch(pkg.source);
  log.debug(`Using base branch: ${baseBranch}`);

  // Step 1: Check for upstream divergence
  const checkSpinner = createSpinner('Checking upstream...').start();

  try {
    const remoteCommit = await getRemoteCommitHash(pkg.source, baseBranch);

    if (remoteCommit !== pkg.localCommit) {
      checkSpinner.fail('Upstream has diverged');
      return {
        status: 'failed',
        error: `Upstream has changed. Run 'nocaap update ${pkg.alias}' first.`,
      };
    }
    checkSpinner.succeed('Upstream in sync');
  } catch (error) {
    checkSpinner.fail('Failed to check upstream');
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { status: 'failed', error: msg };
  }

  // Step 2: Clone to temp
  const cloneSpinner = createSpinner('Cloning upstream...').start();
  let tempDir: string;
  let cleanup: () => Promise<void>;

  try {
    const result = await cloneToTemp(pkg.source, baseBranch);
    tempDir = result.tempDir;
    cleanup = result.cleanup;
    cloneSpinner.succeed('Cloned to temp directory');
  } catch (error) {
    cloneSpinner.fail('Clone failed');
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { status: 'failed', error: msg };
  }

  try {
    // Step 3: Copy files to sparse path location
    const copySpinner = createSpinner('Copying changes...').start();
    const sparsePath = pkg.path
      ? paths.toUnix(pkg.path).replace(/^\/+/, '')
      : '';
    const sparseSegments = sparsePath.split('/').filter(Boolean);

    if (sparseSegments.includes('..')) {
      throw new Error(
        `Invalid package path '${pkg.path}': path traversal segments are not allowed`
      );
    }

    const targetPath = sparsePath
      ? paths.join(tempDir, sparsePath)
      : tempDir;
    if (!paths.isWithin(tempDir, targetPath)) {
      throw new Error(`Resolved target path escapes temp clone root: ${targetPath}`);
    }

    // Determine source: handle both flat and non-flat package layouts
    // Flat = files at package root (post-flattening by sparseClone)
    // Non-flat = files retain original directory structure
    let sourcePath = packagePath;
    if (sparsePath) {
      const sparseSubdir = paths.join(packagePath, sparsePath);
      if (!paths.isWithin(packagePath, sparseSubdir)) {
        throw new Error(
          `Resolved source path escapes package directory: ${sparseSubdir}`
        );
      }
      const stat = await fs.stat(sparseSubdir).catch(() => null);
      if (stat?.isDirectory()) {
        sourcePath = sparseSubdir;
        log.debug(`Package is non-flat, using sparse subdir: ${sparseSubdir}`);
      }
    }
    if (!paths.isWithin(packagePath, sourcePath)) {
      throw new Error(
        `Resolved source path escapes package directory: ${sourcePath}`
      );
    }

    await paths.ensureDir(targetPath);

    // Mirror target: clear existing contents so deletions are reflected
    if (sparsePath && targetPath !== tempDir) {
      const existing = await fs.readdir(targetPath).catch(() => []);
      for (const item of existing) {
        await fs.remove(paths.join(targetPath, item));
      }
    }

    // Copy all files from source to target (excluding .git)
    const items = await fs.readdir(sourcePath);
    for (const item of items) {
      if (item === '.git') continue;
      const srcPath = paths.join(sourcePath, item);
      const destPath = paths.join(targetPath, item);
      await fs.copy(srcPath, destPath, { overwrite: true });
    }
    copySpinner.succeed('Changes copied');

    // Step 4: Check for actual changes before branching
    const hasChanges = await isDirty(tempDir);
    if (!hasChanges) {
      await cleanup();
      return { status: 'skipped', skipReason: 'no_changes' };
    }

    // Step 5: Create feature branch (only if changes exist)
    const branchSpinner = createSpinner('Creating branch...').start();
    await createBranch(tempDir, branchName);
    branchSpinner.succeed(`Created branch: ${branchName}`);

    // Step 6: Commit
    const commitSpinner = createSpinner('Committing...').start();
    try {
      await commitAll(tempDir, commitMessage);
      commitSpinner.succeed('Changes committed');
    } catch (error) {
      // Defensive fallback: isDirty should catch this, but just in case
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('nothing to commit')) {
        commitSpinner.warn('No changes to commit');
        await cleanup();
        return { status: 'skipped', skipReason: 'nothing_to_commit' };
      }
      throw error;
    }

    // Step 7: Push
    const pushSpinner = createSpinner('Pushing to remote...').start();
    try {
      await pushBranch(tempDir, branchName);
      pushSpinner.succeed('Pushed to remote');
    } catch (error) {
      pushSpinner.fail('Push failed');
      throw error;
    }

    // Step 8: Create PR
    const prSpinner = createSpinner('Creating PR...').start();
    const manualUrl = buildNewPrUrl(repoInfo, branchName, baseBranch);

    const prResult = await createPr({
      repoDir: tempDir,
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      branch: branchName,
      baseBranch,
      title: `Update ${pkg.alias} context via nocaap`,
      body: `This PR was created automatically by nocaap.\n\n**Commit message:** ${commitMessage}`,
      manualUrl,
    });

    if (prResult.success) {
      prSpinner.succeed('PR created');
    } else {
      prSpinner.warn('PR not created automatically');
    }

    await cleanup();

    return {
      status: 'pushed',
      prUrl: prResult.url || manualUrl,
    };
  } catch (error) {
    await cleanup();
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { status: 'failed', error: msg };
  }
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Push command - push local changes to upstream as a PR
 *
 * Variants:
 * - nocaap push            → Interactive picker
 * - nocaap push <alias>    → Push specific package
 * - nocaap push --all      → Push all packages
 */
export async function pushCommand(
  alias: string | undefined,
  options: PushOptions
): Promise<void> {
  const projectRoot = process.cwd();

  log.title('nocaap Push');
  log.newline();

  // Get all configured packages
  const allPackages = await getAllPackages(projectRoot);

  if (allPackages.length === 0) {
    log.error('No packages configured. Run `nocaap setup` or `nocaap add` first.');
    return;
  }

  // Determine which packages to push
  let packagesToPush: PackageInfo[];

  if (options.all) {
    // Push all packages
    packagesToPush = allPackages;
    log.info(`Pushing all ${packagesToPush.length} package(s)...`);
  } else if (alias) {
    // Push specific package
    const pkg = allPackages.find((p) => p.alias === alias);
    if (!pkg) {
      log.error(`Package '${alias}' not found in config.`);
      log.dim('Available packages:');
      for (const p of allPackages) {
        log.dim(`  - ${p.alias}`);
      }
      return;
    }
    packagesToPush = [pkg];
  } else {
    // Interactive picker
    log.info('Select packages to push:');
    log.newline();

    const selectedAliases = await selectPackagesToPush(allPackages);

    if (selectedAliases.length === 0) {
      log.warn('No packages selected. Push cancelled.');
      return;
    }

    packagesToPush = allPackages.filter((p) => selectedAliases.includes(p.alias));
  }

  log.newline();

  // Default commit message
  const defaultMessage =
    packagesToPush.length === 1 && packagesToPush[0]
      ? `Update ${packagesToPush[0].alias} context via nocaap`
      : 'Update context via nocaap';

  const commitMessage = options.message || defaultMessage;

  // Push each package
  const results: Array<{ alias: string } & PushResult> = [];

  for (const pkg of packagesToPush) {
    log.hr();
    log.newline();
    log.info(`Pushing ${style.bold(pkg.alias)}...`);
    log.dim(`  Source: ${pkg.source}`);
    if (pkg.path) {
      log.dim(`  Path: ${pkg.path}`);
    }
    log.newline();

    const result = await pushSinglePackage(projectRoot, pkg, commitMessage);
    results.push({ alias: pkg.alias, ...result });

    if (result.status === 'pushed' && result.prUrl) {
      log.newline();
      log.success(`PR created for ${pkg.alias}:`);
      log.info(`  ${style.url(result.prUrl)}`);
    } else if (result.status === 'skipped') {
      log.newline();
      log.info(`${pkg.alias}: No changes to push`);
    } else if (result.status === 'failed') {
      log.newline();
      log.error(`Failed: ${result.error}`);
    }
  }

  // Summary
  log.newline();
  log.hr();
  log.newline();

  const pushed = results.filter((r) => r.status === 'pushed');
  const skipped = results.filter((r) => r.status === 'skipped');
  const failed = results.filter((r) => r.status === 'failed');

  if (pushed.length > 0) {
    log.success(`${pushed.length} package(s) pushed successfully.`);

    const withPrs = pushed.filter((r) => r.prUrl);
    if (withPrs.length > 0) {
      log.newline();
      log.info('Pull Requests:');
      for (const r of withPrs) {
        log.dim(`  ${r.alias}: ${r.prUrl}`);
      }
    }
  }

  if (skipped.length > 0) {
    log.newline();
    log.info(`${skipped.length} package(s) skipped (no changes).`);
    for (const r of skipped) {
      log.dim(`  ${r.alias}: ${r.skipReason}`);
    }
  }

  if (failed.length > 0) {
    log.newline();
    log.warn(`${failed.length} package(s) failed.`);
    for (const r of failed) {
      log.dim(`  ${r.alias}: ${r.error}`);
    }
  }
}
