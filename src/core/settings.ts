/**
 * src/core/settings.ts
 * Resolves merged configuration from all sources
 * Priority: CLI overrides > Project config > Global config > Defaults
 */
import {
  getGlobalPushSettings,
  getGlobalEmbeddingSettings,
} from './global-config.js';
import {
  getSearchSettings,
  getPushSettings,
  getIndexSettings,
} from './config.js';
import { log } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

export interface ResolvedSearchSettings {
  fulltextWeight: number;
  vectorWeight: number;
  rrfK: number;
}

export interface ResolvedPushSettings {
  baseBranch?: string;
}

export interface ResolvedEmbeddingSettings {
  provider: 'ollama' | 'openai' | 'tfjs' | 'auto';
  ollamaModel: string;
  ollamaBaseUrl: string;
}

export interface ResolvedIndexSettings {
  semantic: boolean;
  provider: 'ollama' | 'openai' | 'tfjs' | 'auto';
}

export interface ResolvedSettings {
  search: ResolvedSearchSettings;
  push: ResolvedPushSettings;
  embedding: ResolvedEmbeddingSettings;
  index: ResolvedIndexSettings;
}

/** Partial version for CLI overrides */
export interface SettingsOverrides {
  search?: Partial<ResolvedSearchSettings>;
  push?: Partial<ResolvedPushSettings>;
  embedding?: Partial<ResolvedEmbeddingSettings>;
  index?: Partial<ResolvedIndexSettings>;
}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULTS: ResolvedSettings = {
  search: {
    fulltextWeight: 0.4,
    vectorWeight: 0.6,
    rrfK: 60,
  },
  push: {},
  embedding: {
    provider: 'auto',
    ollamaModel: 'nomic-embed-text',
    ollamaBaseUrl: 'http://localhost:11434',
  },
  index: {
    semantic: false,
    provider: 'auto',
  },
};

/**
 * Get the default settings (useful for reference)
 */
export function getDefaults(): ResolvedSettings {
  return structuredClone(DEFAULTS);
}

// =============================================================================
// Settings Resolver
// =============================================================================

/**
 * Resolve all settings by merging: defaults < global < project < cli overrides
 */
export async function resolveSettings(
  projectRoot: string,
  cliOverrides?: SettingsOverrides
): Promise<ResolvedSettings> {
  log.debug('Resolving settings...');

  // Start with defaults
  const resolved = structuredClone(DEFAULTS);

  // Layer 1: Global config (embedding and push only)
  const globalPush = await getGlobalPushSettings();
  const globalEmbedding = await getGlobalEmbeddingSettings();

  if (globalPush?.baseBranch) {
    resolved.push.baseBranch = globalPush.baseBranch;
    log.debug(`Using global push.baseBranch: ${globalPush.baseBranch}`);
  }

  if (globalEmbedding) {
    if (globalEmbedding.provider) {
      resolved.embedding.provider = globalEmbedding.provider;
    }
    if (globalEmbedding.ollamaModel) {
      resolved.embedding.ollamaModel = globalEmbedding.ollamaModel;
    }
    if (globalEmbedding.ollamaBaseUrl) {
      resolved.embedding.ollamaBaseUrl = globalEmbedding.ollamaBaseUrl;
    }
    log.debug('Applied global embedding settings');
  }

  // Layer 2: Project config
  const projectSearch = await getSearchSettings(projectRoot);
  const projectPush = await getPushSettings(projectRoot);
  const projectIndex = await getIndexSettings(projectRoot);

  if (projectSearch) {
    if (projectSearch.fulltextWeight !== undefined) {
      resolved.search.fulltextWeight = projectSearch.fulltextWeight;
    }
    if (projectSearch.vectorWeight !== undefined) {
      resolved.search.vectorWeight = projectSearch.vectorWeight;
    }
    if (projectSearch.rrfK !== undefined) {
      resolved.search.rrfK = projectSearch.rrfK;
    }
    log.debug('Applied project search settings');
  }

  if (projectPush?.baseBranch) {
    resolved.push.baseBranch = projectPush.baseBranch;
    log.debug(`Using project push.baseBranch: ${projectPush.baseBranch}`);
  }

  if (projectIndex) {
    if (projectIndex.semantic !== undefined) {
      resolved.index.semantic = projectIndex.semantic;
    }
    if (projectIndex.provider !== undefined) {
      resolved.index.provider = projectIndex.provider;
    }
    log.debug('Applied project index settings');
  }

  // Layer 3: CLI overrides (highest priority)
  if (cliOverrides) {
    applyOverrides(resolved, cliOverrides);
    log.debug('Applied CLI overrides');
  }

  return resolved;
}

// =============================================================================
// Convenience Resolvers
// =============================================================================

/**
 * Resolve just search settings (for search-engine.ts)
 */
export async function resolveSearchSettings(
  projectRoot: string,
  cliOverrides?: Partial<ResolvedSearchSettings>
): Promise<ResolvedSearchSettings> {
  const all = await resolveSettings(projectRoot, cliOverrides ? { search: cliOverrides } : undefined);
  return all.search;
}

/**
 * Resolve just embedding settings (for embeddings.ts)
 */
export async function resolveEmbeddingSettings(
  projectRoot: string,
  cliOverrides?: Partial<ResolvedEmbeddingSettings>
): Promise<ResolvedEmbeddingSettings> {
  const all = await resolveSettings(projectRoot, cliOverrides ? { embedding: cliOverrides } : undefined);
  return all.embedding;
}

/**
 * Resolve just push settings
 */
export async function resolvePushSettings(
  projectRoot: string,
  cliOverrides?: Partial<ResolvedPushSettings>
): Promise<ResolvedPushSettings> {
  const all = await resolveSettings(projectRoot, cliOverrides ? { push: cliOverrides } : undefined);
  return all.push;
}

/**
 * Resolve just index settings
 */
export async function resolveIndexSettings(
  projectRoot: string,
  cliOverrides?: Partial<ResolvedIndexSettings>
): Promise<ResolvedIndexSettings> {
  const all = await resolveSettings(projectRoot, cliOverrides ? { index: cliOverrides } : undefined);
  return all.index;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Apply CLI overrides to resolved settings (mutates target)
 */
function applyOverrides(
  target: ResolvedSettings,
  overrides: SettingsOverrides
): void {
  if (overrides.search) {
    if (overrides.search.fulltextWeight !== undefined) {
      target.search.fulltextWeight = overrides.search.fulltextWeight;
    }
    if (overrides.search.vectorWeight !== undefined) {
      target.search.vectorWeight = overrides.search.vectorWeight;
    }
    if (overrides.search.rrfK !== undefined) {
      target.search.rrfK = overrides.search.rrfK;
    }
  }

  if (overrides.push) {
    if (overrides.push.baseBranch !== undefined) {
      target.push.baseBranch = overrides.push.baseBranch;
    }
  }

  if (overrides.embedding) {
    if (overrides.embedding.provider !== undefined) {
      target.embedding.provider = overrides.embedding.provider;
    }
    if (overrides.embedding.ollamaModel !== undefined) {
      target.embedding.ollamaModel = overrides.embedding.ollamaModel;
    }
    if (overrides.embedding.ollamaBaseUrl !== undefined) {
      target.embedding.ollamaBaseUrl = overrides.embedding.ollamaBaseUrl;
    }
  }

  if (overrides.index) {
    if (overrides.index.semantic !== undefined) {
      target.index.semantic = overrides.index.semantic;
    }
    if (overrides.index.provider !== undefined) {
      target.index.provider = overrides.index.provider;
    }
  }
}
