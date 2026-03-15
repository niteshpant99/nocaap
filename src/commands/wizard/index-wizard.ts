/**
 * src/commands/wizard/index-wizard.ts
 * Post-setup indexing wizard - guides users through building a search index
 */
import { confirm } from '@inquirer/prompts';
import { log, style, withSpinner } from '../../utils/logger.js';
import { indexSearchCommand, type IndexSearchResult } from '../index-search.js';
import { detectProvider, getProviderConfig } from '../../core/embeddings.js';
import type { EmbeddingProvider } from '../../core/embeddings.js';

// =============================================================================
// Types
// =============================================================================

export interface IndexWizardOptions {
  /** Project root directory */
  projectRoot: string;
  /** Skip interactive prompts (for CI/scripting) */
  skipPrompts?: boolean;
}

export interface IndexWizardResult {
  /** Whether indexing was performed */
  indexed: boolean;
  /** Whether semantic search was enabled */
  semantic: boolean;
  /** Number of chunks indexed */
  chunkCount?: number;
  /** Embedding provider used (if semantic) */
  provider?: string;
}

// =============================================================================
// Wizard Implementation
// =============================================================================

/**
 * Run the post-setup indexing wizard
 * Prompts user to build search index with optional semantic search
 */
export async function runIndexWizard(
  options: IndexWizardOptions
): Promise<IndexWizardResult> {
  const { skipPrompts = false } = options;

  // Step 1: Ask if user wants to build search index
  if (!skipPrompts) {
    const wantIndex = await confirm({
      message: 'Would you like to build a search index now?',
      default: true,
    });

    if (!wantIndex) {
      log.dim('Skipped indexing. Run `nocaap index` later to enable search.');
      return { indexed: false, semantic: false };
    }
  }

  // Step 2: Ask about semantic search
  let useSemantic = false;
  if (!skipPrompts) {
    useSemantic = await confirm({
      message: 'Enable semantic search? (understands meaning, not just keywords)',
      default: false,
    });
  }

  // Step 3: Detect provider if semantic enabled
  let resolvedProvider: Exclude<EmbeddingProvider, 'auto'> | undefined;
  if (useSemantic) {
    resolvedProvider = await withSpinner(
      'Detecting embedding providers...',
      async () => detectProvider(),
      { successText: 'Provider detected' }
    );

    const config = getProviderConfig(resolvedProvider);
    log.info(`Using ${style.bold(config.model)} for embeddings`);
  }

  // Step 4: Build the index
  log.newline();
  let result: IndexSearchResult;

  try {
    result = await indexSearchCommand({
      semantic: useSemantic,
      provider: useSemantic ? resolvedProvider : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Failed to build index: ${message}`);
    return { indexed: false, semantic: false };
  }

  // Step 5: Return result
  return {
    indexed: true,
    semantic: useSemantic,
    chunkCount: result.chunkCount,
    provider: result.embeddingProvider,
  };
}
