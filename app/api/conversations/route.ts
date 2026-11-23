import { NextRequest } from "next/server";
import {
  getConversations,
  getConversation,
  deleteConversation,
} from "@/lib/memory";

// GET: Fetch all conversations or one specific conversation
export async function GET(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get("id");

    if (conversationId) {
      const conversation = getConversation(conversationId);

      if (!conversation) {
        return Response.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }

      return Response.json({ conversation });
    }

    const conversations = getConversations();

    return Response.json({ conversations });
  } catch (error) {
    console.error("Conversation Fetch Error:", error);

    return Response.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

// DELETE: Delete one conversation
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const conversationId = body.id;

    if (!conversationId || typeof conversationId !== "string") {
      return Response.json(
        { error: "Conversation ID is required" },
        { status: 400 }
      );
    }

    const deleted = deleteConversation(conversationId);

    if (!deleted) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Conversation Delete Error:", error);

    return Response.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}