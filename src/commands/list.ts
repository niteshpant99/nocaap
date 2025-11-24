/**
 * src/commands/list.ts
 * List installed context packages
 */
import * as paths from '../utils/paths.js';
import { log, style } from '../utils/logger.js';
import { readConfig, readLockfile } from '../core/config.js';
import { isGitRepo, isDirty } from '../core/git-engine.js';

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * List all installed context packages with their status
 */
export async function listCommand(): Promise<void> {
  const projectRoot = process.cwd();

  // Read config and lockfile
  const config = await readConfig(projectRoot);
  const lockfile = await readLockfile(projectRoot);

  if (!config || config.packages.length === 0) {
    log.info('No packages installed.');
    log.dim('Run `nocaap setup` or `nocaap add <repo>` to get started.');
    return;
  }

  log.title('Installed Packages');

  if (config.registryUrl) {
    log.dim(`Registry: ${config.registryUrl}`);
    log.newline();
  }

  for (const pkg of config.packages) {
    const lock = lockfile[pkg.alias];
    const commit = lock?.commitHash?.slice(0, 8) ?? 'unknown';
    const packagePath = paths.getPackagePath(projectRoot, pkg.alias);

    // Check package status
    let statusIndicator = style.success('●');
    let statusText = '';

    if (!(await paths.exists(packagePath))) {
      statusIndicator = style.error('○');
      statusText = ' (missing)';
    } else if (await isGitRepo(packagePath)) {
      try {
        if (await isDirty(packagePath)) {
          statusIndicator = style.warn('●');
          statusText = ' (modified)';
        }
      } catch {
        // Ignore errors checking dirty state
      }
    }

    // Display package info
    log.plain(`${statusIndicator} ${style.bold(pkg.alias)}${statusText}`);
    log.dim(`    Source: ${pkg.source}`);
    if (pkg.path) {
      log.dim(`    Path:   ${pkg.path}`);
    }
    log.dim(`    Branch: ${pkg.version || 'main'}`);
    log.dim(`    Commit: ${commit}`);
    if (lock?.updatedAt) {
      const updated = new Date(lock.updatedAt).toLocaleDateString();
      log.dim(`    Updated: ${updated}`);
    }
    log.newline();
  }

  // Summary
  log.hr();
  log.dim(`${config.packages.length} package(s) installed`);
}

