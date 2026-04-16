import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Language } from '@ccto/shared';
import Parser from 'web-tree-sitter';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Map language → WASM grammar file name
const GRAMMAR_FILES: Partial<Record<Language, string>> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  jsx: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
  php: 'tree-sitter-php.wasm',
  css: 'tree-sitter-css.wasm',
  bash: 'tree-sitter-bash.wasm',
  sql: 'tree-sitter-sql.wasm',
};

let initialized = false;
const languageCache = new Map<Language, Parser.Language>();

/**
 * Initialize the tree-sitter WASM runtime. Must be called before parsing.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;
  await Parser.init({
    locateFile: (file: string) => join(__dirname, '..', '..', 'grammars', file),
  });
  initialized = true;
}

/**
 * Load a tree-sitter language grammar for the given language.
 * Returns null if no grammar is available (unsupported language).
 */
export async function loadLanguage(lang: Language): Promise<Parser.Language | null> {
  const cached = languageCache.get(lang);
  if (cached) return cached;
  const grammarFile = GRAMMAR_FILES[lang];
  if (!grammarFile) return null;

  try {
    const grammarPath = join(__dirname, '..', '..', 'grammars', grammarFile);
    const language = await Parser.Language.load(grammarPath);
    languageCache.set(lang, language);
    return language;
  } catch {
    return null;
  }
}

/**
 * Parse source code into a tree-sitter Tree.
 * Returns null if the language grammar is unavailable.
 */
export async function parseSource(source: string, lang: Language): Promise<Parser.Tree | null> {
  await initParser();
  const language = await loadLanguage(lang);
  if (!language) return null;

  const parser = new Parser();
  parser.setLanguage(language);
  return parser.parse(source);
}
