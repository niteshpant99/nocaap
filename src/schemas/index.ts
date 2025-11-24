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

export const ConfigSchema = z.object({
  registryUrl: z.string().url().optional(),
  packages: z.array(PackageEntrySchema),
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
// Type Exports
// =============================================================================

export type ContextEntry = z.infer<typeof ContextEntrySchema>;
export type Registry = z.infer<typeof RegistrySchema>;
export type PackageEntry = z.infer<typeof PackageEntrySchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type LockEntry = z.infer<typeof LockEntrySchema>;
export type Lockfile = z.infer<typeof LockfileSchema>;

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

