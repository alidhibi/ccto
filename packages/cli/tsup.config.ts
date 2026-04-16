import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  shims: true,
  noExternal: [
    /^@ccto\//,
    'chalk',
    'commander',
    'ink',
    'react',
    'fast-glob',
    'ignore',
    'pino',
    '@modelcontextprotocol/sdk',
    'zod',
  ],
  external: [
    'better-sqlite3',
    '@huggingface/transformers',
    'web-tree-sitter',
  ],
});
