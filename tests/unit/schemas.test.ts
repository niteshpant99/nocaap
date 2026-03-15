import { describe, it, expect } from 'vitest';
import {
  ConfigSchema,
  RegistrySchema,
  LockfileSchema,
  PackageEntrySchema,
  ContextEntrySchema,
  GlobalConfigSchema,
  validateConfig,
  validateRegistry,
  validateLockfile,
  safeValidateConfig,
  safeValidateRegistry,
} from '../../src/schemas/index.js';

describe('ConfigSchema', () => {
  it('validates valid config with minimal fields', () => {
    const config = {
      packages: [
        {
          alias: 'test',
          source: 'git@github.com:test/repo.git',
          version: 'main',
        },
      ],
    };
    expect(() => ConfigSchema.parse(config)).not.toThrow();
  });

  it('validates config with all optional fields', () => {
    const config = {
      registryUrl: 'https://example.com/registry.json',
      packages: [
        {
          alias: 'test',
          source: 'git@github.com:test/repo.git',
          path: 'docs/',
          version: 'v1.0.0',
        },
      ],
      search: {
        fulltextWeight: 0.4,
        vectorWeight: 0.6,
        rrfK: 60,
      },
      push: {
        baseBranch: 'main',
      },
      index: {
        semantic: true,
        provider: 'ollama',
      },
    };
    expect(() => ConfigSchema.parse(config)).not.toThrow();
  });

  it('rejects missing required package fields', () => {
    const config = {
      packages: [{ alias: 'test' }], // missing source
    };
    expect(() => ConfigSchema.parse(config)).toThrow();
  });

  it('rejects empty alias', () => {
    const config = {
      packages: [
        {
          alias: '',
          source: 'git@github.com:test/repo.git',
        },
      ],
    };
    expect(() => ConfigSchema.parse(config)).toThrow();
  });

  it('applies default version when not specified', () => {
    const config = {
      packages: [
        {
          alias: 'test',
          source: 'git@github.com:test/repo.git',
        },
      ],
    };
    const parsed = ConfigSchema.parse(config);
    expect(parsed.packages[0].version).toBe('main');
  });

  it('validates search weight constraints', () => {
    const invalidConfig = {
      packages: [],
      search: { fulltextWeight: 1.5 }, // > 1
    };
    expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
  });
});

describe('RegistrySchema', () => {
  it('validates valid registry with contexts', () => {
    const registry = {
      name: 'Test Registry',
      contexts: [
        {
          name: 'test-context',
          description: 'A test context',
          repo: 'git@github.com:test/repo.git',
        },
      ],
    };
    expect(() => RegistrySchema.parse(registry)).not.toThrow();
  });

  it('validates registry with https URL', () => {
    const registry = {
      contexts: [
        {
          name: 'test',
          description: 'Test',
          repo: 'https://github.com/test/repo.git',
        },
      ],
    };
    expect(() => RegistrySchema.parse(registry)).not.toThrow();
  });

  it('validates registry with imports', () => {
    const registry = {
      contexts: [],
      imports: ['https://example.com/other-registry.json'],
    };
    expect(() => RegistrySchema.parse(registry)).not.toThrow();
  });

  it('rejects invalid git URL', () => {
    const registry = {
      contexts: [
        {
          name: 'test',
          description: 'Test',
          repo: 'not-a-valid-url',
        },
      ],
    };
    expect(() => RegistrySchema.parse(registry)).toThrow();
  });

  it('rejects empty context name', () => {
    const registry = {
      contexts: [
        {
          name: '',
          description: 'Test',
          repo: 'git@github.com:test/repo.git',
        },
      ],
    };
    expect(() => RegistrySchema.parse(registry)).toThrow();
  });

  it('accepts optional path and tags', () => {
    const registry = {
      contexts: [
        {
          name: 'test',
          description: 'Test',
          repo: 'git@github.com:test/repo.git',
          path: 'docs/',
          tags: ['documentation', 'internal'],
        },
      ],
    };
    const parsed = RegistrySchema.parse(registry);
    expect(parsed.contexts[0].path).toBe('docs/');
    expect(parsed.contexts[0].tags).toEqual(['documentation', 'internal']);
  });
});

describe('LockfileSchema', () => {
  it('validates valid lockfile', () => {
    const lockfile = {
      'test-package': {
        commitHash: 'abc123def456',
        sparsePath: 'docs/',
        updatedAt: '2024-01-15T10:30:00Z',
      },
    };
    expect(() => LockfileSchema.parse(lockfile)).not.toThrow();
  });

  it('validates lockfile with multiple entries', () => {
    const lockfile = {
      'package-a': {
        commitHash: 'abc123',
        sparsePath: '',
        updatedAt: '2024-01-15T10:30:00Z',
      },
      'package-b': {
        commitHash: 'def456',
        sparsePath: 'src/',
        updatedAt: '2024-01-16T12:00:00Z',
      },
    };
    expect(() => LockfileSchema.parse(lockfile)).not.toThrow();
  });

  it('rejects missing commit hash', () => {
    const lockfile = {
      'test-package': {
        sparsePath: 'docs/',
        updatedAt: '2024-01-15T10:30:00Z',
      },
    };
    expect(() => LockfileSchema.parse(lockfile)).toThrow();
  });

  it('rejects invalid datetime format', () => {
    const lockfile = {
      'test-package': {
        commitHash: 'abc123',
        sparsePath: '',
        updatedAt: 'not-a-date',
      },
    };
    expect(() => LockfileSchema.parse(lockfile)).toThrow();
  });
});

describe('validation helper functions', () => {
  it('validateConfig throws on invalid data', () => {
    expect(() => validateConfig({})).toThrow();
  });

  it('validateConfig returns typed data on valid input', () => {
    const config = { packages: [] };
    const result = validateConfig(config);
    expect(result.packages).toEqual([]);
  });

  it('validateRegistry returns typed data', () => {
    const registry = {
      contexts: [
        { name: 'test', description: 'Test', repo: 'git@github.com:t/r.git' },
      ],
    };
    const result = validateRegistry(registry);
    expect(result.contexts).toHaveLength(1);
  });

  it('safeValidateConfig returns success on valid data', () => {
    const config = { packages: [] };
    const result = safeValidateConfig(config);
    expect(result.success).toBe(true);
  });

  it('safeValidateConfig returns error on invalid data', () => {
    const result = safeValidateConfig({ invalid: true });
    expect(result.success).toBe(false);
  });
});

describe('GlobalConfigSchema', () => {
  it('validates empty config', () => {
    const config = {};
    expect(() => GlobalConfigSchema.parse(config)).not.toThrow();
  });

  it('validates config with all fields', () => {
    const config = {
      defaultRegistry: 'https://example.com/registry.json',
      updatedAt: '2024-01-15T10:30:00Z',
      push: { baseBranch: 'develop' },
      embedding: {
        provider: 'ollama',
        ollamaModel: 'nomic-embed-text',
        ollamaBaseUrl: 'http://localhost:11434',
      },
    };
    expect(() => GlobalConfigSchema.parse(config)).not.toThrow();
  });

  it('validates embedding provider enum', () => {
    const validProviders = ['ollama', 'openai', 'tfjs', 'auto'];
    validProviders.forEach((provider) => {
      const config = { embedding: { provider } };
      expect(() => GlobalConfigSchema.parse(config)).not.toThrow();
    });
  });

  it('rejects invalid embedding provider', () => {
    const config = { embedding: { provider: 'invalid' } };
    expect(() => GlobalConfigSchema.parse(config)).toThrow();
  });
});
