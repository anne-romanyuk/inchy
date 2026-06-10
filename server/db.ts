import Database from "better-sqlite3";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
const dbFile = process.env.PLANNER_DB ?? join(dataDir, "planner.db");
const migrationsDir = join(here, "migrations");

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.pragma("wal_autocheckpoint = 100");


function columnExists(table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function tableExists(table: string) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return Boolean(row);
}

function ensureGoalTaskPersistenceColumns() {
  if (tableExists("goals") && !columnExists("goals", "icon_id")) {
    db.exec("ALTER TABLE goals ADD COLUMN icon_id TEXT");
  }

  if (tableExists("stages")) {
    if (!columnExists("stages", "deadline")) {
      db.exec("ALTER TABLE stages ADD COLUMN deadline TEXT");
    }
    if (!columnExists("stages", "icon_id")) {
      db.exec("ALTER TABLE stages ADD COLUMN icon_id TEXT");
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stages_deadline ON stages(goal_id, deadline);
      CREATE INDEX IF NOT EXISTS idx_stages_goal_position_created ON stages(goal_id, position, created_at);
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_tasks (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','done','skipped')),
      deadline TEXT,
      icon_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal_position ON goal_tasks(goal_id, position, created_at);
    CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal_status ON goal_tasks(goal_id, status);
    CREATE INDEX IF NOT EXISTS idx_goal_tasks_deadline ON goal_tasks(goal_id, deadline);
  `);

  if (tableExists("stages")) {
    db.exec(`
      INSERT OR IGNORE INTO goal_tasks (id, goal_id, position, title, status, deadline, icon_id, created_at, updated_at)
      SELECT
        stages.id,
        stages.goal_id,
        stages.position,
        stages.title,
        stages.status,
        stages.deadline,
        stages.icon_id,
        stages.created_at,
        COALESCE(stages.created_at, datetime('now'))
      FROM stages
      JOIN goals ON goals.id = stages.goal_id;
    `);
  }
}

export function checkpointDatabase() {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // Best-effort durability checkpoint. The database remains valid even if this fails.
  }
}

function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

function splitMigrationStatements(sql: string) {
  const withoutLineComments = sql.replace(/^\s*--.*$/gm, "");
  return withoutLineComments
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => `${statement};`);
}

function isDuplicateColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("duplicate column name");
}

export function runMigrations() {
  ensureMigrationsTable();

  const applied = new Set(
    db.prepare("SELECT name FROM schema_migrations").all().map((row: any) => row.name as string),
  );

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const apply = db.transaction(() => {
      for (const statement of splitMigrationStatements(sql)) {
        try {
          db.exec(statement);
        } catch (error) {
          if (isDuplicateColumnError(error)) {
            console.warn(`[db] skipped duplicate-column statement in ${file}`);
            continue;
          }
          throw error;
        }
      }
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
    });

    try {
      apply();
      console.log(`[db] applied migration ${file}`);
    } catch (error) {
      throw error;
    }
  }

  ensureGoalTaskPersistenceColumns();
  checkpointDatabase();
}

export function clearExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}
