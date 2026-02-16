import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = '/Volumes/ME Backup02/_Dump/brytools.db'

let _db: Database.Database | null = null
let _dbFailed = false

export function getDb(): Database.Database | null {
  if (_db) return _db
  if (_dbFailed) return null
  try {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('busy_timeout = 5000')
    _db.exec(`
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        channel TEXT,
        duration INTEGER,
        mode TEXT NOT NULL DEFAULT 'full',
        status TEXT NOT NULL DEFAULT 'queued',
        progress_percent REAL DEFAULT 0,
        speed TEXT,
        eta TEXT,
        error TEXT,
        pid INTEGER,
        output_dir TEXT,
        file_size INTEGER,
        thumbnail_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT
      )
    `)
    return _db
  } catch (err) {
    console.error('[db] Failed to open database — volume may be unavailable:', (err as Error).message)
    _dbFailed = true
    // Retry after 60s in case volume comes back
    setTimeout(() => { _dbFailed = false }, 60000)
    return null
  }
}

export interface DownloadRow {
  id: string
  url: string
  title: string | null
  channel: string | null
  duration: number | null
  mode: string
  status: string
  progress_percent: number
  speed: string | null
  eta: string | null
  error: string | null
  pid: number | null
  output_dir: string | null
  file_size: number | null
  thumbnail_url: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export function insertDownload(row: Partial<DownloadRow> & { id: string; url: string; mode: string }): void {
  const db = getDb()
  if (!db) return
  db.prepare(`
    INSERT INTO downloads (id, url, title, channel, duration, mode, status, thumbnail_url)
    VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)
  `).run(row.id, row.url, row.title || null, row.channel || null, row.duration || null, row.mode, row.thumbnail_url || null)
}

export function updateDownload(id: string, fields: Partial<DownloadRow>): void {
  const db = getDb()
  if (!db) return
  const keys = Object.keys(fields).filter(k => k !== 'id')
  if (keys.length === 0) return
  const sets = keys.map(k => `${k} = ?`).join(', ')
  const vals = keys.map(k => (fields as Record<string, unknown>)[k])
  db.prepare(`UPDATE downloads SET ${sets} WHERE id = ?`).run(...vals, id)
}

export function getDownload(id: string): DownloadRow | undefined {
  const db = getDb()
  if (!db) return undefined
  return db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as DownloadRow | undefined
}

export function getQueue(): DownloadRow[] {
  const db = getDb()
  if (!db) return []
  return db.prepare(
    `SELECT * FROM downloads WHERE status IN ('queued', 'downloading', 'processing') ORDER BY created_at ASC`
  ).all() as DownloadRow[]
}

export function getHistory(limit = 50, offset = 0): DownloadRow[] {
  const db = getDb()
  if (!db) return []
  return db.prepare(
    `SELECT * FROM downloads WHERE status IN ('completed', 'error', 'cancelled') ORDER BY completed_at DESC, created_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset) as DownloadRow[]
}

export function getHistoryCount(): number {
  const db = getDb()
  if (!db) return 0
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM downloads WHERE status IN ('completed', 'error', 'cancelled')`
  ).get() as { count: number }
  return row.count
}

export function deleteDownload(id: string): void {
  const db = getDb()
  if (!db) return
  db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
}

export function getActiveCount(): number {
  const db = getDb()
  if (!db) return 0
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM downloads WHERE status = 'downloading'`
  ).get() as { count: number }
  return row.count
}

export function getNextQueued(): DownloadRow | undefined {
  const db = getDb()
  if (!db) return undefined
  return db.prepare(
    `SELECT * FROM downloads WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`
  ).get() as DownloadRow | undefined
}
