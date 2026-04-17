import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CCTO_DIR,
  LAST_INDEXED_COMMIT_FILE,
  REINDEX_QUEUE_FILE,
} from '@ccto/shared';
import fg from 'fast-glob';
import { getFileHash, getKnownFiles } from '../store/index.js';

/** Result of incremental change detection */
export interface IncrementalChanges {
  /** Files that need to be deleted from the index (removed from disk) */
  toDelete: string[];
  /** Files whose content has changed and must be re-indexed */
  toReindex: string[];
  /** Files whose content hash is unchanged — skipped */
  skipped: number;
  /** Detection method used */
  method: 'git' | 'mtime' | 'full';
  /** Baseline reference (commit hash or ISO timestamp) */
  since?: string;
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

/**
 * Return true if the project root is inside a git repository.
 * @param projectRoot - Absolute path to the project root
 */
export function isGitAvailable(projectRoot: string): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd: projectRoot,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Return the current HEAD commit hash, or null if not in a git repo.
 * @param projectRoot - Absolute path to the project root
 */
export function getCurrentCommit(projectRoot: string): string | null {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Return the commit hash saved from the last successful index run.
 * @param projectRoot - Absolute path to the project root
 */
export function getLastIndexedCommit(projectRoot: string): string | null {
  const file = join(projectRoot, CCTO_DIR, LAST_INDEXED_COMMIT_FILE);
  try {
    return readFileSync(file, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Persist the current HEAD as the last indexed commit.
 * @param projectRoot - Absolute path to the project root
 * @param commit - Commit hash to save
 */
export function saveLastIndexedCommit(projectRoot: string, commit: string): void {
  const dir = join(projectRoot, CCTO_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, LAST_INDEXED_COMMIT_FILE), `${commit}\n`, 'utf-8');
}

// ─── Queue helpers ────────────────────────────────────────────────────────────

/**
 * Write a reindex-queue entry (called from git post-commit hook).
 * @param projectRoot - Absolute path to the project root
 * @param commit - Commit hash that triggered the reindex
 */
export function writeReindexQueue(projectRoot: string, commit: string): void {
  const dir = join(projectRoot, CCTO_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, REINDEX_QUEUE_FILE), `${commit}\n`, 'utf-8');
}

/**
 * Read the pending reindex commit from the queue file, or null if none.
 * @param projectRoot - Absolute path to the project root
 */
export function readReindexQueue(projectRoot: string): string | null {
  const file = join(projectRoot, CCTO_DIR, REINDEX_QUEUE_FILE);
  try {
    return readFileSync(file, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Remove the reindex queue file after a successful incremental run.
 * @param projectRoot - Absolute path to the project root
 */
export function clearReindexQueue(projectRoot: string): void {
  const file = join(projectRoot, CCTO_DIR, REINDEX_QUEUE_FILE);
  try {
    unlinkSync(file);
  } catch {
    // Already gone — that's fine
  }
}

// ─── File change detection ────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a file's full content.
 * @param filepath - Absolute path to the file
 */
export function computeFileHash(filepath: string): string {
  const content = readFileSync(filepath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Use `git diff --name-only <since>` to list changed/deleted files.
 *
 * Combines committed changes (since → HEAD) with uncommitted working-tree changes.
 *
 * @param projectRoot - Absolute path to the project root
 * @param since - Git ref to compare against (default: 'HEAD' = uncommitted only)
 * @returns Absolute paths of changed and deleted files
 */
export function getChangedFiles(
  projectRoot: string,
  since = 'HEAD',
): { changed: string[]; deleted: string[] } {
  const changed = new Set<string>();
  const deleted: string[] = [];

  // Committed changes between `since` and HEAD (skip if since IS HEAD)
  if (since !== 'HEAD') {
    try {
      const committed = execSync(`git diff --name-only ${since}..HEAD`, {
        cwd: projectRoot,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      for (const rel of committed.trim().split('\n').filter(Boolean)) {
        changed.add(resolve(projectRoot, rel));
      }
    } catch {
      // Commit may not exist yet — ignore
    }
  }

  // Uncommitted working-tree changes (always include)
  try {
    const uncommitted = execSync('git diff --name-only HEAD', {
      cwd: projectRoot,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    for (const rel of uncommitted.trim().split('\n').filter(Boolean)) {
      changed.add(resolve(projectRoot, rel));
    }
  } catch {
    // No HEAD yet (empty repo) — ignore
  }

  // Untracked files that are not gitignored
  try {
    const untracked = execSync('git ls-files --others --exclude-standard', {
      cwd: projectRoot,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    for (const rel of untracked.trim().split('\n').filter(Boolean)) {
      changed.add(resolve(projectRoot, rel));
    }
  } catch {
    // Ignore
  }

  // Separate existing files from deleted ones
  const toChange: string[] = [];
  for (const abs of changed) {
    if (existsSync(abs)) {
      toChange.push(abs);
    } else {
      deleted.push(abs);
    }
  }

  // Also detect files that are tracked in our index but no longer on disk
  try {
    const known = getKnownFiles(projectRoot);
    for (const fp of known) {
      if (!existsSync(fp) && !deleted.includes(fp)) {
        deleted.push(fp);
      }
    }
  } catch {
    // Store not initialised yet
  }

  return { changed: toChange, deleted };
}

/**
 * Mtime-based fallback when git is unavailable.
 * Compares each known file's mtime against the index.db modification time.
 *
 * @param projectRoot - Absolute path to the project root
 */
async function getChangedFilesMtime(
  projectRoot: string,
): Promise<{ changed: string[]; deleted: string[]; since: string }> {
  const dbPath = join(projectRoot, CCTO_DIR, 'index.db');
  let dbMtime = 0;
  let sinceTs = new Date(0).toISOString();
  try {
    const s = statSync(dbPath);
    dbMtime = s.mtimeMs;
    sinceTs = s.mtime.toISOString();
  } catch {
    // DB doesn't exist yet → treat everything as new
  }

  // Walk current project files
  const entries = await fg(['**/*'], {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/.ccto/**', '**/.git/**', '**/dist/**', '**/build/**'],
    dot: false,
    onlyFiles: true,
    absolute: true,
  });

  const changed: string[] = [];
  for (const abs of entries) {
    try {
      const { mtimeMs } = statSync(abs);
      if (mtimeMs > dbMtime) changed.push(abs);
    } catch {
      // ignore
    }
  }

  // Detect deleted files
  const deleted: string[] = [];
  try {
    const known = getKnownFiles(projectRoot);
    for (const fp of known) {
      if (!existsSync(fp)) deleted.push(fp);
    }
  } catch {
    // Store not yet initialised
  }

  return { changed, deleted, since: sinceTs };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Determine which files need re-indexing.
 *
 * Strategy:
 * 1. Git available → `git diff --name-only <lastCommit>` + uncommitted changes
 * 2. No git → mtime comparison against index.db
 * 3. For each candidate, check SHA-256 against stored file_index — skip if unchanged
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Files to delete, files to re-index, and count of skipped unchanged files
 */
export async function getIncrementalChanges(
  projectRoot: string,
): Promise<IncrementalChanges> {
  let candidates: string[];
  let toDelete: string[];
  let method: 'git' | 'mtime';
  let since: string | undefined;

  if (isGitAvailable(projectRoot)) {
    const lastCommit = getLastIndexedCommit(projectRoot) ?? readReindexQueue(projectRoot);
    since = lastCommit ?? undefined;
    const { changed, deleted } = getChangedFiles(projectRoot, lastCommit ?? 'HEAD');
    candidates = changed;
    toDelete = deleted;
    method = 'git';
  } else {
    const result = await getChangedFilesMtime(projectRoot);
    candidates = result.changed;
    toDelete = result.deleted;
    since = result.since;
    method = 'mtime';
  }

  // Hash-based skip: filter out files whose content hasn't actually changed
  const toReindex: string[] = [];
  let skipped = 0;

  for (const fp of candidates) {
    try {
      const currentHash = computeFileHash(fp);
      const storedHash = getFileHash(projectRoot, fp);
      if (storedHash === currentHash) {
        skipped++;
      } else {
        toReindex.push(fp);
      }
    } catch {
      // File became unreadable between detection and now → skip
      skipped++;
    }
  }

  return { toDelete, toReindex, skipped, method, ...(since !== undefined ? { since } : {}) };
}
