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
    .describe(
      'Symbol name to fetch (e.g. "handleRequest", "UserService"). Use `lines` for line ranges.',
    ),
  lines: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .optional()
    .describe('Exact line range to fetch, e.g. [10, 50]'),
});

export type SmartReadInput = z.infer<typeof SmartReadInput>;

/**
 * Read a file token-efficiently: MANDATORY for any file over 200 lines.
 *
 * Always returns the file outline first. If `section` or `lines` is specified,
 * appends the requested code block after the outline.
 *
 * Examples:
 *   smart_read({ filepath: "/src/server.ts" })
 *     → outline of all symbols (saves ~80% tokens vs full read)
 *
 *   smart_read({ filepath: "/src/server.ts", section: "createServer" })
 *     → outline + the full body of `createServer`
 *
 *   smart_read({ filepath: "/src/server.ts", lines: [84, 133] })
 *     → outline + lines 84–133
 *
 * @param input - Validated smart read parameters
 * @returns Outline (always) + requested section, plus call metrics
 */
export async function smartRead(input: SmartReadInput): Promise<{
  text: string;
  metrics: CallMetrics;
}> {
  const start = Date.now();

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
  const lang = detectLanguage(input.filepath);
  const totalLines = fullSource.split('\n').length;

  // Build the outline block (always included)
  const outline = await getOutline(input.filepath);
  let outlineBlock: string;

  if (!outline || outline.entries.length === 0) {
    // Unsupported language: fall back to full content when no section requested
    if (!input.section && !input.lines) {
      const text = `**${input.filepath}** (full — no outline available)\n\`\`\`${lang}\n${fullSource}\n\`\`\``;
      return { text, metrics: makeMetrics(fullTokens, estimateTokens(text), start) };
    }
    outlineBlock = `**${input.filepath}** — no outline available (${totalLines} lines)`;
  } else {
    const sigLines = outline.entries
      .map((e) => `  ${e.startLine}: [${e.kind}] ${e.signature}`)
      .join('\n');
    outlineBlock = [
      `**${input.filepath}** — outline (${outline.entries.length} symbols, ${totalLines} lines)`,
      `\`\`\`${lang}`,
      sigLines,
      '```',
    ].join('\n');
  }

  // No section requested — outline only
  if (!input.section && !input.lines) {
    const text = [
      outlineBlock,
      '',
      '_Use `smart_read` with `section: "symbolName"` or `lines: [start, end]` to fetch a specific part._',
    ].join('\n');
    return { text, metrics: makeMetrics(fullTokens, estimateTokens(text), start) };
  }

  // Resolve the requested section
  let sectionBlock = '';

  if (input.lines) {
    const [from, to] = input.lines;
    const content = fullSource
      .split('\n')
      .slice(from - 1, to)
      .join('\n');
    sectionBlock = [
      `\n**Section: lines ${from}–${to}**`,
      `\`\`\`${lang}`,
      content,
      '```',
    ].join('\n');
  } else if (input.section) {
    // Try line range string for backwards compat (e.g. "10-50")
    const lineRangeMatch = input.section.match(/^(\d+)-(\d+)$/);
    if (lineRangeMatch?.[1] && lineRangeMatch[2]) {
      const from = Number.parseInt(lineRangeMatch[1], 10);
      const to = Number.parseInt(lineRangeMatch[2], 10);
      const content = fullSource
        .split('\n')
        .slice(from - 1, to)
        .join('\n');
      sectionBlock = [
        `\n**Section: lines ${from}–${to}**`,
        `\`\`\`${lang}`,
        content,
        '```',
      ].join('\n');
    } else {
      // Symbol name lookup
      const chunks = await chunkFile(input.filepath);
      const match = chunks.find(
        (c) =>
          c.name === input.section || c.name.toLowerCase() === input.section?.toLowerCase(),
      );
      if (match) {
        sectionBlock = [
          `\n**Section: ${match.kind} \`${match.name}\`** (lines ${match.startLine}–${match.endLine})`,
          `\`\`\`${lang}`,
          match.content,
          '```',
        ].join('\n');
      } else {
        sectionBlock = `\n_Symbol "${input.section}" not found. Use the outline above to pick a valid name._`;
      }
    }
  }

  const text = outlineBlock + sectionBlock;
  return { text, metrics: makeMetrics(fullTokens, estimateTokens(text), start) };
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
