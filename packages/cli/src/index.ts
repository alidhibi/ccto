#!/usr/bin/env node
import { CCTO_VERSION } from '@ccto/shared';
import { Command } from 'commander';
import { runDoctor } from './commands/doctor.js';
import { runMetricsTrackBypass } from './commands/metrics.js';
import { runIndex } from './commands/index.js';
import { runInit } from './commands/init.js';
import {
  runMemoryClear,
  runMemoryList,
  runMemorySaveSession,
  runMemoryTrackFile,
} from './commands/memory.js';
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
  .option('--git-hook', 'Install git post-commit hook for background incremental indexing')
  .action(async (opts) => {
    await runInit({ projectRoot: opts.project, gitHook: opts.gitHook });
  });

program
  .command('index')
  .description('Re-index all files (or only changed files with --incremental)')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .option('-i, --incremental', 'Only re-index files changed since last git commit')
  .option('--full', 'Force full reindex, ignoring previous state')
  .option('-q, --quiet', 'Suppress all console output')
  .action(async (opts) => {
    await runIndex({ projectRoot: opts.project, incremental: opts.incremental, full: opts.full, quiet: opts.quiet });
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

memory
  .command('save-session')
  .description('Save current session summary to memory (called by Stop hook)')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action(async (opts) => {
    await runMemorySaveSession({ projectRoot: opts.project });
  });

memory
  .command('track-file')
  .description('Record an edited file from hook stdin (called by PostToolUse hook)')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action(async (opts) => {
    await runMemoryTrackFile({ projectRoot: opts.project });
  });

const metrics = program.command('metrics').description('Internal metrics hooks');

metrics
  .command('track-bypass')
  .description('Record a native Read on an indexed file (called by PreToolUse hook)')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action(async (opts) => {
    await runMetricsTrackBypass({ projectRoot: opts.project });
  });

program
  .command('doctor')
  .description('Diagnose setup issues')
  .option('-p, --project <path>', 'Project root (default: cwd)')
  .action(async (opts) => {
    await runDoctor({ projectRoot: opts.project });
  });

program.parse();
