import type { ChunkKind, FileOutline, Language, OutlineEntry } from '@ccto/shared';
import type Parser from 'web-tree-sitter';

/** Node types whose body we strip to produce a signature */
const OUTLINE_NODES: Record<string, ChunkKind> = {
  function_declaration: 'function',
  function_expression: 'function',
  arrow_function: 'function',
  method_definition: 'method',
  class_declaration: 'class',
  class_expression: 'class',
  function_definition: 'function',
  class_definition: 'class',
  method_declaration: 'method',
};

/** Child node type names that represent a body block */
const BODY_TYPES = new Set([
  'statement_block',
  'block',
  'class_body',
  'suite', // Python
  'compound_statement',
  'declaration_list',
]);

function extractName(node: Parser.SyntaxNode): string {
  for (const child of node.children) {
    if (
      child.type === 'identifier' ||
      child.type === 'name' ||
      child.type === 'property_identifier'
    ) {
      return child.text;
    }
  }
  return '(anonymous)';
}

/**
 * Build the signature of a node by joining its non-body children's text.
 */
function buildSignature(node: Parser.SyntaxNode, _source: string): string {
  const parts: string[] = [];
  for (const child of node.children) {
    if (BODY_TYPES.has(child.type)) {
      parts.push('{ … }');
      break;
    }
    parts.push(child.text);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function collectOutlineNodes(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const results: Parser.SyntaxNode[] = [];
  const isOutlineNode = OUTLINE_NODES[node.type] !== undefined;

  if (isOutlineNode) {
    results.push(node);
    return results;
  }

  for (const child of node.children) {
    results.push(...collectOutlineNodes(child));
  }
  return results;
}

/**
 * Extract an outline (signatures only) from a parsed tree.
 */
export function extractOutline(
  tree: Parser.Tree,
  source: string,
  filepath: string,
  language: Language,
): FileOutline {
  const nodes = collectOutlineNodes(tree.rootNode);

  const entries: OutlineEntry[] = nodes.map((node) => ({
    kind: OUTLINE_NODES[node.type] ?? 'function',
    name: extractName(node),
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    signature: buildSignature(node, source),
  }));

  return { filepath, language, entries };
}
