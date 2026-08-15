// Database bootstrap - node:sqlite is built into Node.js (>=22.5), so this
// application has zero npm dependencies. The schema and seed data are only
// applied once, the first time the configured DB file doesn't exist yet.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedIfEmpty } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function openDatabase() {
  const dbPath = process.env.DB_PATH || './data/omni_token_queue.sqlite';
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath);
    if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const isNew = dbPath === ':memory:' || !existsSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {
    // Some filesystems (network mounts, certain container overlays) don't
    // support WAL's shared-memory locking. Falling back keeps the app
    // working everywhere; single-process SQLite is fine without WAL too.
    db.exec('PRAGMA journal_mode = DELETE;');
  }

  if (isNew) {
    const schema = readFileSync(`${__dirname}/../db/schema.sql`, 'utf8');
    db.exec(schema);
    console.log(`[db] schema created at ${dbPath}`);
  }

  seedIfEmpty(db);
  return db;
}

// Small query helpers so route files stay short.
export function all(db, sql, params = []) {
  return db.prepare(sql).all(...params);
}
export function get(db, sql, params = []) {
  return db.prepare(sql).get(...params);
}
export function run(db, sql, params = []) {
  return db.prepare(sql).run(...params);
}
