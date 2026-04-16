# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CCTO (Claude Code Token Optimizer)** reduces token consumption by 60–80% when using Claude Code by combining:
- **Local semantic indexing** — tree-sitter AST chunking + local embeddings (offline RAG)
- **MCP Server** — exposes `semantic_search`, `smart_read`, `project_outline`, `memory_recall` tools to Claude
- **Persistent memory** — session memory via Claude Code hooks
- **Output compression** — compresses logs, test output, build artifacts
- **Metrics** — tracks and reports tokens saved

Target project languages: TypeScript, JavaScript, Python, PHP, CSS, Bash/Shell, MySQL, MongoDB.

## Commands

```bash
# Install all workspace dependencies
pnpm install

# Build all packages (ESM + types via tsup)
pnpm build

# Build in watch mode (development)
pnpm dev

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run a single test file
pnpm test packages/core/src/indexer/__tests__/indexer.test.ts

# Run tests matching a pattern
pnpm test -- --grep "semantic_search"

# Lint (auto-fix)
pnpm lint

# Format (auto-fix)
pnpm format

# Type check without emitting
pnpm typecheck

# Clean all build artifacts
pnpm clean
```

Per-package commands work the same way from within each `packages/<name>/` directory.

## Monorepo Structure

```
ccto/
├── packages/
│   ├── shared/        # Shared types, constants, utilities (no external deps)
│   ├── core/          # All business logic (indexer, embeddings, store, memory, metrics, config)
│   ├── mcp-server/    # MCP stdio server — exposes tools to Claude
│   └── cli/           # User-facing CLI (commander + ink TUI)
├── docs/              # architecture.md, mcp-tools.md, hooks.md, faq.md
└── examples/          # Example projects for e2e testing
```

**Dependency flow**: `cli` → `core` → `shared`; `mcp-server` → `core` → `shared`. Inter-package references use `workspace:*`.

### Package Responsibilities

**`shared`** — `types.ts` (Chunk, SearchResult, Stats, etc.), `constants.ts` (default paths, config keys), `utils.ts` (file ops, hashing, logging helpers).

**`core`** — organized into sub-modules:
- `indexer/` — tree-sitter WASM wrapper, semantic chunking (function/class/method boundaries), outline extraction, `fast-glob` file walker with `.gitignore` support
- `embeddings/` — `@huggingface/transformers` wrapper for `Xenova/all-MiniLM-L6-v2`, lazy download to `~/.ccto/models/`, batch processing
- `store/` — `better-sqlite3` + `sqlite-vec` virtual table, incremental indexing via content hash
- `memory/` — persistent session memory (Phase 2)
- `compressor/` — output/session compression (Phase 2)
- `metrics/` — per-call token savings estimation, aggregation
- `config/` — load/validate `.ccto/config.json`

**`mcp-server`** — stdio MCP server; each tool in `tools/` calls into `core`. Exposes `ccto-mcp` binary.

**`cli`** — commands in `commands/`: `init`, `index`, `serve`, `stats`, `memory`, `doctor`. Ink components in `ui/`. Exposes `ccto` binary.

## Tech Stack

| Tool | Role |
|------|------|
| TypeScript 5 (strict) | Language |
| pnpm workspaces | Monorepo management |
| tsup | Build (ESM + `.d.ts`) |
| vitest | Tests |
| biome | Lint + format |
| commander | CLI argument parsing |
| ink + chalk | Terminal UI (React-based) |
| web-tree-sitter (WASM) | Cross-platform code parsing |
| @huggingface/transformers | Local ONNX embeddings (offline) |
| better-sqlite3 + sqlite-vec | Local vector store |
| @modelcontextprotocol/sdk | MCP protocol (stdio transport) |
| execa | Cross-platform shell commands |

## Conventions

**TypeScript**: Strict mode throughout. No `any` without a `// @ts-expect-error` comment explaining why. Explicit return types on all exported functions. ESM only — no CommonJS.

**Cross-platform paths**: Always use `path.join()` / `path.sep`. Never hardcode `/` as a path separator. Avoid shell commands; use `execa` with OS detection when necessary.

**Error classes**:
```ts
class CctoError extends Error { code: string }
class IndexError extends CctoError {}
class StoreError extends CctoError {}
class EmbeddingError extends CctoError {}
```

**Logging**: Unified logger (`pino` or equivalent), configurable level via config. Used in `core` and `cli`.

**Public APIs**: JSDoc on all exported functions with `@param` and `@returns`.

**Commits**: Conventional commits — `feat(scope):`, `fix(scope):`, `chore:`, `docs:`, `test:`, `refactor:`. Example: `feat(core): implement tree-sitter semantic chunker`.

**Test coverage**: Target >70% on `packages/core`.

## Build Roadmap

| Phase | Scope | Status | Key deliverable |
|-------|-------|--------|-----------------|
| 1 | Monorepo setup | ✅ done | All config files, 4 packages, CI workflows, README |
| 2 | Indexer | ✅ done | Tree-sitter chunking, outline extraction, file walker |
| 3 | Embeddings + Store | ✅ done | Local embeddings, sqlite vector search, incremental indexing |
| 4 | MCP Server | ✅ done | 4 MCP tools (`semantic_search`, `smart_read`, `project_outline`, `memory_recall`) |
| 5 | CLI | ✅ done | `ccto init/index/serve/stats/memory/doctor`, MCP hook auto-registration |

**Current state:** All 5 phases complete. `pnpm build` succeeds across all 4 packages. `pnpm test` 12/12. `pnpm check` 0 errors.

**Known setup note:** `better-sqlite3` requires native compilation. On Node 25 + Windows with VS2022 BuildTools (no ClangCL), patch `C:/Users/<USER>/AppData/Local/node-gyp/Cache/<NODE_VERSION>/include/node/common.gypi` replacing `ClangCL` → `v143`, then rebuild via `node-gyp rebuild --release` in the `better-sqlite3` package dir.

After each change: run `pnpm test && pnpm check`, then update this file.


## CCTO Token Optimization

CCTO is active in this project. 54 files indexed, 27 symbol outlines extracted.

### MCP Tools Available

Use these tools instead of reading files directly to save tokens:

- **`semantic_search`** — Find relevant code by description (e.g. `semantic_search("authentication middleware")`)
- **`smart_read`** — Read a file outline first, then fetch specific sections
- **`project_outline`** — Get a condensed project tree with language tags
- **`memory_recall`** — Search past session summaries

### Workflow

1. Start with `project_outline` for a new task
2. Use `semantic_search` to find relevant code before reading files
3. Use `smart_read filepath` to see a file's outline before fetching specific sections
4. Re-index after large changes: `ccto index --incremental`
