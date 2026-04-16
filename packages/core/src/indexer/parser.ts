import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Language } from '@ccto/shared';
import Parser from 'web-tree-sitter';

const _require = createRequire(import.meta.url);

/**
 * Resolve the directory containing tree-sitter.wasm (from the web-tree-sitter package).
 */
function getTreeSitterDir(): string {
  const pkgPath = _require.resolve('web-tree-sitter');
  return dirname(pkgPath);
}

/**
 * Try to locate a language grammar WASM file from an optional npm package.
 * Returns null if the package is not installed or the WASM file is missing.
 */
function resolveGrammarPath(lang: Language): string | null {
  // Map language → [npm package, wasm filename]
  const GRAMMAR_PACKAGES: Partial<Record<Language, [string, string]>> = {
    typescript: ['tree-sitter-typescript', 'tree-sitter-typescript.wasm'],
    tsx: ['tree-sitter-typescript', 'tree-sitter-tsx.wasm'],
    javascript: ['tree-sitter-javascript', 'tree-sitter-javascript.wasm'],
    jsx: ['tree-sitter-javascript', 'tree-sitter-javascript.wasm'],
    python: ['tree-sitter-python', 'tree-sitter-python.wasm'],
    php: ['tree-sitter-php', 'tree-sitter-php.wasm'],
    css: ['tree-sitter-css', 'tree-sitter-css.wasm'],
    bash: ['tree-sitter-bash', 'tree-sitter-bash.wasm'],
    sql: ['tree-sitter-sql', 'tree-sitter-sql.wasm'],
  };

  const entry = GRAMMAR_PACKAGES[lang];
  if (!entry) return null;
  const [pkgName, wasmFile] = entry;

  try {
    const pkgJsonPath = _require.resolve(`${pkgName}/package.json`);
    const pkgDir = dirname(pkgJsonPath);
    const wasmPath = join(pkgDir, wasmFile);
    return existsSync(wasmPath) ? wasmPath : null;
  } catch {
    return null;
  }
}

let initialized = false;
const languageCache = new Map<Language, Parser.Language>();

/**
 * Initialize the tree-sitter WASM runtime. Must be called before parsing.
 */
export async function initParser(): Promise<void> {
  if (initialized) return;
  const tsDir = getTreeSitterDir();
  await Parser.init({
    locateFile: (file: string) => join(tsDir, file),
  });
  initialized = true;
}

/**
 * Load a tree-sitter language grammar for the given language.
 * Returns null if the grammar package is not installed (unsupported / optional dep missing).
 */
export async function loadLanguage(lang: Language): Promise<Parser.Language | null> {
  const cached = languageCache.get(lang);
  if (cached) return cached;

  const grammarPath = resolveGrammarPath(lang);
  if (!grammarPath) return null;

  try {
    const language = await Parser.Language.load(grammarPath);
    languageCache.set(lang, language);
    return language;
  } catch {
    return null;
  }
}

/**
 * Parse source code into a tree-sitter Tree.
 * Returns null if the language grammar is unavailable — callers fall back to size chunking.
 */
export async function parseSource(source: string, lang: Language): Promise<Parser.Tree | null> {
  await initParser();
  const language = await loadLanguage(lang);
  if (!language) return null;

  const parser = new Parser();
  parser.setLanguage(language);
  return parser.parse(source);
}
