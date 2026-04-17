import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { getBypassStats, getStats } from '@ccto/core';
import { CCTO_DIR, type CallMetrics, METRICS_FILE, formatBytes } from '@ccto/shared';
import chalk from 'chalk';

interface StatsOptions {
  projectRoot?: string;
}

export function runStats(options: StatsOptions = {}): void {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  console.log(chalk.bold.cyan('\n  CCTO Statistics\n'));

  // Store stats
  try {
    const stats = getStats(projectRoot);
    console.log(chalk.bold('  Index'));
    console.log(`    Total chunks : ${chalk.green(stats.totalChunks)}`);
    console.log(`    Total files  : ${chalk.green(stats.totalFiles)}`);
    console.log(`    DB size      : ${chalk.green(formatBytes(stats.dbSizeBytes))}`);

    const langs = Object.entries(stats.languages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
    if (langs.length > 0) {
      console.log(`\n  ${chalk.bold('Languages')}`);
      for (const [lang, count] of langs) {
        const bar = '█'.repeat(Math.min(20, Math.round((count / stats.totalChunks) * 20)));
        console.log(`    ${lang.padEnd(14)} ${chalk.cyan(bar)} ${count}`);
      }
    }
  } catch {
    console.log(chalk.dim('  Index not initialized. Run `ccto init` first.'));
  }

  // Metrics
  const metricsPath = join(projectRoot, CCTO_DIR, METRICS_FILE);
  if (existsSync(metricsPath)) {
    try {
      const records = JSON.parse(readFileSync(metricsPath, 'utf-8')) as CallMetrics[];
      const totalSaved = records.reduce((s, r) => s + r.savedTokens, 0);
      const totalCalls = records.length;
      const byTool: Record<string, number> = {};
      for (const r of records) {
        byTool[r.tool] = (byTool[r.tool] ?? 0) + r.savedTokens;
      }

      console.log(`\n  ${chalk.bold('Token Savings')}`);
      console.log(`    Total calls saved  : ${chalk.green(totalCalls)}`);
      console.log(`    Total tokens saved : ${chalk.green(totalSaved.toLocaleString())}`);
      console.log(
        `    Est. cost saved    : ${chalk.green(`$${((totalSaved / 1_000_000) * 3).toFixed(4)}`)} (at $3/1M tokens)`,
      );

      const toolEntries = Object.entries(byTool).sort(([, a], [, b]) => b - a);
      if (toolEntries.length > 0) {
        console.log(`\n  ${chalk.bold('By Tool')}`);
        for (const [tool, saved] of toolEntries) {
          console.log(`    ${tool.padEnd(20)} ${chalk.cyan(saved.toLocaleString())} tokens`);
        }
      }
    } catch {
      // metrics file corrupt
    }
  }

  // Bypass stats
  try {
    const bypass = getBypassStats(projectRoot);
    if (bypass.bypassCount > 0) {
      console.log(`\n  ${chalk.bold.yellow('Potential Savings Missed')}`);
      console.log(
        `    Native Read bypasses : ${chalk.yellow(bypass.bypassCount)} (indexed files read without smart_read)`,
      );
      console.log(
        `    Est. tokens wasted   : ${chalk.yellow(bypass.totalBypassedTokens.toLocaleString())}`,
      );
      console.log(
        `    Est. cost wasted     : ${chalk.yellow(`$${((bypass.totalBypassedTokens / 1_000_000) * 3).toFixed(4)}`)} (at $3/1M tokens)`,
      );
      console.log(chalk.dim('    → Use smart_read instead of Read for indexed files.'));
    }
  } catch {
    // bypass file may not exist yet
  }

  console.log();
}
