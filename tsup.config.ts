import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  treeshake: true,
  // External packages with native bindings or optional dynamic imports
  external: [
    '@lancedb/lancedb',
    'apache-arrow',
    'ollama',
    '@xenova/transformers',
  ],
  banner: {
    js: '#!/usr/bin/env node',
  },
});