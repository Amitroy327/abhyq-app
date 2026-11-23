import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type Memory = {
  id: number;
  category: string;
  content: string;
  group_key: string | null;
  importance: number;
  source: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

type SaveOptions = {
  groupKey?: string | null;
  importance?: number;
  source?: string;
};

const allowedCategories = new Set([
  "personal",
  "preference",
  "project",
  "goal",
  "work",
  "learning",
  "general",
  "test",
]);

const knownColors = [
  "black", "white", "red", "blue", "green", "yellow",
  "pink", "purple", "orange", "brown", "grey", "gray",
];

// Expanded sensitive-information detection.
const sensitivePatterns = [
  /\bpassword\b/i,
  /\bpasscode\b/i,
  /\bpass\s*word\b/i,
  /\bsecret\s+key\b/i,
  /\bapi\s*key\b/i,
  /\baccess\s+token\b/i,
  /\bauth(?:entication)?\s+token\b/i,
  /\botp\b/i,
  /\bone[- ]time\s+password\b/i,
  /\bcvv2?\b/i,
  /\bcvc\b/i,
  /\bsecurity\s+code\b/i,
  /\bpin(?:\s+number)?\b/i,
  /\bcredit\s+card\b/i,
  /\bdebit\s+card\b/i,
  /\bbank\s+account\b/i,
  /\baccount\s+number\b/i,
  /\baadhaar\b/i,
  /\bpan\s+number\b/i,
  /\bsocial\s+security\s+number\b/i,
  /\bssn\b/i,
  /\bprivate\s+key\b/i,
  /\bseed\s+phrase\b/i,
  /\brecovery\s+phrase\b/i,
  /\bmera\s+password\b/i,
  /\bmera\s+otp\b/i,
  /\bmera\s+pin\b/i,
  /\bmera\s+passcode\b/i,
  /\bmera\s+cvv\b/i,
  /\bmera\s+aadhaar\b/i,
  /\bmera\s+bank\s+account\b/i,
];

let database: DatabaseSync | null = null;

// --------------------------------------------------
// BASIC HELPERS
// --------------------------------------------------

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function normalizeCategory(category: string): string {
  const value = category.toLowerCase().trim();

  return allowedCategories.has(value) ? value : "general";
}

function normalizeImportance(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 3;
  }

  return Math.max(1, Math.min(5, Math.round(value)));
}

function containsSensitiveInformation(text: string): boolean {
  return sensitivePatterns.some((pattern) => pattern.test(text));
}

function isLikelyQuestion(text: string): boolean {
  const value = text.trim().toLowerCase();

  if (/[?؟]\s*$/.test(value)) return true;

  return (
    /^(what|why|when|where|who|how|which|whose|whom|can you|could you|would you|will you|do you|does|did|is it|are you)\b/i.test(value) ||
    /^(kya|kaise|kyun|kab|kahan|kaun|kitna|kitni|kitne|konsa|kaunsa|kaunsi|kiske|kisne)\b/i.test(value) ||
    /\b(kya|kaise|kyun|kab|kahan|kaun)\s+(hai|hain|tha|thi|the)\s*$/i.test(value) ||
    /\b(what is|what are|who is|who are|where is|how is|how are)\b/i.test(value) ||
    /\b(favourite|favorite)\s+(colour|color|rang)\s+kya\b/i.test(value)
  );
}

// --------------------------------------------------
// REMEMBER COMMAND CLEANUP
// --------------------------------------------------

function cleanRememberPrefix(text: string): string {
  let value = text.trim();

  const patterns = [
    /^(?:please\s+)?remember\s+(?:this|that)\s*/i,
    /^please\s+remember\s*/i,
    /^remember\s*/i,
    /^(?:ye|yah|isko)\s+yaad\s+rakhna\s*/i,
    /^yaad\s+rakhna\s*/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(value)) {
      value = value.replace(pattern, "").trim();
      break;
    }
  }

  return value.replace(/^(?:ki|that|this)\s+/i, "").trim();
}

// --------------------------------------------------
// FAVOURITE COLOUR DETECTION
// --------------------------------------------------

