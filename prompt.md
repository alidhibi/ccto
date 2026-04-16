# Mission : Construire CCTO (Claude Code Token Optimizer)

Tu vas construire un outil open-source **ambitieux et production-ready** nommé **CCTO** qui optimise la consommation de tokens lors de l'utilisation de Claude Code. Le repo cible est https://github.com/alidhibi/ccto.

## 🎯 Contexte et objectif

CCTO réduit de 60-80% la consommation de tokens sur les projets moyens/gros en combinant :
1. **Indexation sémantique locale** du code (RAG local avec embeddings)
2. **MCP Server** qui fournit des outils intelligents à Claude (smart_read, semantic_search, project_outline)
3. **Mémoire persistante** entre sessions (hooks Claude Code)
4. **Compression d'outputs** (logs, tests, builds)
5. **Métriques et observabilité**

Projets cibles utilisateurs : Python, PHP, Node, JavaScript, TypeScript, Vite, CSS, Shell/Bash, MySQL, MongoDB.

## 🧱 Stack technique imposée

- **Runtime** : Node.js 20+
- **Langage** : TypeScript 5 (strict mode)
- **Monorepo** : pnpm workspaces
- **CLI** : `commander` + `ink` (TUI React) + `chalk`
- **MCP SDK** : `@modelcontextprotocol/sdk`
- **Parsing code** : `web-tree-sitter` (WASM, cross-platform)
- **Embeddings** : `@huggingface/transformers` (ONNX local, modèle `Xenova/all-MiniLM-L6-v2`)
- **Vector DB** : `better-sqlite3` + `sqlite-vec`
- **Build** : `tsup`
- **Tests** : `vitest`
- **Lint/Format** : `biome`
- **Licence** : MIT
- **OS cibles** : Linux, macOS, Windows (tout doit fonctionner partout, attention aux chemins, aux hooks shell, etc.)

## 📁 Structure du monorepo à créer

```
ccto/
├── packages/
│   ├── core/               # Logique métier
│   │   ├── src/
│   │   │   ├── indexer/          # Tree-sitter, chunking, outline
│   │   │   ├── embeddings/       # Transformers.js wrapper
│   │   │   ├── store/            # sqlite-vec vector store
│   │   │   ├── memory/           # Mémoire persistante
│   │   │   ├── compressor/       # Compression outputs/sessions
│   │   │   ├── metrics/          # Collecte métriques
│   │   │   ├── config/           # Chargement config
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── cli/                # CLI utilisateur
│   │   ├── src/
│   │   │   ├── commands/         # init, index, serve, stats, memory, doctor
│   │   │   ├── ui/               # Composants Ink
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── mcp-server/         # Serveur MCP
│   │   ├── src/
│   │   │   ├── tools/            # semantic_search, smart_read, project_outline, memory_recall
│   │   │   ├── server.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/             # Types partagés, constantes, utils
│       ├── src/
│       │   ├── types.ts
│       │   ├── constants.ts
│       │   └── utils.ts
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   ├── architecture.md
│   ├── mcp-tools.md
│   ├── hooks.md
│   └── faq.md
├── examples/
│   └── README.md
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # Lint + test + build sur Linux/Mac/Windows
│   │   └── release.yml         # Publication npm + release GitHub
│   └── ISSUE_TEMPLATE/
├── .gitignore
├── .npmrc
├── biome.json
├── package.json            # Root, pnpm workspaces
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsup.config.ts
├── vitest.config.ts
├── LICENSE                 # MIT
├── README.md               # Pro, avec badges, schémas, exemples
├── CONTRIBUTING.md
└── CHANGELOG.md
```

## 🚦 Méthode de travail

Tu vas travailler **en 5 étapes**. À la fin de chaque étape :
- Fais un commit git clair (conventional commits : `feat:`, `chore:`, `docs:`, etc.)
- Mets à jour `CLAUDE.md` à la racine avec l'état d'avancement, les décisions prises, les points ouverts
- Lance `pnpm test` et `pnpm lint` pour vérifier

---

### ✅ Étape 1 — Setup du monorepo

1. Initialise le repo git (ne fais pas de push, reste local)
2. Crée `package.json` racine avec scripts : `build`, `test`, `lint`, `format`, `typecheck`, `dev`
3. Configure `pnpm-workspace.yaml` pour les 4 packages
4. Crée `tsconfig.base.json` strict, partagé via extends
5. Configure `biome.json` (lint + format)
6. Configure `tsup.config.ts` (build ESM + types)
7. Configure `vitest.config.ts`
8. Crée les 4 packages vides avec leurs `package.json` et `tsconfig.json`
9. Dépendances inter-packages via `workspace:*`
10. Crée un `README.md` initial avec badges (npm, license, CI) et placeholder
11. Crée `LICENSE` MIT (titulaire : alidhibi)
12. Crée `.gitignore` adapté (node_modules, dist, .ccto/, *.db, etc.)
13. Crée les workflows GitHub Actions (CI matrix Linux/Mac/Windows Node 20 + 22)
14. Crée `CLAUDE.md` à la racine avec : vision, architecture, conventions, état d'avancement
15. Fais un commit `chore: initial monorepo setup`

---

### ✅ Étape 2 — Indexer (Tree-sitter)

Dans `packages/core/src/indexer/` :

