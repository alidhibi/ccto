# CCTO — Claude Code Token Optimizer

[![npm](https://img.shields.io/npm/v/ccto)](https://www.npmjs.com/package/ccto)
[![CI](https://github.com/alidhibi/ccto/actions/workflows/ci.yml/badge.svg)](https://github.com/alidhibi/ccto/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

> Reduce Claude Code token consumption by **60–80%** using local semantic indexing and MCP tools.

---

## How it works

CCTO runs a local MCP server that gives Claude smarter ways to read your codebase:

| Without CCTO | With CCTO |
|---|---|
| Claude reads entire files | Claude reads only relevant chunks via `smart_read` |
| Claude searches by filename | Claude finds code semantically via `semantic_search` |
| Context resets each session | Persistent memory via `memory_recall` |
| Full file trees in prompts | Condensed outline via `project_outline` |

All indexing and embeddings run **offline** — no data leaves your machine.

---

## Quickstart

```bash
# Install globally
npm install -g ccto

# In your project directory
ccto init

# That's it — CCTO registers its MCP server with Claude Code automatically
```

After `ccto init`, open Claude Code in your project. CCTO's tools are available immediately.

---

## CLI Commands

| Command | Description |
|---|---|
| `ccto init` | Index project, configure MCP, generate `CLAUDE.md` |
| `ccto index` | Re-index all files |
| `ccto index --incremental` | Re-index only git-changed files |
| `ccto serve` | Start MCP server manually (debug) |
| `ccto stats` | Token savings dashboard |
| `ccto memory list` | List session memories |
| `ccto memory clear` | Clear all memories |
| `ccto doctor` | Diagnose setup issues |

---

## MCP Tools

| Tool | What it does |
|---|---|
| `semantic_search` | Find relevant code chunks by natural language query |
| `smart_read` | Read a file outline-first, then fetch specific sections |
| `project_outline` | Get a condensed project tree and top modules |
| `memory_recall` | Search persistent session memory |

---

## Supported Languages

TypeScript · JavaScript · Python · PHP · CSS/SCSS · Bash · SQL

---

## Requirements

- Node.js 20+
- pnpm 9+ (for development)

---

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

See [CLAUDE.md](CLAUDE.md) for architecture details and [docs/](docs/) for deeper documentation.

---

## License

[MIT](LICENSE) © alidhibi
