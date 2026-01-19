/**
 * src/commands/config.ts
 * Manage nocaap configuration (global and project)
 */
import { log, style } from '../utils/logger.js';
import {
  getGlobalConfig,
  setGlobalConfig,
  getGlobalConfigPath,
} from '../core/global-config.js';
import { readConfig, writeConfig, configExists } from '../core/config.js';
import { resolveSettings } from '../core/settings.js';
import * as paths from '../utils/paths.js';
import type { GlobalConfig } from '../schemas/index.js';

// =============================================================================
// Types
// =============================================================================

export interface ConfigOptions {
  list?: boolean;
  global?: boolean;
  project?: boolean;
}

// Valid config keys with their descriptions
const CONFIG_KEYS: Record<string, { scope: 'global' | 'project' | 'both'; desc: string }> = {
  'registry': { scope: 'global', desc: 'Default registry URL' },
  'push.baseBranch': { scope: 'both', desc: 'Default PR target branch' },
  'embedding.provider': { scope: 'global', desc: 'Embedding provider (ollama|openai|tfjs|auto)' },
  'embedding.ollamaModel': { scope: 'global', desc: 'Ollama model name' },
  'embedding.ollamaBaseUrl': { scope: 'global', desc: 'Ollama server URL' },
  'search.fulltextWeight': { scope: 'project', desc: 'BM25 weight (0-1)' },
  'search.vectorWeight': { scope: 'project', desc: 'Vector weight (0-1)' },
  'search.rrfK': { scope: 'project', desc: 'RRF smoothing constant' },
  'index.semantic': { scope: 'project', desc: 'Enable semantic indexing by default' },
  'index.provider': { scope: 'project', desc: 'Index embedding provider' },
};

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * View or set configuration
 *
 * Usage:
 *   nocaap config                        - Show all config (alias for list)
 *   nocaap config list                   - Show all config
 *   nocaap config list --global          - Show global config only
 *   nocaap config list --project         - Show project config only
 *   nocaap config get <key>              - Get a specific value
 *   nocaap config set <key> <value>      - Set a value (global by default)
 *   nocaap config set --project <k> <v>  - Set project-level value
 *   nocaap config unset <key>            - Remove a value
 */
export async function configCommand(
  key: string | undefined,
  value: string | undefined,
  options: ConfigOptions
): Promise<void> {
  // If --list flag or no arguments, show all config
  if (options.list || !key) {
    await showConfig(options);
    return;
  }

  // Handle subcommands
  switch (key) {
    case 'list':
      await showConfig(options);
      break;
    case 'get':
      if (!value) {
        log.error('Usage: nocaap config get <key>');
        showAvailableKeys();
        return;
      }
      await getConfigValue(value);
      break;
    case 'set':
      // value is actually the key in this case, we need to get the real value
      log.error('Usage: nocaap config set <key> <value>');
      log.dim('Example: nocaap config set push.baseBranch develop');
      break;
    case 'unset':
      if (!value) {
        log.error('Usage: nocaap config unset <key>');
        showAvailableKeys();
        return;
      }
      await unsetConfigValue(value, options);
      break;
    default:
      // Assume key=value format: nocaap config push.baseBranch develop
      if (value !== undefined) {
        await setConfigValue(key, value, options);
      } else {
        await getConfigValue(key);
      }
  }
}

/**
 * Handle "nocaap config set <key> <value>" via index.ts
 */
export async function configSetCommand(
  key: string,
  value: string,
  options: ConfigOptions
): Promise<void> {
  await setConfigValue(key, value, options);
}

// =============================================================================
// Config Operations
// =============================================================================

/**
 * Show all configuration
 */
async function showConfig(options: ConfigOptions): Promise<void> {
  const projectRoot = process.cwd();
  const showGlobal = !options.project;
  const showProject = !options.global;

  log.title('Configuration');
  log.newline();

  // Global config
  if (showGlobal) {
    const globalPath = getGlobalConfigPath();
    log.info(style.bold('Global') + style.dim(` (${globalPath})`));

    const globalConfig = await getGlobalConfig();
    if (Object.keys(globalConfig).length === 0) {
      log.dim('  (empty)');
    } else {
      printConfigObject(globalConfig, '  ');
    }
    log.newline();
  }

  // Project config
  if (showProject) {
    const hasProject = await configExists(projectRoot);
    const projectPath = paths.getConfigPath(projectRoot);

    log.info(style.bold('Project') + style.dim(` (${projectPath})`));

    if (!hasProject) {
      log.dim('  (no project config - run nocaap setup first)');
    } else {
      const projectConfig = await readConfig(projectRoot);
      if (projectConfig) {
        // Show only the settings fields, not packages
        const { search, push, index } = projectConfig;
        const settings = { search, push, index };
        const hasSettings = Object.values(settings).some(v => v !== undefined);

        if (hasSettings) {
          printConfigObject(settings, '  ');
        } else {
          log.dim('  (no settings configured)');
        }
      }
    }
    log.newline();
  }

  // Show effective settings if both scopes shown
  if (showGlobal && showProject) {
    try {
      const resolved = await resolveSettings(projectRoot);
      log.info(style.bold('Effective Settings') + style.dim(' (merged)'));
      printConfigObject(resolved as unknown as Record<string, unknown>, '  ');
    } catch {
      // Project may not exist
    }
  }
}

