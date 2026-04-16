# ccto — Claude Code Token Optimizer

[![npm](https://img.shields.io/npm/v/ccto)](https://www.npmjs.com/package/ccto)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/alidhibi/ccto/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

> Reduce Claude Code token consumption by **60–80%** using local semantic indexing and MCP tools.

All processing runs **offline** — no data leaves your machine.

---

## Install

```bash
npm install -g @alidhibi/ccto
```

## Use

```bash
cd your-project
ccto init
claude
```

That's it. `ccto init` indexes your codebase, registers its MCP server with Claude Code, and updates `CLAUDE.md` — all in one command.

---

## Features

| Without CCTO | With CCTO |
|---|---|
| Claude reads entire files | Claude reads only relevant chunks via `smart_read` |
| Claude searches by filename | Claude finds code semantically via `semantic_search` |
| Context resets each session | Persistent memory via `memory_recall` |
| Full file trees in prompts | Condensed outline via `project_outline` |

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
- Claude Code ([claude.ai/code](https://claude.ai/code))

> On first `ccto init`, the ONNX embedding model (~80 MB) downloads once to `~/.ccto/models/`.

---

## FAQ

**Does ccto send data to the internet?**
No. All indexing and search are local. Only the ONNX model download is a network call, and it happens once.

**Does `ccto init` overwrite my `CLAUDE.md`?**
No. It appends a CCTO section. If one already exists, it skips the update.

**How do I update the index after code changes?**
Run `ccto index --incremental` to re-index only git-changed files.

**MCP tools not showing up in Claude Code?**
Run `ccto doctor` and restart Claude Code after `ccto init`.

---

## License

[MIT](https://github.com/alidhibi/ccto/blob/main/LICENSE) © alidhibi
