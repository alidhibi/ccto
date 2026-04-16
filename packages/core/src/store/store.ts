import type { Chunk, ChunkWithEmbedding, SearchResult, StoreStats } from '@ccto/shared';
import { StoreError } from '@ccto/shared';
import { openDb } from './db.js';

interface ChunkRow {
  id: number;
  hash: string;
  filepath: string;
  lang: string;
  kind: string;
  name: string;
  start_line: number;
  end_line: number;
  content: string;
}

function rowToChunk(row: ChunkRow): Chunk {
  return {
    hash: row.hash,
    filepath: row.filepath,
    language: row.lang as Chunk['language'],
    kind: row.kind as Chunk['kind'],
    name: row.name,
    startLine: row.start_line,
    endLine: row.end_line,
    content: row.content,
  };
}

/** Serialize Float32Array → Buffer for SQLite BLOB storage */
function serializeEmbedding(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer);
}

/** Deserialize Buffer → Float32Array */
function deserializeEmbedding(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** Cosine similarity between two same-length vectors */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Insert or update chunks (with embeddings) in the store.
 * Skips chunks whose hash already exists (incremental indexing).
 */
export function upsertChunks(projectRoot: string, chunks: ChunkWithEmbedding[]): void {
  const db = openDb(projectRoot);

  const insertChunk = db.prepare(`
    INSERT OR IGNORE INTO chunks (hash, filepath, lang, kind, name, start_line, end_line, content)
    VALUES (@hash, @filepath, @lang, @kind, @name, @start_line, @end_line, @content)
  `);

  const getChunkId = db.prepare('SELECT id FROM chunks WHERE hash = ?');

  const insertEmbedding = db.prepare(`
    INSERT OR REPLACE INTO embeddings (chunk_id, embedding)
    VALUES (?, ?)
  `);

  const upsertAll = db.transaction((items: ChunkWithEmbedding[]) => {
    for (const { embedding, ...chunk } of items) {
      insertChunk.run({
        hash: chunk.hash,
        filepath: chunk.filepath,
        lang: chunk.language,
        kind: chunk.kind,
        name: chunk.name,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        content: chunk.content,
      });
      const row = getChunkId.get(chunk.hash) as { id: number } | undefined;
      if (row) {
        insertEmbedding.run(row.id, serializeEmbedding(embedding));
      }
    }
  });

  try {
    upsertAll(chunks);
  } catch (err) {
    throw new StoreError('Failed to upsert chunks', { cause: err });
  }
}

/**
 * Search for the k most semantically similar chunks to a query embedding.
 * Supports optional filters by language or filepath glob.
 *
 * @param projectRoot - Project root directory
 * @param queryEmbedding - Query vector
 * @param k - Number of results to return
 * @param filters - Optional { lang?, pathGlob? } filters
 */
export function search(
  projectRoot: string,
  queryEmbedding: Float32Array,
  k: number,
  filters: { lang?: string; pathGlob?: string } = {},
): SearchResult[] {
  const db = openDb(projectRoot);

  let sql = `
    SELECT c.*, e.embedding
    FROM chunks c
    JOIN embeddings e ON e.chunk_id = c.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (filters.lang) {
    sql += ' AND c.lang = ?';
    params.push(filters.lang);
  }
  if (filters.pathGlob) {
    sql += ' AND c.filepath GLOB ?';
    params.push(filters.pathGlob);
  }

  type RowWithEmb = ChunkRow & { embedding: Buffer };
  const rows = db.prepare(sql).all(...params) as RowWithEmb[];

  const scored = rows.map((row) => ({
    chunk: rowToChunk(row),
    score: cosineSimilarity(queryEmbedding, deserializeEmbedding(row.embedding)),
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * Delete all chunks and embeddings for a specific file.
 * Used for incremental re-indexing of a changed file.
 */
export function deleteByFile(projectRoot: string, filepath: string): void {
  const db = openDb(projectRoot);
  db.prepare('DELETE FROM chunks WHERE filepath = ?').run(filepath);
}

/**
 * Return aggregate statistics about the vector store.
 */
export function getStats(projectRoot: string): StoreStats {
  const db = openDb(projectRoot);

  const { total } = db.prepare('SELECT COUNT(*) as total FROM chunks').get() as { total: number };
  const { files } = db.prepare('SELECT COUNT(DISTINCT filepath) as files FROM chunks').get() as {
    files: number;
  };

  const langRows = db
    .prepare('SELECT lang, COUNT(*) as cnt FROM chunks GROUP BY lang')
    .all() as Array<{ lang: string; cnt: number }>;
  const languages: Record<string, number> = {};
  for (const row of langRows) languages[row.lang] = row.cnt;

  // SQLite page_count * page_size gives us the DB size
  const { page_count } = db.prepare('PRAGMA page_count').get() as { page_count: number };
  const { page_size } = db.prepare('PRAGMA page_size').get() as { page_size: number };

  return {
    totalChunks: total,
    totalFiles: files,
    languages,
    dbSizeBytes: page_count * page_size,
  };
}
