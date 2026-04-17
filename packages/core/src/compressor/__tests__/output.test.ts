import { describe, expect, it } from 'vitest';
import {
  compressBuildOutput,
  compressLogOutput,
  compressTestOutput,
  detectOutputType,
} from '../output.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VITEST_ALL_PASS = `
 RUN  v2.1.9 C:/projects/2026/ccto

 ✓ packages/core/src/indexer/__tests__/chunker.test.ts (4 tests) 8ms
 ✓ packages/core/src/indexer/__tests__/walker.test.ts (3 tests) 24ms
 ✓ packages/core/src/store/__tests__/store.test.ts (5 tests) 170ms
 ✓ packages/core/src/embeddings/__tests__/embedder.test.ts (6 tests) 350ms
 ✓ packages/core/src/config/__tests__/config.test.ts (3 tests) 12ms
 ✓ packages/core/src/memory/__tests__/memory.test.ts (8 tests) 95ms
 ✓ packages/core/src/compressor/__tests__/output.test.ts (12 tests) 40ms
 ✓ packages/mcp-server/src/tools/__tests__/semantic_search.test.ts (5 tests) 80ms
 ✓ packages/mcp-server/src/tools/__tests__/smart_read.test.ts (7 tests) 60ms
 ✓ packages/cli/src/commands/__tests__/memory.test.ts (4 tests) 30ms

 Test Files  10 passed (10)
       Tests  57 passed (57)
   Start at  08:57:24
   Duration  1.23s (transform 150ms, setup 0ms)
`.trim();

const VITEST_WITH_FAILURE = `
 RUN  v2.1.9 C:/projects/2026/ccto

 ✓ packages/core/src/indexer/__tests__/chunker.test.ts (4 tests) 7ms
 ✗ packages/core/src/store/__tests__/store.test.ts (5 tests) 248ms
   × should find relevant chunks
     AssertionError: expected 0 to be greater than or equal to 1
       at Object.<anonymous> (store.test.ts:65:35)

 Test Files  1 passed, 1 failed (2)
       Tests  4 passed, 1 failed (5)
   Start at  09:17:41
   Duration  1.84s
`.trim();

const JEST_WITH_FAILURE = `
PASS src/__tests__/auth.test.ts
PASS src/__tests__/db.test.ts
PASS src/__tests__/config.test.ts
PASS src/__tests__/utils.test.ts
PASS src/__tests__/router.test.ts
PASS src/__tests__/middleware.test.ts
FAIL src/__tests__/user.test.ts
  ● UserService › should create user
    Expected: "created"
    Received: undefined
    at Object.<anonymous> (user.test.ts:42:25)
PASS src/__tests__/product.test.ts
PASS src/__tests__/order.test.ts
PASS src/__tests__/payment.test.ts

Test Suites: 1 failed, 9 passed, 10 total
Tests:       1 failed, 42 passed, 43 total
Snapshots:   0 total
Time:        4.2 s
Ran all test suites.
`.trim();

const TSC_ERRORS = `
packages/core/src/store/__tests__/store.test.ts(65,54): error TS2345: Argument of type 'number | undefined' is not assignable to parameter of type 'number | bigint'.
  Type 'undefined' is not assignable to type 'number | bigint'.
