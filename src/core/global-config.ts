/**
 * src/core/global-config.ts
 * Manages global nocaap configuration (~/.nocaap/config.json)
 */
import fs from 'fs-extra';
import os from 'os';
import * as paths from '../utils/paths.js';
import { log } from '../utils/logger.js';

// =============================================================================
// Constants
// =============================================================================

const NOCAAP_DIR = '.nocaap';
const CONFIG_FILE = 'config.json';

// =============================================================================
// Types
// =============================================================================

export interface GlobalConfig {
  /** Default registry URL for `nocaap setup` */
  defaultRegistry?: string;
  /** Last updated timestamp */
  updatedAt?: string;
}

// =============================================================================
// Path Helpers
// =============================================================================

/**
 * Get the global nocaap config directory path (~/.nocaap)
 */
export function getGlobalConfigDir(): string {
  return paths.join(os.homedir(), NOCAAP_DIR);
}

/**
 * Get the global config file path (~/.nocaap/config.json)
 */
export function getGlobalConfigPath(): string {
  return paths.join(getGlobalConfigDir(), CONFIG_FILE);
}

// =============================================================================
// Config Operations
// =============================================================================

/**
 * Read the global config file
 * Returns empty object if file doesn't exist
 */
export async function getGlobalConfig(): Promise<GlobalConfig> {
  const configPath = getGlobalConfigPath();

  if (!(await paths.exists(configPath))) {
    log.debug(`Global config not found at ${configPath}`);
    return {};
  }

  try {
    const data = await fs.readJson(configPath);
    log.debug(`Read global config from ${configPath}`);
    return data as GlobalConfig;
  } catch (error) {
    log.debug(`Failed to read global config: ${error}`);
    return {};
  }
}

/**
 * Write the global config file
 */
export async function setGlobalConfig(config: GlobalConfig): Promise<void> {
  const configDir = getGlobalConfigDir();
  const configPath = getGlobalConfigPath();

  // Ensure directory exists
  await fs.ensureDir(configDir);

  // Add timestamp
  config.updatedAt = new Date().toISOString();

  await fs.writeJson(configPath, config, { spaces: 2 });
  log.debug(`Wrote global config to ${configPath}`);
}

// =============================================================================
// Registry Helpers
// =============================================================================

/**
 * Get the default registry URL
 * Priority: Environment variable > Global config
 */
export async function getDefaultRegistry(): Promise<string | undefined> {
  // Check environment variable first
  const envRegistry = process.env.NOCAAP_DEFAULT_REGISTRY;
  if (envRegistry) {
    log.debug(`Using registry from NOCAAP_DEFAULT_REGISTRY env var`);
    return envRegistry;
  }

  // Fall back to global config
  const config = await getGlobalConfig();
  return config.defaultRegistry;
}

/**
 * Set the default registry URL in global config
 */
export async function setDefaultRegistry(url: string): Promise<void> {
  const config = await getGlobalConfig();
  config.defaultRegistry = url;
  await setGlobalConfig(config);
  log.debug(`Set default registry to ${url}`);
}

/**
 * Clear the default registry URL from global config
 */
export async function clearDefaultRegistry(): Promise<void> {
  const config = await getGlobalConfig();
  delete config.defaultRegistry;
  await setGlobalConfig(config);
  log.debug('Cleared default registry');
}

/**
 * Check if a default registry is configured
 */
export async function hasDefaultRegistry(): Promise<boolean> {
  const registry = await getDefaultRegistry();
  return !!registry;
}

