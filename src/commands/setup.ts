/**
 * src/commands/setup.ts
 * Interactive setup wizard to configure context packages
 */
import { checkbox, input, confirm } from '@inquirer/prompts';
import * as paths from '../utils/paths.js';
import { log, createSpinner, style } from '../utils/logger.js';
import {
  initContextDir,
  configExists,
  readConfig,
  writeConfig,
  upsertPackage,
  updateLockEntry,
  updateClaudeMd,
} from '../core/config.js';
import {
  getDefaultRegistry,
  setDefaultRegistry,
} from '../core/global-config.js';
import { fetchRegistryWithImports } from '../core/registry.js';
import { checkAccess, sparseClone } from '../core/git-engine.js';
import { generateIndexWithProgress } from '../core/indexer.js';
import type { Registry, ContextEntry } from '../schemas/index.js';

// =============================================================================
// Types
// =============================================================================

export interface SetupOptions {
  /** Registry URL to fetch contexts from */
  registry?: string;
}

interface AccessCheckResult {
  context: ContextEntry;
  hasAccess: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_REGISTRY_PROMPT = 'Enter your organization\'s registry URL:';

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Interactive setup wizard
 *
 * Flow:
 * 1. Get registry URL (from option or prompt)
 * 2. Fetch registry with federation support
 * 3. Check access to each context (SSH check)
 * 4. Display interactive selection
 * 5. Clone selected contexts
 * 6. Generate INDEX.md
 */
export async function setupCommand(options: SetupOptions): Promise<void> {
  const projectRoot = process.cwd();

  log.title('nocaap Setup Wizard');
  log.newline();

  // Check if already initialized
  if (await configExists(projectRoot)) {
    const config = await readConfig(projectRoot);
    if (config && config.packages.length > 0) {
      log.warn('nocaap is already configured in this project.');
      log.dim(`  ${config.packages.length} package(s) installed`);
      log.newline();

      const shouldContinue = await confirm({
        message: 'Do you want to add more packages?',
        default: true,
      });

      if (!shouldContinue) {
        log.info('Setup cancelled.');
        return;
      }
    }
  }

  // Step 1: Get registry URL (from CLI option > global config > prompt)
  let registryUrl = options.registry;

  if (!registryUrl) {
    // Check global config / env var
    const defaultRegistry = await getDefaultRegistry();

    if (defaultRegistry) {
      log.info(`Using default registry: ${style.url(defaultRegistry)}`);
      log.dim('(from global config - run `nocaap config registry` to change)');
      log.newline();

      const useDefault = await confirm({
        message: 'Use this registry?',
        default: true,
      });

      if (useDefault) {
        registryUrl = defaultRegistry;
      }
    }
  }

  // If still no registry, prompt for it
  if (!registryUrl) {
    registryUrl = await input({
      message: DEFAULT_REGISTRY_PROMPT,
      validate: (value) => {
        if (!value.trim()) {
          return 'Registry URL is required';
        }
        try {
          new URL(value);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      },
    });

    // Offer to save as default
    log.newline();
    const saveAsDefault = await confirm({
      message: 'Save this as your default registry?',
      default: true,
    });

    if (saveAsDefault) {
      await setDefaultRegistry(registryUrl);
      log.success('Saved to global config!');
    }
  }

  log.newline();

  // Step 2: Fetch registry
  const fetchSpinner = createSpinner('Fetching registry...').start();

  let registry: Registry;
  try {
    registry = await fetchRegistryWithImports(registryUrl);
    fetchSpinner.succeed(
      `Fetched registry: ${registry.contexts.length} context(s) available`
    );
  } catch (error) {
    fetchSpinner.fail('Failed to fetch registry');
    throw error;
  }

  if (registry.contexts.length === 0) {
    log.warn('No contexts found in registry.');
    return;
  }

  log.newline();

  // Step 3: Check access to each context
  const accessSpinner = createSpinner('Checking repository access...').start();

  const accessResults: AccessCheckResult[] = [];
  for (const context of registry.contexts) {
    const hasAccess = await checkAccess(context.repo);
    accessResults.push({ context, hasAccess });
  }

  const accessibleContexts = accessResults.filter((r) => r.hasAccess);
  const inaccessibleContexts = accessResults.filter((r) => !r.hasAccess);

  accessSpinner.succeed(
    `Access check complete: ${accessibleContexts.length} accessible, ${inaccessibleContexts.length} restricted`
  );

  if (inaccessibleContexts.length > 0) {
    log.newline();
    log.dim('Restricted contexts (no access):');
    for (const { context } of inaccessibleContexts) {
      log.dim(`  - ${context.name}`);
    }
  }

  if (accessibleContexts.length === 0) {
    log.newline();
    log.error('No accessible contexts found. Check your SSH keys and permissions.');
    return;
  }

  log.newline();

  // Step 4: Interactive selection
  // Get already installed packages to mark them
  const currentConfig = await readConfig(projectRoot);
  const installedAliases = new Set(
    currentConfig?.packages.map(p => p.alias) ?? []
  );

  // Build choices with installed status
  const choices = accessibleContexts.map(({ context }) => {
    const alias = generateAlias(context);
    const isInstalled = installedAliases.has(alias);

    return {
      name: isInstalled
        ? `${formatContextChoice(context)} ${style.dim('[already installed]')}`
        : formatContextChoice(context),
      value: context.name,
      checked: false,
      disabled: isInstalled ? 'Already installed' : false,
    };
  });

  // Show count of already installed
  const installedCount = [...installedAliases].filter(alias =>
    accessibleContexts.some(({ context }) => generateAlias(context) === alias)
  ).length;

  if (installedCount > 0) {
    log.info(`${installedCount} package(s) already installed (shown as disabled)`);
    log.newline();
  }

  const selectedNames = await checkbox({
    message: 'Select contexts to install:',
    choices,
    pageSize: 15,
  });

  if (selectedNames.length === 0) {
    log.warn('No contexts selected. Setup cancelled.');
    return;
  }

  log.newline();

  // Step 5: Initialize .context/ directory
  if (!(await configExists(projectRoot))) {
    const initSpinner = createSpinner('Initializing .context/ directory...').start();
    await initContextDir(projectRoot);
    initSpinner.succeed('Initialized .context/ directory');
  }

  // Save registry URL to config
  const configToUpdate = (await readConfig(projectRoot)) ?? { packages: [] };
  configToUpdate.registryUrl = registryUrl;
  await writeConfig(projectRoot, configToUpdate);

  log.newline();

  // Step 6: Clone selected contexts
  log.info(`Installing ${selectedNames.length} context(s)...`);
  log.newline();

  let successCount = 0;
  let failCount = 0;

  for (const name of selectedNames) {
    const context = accessibleContexts.find((r) => r.context.name === name)?.context;
    if (!context) continue;

    const alias = generateAlias(context);

    // Double-check: skip if already installed
    if (installedAliases.has(alias)) {
      log.dim(`Skipping ${alias} (already installed)`);
      continue;
    }

    const spinner = createSpinner(`Installing ${style.bold(context.name)}...`).start();

    try {
      const targetDir = paths.getPackagePath(projectRoot, alias);

      const { commitHash } = await sparseClone({
        repoUrl: context.repo,
        targetDir,
        sparsePath: context.path,
      });

      // Update config
      await upsertPackage(projectRoot, {
        alias,
        source: context.repo,
        path: context.path,
        version: 'main',
      });

      // Update lockfile
      await updateLockEntry(projectRoot, alias, {
        commitHash,
        sparsePath: context.path || '',
        updatedAt: new Date().toISOString(),
      });

      spinner.succeed(`Installed ${context.name} → ${alias}`);
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      spinner.fail(`Failed to install ${context.name}: ${message}`);
      failCount++;
    }
  }

  log.newline();

  // Step 7: Generate INDEX.md
  if (successCount > 0) {
    await generateIndexWithProgress(projectRoot);
  }

  // Step 8: Offer CLAUDE.md integration
  if (successCount > 0) {
    log.newline();
    log.hr();
    log.newline();

    const addClaude = await confirm({
      message: 'Add nocaap reference to CLAUDE.md?',
      default: true,
    });

    if (addClaude) {
      const updated = await updateClaudeMd(projectRoot);
      if (updated) {
        log.success('Added nocaap reference to CLAUDE.md');
      } else {
        log.dim('CLAUDE.md already configured');
      }
    }
  }

  // Summary
  log.newline();
  log.hr();
  log.newline();

  if (successCount > 0) {
    log.success(`Setup complete! ${successCount} context(s) installed.`);
    log.newline();
    log.info('Next steps:');
    log.dim('  1. Review .context/INDEX.md for available documentation');
    log.dim('  2. Run `nocaap update` to pull latest changes');
  }

  if (failCount > 0) {
    log.newline();
    log.warn(`${failCount} context(s) failed to install.`);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a context entry for display in the selection list
 */
function formatContextChoice(context: ContextEntry): string {
  let display = context.name;

  if (context.description) {
    display += ` - ${context.description}`;
  }

  if (context.tags && context.tags.length > 0) {
    display += ` [${context.tags.join(', ')}]`;
  }

  return display;
}

/**
 * Generate a valid alias from a context entry
 * Prefers the leaf folder from path, falls back to name
 */
function generateAlias(context: ContextEntry): string {
  // Prefer leaf folder from path (e.g., "/capabilities" -> "capabilities")
  if (context.path) {
    const leafFolder = context.path.split('/').filter(Boolean).pop();
    if (leafFolder) {
      return leafFolder
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
    }
  }

  // Fallback to name
  return context.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .slice(0, 50); // Limit length
}
