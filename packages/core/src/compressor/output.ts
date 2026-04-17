/** Output type detected from command and stdout content */
export type OutputType = 'test' | 'build' | 'log';

/** Result of a compression operation */
export interface CompressResult {
  compressed: string;
  outputType: OutputType;
  originalBytes: number;
  compressedBytes: number;
}

// ─── Detection ────────────────────────────────────────────────────────────────

const TEST_CMD = /\b(jest|vitest|mocha|jasmine|ava|tap|playwright|cypress|karma)\b/i;
const TEST_NPM = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/i;

const BUILD_CMD =
  /\b(tsc|tsup|webpack|vite|rollup|esbuild|parcel|turbo|swc|babel)\b/i;
const BUILD_NPM = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b/i;

const TEST_STDOUT = /(\s✓|\sPASS\s|\sFAIL\s|\s✗|\bTest Files\b|\bTests:\s|\bpassed\b.*\bfailed\b)/;
const BUILD_STDOUT = /\b(error TS\d|error\[|\bBuild (success|failed)\b|webpack compiled|vite built)/i;

/**
 * Detect the type of output based on the command and stdout content.
 * @param cmd - The command that was run
 * @param stdout - The stdout output of the command
 * @returns Detected output type
 */
export function detectOutputType(cmd: string, stdout: string): OutputType {
  if (TEST_CMD.test(cmd) || TEST_NPM.test(cmd)) return 'test';
  if (BUILD_CMD.test(cmd) || BUILD_NPM.test(cmd)) return 'build';
  if (TEST_STDOUT.test(stdout)) return 'test';
  if (BUILD_STDOUT.test(stdout)) return 'build';
  return 'log';
}

// ─── Test output compressor ───────────────────────────────────────────────────

// Vitest: " ✓ file.ts (N tests) Xms" / " ✗ file.ts ..."
// Jest:   "PASS src/foo.test.ts" / "FAIL src/bar.test.ts"
const PASS_LINE = /^(\s*✓\s|PASS\s)/;
const FAIL_START = /^(\s*✗\s|FAIL\s|\s*×\s)/;
// Summary block at the end (vitest / jest)
const SUMMARY_LINE =
  /\b(Test Files|Tests:|Tests\s|Start at|Duration|Test Suites:|Snapshots:|Ran all|Finished in|passed|failed)\b/i;
// ANSI stripping
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * Compress test runner output (jest / vitest / mocha).
 * Passing test lines are collapsed into a count; failures are kept verbatim.
 * @param stdout - Raw test runner output
 * @returns Compression result
 */
export function compressTestOutput(stdout: string): CompressResult {
  const originalBytes = Buffer.byteLength(stdout);

  const raw = stdout.replace(ANSI, '');
  const lines = raw.split('\n');

  if (lines.length <= 12) {
    return { compressed: stdout, outputType: 'test', originalBytes, compressedBytes: originalBytes };
  }

  const output: string[] = [];
  let passCount = 0;
  let inFailBlock = false;
  let inSummary = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Blank line ends a failure block
    if (trimmed === '' && inFailBlock) {
      inFailBlock = false;
      output.push('');
      continue;
    }

    // Summary section — always keep
    if (SUMMARY_LINE.test(trimmed)) {
      inSummary = true;
    }

    if (inSummary) {
      output.push(line);
      continue;
    }

    // Failure block — keep verbatim
    if (inFailBlock) {
      output.push(line);
      continue;
    }

    // Start of a failure
    if (FAIL_START.test(line)) {
      if (passCount > 0) {
        output.push(`  [${passCount} passing test file${passCount > 1 ? 's' : ''} omitted]`);
        passCount = 0;
      }
      output.push(line);
      inFailBlock = true;
      continue;
    }

    // Passing test line — count, don't emit
    if (PASS_LINE.test(line)) {
      passCount++;
      continue;
    }

    // Anything else: emit directly
    if (passCount > 0) {
      output.push(`  [${passCount} passing test file${passCount > 1 ? 's' : ''} omitted]`);
      passCount = 0;
    }
    output.push(line);
  }

  if (passCount > 0) {
    output.push(`  [${passCount} passing test file${passCount > 1 ? 's' : ''} omitted]`);
  }

  const compressed = output.join('\n').trimEnd();
  return {
    compressed,
    outputType: 'test',
    originalBytes,
    compressedBytes: Buffer.byteLength(compressed),
  };
}

