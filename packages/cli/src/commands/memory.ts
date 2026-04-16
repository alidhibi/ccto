import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { CCTO_DIR, MEMORY_FILE, type MemoryEntry } from '@ccto/shared';
import chalk from 'chalk';

interface MemoryOptions {
  projectRoot?: string;
}

export function runMemoryList(options: MemoryOptions = {}): void {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const path = join(projectRoot, CCTO_DIR, MEMORY_FILE);

  if (!existsSync(path)) {
    console.log(chalk.dim('  No memory file found.'));
    return;
  }

  const entries = JSON.parse(readFileSync(path, 'utf-8')) as MemoryEntry[];
  if (entries.length === 0) {
    console.log(chalk.dim('  Memory is empty.'));
    return;
  }

  console.log(chalk.bold.cyan(`\n  Session Memory (${entries.length} entries)\n`));
  for (const e of entries) {
    console.log(`  ${chalk.dim(e.timestamp)}  ${e.summary}`);
    if (e.tags.length > 0) {
      console.log(`    ${chalk.cyan(e.tags.join(', '))}`);
    }
  }
  console.log();
}

export function runMemoryClear(options: MemoryOptions = {}): void {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const path = join(projectRoot, CCTO_DIR, MEMORY_FILE);

  writeFileSync(path, '[]', 'utf-8');
  console.log(chalk.green('  ✓ Memory cleared'));
}
