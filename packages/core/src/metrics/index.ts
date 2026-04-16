import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CCTO_DIR, type CallMetrics, METRICS_FILE, estimateTokens } from '@ccto/shared';

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

export { estimateTokens };
