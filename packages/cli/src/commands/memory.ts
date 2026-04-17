import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { extname, basename, dirname } from 'node:path';
import {
  clearSessions,
  clearTrackedFiles,
  getTrackedFiles,
  listSessions,
  saveSession,
  trackFile,
} from '@ccto/core';
import { EXT_TO_LANG } from '@ccto/shared';
import chalk from 'chalk';

interface MemoryOptions {
  projectRoot?: string;
}

export function runMemoryList(options: MemoryOptions = {}): void {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  let entries;
  try {
    entries = listSessions(projectRoot);
  } catch {
    console.log(chalk.dim('  No memory database found. Run `ccto init` to enable memory.'));
    return;
  }

  if (entries.length === 0) {
    console.log(chalk.dim('  Memory is empty.'));
    return;
  }

  console.log(chalk.bold.cyan(`\n  Session Memory (${entries.length} entries)\n`));
  for (const e of entries) {
    const date = e.timestamp.slice(0, 16).replace('T', ' ');
    console.log(`  ${chalk.dim(date)}  ${e.summary}`);
    if (e.filesTouched.length > 0) {
      const preview = e.filesTouched.slice(0, 3).map((f) => basename(f)).join(', ');
      const extra = e.filesTouched.length > 3 ? ` +${e.filesTouched.length - 3} more` : '';
      console.log(`    ${chalk.dim('files:')} ${preview}${extra}`);
    }
    if (e.tags.length > 0) {
      console.log(`    ${chalk.cyan(e.tags.join(', '))}`);
    }
  }
  console.log();
}

export function runMemoryClear(options: MemoryOptions = {}): void {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  try {
    clearSessions(projectRoot);
    console.log(chalk.green('  ✓ Memory cleared'));
  } catch {
    console.log(chalk.dim('  No memory database found.'));
  }
}

/** Called by the PostToolUse hook — reads filepath from stdin JSON and tracks it. */
export async function runMemoryTrackFile(options: MemoryOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  let raw = '';
  try {
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      raw += line;
    }
    if (!raw.trim()) return;

    const payload = JSON.parse(raw) as {
      tool_input?: { file_path?: string };
    };
    const filepath = payload?.tool_input?.file_path;
    if (!filepath) return;

    trackFile(projectRoot, filepath);
  } catch {
    // Hooks must not block Claude — silently swallow all errors
  }
}

/** Called by the Stop hook — summarises tracked files and saves a session entry. */
export async function runMemorySaveSession(options: MemoryOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  try {
    const files = getTrackedFiles(projectRoot);
    if (files.length === 0) return;

    // Infer languages from file extensions
    const langs = [...new Set(files.map((f) => EXT_TO_LANG[extname(f)] ?? '').filter(Boolean))];

    // Infer tags: unique parent directory names + language names
    const dirs = [...new Set(files.map((f) => basename(dirname(f))).filter((d) => d !== '.'))];
    const tags = [...new Set([...dirs, ...langs])].slice(0, 8);

    // Build compact summary
    const keyFiles = files
      .slice(0, 5)
      .map((f) => {
        const parts = f.replace(/\\/g, '/').split('/');
        return parts.slice(-2).join('/');
      })
      .join(', ');
    const extra = files.length > 5 ? ` +${files.length - 5} more` : '';
    const langNote = langs.length > 0 ? ` (${langs.join(', ')})` : '';
    const summary = `Edited ${files.length} file${files.length > 1 ? 's' : ''}${langNote}: ${keyFiles}${extra}`;

    const now = new Date().toISOString();
    await saveSession(projectRoot, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: now,
      timestamp: now,
      summary,
      filesTouched: files,
      tags,
    });

    clearTrackedFiles(projectRoot);
  } catch {
    // Hooks must not block Claude — silently swallow all errors
  }
}
