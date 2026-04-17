import { searchSessions } from '@ccto/core';
import type { CallMetrics } from '@ccto/shared';
import { z } from 'zod';

export const MemoryRecallInput = z.object({
  query: z.string().describe('Search query to find relevant memories'),
  limit: z.number().int().min(1).max(20).default(5).describe('Max number of results'),
});

export type MemoryRecallInput = z.infer<typeof MemoryRecallInput>;

/**
 * Search persistent session memory for relevant entries.
 * @param projectRoot - Absolute path to the project root
 * @param input - Validated search parameters
 * @returns Compact session context (<500 tokens) and call metrics
 */
export async function memoryRecall(
  projectRoot: string,
  input: MemoryRecallInput,
): Promise<{ text: string; metrics: CallMetrics }> {
  const metrics: CallMetrics = {
    tool: 'memory_recall',
    tokensRequested: 0,
    tokensServed: 0,
    savedTokens: 0,
    timestamp: new Date().toISOString(),
  };

  let matches;
  try {
    matches = searchSessions(projectRoot, input.query, input.limit);
  } catch {
    return {
      text: '_No session memory found. Run `ccto init` to enable memory persistence._',
      metrics,
    };
  }

  if (matches.length === 0) {
    return { text: `_No memories matching "${input.query}"._`, metrics };
  }

  const lines = matches.map((e) => {
    const date = e.timestamp.slice(0, 16).replace('T', ' ');
    const filesNote =
      e.filesTouched.length > 0
        ? `Files: ${e.filesTouched.slice(0, 5).join(', ')}${e.filesTouched.length > 5 ? ` +${e.filesTouched.length - 5} more` : ''}`
        : '';
    const tagsNote = e.tags.length > 0 ? `Tags: ${e.tags.join(', ')}` : '';
    const meta = [filesNote, tagsNote].filter(Boolean).join(' | ');
    return `**[${date}]** ${e.summary}${meta ? `\n  ${meta}` : ''}`;
  });

  const text = `### Session memory: "${input.query}"\n\n${lines.join('\n\n')}`;

  metrics.tokensServed = Math.ceil(text.length / 4);

  return { text, metrics };
}
