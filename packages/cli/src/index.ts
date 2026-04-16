#!/usr/bin/env node
import { CCTO_VERSION } from '@ccto/shared';
import { Command } from 'commander';
import { runDoctor } from './commands/doctor.js';
import { runIndex } from './commands/index.js';
import { runInit } from './commands/init.js';
import { runMemoryClear, runMemoryList } from './commands/memory.js';
import { runServe } from './commands/serve.js';
import { runStats } from './commands/stats.js';

const program = new Command();

program
  .name('ccto')
  .description('Claude Code Token Optimizer — reduce token usage by 60–80%')
  .version(CCTO_VERSION);

program
  .command('init')
  .description('Index project, configure MCP server, and update CLAUDE.md')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action(async (opts) => {
    await runInit({ projectRoot: opts.project });
  });

program
  .command('index')
  .description('Re-index all files (or only changed files with --incremental)')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .option('-i, --incremental', 'Only re-index files changed since last git commit')
  .action(async (opts) => {
    await runIndex({ projectRoot: opts.project, incremental: opts.incremental });
  });

program
  .command('serve')
  .description('Start the MCP server manually (for debugging)')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action(async (opts) => {
    await runServe({ projectRoot: opts.project });
  });

program
  .command('stats')
  .description('Show token savings dashboard')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action((opts) => {
    runStats({ projectRoot: opts.project });
  });

const memory = program.command('memory').description('Manage session memory');

memory
  .command('list')
  .description('List all memory entries')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action((opts) => {
    runMemoryList({ projectRoot: opts.project });
  });

memory
  .command('clear')
  .description('Clear all memory entries')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action((opts) => {
    runMemoryClear({ projectRoot: opts.project });
  });

program
  .command('doctor')
  .description('Diagnose setup issues')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action(async (opts) => {
    await runDoctor({ projectRoot: opts.project });
  });

program.parse();
