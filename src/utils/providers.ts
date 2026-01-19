/**
 * src/utils/providers.ts
 * Git provider detection and URL parsing utilities
 */

// =============================================================================
// Types
// =============================================================================

export type Provider = 'github' | 'gitlab' | 'bitbucket' | 'unknown';

export interface RepoInfo {
  provider: Provider;
  owner: string;
  repo: string;
}

// =============================================================================
// Provider Detection
// =============================================================================

/**
 * Detect the Git provider from a repository URL
 */
export function detectProvider(url: string): Provider {
  const normalized = url.toLowerCase();

  if (normalized.includes('github.com') || normalized.includes('github:')) {
    return 'github';
  }
  if (normalized.includes('gitlab.com') || normalized.includes('gitlab:')) {
    return 'gitlab';
  }
  if (normalized.includes('bitbucket.org') || normalized.includes('bitbucket:')) {
    return 'bitbucket';
  }

  return 'unknown';
}

// =============================================================================
// URL Parsing
// =============================================================================

/**
 * Parse a Git URL into provider, owner, and repo components
 *
 * Supports:
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo
 */
export function parseRepoInfo(url: string): RepoInfo {
  const provider = detectProvider(url);

  // Remove trailing .git
  const cleaned = url.replace(/\.git$/, '');

  // Try SSH format: git@provider:owner/repo
  const sshMatch = cleaned.match(/git@[^:]+:([^/]+)\/(.+)/);
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    return {
      provider,
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  // Try HTTPS format: https://provider/owner/repo
  const httpsMatch = cleaned.match(/https?:\/\/[^/]+\/([^/]+)\/(.+)/);
  if (httpsMatch && httpsMatch[1] && httpsMatch[2]) {
    return {
      provider,
      owner: httpsMatch[1],
      repo: httpsMatch[2],
    };
  }

  // Fallback: return empty strings
  return {
    provider,
    owner: '',
    repo: '',
  };
}

// =============================================================================
// PR URL Generation
// =============================================================================

/**
 * Build a "create PR" URL for manual browser navigation
 * Used as fallback when gh CLI and API are unavailable
 */
export function buildNewPrUrl(info: RepoInfo, branch: string, baseBranch: string = 'main'): string {
  const { provider, owner, repo } = info;

  switch (provider) {
    case 'github':
      // GitHub compare URL that opens PR creation
      return `https://github.com/${owner}/${repo}/compare/${baseBranch}...${branch}?expand=1`;

    case 'gitlab':
      // GitLab merge request creation URL (target_branch is the base)
      return `https://gitlab.com/${owner}/${repo}/-/merge_requests/new?merge_request[source_branch]=${branch}&merge_request[target_branch]=${baseBranch}`;

    case 'bitbucket':
      // Bitbucket PR creation URL
      return `https://bitbucket.org/${owner}/${repo}/pull-requests/new?source=${branch}&dest=${baseBranch}`;

    default:
      // Generic fallback - just return the repo URL
      return `https://github.com/${owner}/${repo}`;
  }
}

/**
 * Build a direct link to an existing PR
 */
export function buildPrLink(info: RepoInfo, prNumber: number): string {
  const { provider, owner, repo } = info;

  switch (provider) {
    case 'github':
      return `https://github.com/${owner}/${repo}/pull/${prNumber}`;

    case 'gitlab':
      return `https://gitlab.com/${owner}/${repo}/-/merge_requests/${prNumber}`;

    case 'bitbucket':
      return `https://bitbucket.org/${owner}/${repo}/pull-requests/${prNumber}`;

    default:
      return '';
  }
}
