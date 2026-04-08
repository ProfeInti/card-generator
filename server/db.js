// Deprecated: Local SQLite persistence replaced by Supabase Postgres.
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let dbInstance = null

function createDb() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const dbPath = path.join(__dirname, 'card-generator.db')

  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, name),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notebook_collab_pages (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      last_editor_user_id TEXT,
      title TEXT NOT NULL,
      exercise_snapshot_json TEXT NOT NULL,
      notebook_state_json TEXT NOT NULL,
      share_code TEXT NOT NULL UNIQUE,
      visibility TEXT NOT NULL DEFAULT 'code',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS notebook_collab_pages_owner_idx
      ON notebook_collab_pages (owner_user_id);

    CREATE INDEX IF NOT EXISTS notebook_collab_pages_updated_idx
      ON notebook_collab_pages (updated_at DESC);
  `)

  return db
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = createDb()
  }

  return dbInstance
}
