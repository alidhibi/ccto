import type { MemoryEntry } from '@ccto/shared';
import { openMemoryDb } from './db.js';

interface SessionRow {
  id: string;
  session_id: string;
  timestamp: string;
  summary: string;
  files_touched: string;
  tags: string;
}

function rowToEntry(row: SessionRow): MemoryEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    summary: row.summary,
    filesTouched: JSON.parse(row.files_touched) as string[],
    tags: JSON.parse(row.tags) as string[],
  };
}

/**
 * Persist a session memory entry.
 * @param projectRoot - Absolute path to the project root
 * @param entry - The memory entry to save
 */
export function saveSession(projectRoot: string, entry: MemoryEntry): void {
  const db = openMemoryDb(projectRoot);
  db.prepare(
    `INSERT OR REPLACE INTO sessions (id, session_id, timestamp, summary, files_touched, tags)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.sessionId,
    entry.timestamp,
    entry.summary,
    JSON.stringify(entry.filesTouched),
    JSON.stringify(entry.tags),
  );
}

/**
 * List all sessions ordered by most recent first.
 * @param projectRoot - Absolute path to the project root
 * @param limit - Maximum number of results (default 50)
 * @returns Array of memory entries
 */
export function listSessions(projectRoot: string, limit = 50): MemoryEntry[] {
  const db = openMemoryDb(projectRoot);
  const rows = db
    .prepare('SELECT * FROM sessions ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as SessionRow[];
  return rows.map(rowToEntry);
}

/**
 * Search sessions by query string (matches summary or tags).
 * @param projectRoot - Absolute path to the project root
 * @param query - Search query
 * @param limit - Maximum number of results (default 5)
 * @returns Matching memory entries
 */
export function searchSessions(projectRoot: string, query: string, limit = 5): MemoryEntry[] {
  const db = openMemoryDb(projectRoot);
  const pattern = `%${query}%`;
  const rows = db
    .prepare(
      `SELECT * FROM sessions
       WHERE summary LIKE ? OR tags LIKE ?
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(pattern, pattern, limit) as SessionRow[];
  return rows.map(rowToEntry);
}

/**
 * Delete all session memory entries.
 * @param projectRoot - Absolute path to the project root
 */
export function clearSessions(projectRoot: string): void {
  const db = openMemoryDb(projectRoot);
  db.prepare('DELETE FROM sessions').run();
}

/**
 * Record a file as touched in the current session tracker.
 * @param projectRoot - Absolute path to the project root
 * @param filepath - File path to track
 */
export function trackFile(projectRoot: string, filepath: string): void {
  const db = openMemoryDb(projectRoot);
  db.prepare('INSERT OR IGNORE INTO session_tracker (filepath) VALUES (?)').run(filepath);
}

/**
 * Retrieve all files tracked in the current session.
 * @param projectRoot - Absolute path to the project root
 * @returns Array of tracked file paths
 */
export function getTrackedFiles(projectRoot: string): string[] {
  const db = openMemoryDb(projectRoot);
  const rows = db.prepare('SELECT filepath FROM session_tracker').all() as { filepath: string }[];
  return rows.map((r) => r.filepath);
}

/**
 * Clear the session file tracker (called after saving a session).
 * @param projectRoot - Absolute path to the project root
 */
export function clearTrackedFiles(projectRoot: string): void {
  const db = openMemoryDb(projectRoot);
  db.prepare('DELETE FROM session_tracker').run();
}
