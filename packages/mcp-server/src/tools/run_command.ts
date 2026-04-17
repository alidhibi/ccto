import { compressOutputByType } from '@ccto/core';
import type { CallMetrics } from '@ccto/shared';
import { estimateTokens } from '@ccto/shared';
import { execa } from 'execa';
import { z } from 'zod';

export const RunCommandInput = z.object({
  command: z.string().describe('Shell command to execute (e.g. "pnpm test", "tsc --noEmit")'),
  cwd: z.string().optional().describe('Working directory (default: project root)'),
  timeout: z
    .number()
    .int()
    .positive()
    .default(30_000)
    .describe('Timeout in milliseconds (default: 30 000)'),
});

export type RunCommandInput = z.infer<typeof RunCommandInput>;

/**
 * Execute a shell command and return compressed output.
 *
 * Automatically detects output type (test/build/log) and applies the
 * appropriate compressor to reduce token consumption by 50–90%.
 *
 * @param projectRoot - Absolute path to the project root (used as default cwd)
 * @param input - Validated command parameters
 * @returns Compressed output with exit code and call metrics
 */
export async function runCommand(
  projectRoot: string,
  input: RunCommandInput,
): Promise<{ text: string; metrics: CallMetrics }> {
  const start = Date.now();
  const cwd = input.cwd ?? projectRoot;

  const metrics: CallMetrics = {
    tool: 'run_command',
    tokensRequested: 0,
    tokensServed: 0,
    savedTokens: 0,
    timestamp: new Date().toISOString(),
  };

  let rawOutput = '';
  let exitCode = 0;

  try {
    const result = await execa(input.command, {
      shell: true,
      cwd,
      timeout: input.timeout,
      reject: false,
      all: true,
    });

    rawOutput = result.all ?? result.stdout ?? '';
    if (result.stderr && result.stderr !== result.all) {
      rawOutput = rawOutput ? `${rawOutput}\n${result.stderr}` : result.stderr;
    }
    exitCode = result.exitCode ?? 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    rawOutput = message;
    exitCode = 1;
  }

  const { compressed, outputType, originalBytes, compressedBytes } = compressOutputByType(
    input.command,
    rawOutput,
  );

  const originalTokens = Math.ceil(originalBytes / 4);
  const compressedTokens = estimateTokens(compressed);
  const durationMs = Date.now() - start;

  metrics.tokensRequested = originalTokens;
  metrics.tokensServed = compressedTokens;
  metrics.savedTokens = Math.max(0, originalTokens - compressedTokens);

  const bytesSaved = originalBytes - compressedBytes;
  const pct = originalBytes > 0 ? Math.round((bytesSaved / originalBytes) * 100) : 0;

  const header = [
    `\`${input.command}\` — exit ${exitCode} — ${durationMs}ms — type: ${outputType}`,
    `Compression: ${originalBytes}B → ${compressedBytes}B (${pct}% saved, ${metrics.savedTokens} tokens)`,
    '',
  ].join('\n');

  const text = header + compressed;

  return { text, metrics };
}
