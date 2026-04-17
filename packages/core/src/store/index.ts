export { upsertChunks, search, deleteByFile, getStats, isIndexed, getFileHash, upsertFileHash, getKnownFiles } from './store.js';
export { openDb, resetDb } from './db.js';
export type { SearchResult, StoreStats } from '@ccto/shared';
