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
      'Search for semantically relevant code chunks using natural language or code queries. Returns the most relevant function/class/block snippets with file locations and similarity scores.',
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
      'Read a file intelligently: returns an outline (signatures only) by default. Use the `section` parameter to fetch a specific symbol by name or a line range. Saves tokens vs reading the full file.',
    inputSchema: {
      type: 'object',
      properties: {
        filepath: { type: 'string', description: 'Absolute path to the file' },
        section: {
          type: 'string',
          description: 'Symbol name (e.g. "myFunction") or line range (e.g. "10-50")',
        },
      },
      required: ['filepath'],
    },
  },
  {
    name: 'project_outline',
    description:
      'Get a condensed project directory tree with language tags and index statistics. Use this for an overview of the project structure.',
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
      'Search persistent session memory for relevant past context, decisions, and summaries.',
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
    { capabilities: { tools: {} } },
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
