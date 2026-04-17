import { execSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { embed, indexProject, saveConfig, upsertChunks } from '@ccto/core';
import { CCTO_DIR, type CctoConfig, DEFAULT_CONFIG, formatDuration } from '@ccto/shared';
import chalk from 'chalk';

interface InitOptions {
  projectRoot?: string;
  gitHook?: boolean;
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

  // Register session memory hooks
  registerHooks(projectRoot);

  // Install git post-commit hook if requested
  if (options.gitHook) {
    registerGitHook(projectRoot);
  }

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

function registerHooks(projectRoot: string): void {
  const claudeDir = join(projectRoot, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');
  mkdirSync(claudeDir, { recursive: true });

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {}
  }

  const hooks = (settings.hooks as Record<string, unknown[]> | undefined) ?? {};

  const stopHook = { type: 'command', command: 'ccto memory save-session' };
  const trackHook = { type: 'command', command: 'ccto memory track-file' };

  const stopHooks = (hooks['Stop'] as { matcher: string; hooks: unknown[] }[] | undefined) ?? [];
  if (!stopHooks.some((h) => h.hooks?.some((hh) => (hh as { command?: string }).command === stopHook.command))) {
    stopHooks.push({ matcher: '', hooks: [stopHook] });
  }
  hooks['Stop'] = stopHooks;

  const postHooks = (hooks['PostToolUse'] as { matcher: string; hooks: unknown[] }[] | undefined) ?? [];
  if (!postHooks.some((h) => h.hooks?.some((hh) => (hh as { command?: string }).command === trackHook.command))) {
    postHooks.push({ matcher: 'Edit|Write|MultiEdit', hooks: [trackHook] });
  }
  hooks['PostToolUse'] = postHooks;

  const bypassHook = { type: 'command', command: 'ccto metrics track-bypass' };
  const preHooks = (hooks['PreToolUse'] as { matcher: string; hooks: unknown[] }[] | undefined) ?? [];
  if (!preHooks.some((h) => h.hooks?.some((hh) => (hh as { command?: string }).command === bypassHook.command))) {
    preHooks.push({ matcher: 'Read', hooks: [bypassHook] });
  }
  hooks['PreToolUse'] = preHooks;

  settings.hooks = hooks;
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
  console.log(chalk.green('  ✓ Registered session memory hooks in .claude/settings.json'));
}

function registerGitHook(projectRoot: string): void {
  const gitDir = join(projectRoot, '.git');
  if (!existsSync(gitDir)) {
    console.log(chalk.yellow('  ⚠ No .git directory found — skipping git hook'));
    return;
  }
  const hooksDir = join(gitDir, 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, 'post-commit');

  const hookScript = [
    '#!/usr/bin/env sh',
    '# Added by ccto init --git-hook',
    'ccto index --incremental --quiet &',
  ].join('\n') + '\n';

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf-8');
    if (existing.includes('ccto index')) {
      console.log(chalk.dim('  ↓ git post-commit hook already has ccto, skipping'));
      return;
    }
    writeFileSync(hookPath, `${existing}\n${hookScript}`, 'utf-8');
  } else {
    writeFileSync(hookPath, hookScript, 'utf-8');
  }

  try {
    chmodSync(hookPath, 0o755);
  } catch {
    // Windows — chmod is a no-op, git handles it
  }

  console.log(chalk.green('  ✓ Installed git post-commit hook (.git/hooks/post-commit)'));
}

function generateClaudeMd(projectRoot: string, fileCount: number, symbolCount: number): void {
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');

  // Don't overwrite if it already exists and has content
  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');
    if (existing.includes('Tool Usage Rules (MANDATORY)') || existing.includes('CCTO is active')) {
      console.log(chalk.dim('  ↓ CLAUDE.md already has CCTO section, skipping'));
      return;
    }
  }

  const cctoSection = `
## Tool Usage Rules (MANDATORY)

These rules MUST be followed to avoid wasting tokens:

- **Any file over 200 lines**: ALWAYS use \`smart_read\` — NEVER use \`Read\` directly
- **Any code search**: ALWAYS use \`semantic_search\` BEFORE \`Grep\` or keyword search
- **Tests, builds, long commands**: ALWAYS use \`run_command\` — NEVER use \`Bash\` for these
- **Project overview**: use \`project_outline\` instead of listing multiple directories
- **Session start**: call \`memory_recall\` first to recover prior context and decisions

## CCTO Token Optimization

CCTO is active in this project. ${fileCount} files indexed, ${symbolCount} symbol outlines extracted.

### MCP Tools Available

- **\`semantic_search\`** — Find relevant code by description (e.g. \`semantic_search("authentication middleware")\`). Use BEFORE Grep.
- **\`smart_read\`** — Returns file outline first, then appends a specific section on request. MANDATORY for files >200 lines.
  - \`smart_read({filepath})\` → outline only
  - \`smart_read({filepath, section:"functionName"})\` → outline + function body
  - \`smart_read({filepath, lines:[10,50]})\` → outline + line range
- **\`run_command\`** — MANDATORY for tests/builds. Runs a shell command and returns compressed output (50–90% token savings). Auto-detects test/build/log output type.
  - \`run_command({command:"pnpm test"})\` → compressed test output (failures verbatim + summary)
  - \`run_command({command:"tsc --noEmit"})\` → only errors/warnings + final line
  - \`run_command({command:"pnpm build"})\` → build errors + summary
- **\`project_outline\`** — Condensed project tree with language tags
- **\`memory_recall\`** — Recover past session summaries, file edits, and decisions

### Workflow

1. \`memory_recall("task description")\` — recover prior context
2. \`project_outline\` — orient yourself in the project
3. \`semantic_search("what you need")\` — find relevant code
4. \`smart_read filepath\` — inspect a file's outline before fetching sections
5. Re-index after large changes: \`ccto index --incremental\`
`;

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');
    writeFileSync(claudeMdPath, `${existing}\n${cctoSection}`, 'utf-8');
  } else {
    writeFileSync(claudeMdPath, `# CLAUDE.md\n${cctoSection}`, 'utf-8');
  }
  console.log(chalk.green('  ✓ Updated CLAUDE.md with CCTO section'));
}
