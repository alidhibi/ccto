import { homedir } from 'node:os';
import { join } from 'node:path';

export const CCTO_VERSION = '0.1.0';

/** Global cache directory for models and shared state */
export const CCTO_HOME = join(homedir(), '.ccto');
export const MODELS_DIR = join(CCTO_HOME, 'models');

/** Project-local directory (relative to project root) */
export const CCTO_DIR = '.ccto';
export const CONFIG_FILE = 'config.json';
export const DB_FILE = 'index.db';
export const MEMORY_FILE = 'memory.json';
export const MEMORY_DB_FILE = 'memory.db';
export const METRICS_FILE = 'metrics.json';
export const BYPASSES_FILE = 'bypasses.json';
export const LAST_INDEXED_COMMIT_FILE = 'last_indexed_commit';
export const REINDEX_QUEUE_FILE = '.reindex-queue';

/** Default embeddings model */
export const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSION = 384;

/** File size limit (1 MB) */
export const MAX_FILE_SIZE_BYTES = 1_048_576;

/** Extension → language mapping */
export const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.php': 'php',
  '.css': 'css',
  '.scss': 'css',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.sql': 'sql',
};

/** Patterns always excluded from indexing */
export const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.ccto/**',
  '**/.git/**',
  '**/coverage/**',
  '**/*.min.js',
  '**/*.map',
  '**/*.lock',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
];

export const DEFAULT_INCLUDE = ['**/*'];

export const DEFAULT_CONFIG = {
  version: CCTO_VERSION,
  include: DEFAULT_INCLUDE,
  exclude: DEFAULT_EXCLUDE,
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  embeddingsModel: DEFAULT_MODEL,
  logLevel: 'info' as const,
};
