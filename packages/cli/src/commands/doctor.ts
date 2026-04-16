import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CCTO_DIR, CONFIG_FILE, DB_FILE, MODELS_DIR } from '@ccto/shared';
import chalk from 'chalk';

interface DoctorOptions {
  projectRoot?: string;
}

type CheckStatus = 'ok' | 'warn' | 'error';
interface Check {
  label: string;
  status: CheckStatus;
  detail: string;
}

const icons: Record<CheckStatus, string> = { ok: '✓', warn: '⚠', error: '✗' };
const colors: Record<CheckStatus, chalk.Chalk> = {
  ok: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
};

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const checks: Check[] = [];

  // Node version
  const nodeVersion = process.version;
  const major = Number.parseInt(nodeVersion.slice(1));
  checks.push({
    label: 'Node.js version',
    status: major >= 20 ? 'ok' : 'error',
    detail: nodeVersion + (major < 20 ? ' (requires >=20)' : ''),
  });

  // .ccto/config.json
  const configPath = join(projectRoot, CCTO_DIR, CONFIG_FILE);
  checks.push({
    label: '.ccto/config.json',
    status: existsSync(configPath) ? 'ok' : 'warn',
    detail: existsSync(configPath) ? 'found' : 'not found (run `ccto init`)',
  });

  // .ccto/index.db
  const dbPath = join(projectRoot, CCTO_DIR, DB_FILE);
  checks.push({
    label: '.ccto/index.db',
    status: existsSync(dbPath) ? 'ok' : 'warn',
    detail: existsSync(dbPath) ? 'found' : 'not found (run `ccto init`)',
  });

  // Claude Code .claude/settings.json
  const settingsPath = join(projectRoot, '.claude', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
      const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
      const hasCcto = mcpServers?.ccto !== undefined;
      checks.push({
        label: 'MCP server registered',
        status: hasCcto ? 'ok' : 'warn',
        detail: hasCcto ? 'ccto-mcp in .claude/settings.json' : 'not registered (run `ccto init`)',
      });
    } catch {
      checks.push({
        label: 'MCP server registered',
        status: 'warn',
        detail: 'cannot read .claude/settings.json',
      });
    }
  } else {
    checks.push({
      label: 'MCP server registered',
      status: 'warn',
      detail: '.claude/settings.json not found (run `ccto init`)',
    });
  }

  // Model cache
  checks.push({
    label: 'Embeddings model cache',
    status: existsSync(MODELS_DIR) ? 'ok' : 'warn',
    detail: existsSync(MODELS_DIR) ? MODELS_DIR : 'not downloaded yet (will download on first use)',
  });

  // better-sqlite3 native binding (tested via @ccto/core)
  try {
    const { openDb, resetDb } = await import('@ccto/core');
    const tmpDir = join(tmpdir(), `ccto-doctor-test-${Date.now()}`);
    mkdirSync(join(tmpDir, '.ccto'), { recursive: true });
    openDb(tmpDir);
    resetDb();
    rmSync(tmpDir, { recursive: true, force: true });
    checks.push({ label: 'better-sqlite3 native', status: 'ok', detail: 'loaded' });
  } catch (err) {
    checks.push({
      label: 'better-sqlite3 native',
      status: 'error',
      detail: `not available: ${err instanceof Error ? (err.message.split('\n')[0] ?? err.message) : String(err)}`,
    });
  }

  // git
  try {
    const gitVersion = execSync('git --version', { encoding: 'utf-8' }).trim();
    checks.push({ label: 'git', status: 'ok', detail: gitVersion });
  } catch {
    checks.push({
      label: 'git',
      status: 'warn',
      detail: 'not found (incremental indexing unavailable)',
    });
  }

  console.log(chalk.bold.cyan('\n  CCTO Doctor\n'));
  for (const check of checks) {
    const icon = icons[check.status];
    const color = colors[check.status];
    console.log(`  ${color(icon)} ${check.label.padEnd(32)} ${chalk.dim(check.detail)}`);
  }

  const hasErrors = checks.some((c) => c.status === 'error');
  const hasWarns = checks.some((c) => c.status === 'warn');
  if (hasErrors) {
    console.log(chalk.red('\n  ✗ Some checks failed. Fix the errors above.\n'));
  } else if (hasWarns) {
    console.log(chalk.yellow('\n  ⚠ Setup incomplete. Run `ccto init` to fix warnings.\n'));
  } else {
    console.log(chalk.green('\n  ✓ Everything looks good!\n'));
  }
}
