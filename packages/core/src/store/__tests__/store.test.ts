import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChunkWithEmbedding } from '@ccto/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteByFile, getStats, resetDb, search, upsertChunks } from '../index.js';

function makeChunk(
  id: number,
  filepath = 'src/foo.ts',
  embedding?: Float32Array,
): ChunkWithEmbedding {
  const vec = embedding ?? new Float32Array(384).fill(id / 10);
  return {
    hash: `hash-${id}-${filepath}`,
    filepath,
    language: 'typescript',
    kind: 'function',
    name: `fn${id}`,
    startLine: id * 10,
    endLine: id * 10 + 5,
    content: `function fn${id}() { return ${id}; }`,
    embedding: vec,
  };
}

describe('vector store', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = join(tmpdir(), `ccto-store-test-${Date.now()}`);
    mkdirSync(join(projectRoot, '.ccto'), { recursive: true });
  });

  afterEach(() => {
    resetDb();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('upserts chunks and retrieves stats', () => {
    upsertChunks(projectRoot, [makeChunk(1), makeChunk(2)]);
    const stats = getStats(projectRoot);
    expect(stats.totalChunks).toBe(2);
    expect(stats.totalFiles).toBe(1);
    expect(stats.languages.typescript).toBe(2);
  });

  it('ignores duplicate hashes (incremental)', () => {
    const chunk = makeChunk(1);
    upsertChunks(projectRoot, [chunk, chunk]); // duplicate
    const stats = getStats(projectRoot);
    expect(stats.totalChunks).toBe(1);
  });

  it('searches by cosine similarity', () => {
    const queryVec = new Float32Array(384).fill(0.5);
    const closeVec = new Float32Array(384).fill(0.5);
    const farVec = new Float32Array(384).fill(0.0);
    farVec[0] = 1;

    upsertChunks(projectRoot, [makeChunk(1, 'a.ts', closeVec), makeChunk(2, 'b.ts', farVec)]);

    const results = search(projectRoot, queryVec, 2);
    expect(results).toHaveLength(2);
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score);
    expect(results[0]?.chunk.filepath).toBe('a.ts');
  });

  it('deleteByFile removes chunks for that file only', () => {
    upsertChunks(projectRoot, [makeChunk(1, 'keep.ts'), makeChunk(2, 'remove.ts')]);
    deleteByFile(projectRoot, 'remove.ts');
    const stats = getStats(projectRoot);
    expect(stats.totalChunks).toBe(1);
    expect(stats.languages.typescript).toBe(1);
  });

  it('search respects lang filter', () => {
    const jsChunk = { ...makeChunk(1, 'a.js'), language: 'javascript' as const };
    const tsChunk = makeChunk(2, 'b.ts');
    upsertChunks(projectRoot, [jsChunk, tsChunk]);

    const query = new Float32Array(384).fill(0.1);
    const results = search(projectRoot, query, 10, { lang: 'javascript' });
    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.language).toBe('javascript');
  });
});
