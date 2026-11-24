import { createClient } from "@supabase/supabase-js";

export type Memory = {
  id: number;
  user_id?: string;
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
  userId?: string;
  groupKey?: string | null;
  importance?: number;
  source?: string;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type Conversation = {
  id: string;
  user_id?: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type StoredConversationMessage = {
  id: number;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  position: number;
  created_at: string;
};

export type ConversationWithMessages = Conversation & {
  messages: StoredConversationMessage[];
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
  "black",
  "white",
  "red",
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "orange",
  "brown",
  "grey",
  "gray",
];

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

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase URL or API key.");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

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
  if (typeof value !== "number" || !Number.isFinite(value)) return 3;
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
  return detectFavoriteColor(content) ? "preference:favorite-color" : null;
}

function inferGroupKey(
  content: string,
  category: string,
  suppliedGroupKey?: string | null
): string | null {
  const text = content.toLowerCase();
  if (/\babhyq\b/.test(text)) return "abhyq";
  if (/\bgharvix\b/.test(text)) return "gharvix";
  if (suppliedGroupKey?.trim()) return suppliedGroupKey.trim().toLowerCase();
  if (category === "preference") return "preferences";
  if (category === "goal") return "career-goals";
  if (category === "learning") return "learning";
  if (category === "personal") return "personal";
  return null;
}

function prepareMemory(content: string, category: string) {
  const cleaned = cleanRememberPrefix(content).trim().replace(/\s+/g, " ");
  if (containsSensitiveInformation(cleaned)) return null;
  if (!cleaned || cleaned.length < 4 || cleaned.length > 500 || isLikelyQuestion(cleaned)) {
    return null;
  }

  const favoriteColor = detectFavoriteColor(cleaned);
  const finalContent = favoriteColor
    ? `My favorite color is ${favoriteColor}`
    : cleaned.replace(/[.!?।]+$/g, "").trim();
  const finalCategory = favoriteColor ? "preference" : normalizeCategory(category);
  const normalized = normalizeText(finalContent);
  if (!normalized) return null;

  return { finalContent, finalCategory, normalized, favoriteColor };
}

function applyUserFilter<
  T extends {
    eq: (col: string, val: string) => T;
    is: (col: string, val: null) => T;
  }
>(query: T, userId?: string): T {
  return userId ? query.eq("user_id", userId) : query;
}

export async function saveMemory(
  content: string,
  category = "general",
  options: SaveOptions = {}
): Promise<Memory | null> {
  const prepared = prepareMemory(content, category);
  if (!prepared) return null;

  const supabase = getSupabase();
  const { finalContent, finalCategory, normalized, favoriteColor } = prepared;
  const groupKey = inferGroupKey(
    finalContent,
    finalCategory,
    favoriteColor ? "preferences" : options.groupKey
  );
  const importance = normalizeImportance(options.importance);
  const source = options.source?.trim() || "conversation";
  const now = new Date().toISOString();

  if (favoriteColor) {
    let prefQuery = supabase
      .from("memories")
      .select("id, content")
      .eq("category", "preference");
    prefQuery = applyUserFilter(prefQuery, options.userId);
    const { data: prefs } = await prefQuery;

    for (const row of prefs || []) {
      if (getSemanticKey(row.content) === "preference:favorite-color") {
        await supabase.from("memories").delete().eq("id", row.id);
      }
    }
  }

  const payload: Record<string, unknown> = {
    category: finalCategory,
    content: finalContent,
    normalized_content: normalized,
    group_key: groupKey,
    importance,
    source,
    updated_at: now,
  };
  if (options.userId) payload.user_id = options.userId;

  const { data, error } = await supabase
    .from("memories")
    .upsert(payload, {
      onConflict: options.userId
        ? "user_id,normalized_content"
        : "normalized_content",
    })
    .select()
    .single();

  if (error) throw error;
  return data as Memory;
}

export async function getAllMemories(userId?: string): Promise<Memory[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("memories")
    .select("*")
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });

  query = applyUserFilter(query, userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Memory[];
}

