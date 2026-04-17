import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BYPASSES_FILE,
  CCTO_DIR,
  type BypassRecord,
  type CallMetrics,
  METRICS_FILE,
  estimateTokens,
} from '@ccto/shared';

/**
 * Append a metrics record for a single MCP tool call.
 */
export async function recordMetrics(projectRoot: string, metrics: CallMetrics): Promise<void> {
  const path = join(projectRoot, CCTO_DIR, METRICS_FILE);
  const records: CallMetrics[] = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf-8')) as CallMetrics[])
    : [];
  records.push(metrics);
  writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`, 'utf-8');
}

/**
 * Compute total tokens saved across all recorded calls.
 */
export function getTotalSaved(projectRoot: string): number {
  const path = join(projectRoot, CCTO_DIR, METRICS_FILE);
  if (!existsSync(path)) return 0;
  const records = JSON.parse(readFileSync(path, 'utf-8')) as CallMetrics[];
  return records.reduce((sum, r) => sum + r.savedTokens, 0);
}

/**
 * Record a detected native-Read bypass on an already-indexed file.
 * @param projectRoot - Absolute path to the project root
 * @param filepath - The file that was read natively
 * @param estimatedTokens - Estimated tokens consumed by the full read
 */
export function recordBypass(
  projectRoot: string,
  filepath: string,
  estimatedTokens: number,
): void {
  const path = join(projectRoot, CCTO_DIR, BYPASSES_FILE);
  const records: BypassRecord[] = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf-8')) as BypassRecord[])
    : [];
  records.push({ filepath, estimatedTokens, timestamp: new Date().toISOString() });
  writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`, 'utf-8');
}

/**
 * Aggregate bypass statistics.
 * @param projectRoot - Absolute path to the project root
 * @returns Total bypassed tokens and bypass count
 */
export function getBypassStats(
  projectRoot: string,
): { totalBypassedTokens: number; bypassCount: number } {
  const path = join(projectRoot, CCTO_DIR, BYPASSES_FILE);
  if (!existsSync(path)) return { totalBypassedTokens: 0, bypassCount: 0 };
  const records = JSON.parse(readFileSync(path, 'utf-8')) as BypassRecord[];
  return {
    totalBypassedTokens: records.reduce((s, r) => s + r.estimatedTokens, 0),
    bypassCount: records.length,
  };
}

export { estimateTokens };