/**
 * Get a specific config value
 */
async function getConfigValue(key: string): Promise<void> {
  const projectRoot = process.cwd();

  // Validate key
  if (!CONFIG_KEYS[key] && key !== 'registry') {
    log.error(`Unknown config key: ${style.code(key)}`);
    showAvailableKeys();
    return;
  }

  // Get effective value from resolved settings
  try {
    const resolved = await resolveSettings(projectRoot);
    const value = getNestedValue(resolved as unknown as Record<string, unknown>, key);

    if (value !== undefined) {
      log.info(`${key}: ${formatValue(value)}`);
    } else {
      log.info(`${key}: ${style.dim('(not set)')}`);
    }
  } catch {
    // Try global config only
    const globalConfig = await getGlobalConfig();
    const value = getNestedValue(globalConfig, key);

    if (value !== undefined) {
      log.info(`${key}: ${formatValue(value)}`);
    } else {
      log.info(`${key}: ${style.dim('(not set)')}`);
    }
  }
}

/**
 * Set a config value
 */
async function setConfigValue(
  key: string,
  value: string,
  options: ConfigOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // Validate key
  const keyInfo = CONFIG_KEYS[key];
  if (!keyInfo && key !== 'registry') {
    log.error(`Unknown config key: ${style.code(key)}`);
    showAvailableKeys();
    return;
  }

  // Determine scope
  const scope = options.project ? 'project' : 'global';

  // Validate scope
  if (keyInfo && scope === 'project' && keyInfo.scope === 'global') {
    log.error(`Key '${key}' can only be set globally.`);
    log.dim('Run without --project flag.');
    return;
  }
  if (keyInfo && scope === 'global' && keyInfo.scope === 'project') {
    log.error(`Key '${key}' can only be set at project level.`);
    log.dim('Use --project flag.');
    return;
  }

  // Parse and validate value
  const parsedValue = parseValue(key, value);

  if (scope === 'global') {
    await setGlobalValue(key, parsedValue);
    log.success(`Set ${style.code(key)} = ${formatValue(parsedValue)} (global)`);
  } else {
    await setProjectValue(projectRoot, key, parsedValue);
    log.success(`Set ${style.code(key)} = ${formatValue(parsedValue)} (project)`);
  }
}

/**
 * Unset a config value
 */
async function unsetConfigValue(key: string, options: ConfigOptions): Promise<void> {
  const projectRoot = process.cwd();
  const scope = options.project ? 'project' : 'global';

  if (scope === 'global') {
    const config = await getGlobalConfig();
    deleteNestedValue(config, key);
    await setGlobalConfig(config);
    log.success(`Removed ${style.code(key)} from global config`);
  } else {
    const config = await readConfig(projectRoot);
    if (config) {
      deleteNestedValue(config, key);
      await writeConfig(projectRoot, config);
      log.success(`Removed ${style.code(key)} from project config`);
    } else {
      log.warn('No project config found');
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Set a value in global config
 */
async function setGlobalValue(key: string, value: unknown): Promise<void> {
  const config = await getGlobalConfig();

  // Handle registry specially for backward compatibility
  if (key === 'registry') {
    config.defaultRegistry = value as string;
  } else {
    setNestedValue(config, key, value);
  }

  await setGlobalConfig(config);
}

/**
 * Set a value in project config
 */
async function setProjectValue(projectRoot: string, key: string, value: unknown): Promise<void> {
  const config = await readConfig(projectRoot);

  if (!config) {
    log.error('No project config found. Run `nocaap setup` first.');
    return;
  }

  setNestedValue(config, key, value);
  await writeConfig(projectRoot, config);
}

/**
 * Parse a string value to appropriate type
 */
function parseValue(key: string, value: string): unknown {
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Number (for weights and rrfK)
  if (key.includes('Weight') || key === 'search.rrfK') {
    const num = parseFloat(value);
    if (isNaN(num)) {
      throw new Error(`Invalid number: ${value}`);
    }
    // Validate range for weights
    if (key.includes('Weight') && (num < 0 || num > 1)) {
      throw new Error(`Weight must be between 0 and 1`);
    }
    return num;
  }

  return value;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') return style.code(value);
  if (typeof value === 'number') return style.code(value.toString());
  if (typeof value === 'boolean') return style.code(value ? 'true' : 'false');
  return String(value);
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  // Handle registry alias
  if (path === 'registry') {
    return (obj as GlobalConfig).defaultRegistry;
  }

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Set nested value in object using dot notation
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

/**
 * Delete nested value from object using dot notation
 */
function deleteNestedValue(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== 'object') {
      return; // Path doesn't exist
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  delete current[lastPart];
}

/**
 * Print a config object recursively
 */
function printConfigObject(obj: Record<string, unknown>, indent: string): void {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      log.info(`${indent}${style.bold(key)}:`);
      printConfigObject(value as Record<string, unknown>, indent + '  ');
    } else {
      log.info(`${indent}${key}: ${formatValue(value)}`);
    }
  }
}

/**
 * Show available config keys
 */
function showAvailableKeys(): void {
  log.newline();
  log.info('Available keys:');
  for (const [key, info] of Object.entries(CONFIG_KEYS)) {
    const scopeTag = info.scope === 'both' ? '' : ` [${info.scope}]`;
    log.dim(`  ${key}${scopeTag} - ${info.desc}`);
  }
}
