#!/usr/bin/env node
import { resolve } from 'node:path';
import { startServer } from './server.js';

const projectRoot = process.env.CCTO_PROJECT_ROOT ?? resolve(process.cwd());

startServer(projectRoot).catch((err) => {
  console.error('[ccto-mcp] Fatal error:', err);
  process.exit(1);
});

export { createServer, startServer } from './server.js';
