import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deleteByFile, embed, indexProject, loadConfig, upsertChunks } from '@ccto/core';
import { formatDuration } from '@ccto/shared';
import chalk from 'chalk';

interface IndexOptions {
  projectRoot?: string;
  incremental?: boolean;
}

export async function runIndex(options: IndexOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const config = loadConfig(projectRoot);

  let changedFiles: string[] | undefined;

  if (options.incremental) {
    changedFiles = getGitChangedFiles(projectRoot);
    if (changedFiles.length === 0) {
      console.log(chalk.dim('  No changed files detected.'));
      return;
    }
    console.log(chalk.yellow(`  ⏳ Re-indexing ${changedFiles.length} changed files…`));
    for (const fp of changedFiles) {
      deleteByFile(projectRoot, fp);
    }
  } else {
    console.log(chalk.yellow('  ⏳ Full re-index…'));
  }

  const indexConfig = changedFiles ? { ...config, include: changedFiles } : config;

  const { chunks, result } = await indexProject(projectRoot, indexConfig, {
    onFile: (fp) => process.stdout.write(chalk.dim(`    → ${fp}\r`)),
  });
  process.stdout.write(`\r${' '.repeat(80)}\r`);
  console.log(
    chalk.green(`  ✓ Indexed ${result.indexed} files in ${formatDuration(result.durationMs)}`),
  );

  if (chunks.length > 0) {
    console.log(chalk.yellow(`  ⏳ Embedding ${chunks.length} chunks…`));
    const embeddings = await embed(chunks.map((c) => c.content));
    const chunksWithEmb = chunks.map((c, i) => ({
      ...c,
      embedding: embeddings[i] ?? new Float32Array(384),
    }));
    upsertChunks(projectRoot, chunksWithEmb);
    console.log(chalk.green(`  ✓ Updated ${chunks.length} embeddings`));
  }
}

function getGitChangedFiles(projectRoot: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((f) => resolve(projectRoot, f));
  } catch {
    return [];
  }
}
