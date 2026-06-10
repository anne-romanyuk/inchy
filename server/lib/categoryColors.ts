import type { Database } from "better-sqlite3";
import {
  fallbackCategoryColor,
  isCategoryColor,
  pickUnusedCategoryColor,
  type CategoryColor,
} from "../../shared/categoryPalette";
import { newId } from "./ids";

type CategoryTable = "task_categories" | "note_categories";

export type CategoryRow = {
  name: string;
  color: CategoryColor;
};

export function assignCategoryColor(db: Database, table: CategoryTable, userId: string, name: string): CategoryColor | "" {
  const categoryName = name.trim();
  if (!categoryName) return "";

  const existing = db
    .prepare(`SELECT name, color FROM ${table} WHERE user_id = ? AND lower(name) = lower(?) ORDER BY created_at ASC LIMIT 1`)
    .get(userId, categoryName) as CategoryRow | undefined;

  if (existing?.color && isCategoryColor(existing.color)) return existing.color;

  const usedRows = db.prepare(`SELECT color FROM ${table} WHERE user_id = ?`).all(userId) as Array<{ color: string }>;
  const color = pickUnusedCategoryColor(usedRows.map((row) => row.color));

  if (existing) {
    db.prepare(`UPDATE ${table} SET color = ? WHERE user_id = ? AND name = ?`).run(color, userId, existing.name);
    return color;
  }

  db.prepare(`INSERT INTO ${table} (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    newId(),
    userId,
    categoryName,
    color,
    new Date().toISOString(),
  );
  return color;
}

export function listCategoryRows(db: Database, table: CategoryTable, userId: string): CategoryRow[] {
  const rows = db
    .prepare(`SELECT name, color FROM ${table} WHERE user_id = ? ORDER BY lower(name)`)
    .all(userId) as CategoryRow[];

  return rows.map((row) => ({
    name: row.name,
    color: isCategoryColor(row.color) ? row.color : assignCategoryColor(db, table, userId, row.name),
  })).filter((row): row is CategoryRow => isCategoryColor(row.color));
}
