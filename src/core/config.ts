/**
 * src/core/config.ts
 * Manages reading/writing the local .context/ directory files
 */
import fs from 'fs-extra';
import * as paths from '../utils/paths.js';
import {
  type Config,
  type Lockfile,
  type LockEntry,
  type PackageEntry,
  safeValidateConfig,
  safeValidateLockfile,
} from '../schemas/index.js';
import { log } from '../utils/logger.js';

// =============================================================================
// Directory Initialization
// =============================================================================

/**
 * Initialize the .context directory structure
 * Creates: .context/, .context/packages/, context.config.json, context.lock
 */
export async function initContextDir(projectRoot: string): Promise<void> {
  const contextDir = paths.getContextDir(projectRoot);
  const packagesDir = paths.getPackagesDir(projectRoot);
  const configPath = paths.getConfigPath(projectRoot);
  const lockfilePath = paths.getLockfilePath(projectRoot);

  log.debug(`Initializing context directory at ${contextDir}`);

  // Create directories
  await paths.ensureDir(contextDir);
  await paths.ensureDir(packagesDir);

  // Create default config if it doesn't exist
  if (!(await paths.exists(configPath))) {
    const defaultConfig: Config = { packages: [] };
    await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
    log.debug(`Created default config at ${configPath}`);
  }

  // Create empty lockfile if it doesn't exist
  if (!(await paths.exists(lockfilePath))) {
    const defaultLockfile: Lockfile = {};
    await fs.writeJson(lockfilePath, defaultLockfile, { spaces: 2 });
    log.debug(`Created default lockfile at ${lockfilePath}`);
  }
}

// =============================================================================
// Config File Operations
// =============================================================================

/**
 * Check if a config file exists in the project
 */
export async function configExists(projectRoot: string): Promise<boolean> {
  const configPath = paths.getConfigPath(projectRoot);
  return paths.exists(configPath);
}

/**
 * Read the config file from the project
 * Returns null if the file doesn't exist
 */
export async function readConfig(projectRoot: string): Promise<Config | null> {
  const configPath = paths.getConfigPath(projectRoot);

  if (!(await paths.exists(configPath))) {
    log.debug(`Config file not found at ${configPath}`);
    return null;
  }

  try {
    const data = await fs.readJson(configPath);
    const result = safeValidateConfig(data);

    if (!result.success) {
      const errorMessages = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new Error(`Invalid config file: ${errorMessages}`);
    }

    log.debug(`Read config from ${configPath}`);
    return result.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse config file: Invalid JSON at ${configPath}`);
    }
    throw error;
  }
}

/**
 * Write the config file to the project
 */
export async function writeConfig(projectRoot: string, config: Config): Promise<void> {
  const configPath = paths.getConfigPath(projectRoot);

  // Validate before writing
  const result = safeValidateConfig(config);
  if (!result.success) {
    const errorMessages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid config data: ${errorMessages}`);
  }

  await fs.writeJson(configPath, config, { spaces: 2 });
  log.debug(`Wrote config to ${configPath}`);
}

// =============================================================================
// Lockfile Operations
// =============================================================================

/**
 * Read the lockfile from the project
 * Returns empty object if the file doesn't exist (safe default)
 */
export async function readLockfile(projectRoot: string): Promise<Lockfile> {
  const lockfilePath = paths.getLockfilePath(projectRoot);

  if (!(await paths.exists(lockfilePath))) {
    log.debug(`Lockfile not found at ${lockfilePath}, returning empty lockfile`);
    return {};
  }

  try {
    const data = await fs.readJson(lockfilePath);
    const result = safeValidateLockfile(data);

    if (!result.success) {
      const errorMessages = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      throw new Error(`Invalid lockfile: ${errorMessages}`);
    }

    log.debug(`Read lockfile from ${lockfilePath}`);
    return result.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse lockfile: Invalid JSON at ${lockfilePath}`);
    }
    throw error;
  }
}

/**
 * Write the lockfile to the project
 */
export async function writeLockfile(projectRoot: string, lockfile: Lockfile): Promise<void> {
  const lockfilePath = paths.getLockfilePath(projectRoot);

  // Validate before writing
  const result = safeValidateLockfile(lockfile);
  if (!result.success) {
    const errorMessages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Invalid lockfile data: ${errorMessages}`);
  }

  await fs.writeJson(lockfilePath, lockfile, { spaces: 2 });
  log.debug(`Wrote lockfile to ${lockfilePath}`);
}

/**
 * Update a single entry in the lockfile
 * Reads current lockfile, updates the entry, and writes back atomically
 */
export async function updateLockEntry(
  projectRoot: string,
  alias: string,
  entry: LockEntry
): Promise<void> {
  const lockfile = await readLockfile(projectRoot);

  // Update the entry with current timestamp
  lockfile[alias] = {
    ...entry,
    updatedAt: new Date().toISOString(),
  };

  await writeLockfile(projectRoot, lockfile);
  log.debug(`Updated lock entry for alias '${alias}'`);
}

/**
 * Remove a lock entry by alias
 */
export async function removeLockEntry(projectRoot: string, alias: string): Promise<void> {
  const lockfile = await readLockfile(projectRoot);

  if (alias in lockfile) {
    delete lockfile[alias];
    await writeLockfile(projectRoot, lockfile);
    log.debug(`Removed lock entry for alias '${alias}'`);
  }
}

/**
 * Get a single lock entry by alias
 * Returns undefined if not found
 */
export async function getLockEntry(
  projectRoot: string,
  alias: string
): Promise<LockEntry | undefined> {
  const lockfile = await readLockfile(projectRoot);
  return lockfile[alias];
}

// =============================================================================
// Package Helpers
// =============================================================================

/**
 * Add or update a package in the config
 */
export async function upsertPackage(
  projectRoot: string,
  pkg: PackageEntry
): Promise<void> {
  const config = (await readConfig(projectRoot)) ?? { packages: [] };

  const existingIndex = config.packages.findIndex((p) => p.alias === pkg.alias);

  if (existingIndex >= 0) {
    config.packages[existingIndex] = pkg;
    log.debug(`Updated package '${pkg.alias}' in config`);
  } else {
    config.packages.push(pkg);
    log.debug(`Added package '${pkg.alias}' to config`);
  }

  await writeConfig(projectRoot, config);
}

/**
 * Remove a package from the config by alias
 */
export async function removePackage(projectRoot: string, alias: string): Promise<boolean> {
  const config = await readConfig(projectRoot);
  if (!config) return false;

  const initialLength = config.packages.length;
  config.packages = config.packages.filter((p) => p.alias !== alias);

  if (config.packages.length < initialLength) {
    await writeConfig(projectRoot, config);
    log.debug(`Removed package '${alias}' from config`);
    return true;
  }

  return false;
}

/**
 * Get a package entry from config by alias
 */
export async function getPackage(
  projectRoot: string,
  alias: string
): Promise<PackageEntry | undefined> {
  const config = await readConfig(projectRoot);
  return config?.packages.find((p) => p.alias === alias);
}
