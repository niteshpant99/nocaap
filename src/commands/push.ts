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
 * Check if a package has local changes by comparing directory contents
 * Since we flatten the sparse checkout, we compare against a fresh clone
 */
async function _hasLocalChanges(
  packagePath: string,
  _repoUrl: string,
  _sparsePath?: string
): Promise<boolean> {
  // For now, we do a simple check: if the package directory exists and has files
  // A more sophisticated check would compare file hashes
  // For MVP, we assume any package might have changes and let git diff handle it
  return paths.exists(packagePath);
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
): Promise<{ success: boolean; prUrl?: string; error?: string }> {
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
        success: false,
        error: `Upstream has changed. Run 'nocaap update ${pkg.alias}' first.`,
      };
    }
    checkSpinner.succeed('Upstream in sync');
  } catch (error) {
    checkSpinner.fail('Failed to check upstream');
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: msg };
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
    return { success: false, error: msg };
  }

  try {
    // Step 3: Create feature branch
    const branchSpinner = createSpinner('Creating branch...').start();
    await createBranch(tempDir, branchName);
    branchSpinner.succeed(`Created branch: ${branchName}`);

    // Step 4: Copy files to sparse path location
    const copySpinner = createSpinner('Copying changes...').start();
    const targetPath = pkg.path
      ? paths.join(tempDir, pkg.path.replace(/^\/+/, ''))
      : tempDir;

    // Ensure target directory exists and copy files
    await paths.ensureDir(targetPath);

    // Copy all files from package to target (excluding .git)
    const items = await fs.readdir(packagePath);
    for (const item of items) {
      if (item === '.git') continue;
      const srcPath = paths.join(packagePath, item);
      const destPath = paths.join(targetPath, item);
      await fs.copy(srcPath, destPath, { overwrite: true });
    }
    copySpinner.succeed('Changes copied');

    // Step 5: Commit
    const commitSpinner = createSpinner('Committing...').start();
    try {
      await commitAll(tempDir, commitMessage);
      commitSpinner.succeed('Changes committed');
    } catch (error) {
      // If commit fails (no changes), that's actually a success case
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('nothing to commit')) {
        commitSpinner.warn('No changes to commit');
        await cleanup();
        return { success: true, error: 'No changes detected' };
      }
      throw error;
    }

    // Step 6: Push
    const pushSpinner = createSpinner('Pushing to remote...').start();
    try {
      await pushBranch(tempDir, branchName);
      pushSpinner.succeed('Pushed to remote');
    } catch (error) {
      pushSpinner.fail('Push failed');
      throw error;
    }

    // Step 7: Create PR
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

    // Cleanup
    await cleanup();

    return {
      success: true,
      prUrl: prResult.url || manualUrl,
    };
  } catch (error) {
    // Cleanup on error
    await cleanup();
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: msg };
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
  const results: Array<{ alias: string; success: boolean; prUrl?: string; error?: string }> = [];

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

    if (result.success && result.prUrl) {
      log.newline();
      log.success(`PR created for ${pkg.alias}:`);
      log.info(`  ${style.url(result.prUrl)}`);
    } else if (result.error) {
      log.newline();
      log.error(`Failed: ${result.error}`);
    }
  }

  // Summary
  log.newline();
  log.hr();
  log.newline();

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  if (successCount > 0) {
    log.success(`${successCount} package(s) pushed successfully.`);

    // List PR URLs
    const withPrs = results.filter((r) => r.success && r.prUrl);
    if (withPrs.length > 0) {
      log.newline();
      log.info('Pull Requests:');
      for (const r of withPrs) {
        log.dim(`  ${r.alias}: ${r.prUrl}`);
      }
    }
  }

  if (failCount > 0) {
    log.newline();
    log.warn(`${failCount} package(s) failed.`);
    for (const r of results.filter((r) => !r.success)) {
      log.dim(`  ${r.alias}: ${r.error}`);
    }
  }
}