packages/mcp-server/src/tools/semantic_search.ts(30,64): error TS2379: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
`.trim();

const TSUP_SUCCESS = `
CLI Building entry: src/index.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: C:/projects/2026/ccto/tsup.config.ts
CLI Target: node20
CLI Cleaning output folder
ESM Build start
ESM dist/index.js     3.22 KB
ESM dist/index.js.map 7.30 KB
ESM ⚡️ Build success in 77ms
DTS Build start
DTS ⚡️ Build success in 868ms
DTS dist/index.d.ts 5.36 KB
`.trim();

const LONG_LOG = Array.from({ length: 120 }, (_, i) => `[INFO] line ${i + 1}: doing something`).join('\n');

// ─── detectOutputType ─────────────────────────────────────────────────────────

describe('detectOutputType', () => {
  it('detects vitest command as test', () => {
    expect(detectOutputType('vitest run', '')).toBe('test');
  });

  it('detects jest command as test', () => {
    expect(detectOutputType('jest --coverage', '')).toBe('test');
  });

  it('detects pnpm test as test', () => {
    expect(detectOutputType('pnpm test', '')).toBe('test');
  });

  it('detects tsc command as build', () => {
    expect(detectOutputType('tsc --noEmit', '')).toBe('build');
  });

  it('detects tsup as build', () => {
    expect(detectOutputType('tsup src/index.ts', '')).toBe('build');
  });

  it('detects pnpm build as build', () => {
    expect(detectOutputType('pnpm build', '')).toBe('build');
  });

  it('falls back to test via stdout patterns', () => {
    expect(detectOutputType('node ./runner.js', VITEST_ALL_PASS)).toBe('test');
  });

  it('falls back to build via stdout patterns', () => {
    expect(detectOutputType('node ./compile.js', TSC_ERRORS)).toBe('build');
  });

  it('falls back to log for unknown commands', () => {
    expect(detectOutputType('ls -la', 'total 0\ndrwxr-xr-x  2 user group')).toBe('log');
  });
});

// ─── compressTestOutput ────────────────────────────────────────────────────────

describe('compressTestOutput', () => {
  it('returns short output unchanged', () => {
    const short = ' ✓ foo.test.ts (1 tests) 5ms\n Test Files  1 passed (1)';
    const result = compressTestOutput(short);
    expect(result.compressed).toBe(short);
    expect(result.outputType).toBe('test');
  });

  it('collapses passing test files in vitest all-pass output', () => {
    const result = compressTestOutput(VITEST_ALL_PASS);
    expect(result.compressed).toContain('omitted');
    expect(result.compressed).toContain('Test Files');
    expect(result.compressed).toContain('57 passed');
    expect(result.compressed).not.toContain('chunker.test.ts');
    expect(result.compressedBytes).toBeLessThan(result.originalBytes);
  });

  it('keeps failure details verbatim in vitest output', () => {
    const result = compressTestOutput(VITEST_WITH_FAILURE);
    expect(result.compressed).toContain('should find relevant chunks');
    expect(result.compressed).toContain('AssertionError');
    expect(result.compressed).toContain('Test Files');
    expect(result.compressed).toContain('1 failed');
  });

  it('keeps FAIL block verbatim in jest output', () => {
    const result = compressTestOutput(JEST_WITH_FAILURE);
    expect(result.compressed).toContain('UserService');
    expect(result.compressed).toContain('Expected: "created"');
    expect(result.compressed).toContain('Test Suites');
    // Passing test files should be omitted
    expect(result.compressed).not.toContain('PASS src/__tests__/auth.test.ts');
  });

  it('always includes the summary block', () => {
    const result = compressTestOutput(VITEST_WITH_FAILURE);
    expect(result.compressed).toContain('Duration');
  });
});

// ─── compressBuildOutput ───────────────────────────────────────────────────────

describe('compressBuildOutput', () => {
  it('returns short output unchanged', () => {
    const short = 'Build success in 100ms';
    const result = compressBuildOutput(short);
    expect(result.compressed).toBe(short);
    expect(result.outputType).toBe('build');
  });

  it('keeps error lines from tsc output', () => {
    const result = compressBuildOutput(TSC_ERRORS);
    expect(result.compressed).toContain('error TS2345');
    expect(result.compressed).toContain('error TS2379');
  });

  it('compresses tsup success output by removing noise lines', () => {
    const result = compressBuildOutput(TSUP_SUCCESS);
    // Should remove "CLI Building entry", "CLI Using tsconfig", etc.
    expect(result.compressed).not.toContain('Building entry');
    // Should keep the final success lines
    expect(result.compressed).toContain('Build success');
    expect(result.compressedBytes).toBeLessThan(result.originalBytes);
  });

  it('always keeps the tail summary', () => {
    const result = compressBuildOutput(TSUP_SUCCESS);
    // Last meaningful line of TSUP_SUCCESS is the DTS index.d.ts line
    expect(result.compressed).toContain('index.d.ts');
  });
});

// ─── compressLogOutput ────────────────────────────────────────────────────────

describe('compressLogOutput', () => {
  it('returns short output unchanged', () => {
    const short = 'line 1\nline 2\nline 3';
    const result = compressLogOutput(short, 50);
    expect(result.compressed).toBe(short);
    expect(result.outputType).toBe('log');
  });

  it('truncates long output with head + tail', () => {
    const result = compressLogOutput(LONG_LOG, 50);
    expect(result.compressed).toContain('line 1:');
    expect(result.compressed).toContain('line 120:');
    expect(result.compressed).toContain('lines truncated');
    expect(result.compressedBytes).toBeLessThan(result.originalBytes);
  });

  it('respects maxLines parameter', () => {
    const result = compressLogOutput(LONG_LOG, 20);
    const lines = result.compressed.split('\n').filter((l) => l.startsWith('[INFO]'));
    expect(lines.length).toBeLessThanOrEqual(20);
  });

  it('shows correct truncation count', () => {
    const result = compressLogOutput(LONG_LOG, 50);
    // 120 lines - 50 kept = 70 truncated
    expect(result.compressed).toContain('70 lines truncated');
  });
});
