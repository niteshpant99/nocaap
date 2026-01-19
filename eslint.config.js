import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // TypeScript handles these
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // Allow explicit any in specific cases, but warn
      '@typescript-eslint/no-explicit-any': 'warn',

      // Require await in async functions
      '@typescript-eslint/require-await': 'off',

      // Allow empty functions (useful for no-op callbacks)
      '@typescript-eslint/no-empty-function': 'off',

      // Consistent type imports
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      }],

      // No floating promises (must handle or explicitly void)
      '@typescript-eslint/no-floating-promises': 'error',

      // Prefer nullish coalescing
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',

      // No unnecessary conditions
      '@typescript-eslint/no-unnecessary-condition': 'warn',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
  }
);
