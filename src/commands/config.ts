/**
 * src/commands/config.ts
 * Manage global nocaap configuration
 */
import { log, style } from '../utils/logger.js';
import {
  getGlobalConfig,
  getGlobalConfigPath,
  getDefaultRegistry,
  setDefaultRegistry,
  clearDefaultRegistry,
} from '../core/global-config.js';

// =============================================================================
// Types
// =============================================================================

export type ConfigKey = 'registry';

export interface ConfigOptions {
  list?: boolean;
  clear?: boolean;
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * View or set global configuration
 *
 * Usage:
 *   nocaap config registry                    - View current registry
 *   nocaap config registry <url>              - Set registry URL
 *   nocaap config registry --clear            - Clear registry URL
 *   nocaap config --list                      - Show all config
 */
export async function configCommand(
  key: string | undefined,
  value: string | undefined,
  options: ConfigOptions
): Promise<void> {
  // If --list flag or no arguments, show all config
  if (options.list || (!key && !value)) {
    await showAllConfig();
    return;
  }

  // Handle specific keys
  switch (key) {
    case 'registry':
      await handleRegistryConfig(value, options.clear);
      break;
    default:
      log.error(`Unknown config key: ${style.code(key ?? '')}`);
      log.newline();
      log.info('Available keys:');
      log.dim('  registry  - Default registry URL for `nocaap setup`');
      break;
  }
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Show all global config
 */
async function showAllConfig(): Promise<void> {
  const config = await getGlobalConfig();
  const configPath = getGlobalConfigPath();

  log.title('Global Configuration');
  log.dim(`Location: ${configPath}`);
  log.newline();

  if (Object.keys(config).length === 0 || !config.defaultRegistry) {
    log.info('No configuration set.');
    log.newline();
    log.dim("Set your organization's registry:");
    log.dim('  nocaap config registry <url>');
    return;
  }

  if (config.defaultRegistry) {
    log.info(`${style.bold('registry')}: ${config.defaultRegistry}`);
  }

  if (config.updatedAt) {
    log.newline();
    log.dim(`Last updated: ${new Date(config.updatedAt).toLocaleString()}`);
  }
}

/**
 * Handle registry config (view/set/clear)
 */
async function handleRegistryConfig(
  value: string | undefined,
  clear?: boolean
): Promise<void> {
  // Clear registry
  if (clear) {
    await clearDefaultRegistry();
    log.success('Default registry cleared.');
    return;
  }

  // Set registry
  if (value) {
    // Validate URL before setting
    try {
      new URL(value);
    } catch {
      throw new Error(
        `Invalid URL: ${value}\n` +
          'Please provide a valid URL, e.g.:\n' +
          '  https://raw.githubusercontent.com/your-org/hub/main/nocaap-registry.json'
      );
    }

    await setDefaultRegistry(value);
    log.success('Default registry set!');
    log.newline();
    log.info(`Registry: ${style.url(value)}`);
    log.newline();
    log.dim('Now you can run `nocaap setup` without the --registry flag.');
    return;
  }

  // View registry
  const registry = await getDefaultRegistry();
  if (registry) {
    // Check if from env var
    const envVar = process.env.NOCAAP_DEFAULT_REGISTRY;

    log.info(`Default registry: ${style.url(registry)}`);

    if (envVar) {
      log.dim('  (from NOCAAP_DEFAULT_REGISTRY environment variable)');
    } else {
      log.dim('  (from global config)');
    }
  } else {
    log.info('No default registry configured.');
    log.newline();
    log.dim('Set one with:');
    log.dim('  nocaap config registry <url>');
    log.newline();
    log.dim('Example:');
    log.dim(
      '  nocaap config registry https://raw.githubusercontent.com/your-org/hub/main/nocaap-registry.json'
    );
  }
}

