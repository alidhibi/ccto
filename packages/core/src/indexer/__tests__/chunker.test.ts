import { describe, expect, it } from 'vitest';
import { chunkFromTree } from '../chunker.js';

describe('chunkFromTree — fallback (no tree)', () => {
  it('splits a large file into size-based blocks', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `const x${i} = ${i};`);
    const source = lines.join('\n');
    const chunks = chunkFromTree(null, source, 'test.js', 'javascript');

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const chunkLines = chunk.content.split('\n').length;
      expect(chunkLines).toBeLessThanOrEqual(80);
    }
  });

  it('returns a single chunk for small files', () => {
    const source = 'const a = 1;\nconst b = 2;';
    const chunks = chunkFromTree(null, source, 'tiny.js', 'javascript');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.startLine).toBe(1);
  });

  it('skips empty content', () => {
    const chunks = chunkFromTree(null, '   \n  \n ', 'empty.js', 'javascript');
    expect(chunks).toHaveLength(0);
  });

  it('assigns unique hashes', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const source = lines.join('\n');
    const chunks = chunkFromTree(null, source, 'file.js', 'javascript');
    const hashes = chunks.map((c) => c.hash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
