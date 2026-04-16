import { type Chunk, type ChunkKind, type Language, sha256 } from '@ccto/shared';
import type Parser from 'web-tree-sitter';

/** Tree-sitter node types that map to a semantic chunk */
const SEMANTIC_NODES: Record<string, ChunkKind> = {
  // TypeScript / JavaScript
  function_declaration: 'function',
  function_expression: 'function',
  arrow_function: 'function',
  method_definition: 'method',
  class_declaration: 'class',
  class_expression: 'class',
  // Python / PHP (shared names — same semantics)
  function_definition: 'function',
  class_definition: 'class',
  method_declaration: 'method',
  // CSS
  rule_set: 'block',
  // SQL — treat statements as blocks
  select_statement: 'block',
  insert_statement: 'block',
  update_statement: 'block',
  delete_statement: 'block',
  create_statement: 'block',
};

const MAX_CHUNK_LINES = 80;
const MIN_CHUNK_LINES = 3;

/**
 * Extract the "name" of a semantic AST node (e.g., function/class name).
 */
function extractName(node: Parser.SyntaxNode): string {
  // Look for a direct `name` or `identifier` child
  for (const child of node.children) {
    if (
      child.type === 'name' ||
      child.type === 'identifier' ||
      child.type === 'property_identifier'
    ) {
      return child.text;
    }
  }
  return '';
}

/**
 * Recursively collect all semantic top-level nodes from the AST.
 * Skips nodes that are nested inside other semantic nodes.
 */
function collectSemanticNodes(node: Parser.SyntaxNode, depth = 0): Parser.SyntaxNode[] {
  const results: Parser.SyntaxNode[] = [];
  const kind = SEMANTIC_NODES[node.type];

  if (kind !== undefined && depth > 0) {
    const lines = node.endPosition.row - node.startPosition.row + 1;
    if (lines >= MIN_CHUNK_LINES) {
      results.push(node);
      return results; // Don't recurse into semantic nodes
    }
  }

  for (const child of node.children) {
    results.push(...collectSemanticNodes(child, depth + 1));
  }

  return results;
}

/**
 * Perform size-based chunking on plain text (fallback for unsupported languages).
 */
function sizeChunks(lines: string[], filepath: string, language: Language): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < lines.length) {
    const end = Math.min(start + MAX_CHUNK_LINES - 1, lines.length - 1);
    const content = lines.slice(start, end + 1).join('\n');
    if (content.trim().length > 0) {
      chunks.push({
        hash: sha256(filepath + content),
        filepath,
        language,
        kind: 'block',
        name: '',
        startLine: start + 1,
        endLine: end + 1,
        content,
      });
    }
    start = end + 1;
  }
  return chunks;
}

/**
 * Chunk a source file using its tree-sitter AST.
 * Falls back to size-based chunking if no tree is available.
 */
export function chunkFromTree(
  tree: Parser.Tree | null,
  source: string,
  filepath: string,
  language: Language,
): Chunk[] {
  const lines = source.split('\n');

  if (!tree) {
    return sizeChunks(lines, filepath, language);
  }

  const semanticNodes = collectSemanticNodes(tree.rootNode);

  if (semanticNodes.length === 0) {
    // No semantic nodes found (e.g. CSS file, config) — use size chunks
    return sizeChunks(lines, filepath, language);
  }

  const chunks: Chunk[] = [];
  const coveredLines = new Set<number>();

  for (const node of semanticNodes) {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeLines = lines.slice(startLine - 1, endLine);
    const content = nodeLines.join('\n');

    if (content.trim().length === 0) continue;

    const kind = SEMANTIC_NODES[node.type] ?? 'block';
    const name = extractName(node);

    chunks.push({
      hash: sha256(filepath + content),
      filepath,
      language,
      kind,
      name,
      startLine,
      endLine,
      content,
    });

    for (let l = startLine; l <= endLine; l++) coveredLines.add(l);
  }

  // Collect uncovered lines as fallback size chunks
  const uncoveredLines: Array<{ line: number; text: string }> = [];
  for (let i = 1; i <= lines.length; i++) {
    if (!coveredLines.has(i)) {
      uncoveredLines.push({ line: i, text: lines[i - 1] ?? '' });
    }
  }

  // Group consecutive uncovered lines into blocks
  let groupStart: number | null = null;
  let groupTexts: string[] = [];
  const flush = (endLine: number) => {
    if (groupStart === null || groupTexts.join('\n').trim().length === 0) return;
    const content = groupTexts.join('\n');
    chunks.push({
      hash: sha256(filepath + content),
      filepath,
      language,
      kind: 'block',
      name: '',
      startLine: groupStart,
      endLine,
      content,
    });
  };

  for (const { line, text } of uncoveredLines) {
    if (groupStart === null) {
      groupStart = line;
      groupTexts = [text];
    } else if (line === groupStart + groupTexts.length) {
      groupTexts.push(text);
      if (groupTexts.length >= MAX_CHUNK_LINES) {
        flush(line);
        groupStart = null;
        groupTexts = [];
      }
    } else {
      flush(line - 1);
      groupStart = line;
      groupTexts = [text];
    }
  }
  if (groupStart !== null) flush(groupStart + groupTexts.length - 1);

  return chunks.sort((a, b) => a.startLine - b.startLine);
}