export async function searchMemories(
  query: string,
  userId?: string
): Promise<Memory[]> {
  const cleanQuery = normalizeText(query);
  if (!cleanQuery) return [];

  const stopWords = new Set([
    "is", "the", "a", "an", "and", "or", "to", "of", "in", "it", "that", "this",
    "kya", "hai", "ka", "ke", "ki", "ko", "se", "me", "mein", "par", "bhi",
    "kaise", "kab", "kahan", "kyun", "mujhe", "tumhe", "main", "hum", "mera",
    "meri", "mere", "apna", "apni", "apne", "batao", "yaad", "rakhna", "tell",
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

  const all = await getAllMemories(userId);
  return all
    .map((memory) => {
      const content = normalizeText(memory.content);
      const group = normalizeText(memory.group_key || "");
      let score = 0;

      for (const word of queryWords) {
        if (content.includes(word)) score += 6;
        if (group.includes(word)) score += 3;
      }

      if (queryWords.includes("favorite") && detectFavoriteColor(memory.content)) {
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

export async function getMemoriesByGroup(
  groupKey: string,
  userId?: string
): Promise<Memory[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("memories")
    .select("*")
    .eq("group_key", groupKey.toLowerCase())
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false });

  query = applyUserFilter(query, userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Memory[];
}

export async function updateMemory(
  id: number,
  content: string,
  category = "general",
  userId?: string
): Promise<Memory | null> {
  const prepared = prepareMemory(content, category);
  if (!prepared) return null;

  const supabase = getSupabase();
  const { finalContent, finalCategory, normalized, favoriteColor } = prepared;
  const groupKey = inferGroupKey(
    finalContent,
    finalCategory,
    favoriteColor ? "preferences" : null
  );

  let updateQuery = supabase
    .from("memories")
    .update({
      content: finalContent,
      category: finalCategory,
      normalized_content: normalized,
      group_key: groupKey,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  updateQuery = applyUserFilter(updateQuery, userId);
  const { data, error } = await updateQuery.select().single();
  if (error) return null;
  return data as Memory;
}

export async function deleteMemory(id: number, userId?: string) {
  const supabase = getSupabase();
  let query = supabase.from("memories").delete().eq("id", id);
  query = applyUserFilter(query, userId);
  return await query;
}

export async function markMemoryUsed(id: number, userId?: string) {
  const supabase = getSupabase();
  let query = supabase
    .from("memories")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id);
  query = applyUserFilter(query, userId);
  await query;
}

export async function saveConversation(
  id: string,
  title: string,
  messages: ConversationMessage[],
  userId?: string
): Promise<Conversation | null> {
  const conversationId = id.trim();
  if (!conversationId || conversationId.length > 200) {
    throw new Error("Invalid conversation ID.");
  }
  if (!Array.isArray(messages)) {
    throw new Error("Messages must be an array.");
  }

  const cleanMessages = messages.map((message) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string"
    ) {
      throw new Error("Invalid conversation message.");
    }
    return { role: message.role, content: message.content };
  });

  const cleanTitle =
    typeof title === "string"
      ? title.trim().slice(0, 200) || "New Chat"
      : "New Chat";

  const supabase = getSupabase();
  const now = new Date().toISOString();

  const convPayload: Record<string, unknown> = {
    id: conversationId,
    title: cleanTitle,
    updated_at: now,
  };
  if (userId) convPayload.user_id = userId;

  const { data: savedConv, error: convError } = await supabase
    .from("conversations")
    .upsert(convPayload, { onConflict: "id" })
    .select()
    .single();

  if (convError) throw convError;

  await supabase
    .from("conversation_messages")
    .delete()
    .eq("conversation_id", conversationId);

  if (cleanMessages.length > 0) {
    const rows = cleanMessages.map((msg, index) => ({
      conversation_id: conversationId,
      role: msg.role,
      content: msg.content,
      position: index,
    }));

    const { error: msgError } = await supabase
      .from("conversation_messages")
      .insert(rows);

    if (msgError) throw msgError;
  }

  return savedConv as Conversation;
}

export async function getConversation(
  conversationId: string,
  userId?: string
): Promise<ConversationWithMessages | null> {
  const supabase = getSupabase();
  let convQuery = supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId);

  convQuery = applyUserFilter(convQuery, userId);
  const { data: conversation, error } = await convQuery.single();
  if (error || !conversation) return null;

  const { data: messages } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });

  return {
    ...(conversation as Conversation),
    messages: (messages || []) as StoredConversationMessage[],
  };
}

export async function getConversations(userId?: string): Promise<Conversation[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  query = applyUserFilter(query, userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Conversation[];
}

export async function deleteConversation(
  conversationId: string,
  userId?: string
): Promise<boolean> {
  const supabase = getSupabase();
  let query = supabase.from("conversations").delete().eq("id", conversationId);
  query = applyUserFilter(query, userId);
  const { error } = await query;
  return !error;
}

export async function getRecentConversationMessages(
  conversationId: string,
  limit = 20
): Promise<StoredConversationMessage[]> {
  const supabase = getSupabase();
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("position", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return ((data || []) as StoredConversationMessage[]).reverse();
}

export type RelevantConversationMessage = {
  conversation_id: string;
  conversation_title: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export async function searchConversationHistory(
  query: string,
  excludeConversationId?: string | null,
  limit = 8,
  userId?: string
): Promise<RelevantConversationMessage[]> {
  const supabase = getSupabase();
  const stopWords = new Set([
    "hai", "hain", "ho", "tha", "thi", "the",
    "aur", "ka", "ki", "ke", "ko", "se", "me",
    "mein", "par", "to", "bhi", "kya", "kaise",
    "kab", "kahan", "kyun", "mujhe", "tumhe",
    "tum", "main", "hum", "mera", "meri",
    "mere", "apna", "apni", "apne",
    "what", "when", "where", "why", "who",
    "how", "and", "for", "with", "from",
    "that", "this", "you", "your", "about",
    "tell", "please", "can", "did", "was",
    "were", "are", "the", "have", "has",
    "remember", "recall", "previous", "earlier",
    "conversation", "discussed", "talked",
  ]);

  const terms = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length >= 3 && !stopWords.has(word))
    ),
  ].slice(0, 10);

  if (terms.length === 0) return [];

  let convQuery = supabase.from("conversations").select("id, title, user_id");
  convQuery = applyUserFilter(convQuery, userId);
  const { data: convs } = await convQuery;

  const validConvs = new Map<string, string>();
  for (const c of convs || []) {
    if (excludeConversationId && c.id === excludeConversationId) continue;
    validConvs.set(c.id, c.title);
  }

  if (validConvs.size === 0) return [];

  const { data: msgs } = await supabase
    .from("conversation_messages")
    .select("conversation_id, role, content, created_at")
    .in("conversation_id", [...validConvs.keys()])
    .order("created_at", { ascending: false })
    .limit(500);

  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const scored = (msgs || [])
    .map((msg) => {
      const lower = String(msg.content || "").toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (lower.includes(term)) score += 5;
      }
      return {
        conversation_id: msg.conversation_id,
        conversation_title: validConvs.get(msg.conversation_id) || "Chat",
        role: msg.role as "user" | "assistant",
        content: msg.content,
        created_at: msg.created_at,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit)
    .map(({ score, ...rest }) => rest);

  return scored;
}