export function detectFavoriteColor(content: string): string | null {
  const text = cleanRememberPrefix(content)
    .toLowerCase()
    .replace(/^(?:(?:ki|that|this|ab|aur)\s+)+/i, "")
    .trim();

  const colors = knownColors.join("|");

  const patterns = [
    new RegExp(
      `(?:my|mera|meri)\\s+(?:favourite|favorite|pasandida)\\s+(?:colour|color|rang)\\s+(?:is|hai)\\s+(${colors})\\b`,
      "i"
    ),
    new RegExp(
      `mujhe\\s+(${colors})\\s+(?:(?:colour|color|rang)\\s+)?pasand\\s+hai`,
      "i"
    ),
    new RegExp(`i\\s+(?:like|love|prefer)\\s+(${colors})\\b`, "i"),
    new RegExp(
      `(?:my|mera|meri)\\s+(?:favourite|favorite)\\s+(${colors})\\s+(?:colour|color)`,
      "i"
    ),
    new RegExp(
      `(?:mera|meri)\\s+(?:favourite|favorite)\\s+(?:colour|color|rang)\\s+(${colors})\\b`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) return match[1].toLowerCase();
  }

  return null;
}

function getSemanticKey(content: string): string | null {
  if (detectFavoriteColor(content)) {
    return "preference:favorite-color";
  }

  return null;
}

// --------------------------------------------------
// GROUP DETECTION
// --------------------------------------------------

function inferGroupKey(
  content: string,
  category: string,
  suppliedGroupKey?: string | null
): string | null {
  const text = content.toLowerCase();

  if (/\babhyq\b/.test(text)) return "abhyq";
  if (/\bgharvix\b/.test(text)) return "gharvix";

  if (suppliedGroupKey?.trim()) {
    return suppliedGroupKey.trim().toLowerCase();
  }

  if (category === "preference") return "preferences";
  if (category === "goal") return "career-goals";
  if (category === "learning") return "learning";
  if (category === "personal") return "personal";

  return null;
}

// --------------------------------------------------
// PREPARE MEMORY
// --------------------------------------------------

function prepareMemory(content: string, category: string) {
  const cleaned = cleanRememberPrefix(content)
    .trim()
    .replace(/\s+/g, " ");

  // Sensitive information is rejected before any database write.
  if (containsSensitiveInformation(cleaned)) {
    return null;
  }

  if (
    !cleaned ||
    cleaned.length < 4 ||
    cleaned.length > 500 ||
    isLikelyQuestion(cleaned)
  ) {
    return null;
  }

  const favoriteColor = detectFavoriteColor(cleaned);

  const finalContent = favoriteColor
    ? `My favorite color is ${favoriteColor}`
    : cleaned.replace(/[.!?।]+$/g, "").trim();

  const finalCategory = favoriteColor
    ? "preference"
    : normalizeCategory(category);

  const normalized = normalizeText(finalContent);

  if (!normalized) return null;

  return {
    finalContent,
    finalCategory,
    normalized,
    favoriteColor,
  };
}

// --------------------------------------------------
// DATABASE HELPERS
// --------------------------------------------------

