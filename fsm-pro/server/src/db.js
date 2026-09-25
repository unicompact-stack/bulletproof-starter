/**
 * db.js — схема и подключение к SQLite.
 *
 * Почему SQLite: см. Challenge Log в plans/2026-09-09-fsm-pro-server-admin.md.
 * Коротко: настоящая реляционная БД без внешних сервисов, один файл, один язык с проектом.
 * Для продакшна потребуется Postgres — слой доступа изолирован именно для этого.
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.FSM_DB || path.join(__dirname, '..', 'fsm.db');

/** Схема. Перенесена из database_schema.sql с упрощениями под демо. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  full_name  TEXT NOT NULL,
  phone      TEXT,
  role       TEXT NOT NULL CHECK (role IN ('technician','manager')),
  code       TEXT UNIQUE,
  team_id    TEXT REFERENCES teams(id),
  blocked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT,
  address        TEXT,
  customer_name  TEXT,
  customer_phone TEXT,
  status         TEXT NOT NULL CHECK (status IN ('new','assigned','in_progress','under_review','completed')),
  assigned_to    TEXT REFERENCES users(id),
  created_by     TEXT REFERENCES users(id),
  due_at         TEXT,
  lat            REAL,
  lng            REAL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_photos (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('before','process','result')),
  url        TEXT NOT NULL,
  taken_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  TEXT REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_status_history (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    TEXT REFERENCES users(id),
  comment     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned   ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_history_task     ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task    ON comments(task_id);
`;

let db = null;

/** Открыть (и при необходимости создать) базу. */
function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

/** Закрыть соединение (для тестов). */
function closeDb() {
  if (db) { db.close(); db = null; }
}

module.exports = { getDb, closeDb, DB_PATH, SCHEMA };
