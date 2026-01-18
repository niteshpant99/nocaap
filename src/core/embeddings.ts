/**
 * src/core/embeddings.ts
 * Embedding provider detection and generation for semantic search
 */
import { log } from '../utils/logger.js';

// =============================================================================
// Types
// =============================================================================

export type EmbeddingProvider = 'ollama' | 'openai' | 'tfjs' | 'auto';

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  dimensions: number;
  provider: EmbeddingProvider;
}

export interface EmbeddingMetadata {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  createdAt: string;
}

// =============================================================================
// Provider Configuration
// =============================================================================

const PROVIDER_CONFIG = {
  ollama: {
    model: 'nomic-embed-text',
    dimensions: 768,
    batchSize: 50,
  },
  openai: {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
  },
  tfjs: {
    model: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    batchSize: 32,
  },
} as const;

// =============================================================================
// Provider Detection
// =============================================================================

/**
 * Detect the best available embedding provider
 * Priority: Ollama → OpenAI → Transformers.js
 */
export async function detectProvider(): Promise<Exclude<EmbeddingProvider, 'auto'>> {
  // 1. Check for Ollama
  if (await isOllamaAvailable()) {
    log.debug('Detected Ollama with embedding model');
    return 'ollama';
  }

  // 2. Check for OpenAI API key
  if (process.env.OPENAI_API_KEY) {
    log.debug('Detected OpenAI API key');
    return 'openai';
  }

  // 3. Fall back to Transformers.js
  log.debug('Using Transformers.js embeddings (fallback)');
  return 'tfjs';
}

/**
 * Check if Ollama is running with an embedding model
 */
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) return false;

    const data = await response.json() as { models?: Array<{ name: string }> };
    const hasEmbedModel = data.models?.some((m) =>
      m.name.includes('nomic-embed') ||
      m.name.includes('mxbai-embed') ||
      m.name.includes('all-minilm')
    );

    return hasEmbedModel ?? false;
  } catch {
    return false;
  }
}

// =============================================================================
// Embedding Generation
// =============================================================================

/**
 * Generate embeddings for an array of texts
 */
export async function generateEmbeddings(
  texts: string[],
  provider: EmbeddingProvider
): Promise<EmbeddingResult> {
  const resolvedProvider = provider === 'auto' ? await detectProvider() : provider;

  log.debug(`Generating ${texts.length} embeddings with ${resolvedProvider}`);

  switch (resolvedProvider) {
    case 'ollama':
      return generateOllamaEmbeddings(texts);
    case 'openai':
      return generateOpenAIEmbeddings(texts);
    case 'tfjs':
      return generateTfjsEmbeddings(texts);
    default:
      throw new Error(`Unknown provider: ${resolvedProvider}`);
  }
}

/**
 * Generate a single embedding for a query
 */
export async function generateQueryEmbedding(
  query: string,
  provider: EmbeddingProvider
): Promise<number[]> {
  const result = await generateEmbeddings([query], provider);
  return result.vectors[0]!;
}

// =============================================================================
// Ollama Provider
// =============================================================================

async function generateOllamaEmbeddings(texts: string[]): Promise<EmbeddingResult> {
  const config = PROVIDER_CONFIG.ollama;
  const vectors: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += config.batchSize) {
    const batch = texts.slice(i, i + config.batchSize);

    try {
      // Dynamic import to handle optional dependency
      const ollama = await import('ollama');
      const response = await ollama.default.embed({
        model: config.model,
        input: batch,
      });

      vectors.push(...response.embeddings);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Ollama embedding failed: ${message}`);
    }
  }

  return {
    vectors,
    model: config.model,
    dimensions: config.dimensions,
    provider: 'ollama',
  };
}

// =============================================================================
// OpenAI Provider
// =============================================================================

async function generateOpenAIEmbeddings(texts: string[]): Promise<EmbeddingResult> {
  const config = PROVIDER_CONFIG.openai;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const vectors: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += config.batchSize) {
    const batch = texts.slice(i, i + config.batchSize);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        input: batch,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    vectors.push(...data.data.map((d) => d.embedding));
  }

  return {
    vectors,
    model: config.model,
    dimensions: config.dimensions,
    provider: 'openai',
  };
}

// =============================================================================
// Transformers.js Provider
// =============================================================================

async function generateTfjsEmbeddings(texts: string[]): Promise<EmbeddingResult> {
  const config = PROVIDER_CONFIG.tfjs;

  try {
    // Dynamic import for Transformers.js
    const { pipeline } = await import('@xenova/transformers');

    // Initialize the embedding pipeline
    const embedder = await pipeline('feature-extraction', config.model);

    const vectors: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += config.batchSize) {
      const batch = texts.slice(i, i + config.batchSize);

      for (const text of batch) {
        const output = await embedder(text, {
          pooling: 'mean',
          normalize: true,
        });

        // Extract the embedding vector
        vectors.push(Array.from(output.data as Float32Array));
      }
    }

    return {
      vectors,
      model: config.model,
      dimensions: config.dimensions,
      provider: 'tfjs',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Transformers.js embedding failed: ${message}`);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get provider configuration
 */
export function getProviderConfig(provider: Exclude<EmbeddingProvider, 'auto'>) {
  return PROVIDER_CONFIG[provider];
}