// ─── Build output compressor ──────────────────────────────────────────────────

const ERROR_LINE = /\b(error|Error)\b/;
const WARNING_LINE = /\b(warning|warn|Warning)\b/i;
// Lines that are pure progress noise (file sizes, "Building entry:", etc.)
const NOISE_LINE = /^(CLI |ESM |CJS |DTS |\s*(Building|Cleaning|Using|Target))/;
const BUILD_SUMMARY = /\b(success|failed|complete|done|built|compiled|⚡|✓|error TS\d|Build success|Build failed)\b/i;

/**
 * Compress build tool output (tsc, tsup, webpack, vite, etc.).
 * Keeps only errors, warnings, and the final summary lines.
 * @param stdout - Raw build tool output
 * @returns Compression result
 */
export function compressBuildOutput(stdout: string): CompressResult {
  const originalBytes = Buffer.byteLength(stdout);

  const raw = stdout.replace(ANSI, '');
  const lines = raw.split('\n');

  if (lines.length <= 8) {
    return { compressed: stdout, outputType: 'build', originalBytes, compressedBytes: originalBytes };
  }

  const kept: string[] = [];
  const lastN = 6;

  // Identify the tail (final summary lines)
  const tailStart = Math.max(0, lines.length - lastN);

  for (let i = 0; i < tailStart; i++) {
    const line = lines[i] ?? '';
    const plain = line.replace(ANSI, '').trim();
    if (!plain) continue;
    if (NOISE_LINE.test(plain)) continue;
    if (ERROR_LINE.test(plain) || WARNING_LINE.test(plain) || BUILD_SUMMARY.test(plain)) {
      kept.push(line);
    }
  }

  // Always keep the tail
  const tail = lines.slice(tailStart).filter((l) => l.trim() !== '');

  const all = [...kept, ...(kept.length ? [''] : []), ...tail];
  const compressed = all.join('\n').trimEnd();

  return {
    compressed,
    outputType: 'build',
    originalBytes,
    compressedBytes: Buffer.byteLength(compressed),
  };
}

// ─── Log output compressor ────────────────────────────────────────────────────

/**
 * Compress arbitrary log/command output by keeping head + tail.
 * @param stdout - Raw output
 * @param maxLines - Maximum total lines to keep (split equally between head and tail)
 * @returns Compression result
 */
export function compressLogOutput(stdout: string, maxLines = 50): CompressResult {
  const originalBytes = Buffer.byteLength(stdout);
  const lines = stdout.split('\n');

  if (lines.length <= maxLines) {
    return { compressed: stdout, outputType: 'log', originalBytes, compressedBytes: originalBytes };
  }

  const half = Math.floor(maxLines / 2);
  const head = lines.slice(0, half);
  const tail = lines.slice(-half);
  const truncated = lines.length - maxLines;

  const compressed = [
    ...head,
    ``,
    `... ${truncated} lines truncated ...`,
    ``,
    ...tail,
  ].join('\n');

  return {
    compressed,
    outputType: 'log',
    originalBytes,
    compressedBytes: Buffer.byteLength(compressed),
  };
}

// ─── Unified entry point ──────────────────────────────────────────────────────

/**
 * Detect output type and apply the appropriate compressor.
 * @param cmd - The command that produced the output
 * @param stdout - Raw stdout/stderr content
 * @param maxLogLines - Max lines for log-type fallback
 * @returns Compression result with type, original and compressed sizes
 */
export function compressOutputByType(
  cmd: string,
  stdout: string,
  maxLogLines = 50,
): CompressResult {
  const type = detectOutputType(cmd, stdout);
  switch (type) {
    case 'test':
      return compressTestOutput(stdout);
    case 'build':
      return compressBuildOutput(stdout);
    default:
      return compressLogOutput(stdout, maxLogLines);
  }
}
