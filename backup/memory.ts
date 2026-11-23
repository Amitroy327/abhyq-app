import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type Memory = {
  id: number;
  category: string;
  content: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

const globalForMemory = globalThis as typeof globalThis & {
  abhyqMemoryDB?: DatabaseSync;
};

function getDatabase(): DatabaseSync {
  if (globalForMemory.abhyqMemoryDB) {
    return globalForMemory.abhyqMemoryDB;
  }

  const dataDirectory = path.join(process.cwd(), "data");

  mkdirSync(dataDirectory, { recursive: true });

  const databasePath = path.join(
    dataDirectory,
    "abhyq-memory.db"
  );

  const db = new DatabaseSync(databasePath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      normalized_content TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memories_category
    ON memories(category);
  `);

  globalForMemory.abhyqMemoryDB = db;

  return db;
}

// Normalize memory to detect duplicates
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.!?।,]+$/g, "")
    .replace(/\s+/g, " ");
}

// Save memory and prevent exact duplicates
export function saveMemory(
  content: string,
  category = "general"
): Memory | null {
  const cleanContent = content.trim();

  if (!cleanContent) return null;

  const db = getDatabase();
  const normalized = normalize(cleanContent);

  db.prepare(`
    INSERT INTO memories (
      category,
      content,
      normalized_content
    )
    VALUES (?, ?, ?)

    ON CONFLICT(normalized_content)
    DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP
  `).run(category, cleanContent, normalized);

  const result = db.prepare(`
    SELECT *
    FROM memories
    WHERE normalized_content = ?
  `).get(normalized) as Memory | undefined;

  return result ?? null;
}

// Get all memories
export function getAllMemories(): Memory[] {
  const db = getDatabase();

  return db.prepare(`
    SELECT *
    FROM memories
    ORDER BY updated_at DESC
  `).all() as Memory[];
}

// Search memories
export function searchMemories(
  searchText: string
): Memory[] {
  const db = getDatabase();

  const words = searchText
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);

  if (words.length === 0) return [];

  const conditions = words.map(
    () => "LOWER(content) LIKE ?"
  );

  const values = words.map(
    (word) => `%${word}%`
  );

  return db.prepare(`
    SELECT *
    FROM memories
    WHERE ${conditions.join(" OR ")}
    ORDER BY updated_at DESC
    LIMIT 10
  `).all(...values) as Memory[];
}

// Update an existing memory
export function updateMemory(
  id: number,
  newContent: string,
  category = "general"
): boolean {
  const cleanContent = newContent.trim();

  if (!cleanContent) return false;

  const db = getDatabase();

  const result = db.prepare(`
    UPDATE memories
    SET
      content = ?,
      category = ?,
      normalized_content = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    cleanContent,
    category,
    normalize(cleanContent),
    id
  );

  return Number(result.changes) > 0;
}

// Delete a memory
export function deleteMemory(id: number): boolean {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM memories
    WHERE id = ?
  `).run(id);

  return Number(result.changes) > 0;
}

// Mark memory as recently recalled
export function markMemoryUsed(id: number): void {
  const db = getDatabase();

  db.prepare(`
    UPDATE memories
    SET last_used_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}