import { resolve } from 'node:path';
import {
  clearReindexQueue,
  deleteByFile,
  embed,
  getCurrentCommit,
  getIncrementalChanges,
  indexProject,
  isGitAvailable,
  getLastIndexedCommit,
  loadConfig,
  saveLastIndexedCommit,
  upsertChunks,
  upsertFileHash,
  computeFileHash,
} from '@ccto/core';
import { formatDuration } from '@ccto/shared';
import chalk from 'chalk';

export interface IndexOptions {
  projectRoot?: string;
  /** Force incremental (git diff / mtime). */
  incremental?: boolean;
  /** Force full reindex, ignoring previous state. */
  full?: boolean;
  /** Suppress all console output (used by background hook). */
  quiet?: boolean;
}

export async function runIndex(options: IndexOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const config = loadConfig(projectRoot);
  const quiet = options.quiet ?? false;

  const log = (...args: Parameters<typeof console.log>): void => {
    if (!quiet) console.log(...args);
  };

  // ── Determine mode ────────────────────────────────────────────────────────
  const gitPresent = isGitAvailable(projectRoot);
  const hasLastCommit = Boolean(getLastIndexedCommit(projectRoot));

  const useIncremental =
    options.full ? false
    : options.incremental ? true
    : gitPresent && hasLastCommit; // auto-detect

  // ── Incremental path ──────────────────────────────────────────────────────
  if (useIncremental) {
    const changes = await getIncrementalChanges(projectRoot);

    const sinceLabel = changes.since
      ? chalk.dim(`since ${changes.since.slice(0, 8)}`)
      : '';
    log(chalk.yellow(`  ⏳ Incremental index ${sinceLabel} [${changes.method}]…`));

    if (changes.toDelete.length === 0 && changes.toReindex.length === 0) {
      log(chalk.dim(`  ✓ Nothing changed (${changes.skipped} files hash-unchanged)`));
      clearReindexQueue(projectRoot);
      return;
    }

    // Delete stale entries
    for (const fp of changes.toDelete) {
      deleteByFile(projectRoot, fp);
    }

    // Re-index changed files
    let reindexed = 0;
    let embeddingCount = 0;

    if (changes.toReindex.length > 0) {
      const indexConfig = { ...config, include: changes.toReindex };
      const { chunks, result } = await indexProject(projectRoot, indexConfig, {
        onFile: (fp) => process.stdout.write(quiet ? '' : chalk.dim(`    → ${fp}\r`)),
      });
      if (!quiet) process.stdout.write(`\r${' '.repeat(80)}\r`);
      reindexed = result.indexed;

      if (chunks.length > 0) {
        const embeddings = await embed(chunks.map((c) => c.content));
        const chunksWithEmb = chunks.map((c, i) => ({
          ...c,
          embedding: embeddings[i] ?? new Float32Array(384),
        }));
        upsertChunks(projectRoot, chunksWithEmb);
        embeddingCount = chunks.length;

        // Record file hashes for future incremental runs
        const indexed = new Set(chunks.map((c) => c.filepath));
        for (const fp of indexed) {
          try {
            upsertFileHash(projectRoot, fp, computeFileHash(fp));
          } catch {
            // File may have changed again — skip
          }
        }
      }
    }

    // Update last-indexed commit
    if (changes.method === 'git') {
      const head = getCurrentCommit(projectRoot);
      if (head) saveLastIndexedCommit(projectRoot, head);
      clearReindexQueue(projectRoot);
    }

    const parts = [
      `${changes.toReindex.length} changed`,
      `${reindexed} reindexed`,
      `${changes.skipped} skipped (hash unchanged)`,
      `${changes.toDelete.length} deleted`,
    ];
    log(chalk.green(`  ✓ ${parts.join(', ')}`));
    if (embeddingCount > 0) {
      log(chalk.green(`  ✓ Updated ${embeddingCount} embeddings`));
    }
    return;
  }

  // ── Full reindex path ─────────────────────────────────────────────────────
  log(chalk.yellow('  ⏳ Full re-index…'));

  const { chunks, result } = await indexProject(projectRoot, config, {
    onFile: (fp) => process.stdout.write(quiet ? '' : chalk.dim(`    → ${fp}\r`)),
    onError: (fp, err) =>
      log(chalk.red(`    ✗ ${fp}: ${err instanceof Error ? err.message : err}`)),
  });
  if (!quiet) process.stdout.write(`\r${' '.repeat(80)}\r`);
  log(
    chalk.green(
      `  ✓ Indexed ${result.indexed} files (${result.skipped} skipped, ${result.errors} errors) in ${formatDuration(result.durationMs)}`,
    ),
  );

  if (chunks.length > 0) {
    log(chalk.yellow(`  ⏳ Embedding ${chunks.length} chunks…`));
    const embeddings = await embed(chunks.map((c) => c.content));
    const chunksWithEmb = chunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i] ?? new Float32Array(384),
    }));
    upsertChunks(projectRoot, chunksWithEmb);

    // Record all file hashes
    const indexed = new Set(chunks.map((c) => c.filepath));
    for (const fp of indexed) {
      try {
        upsertFileHash(projectRoot, fp, computeFileHash(fp));
      } catch {
        // skip
      }
    }

    log(chalk.green(`  ✓ Updated ${chunks.length} embeddings`));
  }

  // Save current commit as baseline for future incremental runs
  if (gitPresent) {
    const head = getCurrentCommit(projectRoot);
    if (head) saveLastIndexedCommit(projectRoot, head);
  }
}
