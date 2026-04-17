import { loadConfig, recordMetrics } from '@ccto/core';
import { CCTO_VERSION } from '@ccto/shared';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryRecallInput, memoryRecall } from './tools/memory_recall.js';
import { ProjectOutlineInput, projectOutline } from './tools/project_outline.js';
import { SemanticSearchInput, semanticSearch } from './tools/semantic_search.js';
import { SmartReadInput, smartRead } from './tools/smart_read.js';

const TOOLS: Tool[] = [
  {
    name: 'semantic_search',
    description:
      'ALWAYS use this BEFORE Grep or any file search. Find semantically relevant code by natural language — returns function/class/block snippets with file locations and similarity scores. ' +
      'Examples: semantic_search("authentication middleware"), semantic_search("database connection pool"), semantic_search("error handling in API routes").',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language or code query' },
        k: { type: 'number', description: 'Number of results (1–20)', default: 5 },
        lang: { type: 'string', description: 'Filter by language (e.g. typescript)' },
        path: { type: 'string', description: 'Glob pattern to filter by file path' },
      },
      required: ['query'],
    },
  },
  {
    name: 'smart_read',
    description:
      'MANDATORY for any file over 200 lines. NEVER use the Read tool on large files — use smart_read instead. ' +
      'Returns the file outline (all symbol signatures) first, then appends the requested section. Saves 60–90% tokens vs full file reads. ' +
      'Workflow: (1) call smart_read with filepath only → see outline; (2) call again with section or lines to fetch the specific part you need. ' +
      'Examples: smart_read({filepath:"/src/server.ts"}) → outline; ' +
      'smart_read({filepath:"/src/server.ts", section:"createServer"}) → outline + createServer body; ' +
      'smart_read({filepath:"/src/server.ts", lines:[84,133]}) → outline + lines 84–133.',
    inputSchema: {
      type: 'object',
      properties: {
        filepath: { type: 'string', description: 'Absolute path to the file' },
        section: {
          type: 'string',
          description: 'Symbol name to fetch (e.g. "createServer", "UserService")',
        },
        lines: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description: 'Exact line range [start, end] to fetch (e.g. [84, 133])',
        },
      },
      required: ['filepath'],
    },
  },
  {
    name: 'project_outline',
    description:
      'Get a condensed project directory tree with language tags and index statistics. ' +
      'Use this INSTEAD of reading multiple files to understand project structure. ' +
      'Always call this at the start of a new task to orient yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        depth: { type: 'number', description: 'Directory depth (1–5)', default: 3 },
      },
    },
  },
  {
    name: 'memory_recall',
    description:
      'Search persistent session memory for relevant past context, decisions, and file edits. ' +
      'Call this FIRST at the start of any session to recover prior context before exploring the codebase.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (1–20)', default: 5 },
      },
      required: ['query'],
    },
  },
];

/**
 * Create and return a configured MCP server instance.
 */
export function createServer(projectRoot: string): Server {
  const _config = loadConfig(projectRoot);

  const server = new Server(
    { name: 'ccto', version: CCTO_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'CCTO token optimizer is active. Rules:\n' +
        '1. MANDATORY: Use smart_read instead of Read for any file over 200 lines.\n' +
        '2. MANDATORY: Use semantic_search before Grep or any keyword search.\n' +
        '3. Start every session with memory_recall to recover prior context.\n' +
        '4. Use project_outline instead of listing multiple directories.\n' +
        'Violating these rules wastes tokens unnecessarily.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: { text: string; metrics: import('@ccto/shared').CallMetrics };

      switch (name) {
        case 'semantic_search': {
          const input = SemanticSearchInput.parse(args);
          result = await semanticSearch(projectRoot, input);
          break;
        }
        case 'smart_read': {
          const input = SmartReadInput.parse(args);
          result = await smartRead(input);
          break;
        }
        case 'project_outline': {
          const input = ProjectOutlineInput.parse(args ?? {});
          result = await projectOutline(projectRoot, input);
          break;
        }
        case 'memory_recall': {
          const input = MemoryRecallInput.parse(args);
          result = await memoryRecall(projectRoot, input);
          break;
        }
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }

      // Record metrics asynchronously (non-blocking, ignore errors)
      recordMetrics(projectRoot, result.metrics).catch(() => {});

      return {
        content: [{ type: 'text', text: result.text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the MCP server with stdio transport.
 */
export async function startServer(projectRoot: string): Promise<void> {
  const server = createServer(projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
