import {
  saveMemory,
  getAllMemories,
  searchMemories,
  deleteMemory,
} from "@/lib/memory";

// GET: Retrieve all memories or search memories
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    const memories = query
      ? searchMemories(query)
      : getAllMemories();

    return Response.json({
      success: true,
      count: memories.length,
      memories,
    });
  } catch (error) {
    console.error("Memory GET error:", error);

    return Response.json(
      {
        success: false,
        error: "Memory load failed",
      },
      { status: 500 }
    );
  }
}

// POST: Save a new memory
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (
      typeof body.content !== "string" ||
      !body.content.trim()
    ) {
      return Response.json(
        {
          success: false,
          error: "Memory content is required",
        },
        { status: 400 }
      );
    }

    const memory = saveMemory(
      body.content,
      typeof body.category === "string"
        ? body.category
        : "general"
    );

    return Response.json({
      success: true,
      memory,
      message: "Memory saved successfully",
    });
  } catch (error) {
    console.error("Memory POST error:", error);

    return Response.json(
      {
        success: false,
        error: "Memory save failed",
      },
      { status: 500 }
    );
  }
}

// DELETE: Delete a memory
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);

    if (!Number.isInteger(id) || id <= 0) {
      return Response.json(
        {
          success: false,
          error: "Valid memory ID required",
        },
        { status: 400 }
      );
    }

    const deleted = deleteMemory(id);

    return Response.json({
      success: deleted,
      message: deleted
        ? "Memory deleted"
        : "Memory not found",
    });
  } catch (error) {
    console.error("Memory DELETE error:", error);

    return Response.json(
      {
        success: false,
        error: "Memory delete failed",
      },
      { status: 500 }
    );
  }
}