function getDatabase(): DatabaseSync {
  if (database) return database;

  const dataDirectory = path.join(process.cwd(), "data");

  mkdirSync(dataDirectory, { recursive: true });

  const db = new DatabaseSync(
    path.join(dataDirectory, "abhyq-memory.db")
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      normalized_content TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT,
      group_key TEXT,
      importance INTEGER NOT NULL DEFAULT 3,
      source TEXT NOT NULL DEFAULT 'conversation'
    );
  `);

  const columns = db
    .prepare("PRAGMA table_info(memories)")
    .all() as Array<{ name: string }>;

  const existingColumns = new Set(
    columns.map((column) => column.name)
  );

  if (!existingColumns.has("group_key")) {
    db.exec("ALTER TABLE memories ADD COLUMN group_key TEXT");
  }

  if (!existingColumns.has("importance")) {
    db.exec(`
      ALTER TABLE memories
      ADD COLUMN importance INTEGER NOT NULL DEFAULT 3
    `);
  }

  if (!existingColumns.has("source")) {
    db.exec(`
      ALTER TABLE memories
      ADD COLUMN source TEXT NOT NULL DEFAULT 'conversation'
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_category
    ON memories(category);

    CREATE INDEX IF NOT EXISTS idx_memories_group
    ON memories(group_key);

    CREATE INDEX IF NOT EXISTS idx_memories_importance
    ON memories(importance);
  `);

  database = db;

  try {
    cleanLegacyMemories(db);
  } catch (error) {
    database = null;
    db.close();
    throw error;
  }

  return db;
}

// --------------------------------------------------
// LEGACY MEMORY CLEANUP
// --------------------------------------------------

function cleanLegacyMemories(db: DatabaseSync): void {
  type LegacyMemory = {
    id: number;
    category: string;
    content: string;
    normalized_content: string;
    group_key: string | null;
    importance: number;
    source: string;
    created_at: string;
    updated_at: string;
    last_used_at: string | null;
  };

  const rows = db.prepare(`
    SELECT *
    FROM memories
    ORDER BY updated_at DESC, id DESC
  `).all() as LegacyMemory[];

  const candidates: Array<{
    row: LegacyMemory;
    content: string;
    category: string;
    normalized: string;
    groupKey: string | null;
    favoriteColor: boolean;
  }> = [];

  for (const row of rows) {
    const cleaned = cleanRememberPrefix(row.content)
      .trim()
      .replace(/\s+/g, " ");

    // Remove sensitive records from older versions.
    if (
      !cleaned ||
      cleaned.length < 4 ||
      cleaned.length > 500 ||
      isLikelyQuestion(cleaned) ||
      containsSensitiveInformation(cleaned)
    ) {
      continue;
    }

    const color = detectFavoriteColor(cleaned);

    const content = color
      ? `My favorite color is ${color}`
      : cleaned.replace(/[.!?।]+$/g, "").trim();

    const category = color
      ? "preference"
      : normalizeCategory(row.category);

    const normalized = normalizeText(content);

    if (!normalized) continue;

    candidates.push({
      row,
      content,
      category,
      normalized,
      groupKey: inferGroupKey(
        content,
        category,
        color ? "preferences" : row.group_key
      ),
      favoriteColor: Boolean(color),
    });
  }

  const uniqueCandidates = new Map<
    string,
    (typeof candidates)[number]
  >();

  for (const candidate of candidates) {
    if (!uniqueCandidates.has(candidate.normalized)) {
      uniqueCandidates.set(candidate.normalized, candidate);
    }
  }

  // Keep only the newest favourite colour.
  let favoriteColorKept = false;

  const finalCandidates = [...uniqueCandidates.values()].filter(
    (candidate) => {
      if (!candidate.favoriteColor) return true;

      if (favoriteColorKept) return false;

      favoriteColorKept = true;
      return true;
    }
  );

  const keepIds = new Set(
    finalCandidates.map((candidate) => candidate.row.id)
  );

  const updateRow = db.prepare(`
    UPDATE memories
    SET
      category = ?,
      content = ?,
      normalized_content = ?,
      group_key = ?,
      updated_at = ?
    WHERE id = ?
  `);

  const deleteRow = db.prepare(
    "DELETE FROM memories WHERE id = ?"
  );

  db.exec("BEGIN");

  try {
    for (const row of rows) {
      if (!keepIds.has(row.id)) {
        deleteRow.run(row.id);
      }
    }

    for (const candidate of finalCandidates) {
      updateRow.run(
        candidate.category,
        candidate.content,
        candidate.normalized,
        candidate.groupKey,
        candidate.row.updated_at,
        candidate.row.id
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// --------------------------------------------------
// FAVOURITE COLOUR CLEANUP
// --------------------------------------------------

function removeOldFavoriteColors(exceptId?: number): void {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT id, content
    FROM memories
    WHERE category = 'preference'
  `).all() as Array<{
    id: number;
    content: string;
  }>;

  const remove = db.prepare(
    "DELETE FROM memories WHERE id = ?"
  );

  for (const row of rows) {
    if (
      getSemanticKey(row.content) === "preference:favorite-color" &&
      row.id !== exceptId
    ) {
      remove.run(row.id);
    }
  }
}

// --------------------------------------------------
// SAVE MEMORY
// --------------------------------------------------

