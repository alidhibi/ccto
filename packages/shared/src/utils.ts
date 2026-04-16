import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { EXT_TO_LANG } from './constants.js';
import type { Language } from './types.js';

/**
 * Compute the SHA-256 hash of a string.
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Detect the programming language from a file path by extension.
 */
export function detectLanguage(filepath: string): Language {
  const ext = extname(filepath).toLowerCase();
  return (EXT_TO_LANG[ext] as Language | undefined) ?? 'unknown';
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 chars).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format bytes to a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
