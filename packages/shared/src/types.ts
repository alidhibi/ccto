/** Supported programming languages for indexing */
export type Language =
  | 'typescript'
  | 'javascript'
  | 'tsx'
  | 'jsx'
  | 'python'
  | 'php'
  | 'css'
  | 'bash'
  | 'sql'
  | 'unknown';

/** Kind of code chunk */
export type ChunkKind = 'function' | 'class' | 'method' | 'block' | 'file';

/** A semantic code chunk extracted from a source file */
export interface Chunk {
  /** Unique content-addressable hash (SHA-256 of content) */
  hash: string;
  /** Absolute path to the source file */
  filepath: string;
  /** Detected language */
  language: Language;
  /** AST node kind */
  kind: ChunkKind;
  /** Name of the symbol (function/class name, or empty for block/file) */
  name: string;
  /** 1-based start line */
  startLine: number;
  /** 1-based end line */
  endLine: number;
  /** Raw source text of the chunk */
  content: string;
}

/** A chunk enriched with its embedding vector */
export interface ChunkWithEmbedding extends Chunk {
  embedding: Float32Array;
}

/** Result of a vector similarity search */
export interface SearchResult {
  chunk: Chunk;
  /** Cosine similarity score [0, 1] */
  score: number;
}

/** Outline entry for a single symbol */
export interface OutlineEntry {
  kind: ChunkKind;
  name: string;
  startLine: number;
  endLine: number;
  /** Signature without the body */
  signature: string;
}

/** Outline of a single file */
export interface FileOutline {
  filepath: string;
  language: Language;
  entries: OutlineEntry[];
}

/** Result of a full project indexing run */
export interface IndexResult {
  indexed: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

/** Aggregated statistics from the vector store */
export interface StoreStats {
  totalChunks: number;
  totalFiles: number;
  languages: Record<string, number>;
  dbSizeBytes: number;
}

/** Saved session memory entry */
export interface MemoryEntry {
  id: string;
  sessionId: string;
  timestamp: string;
  summary: string;
  filesTouched: string[];
  tags: string[];
}

/** A detected native-Read bypass on an indexed file */
export interface BypassRecord {
  filepath: string;
  estimatedTokens: number;
  timestamp: string;
}

/** Token savings metrics for a single MCP tool call */
export interface CallMetrics {
  tool: string;
  tokensRequested: number;
  tokensServed: number;
  savedTokens: number;
  timestamp: string;
}

/** CCTO project configuration (stored at .ccto/config.json) */
export interface CctoConfig {
  version: string;
  projectRoot: string;
  include: string[];
  exclude: string[];
  maxFileSizeBytes: number;
  embeddingsModel: string;
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
}
