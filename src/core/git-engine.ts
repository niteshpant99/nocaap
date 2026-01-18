/**
 * src/core/git-engine.ts
 * Git operations with partial clones and sparse checkout
 */
import simpleGit, { type SimpleGit, type SimpleGitOptions } from 'simple-git';
import fs from 'fs-extra';
import os from 'os';
import * as paths from '../utils/paths.js';
import { log } from '../utils/logger.js';

// =============================================================================
// Git Instance Factory
// =============================================================================

/**
 * Create a simple-git instance with sensible defaults
 */
function createGit(baseDir?: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: baseDir ? paths.toUnix(baseDir) : undefined,
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: true,
    timeout: {
      block: 60000, // 60 seconds for any single operation
    },
  };

  return simpleGit(options);
}

// =============================================================================
// Access Verification
// =============================================================================

/**
 * Check if user has read access to a repository
 * Uses `git ls-remote` which respects SSH keys
 * @returns true if accessible, false if auth fails or repo doesn't exist
 */
export async function checkAccess(repoUrl: string): Promise<boolean> {
  log.debug(`Checking access to ${repoUrl}`);

  try {
    const git = createGit();
    // ls-remote will fail if no access - we just need it to not throw
    await git.listRemote([repoUrl, 'HEAD']);
    log.debug(`Access confirmed for ${repoUrl}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.debug(`Access denied or repo not found: ${repoUrl} - ${message}`);
    return false;
  }
}

/**
 * Detect the default branch of a repository (main, master, etc.)
 * Uses `git ls-remote --symref` to query the remote HEAD reference
 * @returns The default branch name, or 'main' as fallback
 */
export async function getDefaultBranch(repoUrl: string): Promise<string> {
  log.debug(`Detecting default branch for ${repoUrl}`);

  try {
    const git = createGit();
    // ls-remote --symref shows the symbolic ref for HEAD
    const result = await git.listRemote(['--symref', repoUrl, 'HEAD']);
    
    // Parse output like: "ref: refs/heads/main\tHEAD"
    const match = result.match(/ref:\s+refs\/heads\/([^\t\s]+)/);
    if (match && match[1]) {
      log.debug(`Default branch detected: ${match[1]}`);
      return match[1];
    }

    // Fallback: try to detect from available branches
    const branchesResult = await git.listRemote(['--heads', repoUrl]);
    
    // Check for common branch names in order of preference
    const commonBranches = ['main', 'master', 'develop', 'trunk'];
    for (const branch of commonBranches) {
      if (branchesResult.includes(`refs/heads/${branch}`)) {
        log.debug(`Default branch fallback: ${branch}`);
        return branch;
      }
    }

    log.debug('Could not detect default branch, using "main"');
    return 'main';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.debug(`Failed to detect default branch: ${message}, using "main"`);
    return 'main';
  }
}

// =============================================================================
// Clone Operations
// =============================================================================

export interface CloneOptions {
  /** Git repository URL (SSH or HTTPS) */
  repoUrl: string;
  /** Target directory for the clone */
  targetDir: string;
  /** Optional path within repo for sparse checkout */
  sparsePath?: string;
  /** Branch or tag to checkout (default: default branch) */
  branch?: string;
}

export interface CloneResult {
  /** The HEAD commit hash after clone */
  commitHash: string;
}

/**
 * Perform a sparse checkout clone
 * Uses --filter=blob:none --sparse --depth 1 for minimal download
 *
 * Clone sequence:
 * 1. Auto-detect default branch if not specified
 * 2. git clone --filter=blob:none --sparse --depth 1 --branch <branch> <url> <target>
 * 3. cd <target> && git sparse-checkout set --no-cone <path>
 */
export async function sparseClone(options: CloneOptions): Promise<CloneResult> {
  const { repoUrl, targetDir, sparsePath } = options;
  const normalizedTarget = paths.toUnix(targetDir);

  log.debug(`Sparse cloning ${repoUrl} to ${normalizedTarget}`);

  // Auto-detect default branch if not specified
  const branch = options.branch || await getDefaultBranch(repoUrl);

  // Check if target already exists
  if (await paths.exists(normalizedTarget)) {
    // Check if it's dirty before removing
    if (await isGitRepo(normalizedTarget)) {
      if (await isDirty(normalizedTarget)) {
        throw new Error(
          `Target directory has uncommitted changes: ${normalizedTarget}. ` +
            'Please commit or discard changes before re-cloning.'
        );
      }
    }
    // Safe to remove - either not a git repo or clean
    log.debug(`Removing existing directory: ${normalizedTarget}`);
    await fs.remove(normalizedTarget);
  }

  // Ensure parent directory exists
  await paths.ensureDir(paths.dirname(normalizedTarget));

  // Build clone arguments
  const cloneArgs = [
    '--filter=blob:none', // Partial clone - no blobs initially
    '--sparse', // Enable sparse checkout
    '--depth', '1', // Shallow clone - no history
    '--branch', branch, // Always specify branch (auto-detected if not provided)
  ];

  cloneArgs.push(repoUrl, normalizedTarget);

  // Step 1: Perform the clone
  const git = createGit();
  try {
    await git.clone(repoUrl, normalizedTarget, cloneArgs.slice(0, -2)); // simple-git handles url and target separately
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to clone ${repoUrl}: ${message}`);
  }

  // Step 2: Set sparse-checkout path if specified
  if (sparsePath) {
    const repoGit = createGit(normalizedTarget);
    // Normalize path and strip leading slashes (git sparse-checkout prefers no leading slash)
    const normalizedSparsePath = paths.toUnix(sparsePath).replace(/^\/+/, '');

    try {
      // Use --no-cone mode to ONLY include the specified path
      // Cone mode (default) includes root-level files which we don't want
      await repoGit.raw(['sparse-checkout', 'set', '--no-cone', normalizedSparsePath]);
      log.debug(`Set sparse-checkout path: ${normalizedSparsePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to set sparse-checkout path '${sparsePath}': ${message}`);
    }

    // Warn if the sparse path resulted in no files
    const sparseFullPath = paths.join(normalizedTarget, normalizedSparsePath);
    if (!(await paths.exists(sparseFullPath))) {
      log.warn(`Sparse path '${sparsePath}' does not exist in the repository`);
    } else {
      // Step 3: Flatten the directory structure
      // Move contents from sparse subdirectory to package root
      log.debug(`Flattening sparse path: ${sparseFullPath} -> ${normalizedTarget}`);

      const items = await fs.readdir(sparseFullPath);
      for (const item of items) {
        const srcPath = paths.join(sparseFullPath, item);
        const destPath = paths.join(normalizedTarget, item);
        await fs.move(srcPath, destPath, { overwrite: true });
      }

      // Remove the now-empty sparse directory chain
      const topLevelDir = normalizedSparsePath.split('/')[0];
      if (topLevelDir) {
        const topLevelPath = paths.join(normalizedTarget, topLevelDir);
        await fs.remove(topLevelPath);
        log.debug(`Removed empty sparse directory: ${topLevelPath}`);
      }
    }
  }

  // Get the commit hash
  const commitHash = await getHeadCommit(normalizedTarget);

  log.debug(`Clone complete. HEAD: ${commitHash}`);

  return { commitHash };
}

