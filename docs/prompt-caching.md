# Prompt Caching in CCTO

CCTO enables [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) on its stable MCP tool outputs to reduce token costs by up to 90% on repeated calls.

## How it works

When Claude Code sends a conversation to Anthropic, it includes tool results as content blocks. Anthropic caches content blocks marked with `cache_control: { type: "ephemeral" }` for **5 minutes**. Subsequent requests that include the same cached block pay only **10% of the normal input token price**.

## What CCTO caches

| Tool | Reason | Expected cache hit rate |
|------|--------|------------------------|
| `project_outline` | Project tree is static within a session | High — called once per session, referenced repeatedly |
| `memory_recall` | Past session summaries don't change mid-session | High — called at session start |

Tools whose output varies per call (`semantic_search`, `smart_read`, `run_command`) are **not** cached.

## Expected savings

A typical session calls `project_outline` once and `memory_recall` once at startup. Those responses are then referenced as context in subsequent exchanges.

| Scenario | Without caching | With caching | Savings |
|----------|----------------|--------------|---------|
| `project_outline` (~800 tokens) × 10 references | 8,000 tokens | 800 + 720 (10% × 9) | ~88% |
| `memory_recall` (~300 tokens) × 5 references | 1,500 tokens | 300 + 135 (10% × 4) | ~71% |

## CLAUDE.md caching

The `CLAUDE.md` file is included in Claude Code's system prompt at the start of every session. It ends with:

```html
<!-- cache_control: ephemeral — CLAUDE.md is stable; Anthropic prompt cache TTL 5 min -->
```

This marker signals to the Anthropic caching layer that the system prompt content ending here is stable and eligible for caching. Claude Code reads this and applies the cache breakpoint at the API level.

## Implementation details

In `packages/mcp-server/src/server.ts`, the `CallToolRequestSchema` handler conditionally adds `cache_control` to the MCP content block:

```ts
const CACHEABLE_TOOLS = new Set(['project_outline', 'memory_recall']);

const content = CACHEABLE_TOOLS.has(name)
  ? [{ type: 'text', text: result.text, cache_control: { type: 'ephemeral' } }]
  : [{ type: 'text', text: result.text }];
```

`cache_control` is an Anthropic API extension beyond the MCP spec. Claude Code (the MCP client) forwards it transparently to the Anthropic API when building the `tool_result` content block.

## Cache TTL and invalidation

- **TTL**: 5 minutes (Anthropic default for ephemeral cache)
- **Invalidation**: automatic after TTL; no manual invalidation needed
- **Freshness**: `project_outline` and `memory_recall` outputs are stable within a session; any index changes after a `ccto index` run will produce a new (uncached) response
