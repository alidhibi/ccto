export { indexProject, getOutline, chunkFile } from './indexer.js';
export { walkProject } from './walker.js';
export { parseSource, initParser, loadLanguage } from './parser.js';
export { chunkFromTree } from './chunker.js';
export { extractOutline } from './outline.js';
export {
  getChangedFiles,
  getIncrementalChanges,
  getCurrentCommit,
  getLastIndexedCommit,
  saveLastIndexedCommit,
  isGitAvailable,
  computeFileHash,
  writeReindexQueue,
  readReindexQueue,
  clearReindexQueue,
} from './incremental.js';
export type { IndexCallbacks } from './indexer.js';
export type { WalkerFile } from './walker.js';
export type { IncrementalChanges } from './incremental.js';
