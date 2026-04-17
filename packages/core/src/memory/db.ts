import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CCTO_DIR, MEMORY_DB_FILE } from '@ccto/shared';
import Database from 'better-sqlite3';

export type MemoryDb = Database.Database;

let dbInstance: Database.Database | null = null;

/**
 * Open (or return cached) the memory SQLite database, creating it if needed.
 * @param projectRoot - Absolute path to the project root
 * @returns The opened database instance
 */
export function openMemoryDb(projectRoot: string): Database.Database {
  if (dbInstance) return dbInstance;

  const dir = join(projectRoot, CCTO_DIR);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, MEMORY_DB_FILE);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  migrate(db);
  dbInstance = db;
  return db;
}

/** Reset the cached db instance (for tests). */
export function resetMemoryDb(): void {
  dbInstance?.close();
  dbInstance = null;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      session_id    TEXT NOT NULL,
      timestamp     TEXT NOT NULL,
      summary       TEXT NOT NULL,
      files_touched TEXT NOT NULL,
      tags          TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp);

    CREATE TABLE IF NOT EXISTS session_tracker (
      filepath TEXT NOT NULL UNIQUE
    );
  `);
}
