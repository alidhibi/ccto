import { resolve } from 'node:path';
import chalk from 'chalk';

interface ServeOptions {
  projectRoot?: string;
}

export async function runServe(options: ServeOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  console.log(chalk.bold.cyan('  Starting ccto MCP server…'));
  console.log(chalk.dim(`  Project root: ${projectRoot}`));
  console.log(chalk.dim('  Transport: stdio'));
  console.log(chalk.dim('  Press Ctrl+C to stop\n'));

  // Dynamically import to avoid circular deps
  const { startServer } = await import('@ccto/mcp-server');
  await startServer(projectRoot);
}
