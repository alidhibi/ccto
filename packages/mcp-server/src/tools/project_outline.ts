import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getStats } from '@ccto/core';
import { EXT_TO_LANG, formatBytes } from '@ccto/shared';
import type { CallMetrics } from '@ccto/shared';
import { z } from 'zod';

export const ProjectOutlineInput = z.object({
  depth: z.number().int().min(1).max(5).default(3).describe('Max directory depth to display'),
});

export type ProjectOutlineInput = z.infer<typeof ProjectOutlineInput>;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.ccto',
  'coverage',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  'vendor',
]);

function buildTree(dir: string, projectRoot: string, depth: number, maxDepth: number): string[] {
  if (depth > maxDepth) return [];
  const lines: string[] = [];
  const indent = '  '.repeat(depth - 1);

  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry.startsWith('.') && depth > 1) continue;
    const fullPath = join(dir, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      lines.push(`${indent}${entry}/`);
      lines.push(...buildTree(fullPath, projectRoot, depth + 1, maxDepth));
    } else {
      const extPart = entry.includes('.') ? entry.split('.').pop() : undefined;
      const lang = extPart ? (EXT_TO_LANG[`.${extPart}`] ?? '') : '';
      const langTag = lang ? ` [${lang}]` : '';
      lines.push(`${indent}${entry}${langTag}`);
    }
  }

  return lines;
}

export async function projectOutline(
  projectRoot: string,
  input: ProjectOutlineInput,
): Promise<{ text: string; metrics: CallMetrics }> {
  const tree = buildTree(projectRoot, projectRoot, 1, input.depth);

  let statsText = '';
  try {
    const stats = getStats(projectRoot);
    const langSummary = Object.entries(stats.languages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([lang, count]) => `${lang}: ${count} chunks`)
      .join(', ');
    statsText = `\n\n**Index stats:** ${stats.totalChunks} chunks across ${stats.totalFiles} files (${formatBytes(stats.dbSizeBytes)})\n**Languages:** ${langSummary}`;
  } catch {
    // DB not initialized yet
  }

  const text = [`**Project:** ${projectRoot}`, '', '```', tree.join('\n'), '```', statsText].join(
    '\n',
  );

  const metrics: CallMetrics = {
    tool: 'project_outline',
    tokensRequested: tree.length * 20, // rough estimate of full recursive read
    tokensServed: Math.ceil(text.length / 4),
    savedTokens: 0,
    timestamp: new Date().toISOString(),
  };
  metrics.savedTokens = Math.max(0, metrics.tokensRequested - metrics.tokensServed);

  return { text, metrics };
}
