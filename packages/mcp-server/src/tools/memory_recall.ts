import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CCTO_DIR, MEMORY_FILE } from '@ccto/shared';
import type { CallMetrics, MemoryEntry } from '@ccto/shared';
import { z } from 'zod';

export const MemoryRecallInput = z.object({
  query: z.string().describe('Search query to find relevant memories'),
  limit: z.number().int().min(1).max(20).default(5).describe('Max number of results'),
});

export type MemoryRecallInput = z.infer<typeof MemoryRecallInput>;

/**
 * Search persistent session memory for relevant entries.
 * Phase 2 stub — does simple text matching until full semantic memory is implemented.
 */
export async function memoryRecall(
  projectRoot: string,
  input: MemoryRecallInput,
): Promise<{ text: string; metrics: CallMetrics }> {
  const memoryPath = join(projectRoot, CCTO_DIR, MEMORY_FILE);

  const metrics: CallMetrics = {
    tool: 'memory_recall',
    tokensRequested: 0,
    tokensServed: 0,
    savedTokens: 0,
    timestamp: new Date().toISOString(),
  };

  if (!existsSync(memoryPath)) {
    return {
      text: '_No session memory found. Run `ccto init` to enable memory persistence._',
      metrics,
    };
  }

  let entries: MemoryEntry[] = [];
  try {
    entries = JSON.parse(readFileSync(memoryPath, 'utf-8')) as MemoryEntry[];
  } catch {
    return { text: '_Failed to read memory file._', metrics };
  }

  const queryLower = input.query.toLowerCase();
  const matches = entries
    .filter(
      (e) =>
        e.summary.toLowerCase().includes(queryLower) ||
        e.tags.some((t) => t.toLowerCase().includes(queryLower)),
    )
    .slice(0, input.limit);

  if (matches.length === 0) {
    return { text: `_No memories matching "${input.query}"._`, metrics };
  }

  const lines = matches.map(
    (e) => `**[${e.timestamp}]** ${e.summary}${e.tags.length ? ` (${e.tags.join(', ')})` : ''}`,
  );

  const text = `### Memories matching "${input.query}"\n\n${lines.join('\n\n')}`;
  metrics.tokensServed = Math.ceil(text.length / 4);

  return { text, metrics };
}
