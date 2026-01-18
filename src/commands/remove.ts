/**
 * src/commands/remove.ts
 * Remove a context package
 */
import { confirm } from '@inquirer/prompts';
import * as paths from '../utils/paths.js';
import { log, createSpinner } from '../utils/logger.js';
import {
  removePackage as removePackageFromConfig,
  removeLockEntry,
  getPackage,
} from '../core/config.js';
import { isDirty, isGitRepo } from '../core/git-engine.js';
import { generateIndexWithProgress } from '../core/indexer.js';

// =============================================================================
// Types
// =============================================================================

export interface RemoveOptions {
  /** Force removal even if dirty */
  force?: boolean;
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Remove a context package
 *
 * Flow:
 * 1. Verify package exists in config
 * 2. Check for uncommitted changes (unless --force)
 * 3. Remove package directory
 * 4. Remove from config and lockfile
 * 5. Regenerate INDEX.md
 */
export async function removeCommand(
  alias: string,
  options: RemoveOptions
): Promise<void> {
  const projectRoot = process.cwd();

  log.title('Removing context package');

  // Check if package exists in config
  const pkg = await getPackage(projectRoot, alias);
  if (!pkg) {
    throw new Error(
      `Package '${alias}' not found in configuration.\n` +
        'Run `nocaap list` to see installed packages.'
    );
  }

  log.info(`Package: ${alias}`);
  log.dim(`  Source: ${pkg.source}`);
  if (pkg.path) {
    log.dim(`  Path: ${pkg.path}`);
  }
  log.newline();

  const packagePath = paths.getPackagePath(projectRoot, alias);

  // Check for dirty state (unless --force)
  if (!options.force && (await paths.exists(packagePath))) {
    if (await isGitRepo(packagePath)) {
      try {
        if (await isDirty(packagePath)) {
          log.warn('Package has uncommitted changes.');
          log.newline();

          const shouldContinue = await confirm({
            message: 'Remove anyway? Local changes will be lost.',
            default: false,
          });

          if (!shouldContinue) {
            log.info('Removal cancelled.');
            return;
          }
        }
      } catch {
        // Ignore errors checking dirty state
      }
    }
  }

  // Remove package directory
  const dirSpinner = createSpinner('Removing package directory...').start();

  try {
    if (await paths.exists(packagePath)) {
      // Use fs.remove directly to bypass dirty check (we already confirmed)
      const fs = await import('fs-extra');
      await fs.default.remove(packagePath);
    }
    dirSpinner.succeed('Removed package directory');
  } catch (error) {
    dirSpinner.fail('Failed to remove directory');
    throw error;
  }

  // Remove from config
  const configSpinner = createSpinner('Updating configuration...').start();

  try {
    await removePackageFromConfig(projectRoot, alias);
    await removeLockEntry(projectRoot, alias);
    configSpinner.succeed('Configuration updated');
  } catch (error) {
    configSpinner.fail('Failed to update configuration');
    throw error;
  }

  // Regenerate INDEX.md
  log.newline();
  await generateIndexWithProgress(projectRoot);

  // Done!
  log.newline();
  log.success(`Package '${alias}' removed successfully.`);
}