// =============================================================================
// Repository State
// =============================================================================

/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(dirPath: string): Promise<boolean> {
  const gitDir = paths.join(dirPath, '.git');
  return paths.exists(gitDir);
}

/**
 * Check if a repository has uncommitted changes
 * CRITICAL: Must check before any destructive operation
 * @returns true if there are uncommitted changes, false if clean
 */
export async function isDirty(repoPath: string): Promise<boolean> {
  const normalizedPath = paths.toUnix(repoPath);
  log.debug(`Checking dirty state for ${normalizedPath}`);

  if (!(await isGitRepo(normalizedPath))) {
    throw new Error(`Not a git repository: ${normalizedPath}`);
  }

  try {
    const git = createGit(normalizedPath);
    const status = await git.status();

    // Use built-in isClean() method for reliable dirty check
    const isDirtyState = !status.isClean();

    log.debug(`Repository ${normalizedPath} is ${isDirtyState ? 'dirty' : 'clean'}`);
    return isDirtyState;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to check repository status: ${message}`);
  }
}

/**
 * Get the current HEAD commit hash
 */
export async function getHeadCommit(repoPath: string): Promise<string> {
  const normalizedPath = paths.toUnix(repoPath);

  if (!(await isGitRepo(normalizedPath))) {
    throw new Error(`Not a git repository: ${normalizedPath}`);
  }

  try {
    const git = createGit(normalizedPath);
    const hash = await git.revparse(['HEAD']);
    return hash.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get HEAD commit: ${message}`);
  }
}

/**
 * Get the remote URL for a repository
 */
