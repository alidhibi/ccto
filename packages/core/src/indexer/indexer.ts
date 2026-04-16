import type { CctoConfig, Chunk, FileOutline, IndexResult } from '@ccto/shared';
import { chunkFromTree } from './chunker.js';
import { extractOutline } from './outline.js';
import { parseSource } from './parser.js';
import { walkProject } from './walker.js';

export interface IndexCallbacks {
  onFile?: (filepath: string) => void;
  onError?: (filepath: string, err: unknown) => void;
}

/**
 * Index all files in a project: parse, chunk, and return chunks + outlines.
 */
export async function indexProject(
  projectRoot: string,
  config: Partial<CctoConfig> = {},
  callbacks: IndexCallbacks = {},
): Promise<{ chunks: Chunk[]; outlines: FileOutline[]; result: IndexResult }> {
  const allChunks: Chunk[] = [];
  const allOutlines: FileOutline[] = [];
  let indexed = 0;
  let skipped = 0;
  let errors = 0;
  const start = Date.now();

  for await (const file of walkProject(projectRoot, config)) {
    callbacks.onFile?.(file.filepath);

    try {
      const tree = await parseSource(file.source, file.language);
      const chunks = chunkFromTree(tree, file.source, file.filepath, file.language);

      if (chunks.length === 0) {
        skipped++;
        continue;
      }

      allChunks.push(...chunks);

      if (tree) {
        const outline = extractOutline(tree, file.source, file.filepath, file.language);
        if (outline.entries.length > 0) {
          allOutlines.push(outline);
        }
      }

      indexed++;
    } catch (err) {
      errors++;
      callbacks.onError?.(file.filepath, err);
    }
  }

  return {
    chunks: allChunks,
    outlines: allOutlines,
    result: {
      indexed,
      skipped,
      errors,
      durationMs: Date.now() - start,
    },
  };
}

/**
 * Get the outline of a single file.
 */
export async function getOutline(filepath: string): Promise<FileOutline | null> {
  const { readFileSync } = await import('node:fs');
  const { detectLanguage } = await import('@ccto/shared');

  let source: string;
  try {
    source = readFileSync(filepath, 'utf-8');
  } catch {
    return null;
  }

  const language = detectLanguage(filepath);
  const tree = await parseSource(source, language);
  if (!tree) return null;

  return extractOutline(tree, source, filepath, language);
}

/**
 * Chunk a single file into semantic chunks.
 */
export async function chunkFile(filepath: string): Promise<Chunk[]> {
  const { readFileSync } = await import('node:fs');
  const { detectLanguage } = await import('@ccto/shared');

  let source: string;
  try {
    source = readFileSync(filepath, 'utf-8');
  } catch {
    return [];
  }

  const language = detectLanguage(filepath);
  const tree = await parseSource(source, language);
  return chunkFromTree(tree, source, filepath, language);
}
