/**
 * src/schemas/index.ts
 * Zod validation schemas for nocaap data structures
 */
import { z } from 'zod';

// =============================================================================
// Registry Schema (nocaap-registry.json)
// =============================================================================

const gitUrlPattern = /^(git@|https:\/\/|git:\/\/).+/;

export const ContextEntrySchema = z.object({
  name: z.string().min(1, 'Context name is required'),
  description: z.string(),
  repo: z.string()
    .min(1, 'Repository URL is required')
    .refine(
      (url) => gitUrlPattern.test(url),
      'Must be a valid Git URL (git@, https://, or git://)'
    ),
  path: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const RegistrySchema = z.object({
  name: z.string().optional(),
  contexts: z.array(ContextEntrySchema),
  imports: z.array(z.string().url()).optional(),
});

// =============================================================================
// Config Schema (.context/context.config.json)
// =============================================================================

export const PackageEntrySchema = z.object({
  alias: z.string().min(1, 'Alias is required'),
  source: z.string().min(1, 'Source URL is required'),
  path: z.string().optional(),
  version: z.string().default('main'),
});

// Settings sub-schemas (all optional for backward compatibility)
export const SearchSettingsSchema = z.object({
  fulltextWeight: z.number().min(0).max(1).optional(),
  vectorWeight: z.number().min(0).max(1).optional(),
  rrfK: z.number().int().positive().optional(),
}).optional();

export const PushSettingsSchema = z.object({
  baseBranch: z.string().optional(),
}).optional();

export const IndexSettingsSchema = z.object({
  semantic: z.boolean().optional(),
  provider: z.enum(['ollama', 'openai', 'tfjs', 'auto']).optional(),
}).optional();

export const EmbeddingSettingsSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'tfjs', 'auto']).optional(),
  ollamaModel: z.string().optional(),
  ollamaBaseUrl: z.string().url().optional(),
}).optional();

export const ConfigSchema = z.object({
  registryUrl: z.string().url().optional(),
  packages: z.array(PackageEntrySchema),
  search: SearchSettingsSchema,
  push: PushSettingsSchema,
  index: IndexSettingsSchema,
});

// =============================================================================
// Lockfile Schema (.context/context.lock)
// =============================================================================

export const LockEntrySchema = z.object({
  commitHash: z.string().min(1, 'Commit hash is required'),
  sparsePath: z.string(),
  updatedAt: z.string().datetime(),
});

export const LockfileSchema = z.record(z.string(), LockEntrySchema);

// =============================================================================
// Global Config Schema (~/.nocaap/config.json)
// =============================================================================

export const GlobalConfigSchema = z.object({
  defaultRegistry: z.string().url().optional(),
  updatedAt: z.string().datetime().optional(),
  push: PushSettingsSchema,
  embedding: EmbeddingSettingsSchema,
});

// =============================================================================
// Type Exports
// =============================================================================

export type ContextEntry = z.infer<typeof ContextEntrySchema>;
export type Registry = z.infer<typeof RegistrySchema>;
export type PackageEntry = z.infer<typeof PackageEntrySchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type LockEntry = z.infer<typeof LockEntrySchema>;
export type Lockfile = z.infer<typeof LockfileSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

// Settings types (unwrapped from optional for convenience)
export type SearchSettings = z.infer<typeof SearchSettingsSchema>;
export type PushSettings = z.infer<typeof PushSettingsSchema>;
export type IndexSettings = z.infer<typeof IndexSettingsSchema>;
export type EmbeddingSettings = z.infer<typeof EmbeddingSettingsSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateRegistry(data: unknown): Registry {
  return RegistrySchema.parse(data);
}

export function validateConfig(data: unknown): Config {
  return ConfigSchema.parse(data);
}

export function validateLockfile(data: unknown): Lockfile {
  return LockfileSchema.parse(data);
}

// =============================================================================
// Safe Validation Helpers
// =============================================================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

export function safeValidate<T>(
  schema: z.ZodType<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

export function safeValidateRegistry(data: unknown): ValidationResult<Registry> {
  return safeValidate(RegistrySchema, data);
}

export function safeValidateConfig(data: unknown): ValidationResult<Config> {
  const result = ConfigSchema.safeParse(data);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

export function safeValidateLockfile(data: unknown): ValidationResult<Lockfile> {
  return safeValidate(LockfileSchema, data);
}

export function validateGlobalConfig(data: unknown): GlobalConfig {
  return GlobalConfigSchema.parse(data);
}

export function safeValidateGlobalConfig(data: unknown): ValidationResult<GlobalConfig> {
  return safeValidate(GlobalConfigSchema, data);
}

