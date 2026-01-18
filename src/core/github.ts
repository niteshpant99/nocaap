/**
 * src/core/github.ts
 * GitHub PR creation utilities with cascading fallbacks
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { log } from '../utils/logger.js';

const execAsync = promisify(exec);

// =============================================================================
// Types
// =============================================================================

export type PrMethod = 'gh' | 'api' | 'manual';

export interface PrResult {
  /** The PR URL if created successfully */
  url: string | null;
  /** The method that was used */
  method: PrMethod;
  /** Whether the PR was created successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Detection
// =============================================================================

/**
 * Check if the gh CLI is available and authenticated
 */
export async function isGhAvailable(): Promise<boolean> {
  try {
    await execAsync('gh auth status');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if GITHUB_TOKEN environment variable is set
 */
export function hasGitHubToken(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

/**
 * Detect the best available method for PR creation
 */
export async function detectPrMethod(): Promise<PrMethod> {
  // Try gh CLI first (best UX)
  if (await isGhAvailable()) {
    log.debug('gh CLI available and authenticated');
    return 'gh';
  }

  // Try GitHub API via token
  if (hasGitHubToken()) {
    log.debug('GITHUB_TOKEN available for API');
    return 'api';
  }

  // Fallback to manual URL
  log.debug('No automated PR method available, will use manual URL');
  return 'manual';
}

// =============================================================================
// PR Creation via gh CLI
// =============================================================================

/**
 * Create a PR using the gh CLI
 * Requires gh to be installed and authenticated
 *
 * @param repoDir - The local repository directory (temp clone)
 * @param branch - The branch name for the PR
 * @param title - The PR title
 * @param body - The PR body/description
 * @returns The PR URL if successful, null otherwise
 */
export async function createPrViaGh(
  repoDir: string,
  branch: string,
  title: string,
  body: string
): Promise<string | null> {
  log.debug(`Creating PR via gh CLI in ${repoDir}`);

  try {
    // gh pr create outputs the PR URL on success
    const { stdout } = await execAsync(
      `gh pr create --title "${escapeShell(title)}" --body "${escapeShell(body)}" --head "${branch}"`,
      { cwd: repoDir }
    );

    const url = stdout.trim();
    log.debug(`PR created via gh: ${url}`);
    return url;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.debug(`gh pr create failed: ${message}`);
    return null;
  }
}

// =============================================================================
// PR Creation via GitHub API
// =============================================================================

/**
 * Create a PR using the GitHub REST API
 * Requires GITHUB_TOKEN environment variable
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branch - The head branch for the PR
 * @param baseBranch - The base branch (usually main)
 * @param title - The PR title
 * @param body - The PR body/description
 * @returns The PR URL if successful, null otherwise
 */
export async function createPrViaApi(
  owner: string,
  repo: string,
  branch: string,
  baseBranch: string,
  title: string,
  body: string
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    log.debug('No GITHUB_TOKEN available for API');
    return null;
  }

  log.debug(`Creating PR via GitHub API for ${owner}/${repo}`);

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title,
        body,
        head: branch,
        base: baseBranch,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.debug(`GitHub API error: ${response.status} - ${JSON.stringify(errorData)}`);
      return null;
    }

    const data = (await response.json()) as { html_url?: string };
    const url = data.html_url || null;

    if (url) {
      log.debug(`PR created via API: ${url}`);
    }

    return url;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.debug(`GitHub API request failed: ${message}`);
    return null;
  }
}

// =============================================================================
// Cascading PR Creation
// =============================================================================

export interface CreatePrOptions {
  /** Local repository directory (temp clone) */
  repoDir: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Feature branch name */
  branch: string;
  /** Base branch (usually main) */
  baseBranch: string;
  /** PR title */
  title: string;
  /** PR body/description */
  body: string;
  /** Manual PR URL for fallback */
  manualUrl: string;
}

/**
 * Create a PR using the best available method
 * Cascades: gh CLI → GitHub API → manual URL
 */
export async function createPr(options: CreatePrOptions): Promise<PrResult> {
  const method = await detectPrMethod();

  switch (method) {
    case 'gh': {
      const url = await createPrViaGh(
        options.repoDir,
        options.branch,
        options.title,
        options.body
      );

      if (url) {
        return { url, method: 'gh', success: true };
      }

      // gh failed, try API
      log.debug('gh CLI failed, trying GitHub API');
      if (hasGitHubToken()) {
        const apiUrl = await createPrViaApi(
          options.owner,
          options.repo,
          options.branch,
          options.baseBranch,
          options.title,
          options.body
        );

        if (apiUrl) {
          return { url: apiUrl, method: 'api', success: true };
        }
      }

      // Both failed, return manual URL
      return {
        url: options.manualUrl,
        method: 'manual',
        success: false,
        error: 'Could not create PR automatically. Please create it manually.',
      };
    }

    case 'api': {
      const url = await createPrViaApi(
        options.owner,
        options.repo,
        options.branch,
        options.baseBranch,
        options.title,
        options.body
      );

      if (url) {
        return { url, method: 'api', success: true };
      }

      // API failed, return manual URL
      return {
        url: options.manualUrl,
        method: 'manual',
        success: false,
        error: 'Could not create PR via API. Please create it manually.',
      };
    }

    case 'manual':
    default:
      return {
        url: options.manualUrl,
        method: 'manual',
        success: false,
        error: 'No automated PR creation method available.',
      };
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Escape a string for safe use in shell commands
 */
function escapeShell(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}
