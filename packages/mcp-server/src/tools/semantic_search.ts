import { embed } from '@ccto/core';
import { search } from '@ccto/core';
import { estimateTokens } from '@ccto/shared';
import type { CallMetrics } from '@ccto/shared';
import { z } from 'zod';

export const SemanticSearchInput = z.object({
  query: z.string().describe('Natural language or code query to search for'),
  k: z.number().int().min(1).max(20).default(5).describe('Number of results to return'),
  lang: z.string().optional().describe('Filter by language (e.g. typescript, python)'),
  path: z.string().optional().describe('Glob pattern to filter by file path'),
});

export type SemanticSearchInput = z.infer<typeof SemanticSearchInput>;

export async function semanticSearch(
  projectRoot: string,
  input: SemanticSearchInput,
): Promise<{ text: string; metrics: CallMetrics }> {
  const start = Date.now();

  const [queryEmbedding] = await embed([input.query]);
  if (!queryEmbedding) {
    return {
      text: 'No embedding generated for query.',
      metrics: makeMetrics('semantic_search', 0, 0, start),
    };
  }

  const results = search(projectRoot, queryEmbedding, input.k, {
    lang: input.lang,
    pathGlob: input.path,
  });

  if (results.length === 0) {
    return {
      text: 'No results found.',
      metrics: makeMetrics('semantic_search', 0, 0, start),
    };
  }

  const lines: string[] = [];
  let totalServedTokens = 0;
  let totalOriginalTokens = 0;

  for (const { chunk, score } of results) {
    const header = `### ${chunk.filepath}:${chunk.startLine}-${chunk.endLine} (${chunk.kind}${chunk.name ? `: ${chunk.name}` : ''}) [score: ${score.toFixed(3)}]`;
    const body = chunk.content;
    lines.push(header, `\`\`\`${chunk.language}`, body, '```', '');
    totalServedTokens += estimateTokens(header + body);
    totalOriginalTokens += estimateTokens(body) * 3; // estimate of full-file context saved
  }

  const text = lines.join('\n');
  return {
    text,
    metrics: makeMetrics('semantic_search', totalOriginalTokens, totalServedTokens, start),
  };
}

function makeMetrics(
  tool: string,
  tokensRequested: number,
  tokensServed: number,
  _start: number,
): CallMetrics {
  return {
    tool,
    tokensRequested,
    tokensServed,
    savedTokens: Math.max(0, tokensRequested - tokensServed),
    timestamp: new Date().toISOString(),
  };
}
