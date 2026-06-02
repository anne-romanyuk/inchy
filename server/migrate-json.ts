import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { db } from "./db";

const dataDir = join(process.cwd(), "data");
const usersFile = join(dataDir, "users.json");
const tasksFile = join(dataDir, "tasks.json");
const defaultTasksFile = join(dataDir, "default-tasks.json");

type JsonUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatarId?: string | null;
  createdAt: string;
};

type JsonTask = {
  id: string;
  userId: string;
  title: string;
  priority: "low" | "medium" | "high";
  category?: string;
  duration?: string;
  completed: boolean;
  createdAt: string;
};

type JsonDefaultTask = {
  id: string;
  userId: string;
  title: string;
  priority: "low" | "medium" | "high";
  category?: string;
  duration?: string;
  createdAt: string;
};

function readJsonArray<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T[];
  } catch {
    return [];
  }
}

export function importLegacyJson() {
  const hasUsersRow = db.prepare("SELECT 1 FROM users LIMIT 1").get();
  if (hasUsersRow) return;

  const users = readJsonArray<JsonUser>(usersFile);
  const tasks = readJsonArray<JsonTask>(tasksFile);
  const defaults = readJsonArray<JsonDefaultTask>(defaultTasksFile);

  if (!users.length && !tasks.length && !defaults.length) return;

  const insertUser = db.prepare(
    "INSERT INTO users (id, name, email, password_hash, avatar_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertTask = db.prepare(
    "INSERT INTO tasks (id, user_id, title, priority, category, duration, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertDefault = db.prepare(
    "INSERT INTO default_tasks (id, user_id, title, priority, category, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  const userIds = new Set(users.map((user) => user.id));

  const run = db.transaction(() => {
    for (const user of users) {
      insertUser.run(
        user.id,
        user.name,
        user.email.toLowerCase(),
        user.passwordHash,
        user.avatarId ?? null,
        user.createdAt,
      );
    }
    for (const task of tasks) {
      if (!userIds.has(task.userId)) continue;
      insertTask.run(
        task.id,
        task.userId,
        task.title,
        task.priority,
        task.category ?? "",
        task.duration ?? "",
        task.completed ? 1 : 0,
        task.createdAt,
      );
    }
    for (const item of defaults) {
      if (!userIds.has(item.userId)) continue;
      insertDefault.run(
        item.id,
        item.userId,
        item.title,
        item.priority,
        item.category ?? "",
        item.duration ?? "",
        item.createdAt,
      );
    }
  });

  run();

  console.log(
    `[migrate-json] imported users=${users.length}, tasks=${tasks.length}, defaults=${defaults.length}`,
  );

  for (const file of [usersFile, tasksFile, defaultTasksFile]) {
    if (existsSync(file)) {
      try {
        renameSync(file, `${file}.bak`);
      } catch {
        // best-effort backup
      }
    }
  }
}