export async function getRemoteUrl(repoPath: string): Promise<string | null> {
  const normalizedPath = paths.toUnix(repoPath);

  if (!(await isGitRepo(normalizedPath))) {
    return null;
  }

  try {
    const git = createGit(normalizedPath);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin');
    return origin?.refs?.fetch ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// Update Operations
// =============================================================================

/**
 * Pull latest changes from remote
 * @throws Error if repository is dirty
 */
export async function pull(repoPath: string): Promise<CloneResult> {
  const normalizedPath = paths.toUnix(repoPath);
  log.debug(`Pulling updates for ${normalizedPath}`);

  if (!(await isGitRepo(normalizedPath))) {
    throw new Error(`Not a git repository: ${normalizedPath}`);
  }

  // CRITICAL: Check for dirty state before pulling
  if (await isDirty(normalizedPath)) {
    throw new Error(
      `Cannot pull: repository has uncommitted changes at ${normalizedPath}. ` +
        'Please commit or discard changes first.'
    );
  }

  try {
    const git = createGit(normalizedPath);
    await git.pull();
    const commitHash = await getHeadCommit(normalizedPath);

    log.debug(`Pull complete. HEAD: ${commitHash}`);
    return { commitHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to pull updates: ${message}`);
  }
}

/**
 * Fetch and reset to latest remote HEAD
 * More aggressive than pull - discards local state
 * @throws Error if repository is dirty
 */
export async function fetchAndReset(repoPath: string): Promise<CloneResult> {
  const normalizedPath = paths.toUnix(repoPath);
  log.debug(`Fetch and reset for ${normalizedPath}`);

  if (!(await isGitRepo(normalizedPath))) {
    throw new Error(`Not a git repository: ${normalizedPath}`);
  }

  // CRITICAL: Check for dirty state
  if (await isDirty(normalizedPath)) {
    throw new Error(
      `Cannot reset: repository has uncommitted changes at ${normalizedPath}. ` +
        'Please commit or discard changes first.'
    );
  }

  try {
    const git = createGit(normalizedPath);

    // Fetch latest from origin
    await git.fetch(['origin']);

    // Get the current branch
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);

    // Reset to origin/<branch>
    await git.reset(['--hard', `origin/${branch.trim()}`]);

    const commitHash = await getHeadCommit(normalizedPath);

    log.debug(`Reset complete. HEAD: ${commitHash}`);
    return { commitHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to fetch and reset: ${message}`);
  }
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Safely remove a package directory
 * @throws Error if directory has uncommitted changes
 */
export async function removePackage(packagePath: string): Promise<void> {
  const normalizedPath = paths.toUnix(packagePath);
  log.debug(`Removing package at ${normalizedPath}`);

  if (!(await paths.exists(normalizedPath))) {
    log.debug(`Package directory does not exist: ${normalizedPath}`);
    return;
  }

  // If it's a git repo, check for dirty state
  if (await isGitRepo(normalizedPath)) {
    if (await isDirty(normalizedPath)) {
      throw new Error(
        `Cannot remove: package has uncommitted changes at ${normalizedPath}. ` +
          'Please commit or discard changes first.'
      );
    }
  }

  await fs.remove(normalizedPath);
  log.debug(`Removed package directory: ${normalizedPath}`);
}

// =============================================================================
// Sparse Checkout Utilities
// =============================================================================

/**
 * Get the current sparse-checkout paths
 */
export async function getSparseCheckoutPaths(repoPath: string): Promise<string[]> {
  const normalizedPath = paths.toUnix(repoPath);

  if (!(await isGitRepo(normalizedPath))) {
    throw new Error(`Not a git repository: ${normalizedPath}`);
  }

  try {
    const git = createGit(normalizedPath);
    const result = await git.raw(['sparse-checkout', 'list']);
    return result
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    // If sparse-checkout not configured, return empty array
    return [];
  }
}

/**
 * Update the sparse-checkout path for an existing repo
 */
export async function updateSparseCheckout(
  repoPath: string,
  sparsePath: string
): Promise<void> {
  const normalizedPath = paths.toUnix(repoPath);
  // Strip leading slashes for git sparse-checkout compatibility
  const normalizedSparsePath = paths.toUnix(sparsePath).replace(/^\/+/, '');

  if (!(await isGitRepo(normalizedPath))) {
    throw new Error(`Not a git repository: ${normalizedPath}`);
  }

  try {
    const git = createGit(normalizedPath);
    // Use --no-cone mode to ONLY include the specified path (no root files)
    await git.raw(['sparse-checkout', 'set', '--no-cone', normalizedSparsePath]);
    log.debug(`Updated sparse-checkout to: ${normalizedSparsePath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to update sparse-checkout: ${message}`);
  }
}

// =============================================================================
// Push Support Utilities
// =============================================================================

/**
 * Get the latest commit hash from a remote repository
 * Uses `git ls-remote` to query without cloning
 */
export async function getRemoteCommitHash(
  repoUrl: string,
  branch?: string
): Promise<string> {
  log.debug(`Getting remote commit hash for ${repoUrl}`);

  try {
    const git = createGit();
    const ref = branch ? `refs/heads/${branch}` : 'HEAD';
    const result = await git.listRemote([repoUrl, ref]);

    // Parse the commit hash from output like "abc123\trefs/heads/main"
    const match = result.match(/^([a-f0-9]+)/);
    if (!match || !match[1]) {
      throw new Error('Could not parse commit hash from remote');
    }

    const commitHash = match[1];
    log.debug(`Remote commit hash: ${commitHash}`);
    return commitHash;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get remote commit hash: ${message}`);
  }
}

export interface TempCloneResult {
  /** Path to the temporary clone directory */
  tempDir: string;
  /** Cleanup function to remove the temp directory */
  cleanup: () => Promise<void>;
}

/**
 * Clone a repository to a temporary directory
 * Returns path and cleanup function
 *
 * Uses shallow clone (--depth 1) for speed
 */
export async function cloneToTemp(
  repoUrl: string,
  branch?: string
): Promise<TempCloneResult> {
  // Create unique temp directory
  const tempBase = paths.join(os.tmpdir(), 'nocaap-push');
  await paths.ensureDir(tempBase);
  const tempDir = await fs.mkdtemp(paths.join(tempBase, 'repo-'));

  log.debug(`Cloning ${repoUrl} to temp directory: ${tempDir}`);

  try {
    const git = createGit();

    // Build clone arguments
    const cloneArgs = ['--depth', '1'];
    if (branch) {
      cloneArgs.push('--branch', branch);
    }

    await git.clone(repoUrl, tempDir, cloneArgs);

    log.debug(`Temp clone complete: ${tempDir}`);

    // Return path and cleanup function
    return {
      tempDir,
      cleanup: async () => {
        log.debug(`Cleaning up temp directory: ${tempDir}`);
        await fs.remove(tempDir);
      },
    };
  } catch (error) {
    // Clean up on failure
    await fs.remove(tempDir);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to clone to temp directory: ${message}`);
  }
}

/**
 * Create a new branch in a repository
 */
export async function createBranch(repoPath: string, branchName: string): Promise<void> {
  const normalizedPath = paths.toUnix(repoPath);

  if (!(await isGitRepo(normalizedPath))) {
    throw new Error(`Not a git repository: ${normalizedPath}`);
  }

  try {
    const git = createGit(normalizedPath);
    await git.checkoutLocalBranch(branchName);
    log.debug(`Created and checked out branch: ${branchName}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create branch: ${message}`);
  }
}

/**
 * Commit all changes in a repository
 */
export async function commitAll(repoPath: string, message: string): Promise<string> {
  const normalizedPath = paths.toUnix(repoPath);

  if (!(await isGitRepo(normalizedPath))) {
    throw new Error(`Not a git repository: ${normalizedPath}`);
  }

  try {
    const git = createGit(normalizedPath);

    // Stage all changes
    await git.add('-A');

    // Commit
    const result = await git.commit(message);

    log.debug(`Committed changes: ${result.commit}`);
    return result.commit;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to commit: ${message}`);
  }
}

/**
 * Push a branch to origin
 * @throws Error if push fails (e.g., no write access)
 */
export async function pushBranch(
  repoPath: string,
  branchName: string
): Promise<void> {
  const normalizedPath = paths.toUnix(repoPath);

  if (!(await isGitRepo(normalizedPath))) {
    throw new Error(`Not a git repository: ${normalizedPath}`);
  }

  try {
    const git = createGit(normalizedPath);
    await git.push('origin', branchName, ['--set-upstream']);
    log.debug(`Pushed branch ${branchName} to origin`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check for permission denied
    if (
      message.includes('Permission denied') ||
      message.includes('403') ||
      message.includes('authentication failed')
    ) {
      throw new Error(
        `Permission denied. You don't have write access to this repository.\n` +
          'Consider forking the repository and pushing to your fork.'
      );
    }

    throw new Error(`Failed to push: ${message}`);
  }
}
