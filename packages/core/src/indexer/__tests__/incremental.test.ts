import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearReindexQueue,
  computeFileHash,
  getCurrentCommit,
  getChangedFiles,
  getIncrementalChanges,
  getLastIndexedCommit,
  isGitAvailable,
  readReindexQueue,
  saveLastIndexedCommit,
  writeReindexQueue,
} from '../incremental.js';
import { resetDb } from '../../store/db.js';

function git(cwd: string, ...args: string[]): string {
  return execSync(`git ${args.join(' ')}`, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@test.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@test.com',
    },
  }).trim();
}

function initRepo(dir: string): void {
  git(dir, 'init');
  git(dir, 'config', 'user.email', 'test@test.com');
  git(dir, 'config', 'user.name', 'Test');
}

function writeAndCommit(dir: string, filename: string, content: string): string {
  writeFileSync(join(dir, filename), content, 'utf-8');
  git(dir, 'add', filename);
  git(dir, 'commit', '-m', `"add ${filename}"`);
  return getCurrentCommit(dir) ?? '';
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ccto-inc-test-'));
});

afterEach(() => {
  resetDb(tmpDir);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('isGitAvailable', () => {
  it('returns true for a git repo', () => {
    initRepo(tmpDir);
    expect(isGitAvailable(tmpDir)).toBe(true);
  });

  it('returns false for a non-git directory', () => {
    expect(isGitAvailable(tmpDir)).toBe(false);
  });
});

describe('getCurrentCommit', () => {
  it('returns null for repo with no commits', () => {
    initRepo(tmpDir);
    expect(getCurrentCommit(tmpDir)).toBeNull();
  });

  it('returns commit hash after a commit', () => {
    initRepo(tmpDir);
    writeAndCommit(tmpDir, 'file.ts', 'export const x = 1;');
    const commit = getCurrentCommit(tmpDir);
    expect(commit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('getLastIndexedCommit / saveLastIndexedCommit', () => {
  it('returns null when no commit saved', () => {
    expect(getLastIndexedCommit(tmpDir)).toBeNull();
  });

  it('round-trips a commit hash', () => {
    initRepo(tmpDir);
    writeAndCommit(tmpDir, 'a.ts', 'const a = 1;');
    const commit = getCurrentCommit(tmpDir)!;
    saveLastIndexedCommit(tmpDir, commit);
    expect(getLastIndexedCommit(tmpDir)).toBe(commit);
  });
});

describe('writeReindexQueue / readReindexQueue / clearReindexQueue', () => {
  it('returns null when queue is empty', () => {
    expect(readReindexQueue(tmpDir)).toBeNull();
  });

  it('round-trips a commit hash', () => {
    writeReindexQueue(tmpDir, 'abc123');
    expect(readReindexQueue(tmpDir)).toBe('abc123');
  });

  it('clears the queue', () => {
    writeReindexQueue(tmpDir, 'abc123');
    clearReindexQueue(tmpDir);
    expect(readReindexQueue(tmpDir)).toBeNull();
  });

  it('clearReindexQueue is idempotent when file absent', () => {
    expect(() => clearReindexQueue(tmpDir)).not.toThrow();
  });
});

describe('computeFileHash', () => {
  it('returns a 64-char hex SHA-256', () => {
    const fp = join(tmpDir, 'test.ts');
    writeFileSync(fp, 'hello', 'utf-8');
    const hash = computeFileHash(fp);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different content → different hash', () => {
    const fp = join(tmpDir, 'test.ts');
    writeFileSync(fp, 'hello', 'utf-8');
    const h1 = computeFileHash(fp);
    writeFileSync(fp, 'world', 'utf-8');
    const h2 = computeFileHash(fp);
    expect(h1).not.toBe(h2);
  });

  it('same content → same hash', () => {
    const fp = join(tmpDir, 'test.ts');
    writeFileSync(fp, 'deterministic', 'utf-8');
    expect(computeFileHash(fp)).toBe(computeFileHash(fp));
  });
});

describe('getChangedFiles', () => {
  it('reports an untracked file as changed', () => {
    initRepo(tmpDir);
    writeAndCommit(tmpDir, 'base.ts', 'const x = 1;');
    writeFileSync(join(tmpDir, 'new.ts'), 'const y = 2;', 'utf-8');
    const { changed } = getChangedFiles(tmpDir, getCurrentCommit(tmpDir)!);
    expect(changed.some((f) => f.endsWith('new.ts'))).toBe(true);
  });

  it('reports a modified tracked file as changed', () => {
    initRepo(tmpDir);
    writeAndCommit(tmpDir, 'base.ts', 'const x = 1;');
    const commit1 = getCurrentCommit(tmpDir)!;
    writeAndCommit(tmpDir, 'new.ts', 'const y = 2;');
    const { changed } = getChangedFiles(tmpDir, commit1);
    expect(changed.some((f) => f.endsWith('new.ts'))).toBe(true);
  });

  it('reports deleted file', () => {
    initRepo(tmpDir);
    writeAndCommit(tmpDir, 'base.ts', 'const x = 1;');
    const commit1 = getCurrentCommit(tmpDir)!;
    git(tmpDir, 'rm', 'base.ts');
    git(tmpDir, 'commit', '-m', '"remove base"');
    const { deleted } = getChangedFiles(tmpDir, commit1);
    expect(deleted.some((f) => f.endsWith('base.ts'))).toBe(true);
  });
});

describe('getIncrementalChanges', () => {
  it('returns mtime method when git is unavailable', async () => {
    writeFileSync(join(tmpDir, 'file.ts'), 'hello', 'utf-8');
    const changes = await getIncrementalChanges(tmpDir);
    expect(changes.method).toBe('mtime');
    expect(changes.toReindex.length).toBeGreaterThanOrEqual(0);
  });

  it('returns git method when git is available', async () => {
    initRepo(tmpDir);
    writeAndCommit(tmpDir, 'base.ts', 'const x = 1;');
    saveLastIndexedCommit(tmpDir, getCurrentCommit(tmpDir)!);
    const changes = await getIncrementalChanges(tmpDir);
    expect(changes.method).toBe('git');
  });

  it('detects a new file since last commit', async () => {
    initRepo(tmpDir);
    writeAndCommit(tmpDir, 'base.ts', 'const x = 1;');
    const commit1 = getCurrentCommit(tmpDir)!;
    saveLastIndexedCommit(tmpDir, commit1);

    writeAndCommit(tmpDir, 'new.ts', 'const y = 2;');

    const changes = await getIncrementalChanges(tmpDir);
    expect(changes.method).toBe('git');
    expect(changes.toReindex.some((f) => f.endsWith('new.ts'))).toBe(true);
  });

  it('skips files whose hash is unchanged', async () => {
    initRepo(tmpDir);
    writeAndCommit(tmpDir, 'stable.ts', 'const x = 1;');
    const commit1 = getCurrentCommit(tmpDir)!;

    // Make a second commit with different content
    writeAndCommit(tmpDir, 'stable.ts', 'const x = 2; // v2');

    // Record the CURRENT hash in file_index — content matches what's on disk
    const { upsertFileHash } = await import('../../store/store.js');
    upsertFileHash(tmpDir, join(tmpDir, 'stable.ts'), computeFileHash(join(tmpDir, 'stable.ts')));

    // Report commit1 as last indexed — git diff will show stable.ts as changed
    saveLastIndexedCommit(tmpDir, commit1);

    const changes = await getIncrementalChanges(tmpDir);
    // Hash matches current content → should be skipped, not in toReindex
    expect(changes.skipped).toBeGreaterThanOrEqual(1);
    expect(changes.toReindex.some((f) => f.endsWith('stable.ts'))).toBe(false);
  });

  it('includes a changed file when hash differs', async () => {
    initRepo(tmpDir);
    writeAndCommit(tmpDir, 'changing.ts', 'const x = 1;');
    const commit1 = getCurrentCommit(tmpDir)!;

    // Record old hash
    const { upsertFileHash } = await import('../../store/store.js');
    upsertFileHash(tmpDir, join(tmpDir, 'changing.ts'), 'deadbeef-old-hash');

    saveLastIndexedCommit(tmpDir, commit1);

    writeAndCommit(tmpDir, 'changing.ts', 'const x = 99; // changed');

    const changes = await getIncrementalChanges(tmpDir);
    expect(changes.toReindex.some((f) => f.endsWith('changing.ts'))).toBe(true);
  });
});
