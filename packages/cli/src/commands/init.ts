import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { embed, indexProject, saveConfig, upsertChunks } from '@ccto/core';
import { CCTO_DIR, type CctoConfig, DEFAULT_CONFIG, formatDuration } from '@ccto/shared';
import chalk from 'chalk';

interface InitOptions {
  projectRoot?: string;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  console.log(chalk.bold.cyan('\n  CCTO — Claude Code Token Optimizer'));
  console.log(chalk.dim(`  Initializing in: ${projectRoot}\n`));

  // Create .ccto/
  const cctoDir = join(projectRoot, CCTO_DIR);
  mkdirSync(cctoDir, { recursive: true });

  // Write config
  const config: CctoConfig = { ...DEFAULT_CONFIG, projectRoot };
  saveConfig(projectRoot, config);
  console.log(chalk.green('  ✓ Created .ccto/config.json'));

  // Index the project
  console.log(chalk.yellow('  ⏳ Indexing project files…'));
  const { chunks, outlines, result } = await indexProject(projectRoot, config, {
    onFile: (fp) => process.stdout.write(chalk.dim(`    → ${fp}\r`)),
    onError: (fp, err) =>
      console.warn(chalk.red(`    ✗ ${fp}: ${err instanceof Error ? err.message : err}`)),
  });
  process.stdout.write(`\r${' '.repeat(80)}\r`);
  console.log(
    chalk.green(
      `  ✓ Indexed ${result.indexed} files (${result.skipped} skipped, ${result.errors} errors) in ${formatDuration(result.durationMs)}`,
    ),
  );

  // Compute and store embeddings
  if (chunks.length > 0) {
    console.log(chalk.yellow(`  ⏳ Computing embeddings for ${chunks.length} chunks…`));
    try {
      const texts = chunks.map((c) => c.content);
      const embeddings = await embed(texts);
      const chunksWithEmbeddings = chunks.map((c, i) => ({
        ...c,
        embedding: embeddings[i] ?? new Float32Array(384),
      }));
      upsertChunks(projectRoot, chunksWithEmbeddings);
      console.log(chalk.green(`  ✓ Stored ${chunks.length} chunk embeddings`));
    } catch (err) {
      console.warn(chalk.yellow(`  ⚠ Embeddings failed (will use fallback): ${err}`));
    }
  }

  // Register MCP server with Claude Code
  registerMcpServer(projectRoot);

  // Generate CLAUDE.md
  generateClaudeMd(projectRoot, result.indexed, outlines.length);

  console.log(chalk.bold.green('\n  ✅ CCTO ready!\n'));
  console.log('  Next steps:');
  console.log('  • Open Claude Code in this project — MCP tools are active');
  console.log(`  • Run ${chalk.cyan('ccto stats')} to see token savings`);
  console.log(`  • Run ${chalk.cyan('ccto index --incremental')} after code changes\n`);
}

function registerMcpServer(projectRoot: string): void {
  try {
    execSync('claude mcp add ccto --scope user -- ccto serve', {
      stdio: 'inherit',
      cwd: projectRoot,
    });
    console.log(chalk.green('  ✓ Registered ccto MCP server via `claude mcp add` (user scope)'));
    return;
  } catch {
    console.log(chalk.dim('  ↓ `claude` CLI not found — falling back to .claude/settings.json'));
  }

  // Fallback: write directly to .claude/settings.json (project scope)
  const claudeDir = join(projectRoot, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');
  mkdirSync(claudeDir, { recursive: true });

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {}
  }

  const mcpServers = (settings.mcpServers as Record<string, unknown> | undefined) ?? {};
  mcpServers.ccto = { command: 'ccto', args: ['serve'] };
  settings.mcpServers = mcpServers;
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
  console.log(chalk.green('  ✓ Registered ccto MCP server in .claude/settings.json'));
}

function generateClaudeMd(projectRoot: string, fileCount: number, symbolCount: number): void {
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');

  // Don't overwrite if it already exists and has content
  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');
    if (existing.includes('CCTO is active')) {
      console.log(chalk.dim('  ↓ CLAUDE.md already has CCTO section, skipping'));
      return;
    }
  }

  const cctoSection = `
## CCTO Token Optimization

CCTO is active in this project. ${fileCount} files indexed, ${symbolCount} symbol outlines extracted.

### MCP Tools Available

Use these tools instead of reading files directly to save tokens:

- **\`semantic_search\`** — Find relevant code by description (e.g. \`semantic_search("authentication middleware")\`)
- **\`smart_read\`** — Read a file outline first, then fetch specific sections
- **\`project_outline\`** — Get a condensed project tree with language tags
- **\`memory_recall\`** — Search past session summaries

### Workflow

1. Start with \`project_outline\` for a new task
2. Use \`semantic_search\` to find relevant code before reading files
3. Use \`smart_read filepath\` to see a file's outline before fetching specific sections
4. Re-index after large changes: \`ccto index --incremental\`
`;

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');
    writeFileSync(claudeMdPath, `${existing}\n${cctoSection}`, 'utf-8');
  } else {
    writeFileSync(claudeMdPath, `# CLAUDE.md\n${cctoSection}`, 'utf-8');
  }
  console.log(chalk.green('  ✓ Updated CLAUDE.md with CCTO section'));
}
