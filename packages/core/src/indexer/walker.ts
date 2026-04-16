import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  type CctoConfig,
  DEFAULT_EXCLUDE,
  MAX_FILE_SIZE_BYTES,
  detectLanguage,
} from '@ccto/shared';
import fg from 'fast-glob';
import ignore from 'ignore';

export interface WalkerFile {
  filepath: string;
  source: string;
  language: ReturnType<typeof detectLanguage>;
}

/**
 * Walk project files matching the config, respecting .gitignore.
 * Yields one file at a time via async generator.
 */
export async function* walkProject(
  projectRoot: string,
  config: Partial<CctoConfig> = {},
): AsyncGenerator<WalkerFile> {
  const include = config.include ?? ['**/*'];
  const exclude = [...(config.exclude ?? DEFAULT_EXCLUDE)];
  const maxSize = config.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;

  // Load .gitignore rules
  const ig = ignore();
  try {
    const gitignorePath = join(projectRoot, '.gitignore');
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
  } catch {
    // No .gitignore — that's fine
  }

  const entries = await fg(include, {
    cwd: projectRoot,
    ignore: exclude,
    dot: false,
    onlyFiles: true,
    absolute: false,
  });

  for (const relPath of entries) {
    // Check .gitignore
    if (ig.ignores(relPath)) continue;

    const filepath = join(projectRoot, relPath);

    // Check file size
    try {
      const stat = statSync(filepath);
      if (stat.size > maxSize) continue;
    } catch {
      continue;
    }

    // Read source
    let source: string;
    try {
      source = readFileSync(filepath, 'utf-8');
    } catch {
      continue;
    }

    const language = detectLanguage(filepath);

    yield { filepath, source, language };
  }
}
