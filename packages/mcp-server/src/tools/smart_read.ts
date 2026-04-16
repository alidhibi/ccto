import { readFileSync } from 'node:fs';
import { chunkFile, getOutline } from '@ccto/core';
import { detectLanguage, estimateTokens } from '@ccto/shared';
import type { CallMetrics } from '@ccto/shared';
import { z } from 'zod';

export const SmartReadInput = z.object({
  filepath: z.string().describe('Absolute path to the file to read'),
  section: z
    .string()
    .optional()
    .describe('Symbol name or line range (e.g. "myFunction" or "10-50") to fetch'),
});

export type SmartReadInput = z.infer<typeof SmartReadInput>;

export async function smartRead(input: SmartReadInput): Promise<{
  text: string;
  metrics: CallMetrics;
}> {
  const start = Date.now();

  // Read full file to compute baseline token count
  let fullSource = '';
  try {
    fullSource = readFileSync(input.filepath, 'utf-8');
  } catch {
    return {
      text: `Error: cannot read file ${input.filepath}`,
      metrics: makeMetrics(estimateTokens(input.filepath), 0, start),
    };
  }

  const fullTokens = estimateTokens(fullSource);

  // If a specific section is requested, return only that
  if (input.section) {
    const lineRangeMatch = input.section.match(/^(\d+)-(\d+)$/);
    if (lineRangeMatch?.[1] && lineRangeMatch[2]) {
      const from = Number.parseInt(lineRangeMatch[1], 10);
      const to = Number.parseInt(lineRangeMatch[2], 10);
      const lines = fullSource.split('\n').slice(from - 1, to);
      const content = lines.join('\n');
      const lang = detectLanguage(input.filepath);
      const text = `**${input.filepath}:${from}-${to}**\n\`\`\`${lang}\n${content}\n\`\`\``;
      return {
        text,
        metrics: makeMetrics(fullTokens, estimateTokens(text), start),
      };
    }

    // Symbol name lookup — find matching chunk
    const chunks = await chunkFile(input.filepath);
    const match = chunks.find(
      (c) => c.name === input.section || c.name.toLowerCase() === input.section?.toLowerCase(),
    );
    if (match) {
      const lang = detectLanguage(input.filepath);
      const text = `**${input.filepath}:${match.startLine}-${match.endLine}** (${match.kind}: ${match.name})\n\`\`\`${lang}\n${match.content}\n\`\`\``;
      return {
        text,
        metrics: makeMetrics(fullTokens, estimateTokens(text), start),
      };
    }
  }

  // Default: return the file outline (signatures only)
  const outline = await getOutline(input.filepath);
  if (!outline || outline.entries.length === 0) {
    // Unsupported language — return full content
    const lang = detectLanguage(input.filepath);
    const text = `**${input.filepath}** (full)\n\`\`\`${lang}\n${fullSource}\n\`\`\``;
    return {
      text,
      metrics: makeMetrics(fullTokens, estimateTokens(text), start),
    };
  }

  const lang = detectLanguage(input.filepath);
  const outlineText = outline.entries
    .map((e) => `  ${e.startLine}: [${e.kind}] ${e.signature}`)
    .join('\n');

  const text = [
    `**${input.filepath}** — outline (${outline.entries.length} symbols, ${fullSource.split('\n').length} lines)`,
    `\`\`\`${lang}`,
    outlineText,
    '```',
    '',
    '_Use `smart_read` with `section: "symbolName"` or `section: "10-50"` to fetch a specific part._',
  ].join('\n');

  return {
    text,
    metrics: makeMetrics(fullTokens, estimateTokens(text), start),
  };
}

function makeMetrics(tokensRequested: number, tokensServed: number, _start: number): CallMetrics {
  return {
    tool: 'smart_read',
    tokensRequested,
    tokensServed,
    savedTokens: Math.max(0, tokensRequested - tokensServed),
    timestamp: new Date().toISOString(),
  };
}
