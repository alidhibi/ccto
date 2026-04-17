import { createInterface } from 'node:readline';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { isIndexed, recordBypass } from '@ccto/core';

interface MetricsOptions {
  projectRoot?: string;
}

/**
 * Called by the PreToolUse hook on "Read" tool calls.
 * Reads stdin JSON payload, checks if the target file is indexed,
 * and records a bypass if so.
 */
export async function runMetricsTrackBypass(options: MetricsOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  try {
    let raw = '';
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      raw += line;
    }
    if (!raw.trim()) return;

    const payload = JSON.parse(raw) as {
      tool_input?: { file_path?: string };
    };
    const filepath = payload?.tool_input?.file_path;
    if (!filepath) return;

    if (!isIndexed(projectRoot, filepath)) return;

    // Estimate how many tokens the full read will consume
    let estimatedTokens = 0;
    try {
      const size = statSync(filepath).size;
      estimatedTokens = Math.ceil(size / 4);
    } catch {
      estimatedTokens = 500; // fallback estimate
    }

    recordBypass(projectRoot, filepath, estimatedTokens);
  } catch {
    // Hooks must not block Claude — silently swallow all errors
  }
}
