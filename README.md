# CCTO — Claude Code Token Optimizer

[![npm](https://img.shields.io/npm/v/@alidhibi/ccto)](https://www.npmjs.com/package/@alidhibi/ccto)
[![CI](https://github.com/alidhibi/ccto/actions/workflows/ci.yml/badge.svg)](https://github.com/alidhibi/ccto/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

> Reduce Claude Code token consumption by **60–80%** using local semantic indexing and MCP tools.

---

## Install

```bash
npm install -g @alidhibi/ccto
```

## Use

```bash
cd mon-projet
ccto init
claude
```

After `ccto init`, open Claude Code. CCTO's MCP tools are active immediately.

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

- **Node.js 20+**
- **Claude Code** ([claude.ai/code](https://claude.ai/code))

> On first `ccto init`, the ONNX embedding model (~80 MB) downloads once to `~/.ccto/models/`.

---

## FAQ

**Does CCTO send data to the internet?**
No. All indexing, embeddings, and search run locally. The only network call is the ONNX model download on first use (~80 MB, one-time).

**Does `ccto init` overwrite my `CLAUDE.md`?**
No. It appends a CCTO section. If a CCTO section already exists, it skips the update.

**How do I update the index after code changes?**
Run `ccto index --incremental` to re-index only git-changed files.

**MCP tools are not appearing in Claude Code?**
Run `ccto doctor` to diagnose. Make sure Claude Code was restarted after `ccto init`.

---

## Roadmap

- [ ] Output compression for large test/build logs
- [ ] Session memory auto-save via Claude Code hooks
- [ ] Multi-project memory aggregation
- [ ] VS Code extension

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
