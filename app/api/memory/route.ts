import { createClient } from "@supabase/supabase-js";
import {
  saveMemory,
  getAllMemories,
  searchMemories,
  getMemoriesByGroup,
  updateMemory,
  deleteMemory,
  type Memory,
} from "@/lib/memory";

type MemoryRecord = Memory;

const USER_PREFIX_REGEX = /^\[user:([^\]]+)\]\s*/;

function getUserScopeTag(userKey: string | null) {
  return `[user:${userKey || "guest"}] `;
}

function parseScopedContent(rawContent: string): {
  owner: string;
  cleanContent: string;
} {
  const match = rawContent.match(USER_PREFIX_REGEX);
  if (!match) {
    return { owner: "legacy_guest", cleanContent: rawContent };
  }
  return {
    owner: match[1],
    cleanContent: rawContent.replace(USER_PREFIX_REGEX, ""),
  };
}

async function resolveUserKey(request: Request): Promise<string> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pubKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (token && url && pubKey) {
    try {
      const supabase = createClient(url, pubKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await supabase.auth.getUser(token);
      if (data.user?.id) {
        return data.user.id;
      }
    } catch {
      // fallback to guest
    }
  }

  return "guest";
}

function filterAndCleanMemories(
  items: MemoryRecord[],
  userKey: string,
  category?: string | null
) {
  const targetOwner = userKey === "guest" ? "legacy_guest" : userKey;

  return items
    .filter((item) => item.category !== "test")
    .filter((item) => {
      if (category && item.category !== category) return false;
      const parsed = parseScopedContent(item.content);
      if (userKey === "guest") {
        return parsed.owner === "guest" || parsed.owner === "legacy_guest";
      }
      return parsed.owner === targetOwner;
    })
    .map((item) => {
      const parsed = parseScopedContent(item.content);
      return {
        ...item,
        content: parsed.cleanContent,
      };
    });
}

// GET: Load, search and filter memories for current user
export async function GET(request: Request) {
  try {
    const userKey = await resolveUserKey(request);
    const { searchParams } = new URL(request.url);

    const query = searchParams.get("q");
    const group = searchParams.get("group");
    const category = searchParams.get("category");

    let rawMemories: MemoryRecord[];

    if (group) {
      rawMemories = await getMemoriesByGroup(group);
    } else if (query) {
      rawMemories = await searchMemories(query);
    } else {
      rawMemories = await getAllMemories();
    }

    const memories = filterAndCleanMemories(rawMemories, userKey, category);

    return Response.json({
      success: true,
      total: memories.length,
      memories,
    });
  } catch (error) {
    console.error("Memory GET error:", error);

    return Response.json(
      {
        success: false,
        error: "Unable to load memories.",
      },
      { status: 500 }
    );
  }
}

// POST: Save a new memory for current user
export async function POST(request: Request) {
  try {
    const userKey = await resolveUserKey(request);
    const body = await request.json();

    const {
      content,
      category = "general",
      groupKey = null,
      importance = 3,
      source = "conversation",
    } = body;

    if (typeof content !== "string" || !content.trim()) {
      return Response.json(
        {
          success: false,
          error: "Memory content is required.",
        },
        { status: 400 }
      );
    }

    const scopedContent = `${getUserScopeTag(userKey)}${content.trim()}`;
    const saved = await saveMemory(scopedContent, category, {
      groupKey,
      importance,
      source,
    });

    if (!saved) {
      return Response.json(
        {
          success: false,
          error: "Memory could not be saved.",
        },
        { status: 400 }
      );
    }

    const parsed = parseScopedContent(saved.content);

    return Response.json({
      success: true,
      message: "Memory saved successfully.",
      memory: {
        ...saved,
        content: parsed.cleanContent,
      },
    });
  } catch (error) {
    console.error("Memory POST error:", error);

    return Response.json(
      {
        success: false,
        error: "Unable to save memory.",
      },
      { status: 500 }
    );
  }
}

// PUT: Update an existing memory belonging to current user
export async function PUT(request: Request) {
  try {
    const userKey = await resolveUserKey(request);
    const body = await request.json();

    const { id, content, category = "general" } = body;

    if (
      typeof id !== "number" ||
      !Number.isInteger(id) ||
      typeof content !== "string" ||
      !content.trim()
    ) {
      return Response.json(
        {
          success: false,
          error: "Valid memory ID and content are required.",
        },
        { status: 400 }
      );
    }

    const all = await getAllMemories();
    const existing = all.find((item) => item.id === id);
    if (!existing) {
      return Response.json(
        {
          success: false,
          error: "Memory not found.",
        },
        { status: 404 }
      );
    }

    const parsedExisting = parseScopedContent(existing.content);
    const allowed =
      userKey === "guest"
        ? parsedExisting.owner === "guest" || parsedExisting.owner === "legacy_guest"
        : parsedExisting.owner === userKey;

    if (!allowed) {
      return Response.json(
        {
          success: false,
          error: "Not allowed to update another user's memory.",
        },
        { status: 403 }
      );
    }

    const scopedContent = `${getUserScopeTag(userKey)}${content.trim()}`;
    const updated = await updateMemory(id, scopedContent, category);

    if (!updated) {
      return Response.json(
        {
          success: false,
          error: "Memory not found or could not be updated.",
        },
        { status: 404 }
      );
    }

    const parsedUpdated = parseScopedContent(updated.content);

    return Response.json({
      success: true,
      message: "Memory updated successfully.",
      memory: {
        ...updated,
        content: parsedUpdated.cleanContent,
      },
    });
  } catch (error) {
    console.error("Memory PUT error:", error);

    return Response.json(
      {
        success: false,
        error: "Unable to update memory.",
      },
      { status: 500 }
    );
  }
}

// DELETE: Delete a memory belonging to current user
export async function DELETE(request: Request) {
  try {
    const userKey = await resolveUserKey(request);
    const { searchParams } = new URL(request.url);

    let id = Number(searchParams.get("id"));

    if (!searchParams.has("id")) {
      const body = await request.json();
      id = Number(body.id);
    }

    if (!Number.isInteger(id) || id <= 0) {
      return Response.json(
        {
          success: false,
          error: "Valid memory ID is required.",
        },
        { status: 400 }
      );
    }

    const all = await getAllMemories();
    const existing = all.find((item) => item.id === id);
    if (!existing) {
      return Response.json(
        {
          success: false,
          error: "Memory not found.",
        },
        { status: 404 }
      );
    }

    const parsedExisting = parseScopedContent(existing.content);
    const allowed =
      userKey === "guest"
        ? parsedExisting.owner === "guest" || parsedExisting.owner === "legacy_guest"
        : parsedExisting.owner === userKey;

    if (!allowed) {
      return Response.json(
        {
          success: false,
          error: "Not allowed to delete another user's memory.",
        },
        { status: 403 }
      );
    }

    const result = await deleteMemory(id);

    if (result?.error) {
      return Response.json(
        {
          success: false,
          error: "Memory not found.",
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      message: "Memory deleted successfully.",
    });
  } catch (error) {
    console.error("Memory DELETE error:", error);

    return Response.json(
      {
        success: false,
        error: "Unable to delete memory.",
      },
      { status: 500 }
    );
  }
}