1. Wrapper `web-tree-sitter` qui charge les grammaires en WASM (embarquées dans le package pour fonctionner offline)
2. Supporte : TypeScript, JavaScript, TSX, Python, PHP, CSS, Bash, SQL
3. **Chunking sémantique** : découpe par fonction/classe/méthode plutôt que par taille brute. Fallback chunking par taille si langage non supporté.
4. Extraction d'**outline** : signatures sans le corps (pour lazy loading)
5. Parcours de fichiers avec `fast-glob`, respect de `.gitignore` via `ignore`
6. Détection de la langue par extension
7. API publique :
   ```ts
   indexProject(root: string, options): Promise<IndexResult>
   getOutline(filepath: string): Promise<FileOutline>
   chunkFile(filepath: string): Promise<Chunk[]>
   ```
8. Tests unitaires avec des fichiers d'exemple
9. Commit `feat(core): implement tree-sitter indexer`

---

### ✅ Étape 3 — Embeddings + Vector Store

Dans `packages/core/src/embeddings/` :

1. Wrapper `@huggingface/transformers` avec `Xenova/all-MiniLM-L6-v2`
2. Téléchargement lazy au premier usage, cache dans `~/.ccto/models/`
3. Batch processing pour efficacité
4. API :
   ```ts
   embed(texts: string[]): Promise<Float32Array[]>
   ```

Dans `packages/core/src/store/` :

1. Init de `better-sqlite3` + chargement extension `sqlite-vec`
2. Schéma : table `chunks` (id, filepath, lang, kind, name, start, end, content, hash) + table `vec_chunks` (sqlite-vec virtual)
3. API :
   ```ts
   upsertChunks(chunks: Chunk[]): Promise<void>
   search(query: string, k: number, filters?): Promise<SearchResult[]>
   deleteByFile(filepath: string): Promise<void>
   getStats(): Promise<Stats>
   ```
4. Indexation incrémentale basée sur hash du contenu
5. Tests unitaires
6. Commit `feat(core): embeddings + sqlite-vec store`

---

### ✅ Étape 4 — MCP Server

Dans `packages/mcp-server/src/` :

1. Serveur MCP avec `@modelcontextprotocol/sdk` en stdio transport
2. Outils exposés :
   - **`semantic_search`** : cherche des chunks pertinents via embeddings. Input : query, k, filters (lang, path glob). Output : chunks avec filepath, lignes, score.
   - **`smart_read`** : lit un fichier en renvoyant d'abord l'outline, puis permet de demander une section précise par nom ou lignes.
   - **`project_outline`** : renvoie l'arborescence condensée + top modules détectés.
   - **`memory_recall`** : (stub Phase 2) cherche dans la mémoire persistante.
3. Collecte metrics à chaque appel (tokens estimés économisés vs lecture complète)
4. Binaire `ccto-mcp` exécutable via npx
5. Tests d'intégration
6. Commit `feat(mcp): initial MCP server with 4 tools`

---

### ✅ Étape 5 — CLI + intégration

Dans `packages/cli/src/commands/` :

1. **`ccto init`** :
   - Détecte les langages du projet
   - Crée `.ccto/` avec `config.json`
   - Lance l'indexation initiale (barre de progression Ink)
   - Génère `CLAUDE.md` optimisé (architecture condensée + conventions détectées + règles de concision)
   - Configure les hooks Claude Code (écrit dans `.claude/settings.json` ou équivalent — cross-platform)
   - Enregistre le MCP server dans la config Claude Code
2. **`ccto index [--incremental]`** : réindexe (full ou via git diff)
3. **`ccto serve`** : lance le MCP server manuellement (debug)
4. **`ccto stats`** : dashboard TUI Ink avec tokens économisés, top fichiers, coûts évités
5. **`ccto memory list|clear`** : gestion mémoire
6. **`ccto doctor`** : diagnostic (Node version, fichiers, permissions, MCP configuré, embeddings téléchargés)
7. Binaire `ccto` exposé
8. Tests e2e sur projet d'exemple
9. README.md final : installation, quickstart, features, FAQ, comparaison avec autres outils, roadmap
10. Commit `feat(cli): full CLI with init, index, serve, stats, memory, doctor`

---

## 🧭 Conventions et qualité

- **TypeScript strict** partout, pas de `any` sauf justifié par commentaire
- **ESM only** (pas de CommonJS)
- **Chemins cross-platform** : toujours `path.join`, `path.sep`, jamais de `/` en dur
- **Shell cross-platform** : éviter les commandes shell, sinon utiliser `execa` avec détection OS
- **Logs** : bibliothèque unifiée (`pino` ou équivalent léger), niveaux configurables
- **Erreurs** : classes d'erreur custom (`CctoError`, `IndexError`, etc.)
- **Tests** : viser >70% coverage sur `core`
- **Commits** : conventional commits
- **Documentation** : JSDoc sur les APIs publiques, markdown dans `docs/`

## 📝 Livrables attendus

À la fin :
- Repo buildable avec `pnpm install && pnpm build`
- Tests passants sur les 3 OS (CI GitHub Actions verte)
- `npx ccto init` fonctionnel dans un projet d'exemple
- MCP server testable avec l'inspector MCP
- README professionnel avec GIF/screenshots (placeholders acceptés, notés comme TODO)
- `CLAUDE.md` à jour pour faciliter les futures contributions

## 🚀 Démarrage

Commence par l'**Étape 1** maintenant. À chaque étape :
1. Annonce ce que tu vas faire
2. Implémente
3. Lance les tests/lint
4. Commit
5. Mets à jour `CLAUDE.md`
6. Passe à la suivante

Si tu rencontres une ambiguïté bloquante, pose UNE question claire puis continue avec ton meilleur choix documenté. Ne demande pas confirmation entre chaque fichier : avance.

Go. 🔥