export function saveMemory(
  content: string,
  category = "general",
  options: SaveOptions = {}
): Memory | null {
  const prepared = prepareMemory(content, category);

  if (!prepared) return null;

  const db = getDatabase();

  const {
    finalContent,
    finalCategory,
    normalized,
    favoriteColor,
  } = prepared;

  const groupKey = inferGroupKey(
    finalContent,
    finalCategory,
    favoriteColor ? "preferences" : options.groupKey
  );

  const importance = normalizeImportance(options.importance);

  const source = options.source?.trim() || "conversation";

  db.exec("BEGIN");

  try {
    if (favoriteColor) {
      removeOldFavoriteColors();
    }

    db.prepare(`
      INSERT INTO memories (
        category,
        content,
        normalized_content,
        group_key,
        importance,
        source,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

      ON CONFLICT(normalized_content)
      DO UPDATE SET
        category = excluded.category,
        content = excluded.content,
        group_key = excluded.group_key,
        importance = excluded.importance,
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      finalCategory,
      finalContent,
      normalized,
      groupKey,
      importance,
      source
    );

    const saved = db.prepare(`
      SELECT *
      FROM memories
      WHERE normalized_content = ?
    `).get(normalized) as Memory | undefined;

    db.exec("COMMIT");

    return saved || null;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// --------------------------------------------------
// GET ALL MEMORIES
// --------------------------------------------------

export function getAllMemories(): Memory[] {
  const db = getDatabase();

  return db.prepare(`
    SELECT *
    FROM memories
    ORDER BY importance DESC, updated_at DESC, id DESC
  `).all() as Memory[];
}

// --------------------------------------------------
// SEARCH MEMORIES
// --------------------------------------------------

export function searchMemories(query: string): Memory[] {
  const cleanQuery = normalizeText(query);

  if (!cleanQuery) return [];

  const stopWords = new Set([
    "mera", "meri", "mujhe", "kya", "hai", "ka", "ke", "ki",
    "the", "is", "my", "what", "do", "i", "you", "about",
    "tell", "me", "please", "colour", "color", "rang",
  ]);

  const synonyms: Record<string, string> = {
    favourite: "favorite",
    pasandida: "favorite",
  };

  const queryWords = cleanQuery
    .split(" ")
    .filter((word) => !stopWords.has(word))
    .map((word) => synonyms[word] || word);

  if (queryWords.length === 0) return [];

  return getAllMemories()
    .map((memory) => {
      const content = normalizeText(memory.content);
      const group = normalizeText(memory.group_key || "");

      let score = 0;

      for (const word of queryWords) {
        if (content.includes(word)) score += 4;
        if (group.includes(word)) score += 2;
      }

      if (
        queryWords.includes("favorite") &&
        detectFavoriteColor(memory.content)
      ) {
        score += 10;
      }

      if (memory.importance >= 4) score += 1;

      return { memory, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => item.memory);
}

// --------------------------------------------------
// GET MEMORIES BY GROUP
// --------------------------------------------------

export function getMemoriesByGroup(groupKey: string): Memory[] {
  const db = getDatabase();

  return db.prepare(`
    SELECT *
    FROM memories
    WHERE group_key = ?
    ORDER BY importance DESC, updated_at DESC
  `).all(groupKey.toLowerCase()) as Memory[];
}

// --------------------------------------------------
// UPDATE MEMORY
// --------------------------------------------------

export function updateMemory(
  id: number,
  content: string,
  category = "general"
): Memory | null {
  const prepared = prepareMemory(content, category);

  if (!prepared) return null;

  const db = getDatabase();

  const existing = db.prepare(`
    SELECT id
    FROM memories
    WHERE id = ?
  `).get(id);

  if (!existing) return null;

  const {
    finalContent,
    finalCategory,
    normalized,
    favoriteColor,
  } = prepared;

  const groupKey = inferGroupKey(
    finalContent,
    finalCategory,
    favoriteColor ? "preferences" : null
  );

  db.exec("BEGIN");

  try {
    if (favoriteColor) {
      removeOldFavoriteColors(id);
    }

    const duplicate = db.prepare(`
      SELECT id
      FROM memories
      WHERE normalized_content = ? AND id != ?
    `).get(normalized, id) as { id: number } | undefined;

    if (duplicate) {
      db.prepare(
        "DELETE FROM memories WHERE id = ?"
      ).run(duplicate.id);
    }

    db.prepare(`
      UPDATE memories
      SET
        content = ?,
        category = ?,
        normalized_content = ?,
        group_key = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      finalContent,
      finalCategory,
      normalized,
      groupKey,
      id
    );

    const updated = db.prepare(`
      SELECT *
      FROM memories
      WHERE id = ?
    `).get(id) as Memory | undefined;

    db.exec("COMMIT");

    return updated || null;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// --------------------------------------------------
// DELETE MEMORY
// --------------------------------------------------

export function deleteMemory(id: number) {
  const db = getDatabase();

  return db.prepare(`
    DELETE FROM memories
    WHERE id = ?
  `).run(id);
}

// --------------------------------------------------
// MARK MEMORY AS USED
// --------------------------------------------------

export function markMemoryUsed(id: number) {
  const db = getDatabase();

  db.prepare(`
    UPDATE memories
    SET last_used_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}