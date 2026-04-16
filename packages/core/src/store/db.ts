import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CCTO_DIR, DB_FILE, StoreError } from '@ccto/shared';
import Database from 'better-sqlite3';

export type Db = Database.Database;

let dbInstance: Database.Database | null = null;

/**
 * Open (or return cached) the SQLite database, creating it if needed.
 * Loads the sqlite-vec extension when available.
 */
export function openDb(projectRoot: string): Database.Database {
  if (dbInstance) return dbInstance;

  const dir = join(projectRoot, CCTO_DIR);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, DB_FILE);

  try {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    // Try to load sqlite-vec extension (optional — vector search degrades to exact scan)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteVec = require('sqlite-vec');
      sqliteVec.load(db);
    } catch {
      // sqlite-vec not available — vector search will fall back
    }

    migrate(db);
    dbInstance = db;
    return db;
  } catch (err) {
    throw new StoreError(`Failed to open database at ${dbPath}`, { cause: err });
  }
}

/** Reset the cached db instance (for tests). */
export function resetDb(): void {
  dbInstance?.close();
  dbInstance = null;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      hash     TEXT NOT NULL UNIQUE,
      filepath TEXT NOT NULL,
      lang     TEXT NOT NULL,
      kind     TEXT NOT NULL,
      name     TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line   INTEGER NOT NULL,
      content  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_filepath ON chunks(filepath);
    CREATE INDEX IF NOT EXISTS idx_chunks_hash     ON chunks(hash);

    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id  INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
      embedding BLOB NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON embeddings(chunk_id);
  `);
}
