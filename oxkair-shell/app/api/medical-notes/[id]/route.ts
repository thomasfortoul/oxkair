import { NextRequest } from "next/server";
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
} from "../../_lib/with-auth";
import {
  getMedicalNoteById,
  updateMedicalNote,
  deleteMedicalNote,
} from "@/lib/db/pg-service";
import { query } from "@/lib/db/pg-service";

// UUID validation helper to prevent 22P02 errors
function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (ctx) => {
    try {
      const { id } = await params;

      if (!isValidUUID(id)) {
        return createErrorResponse("Invalid ID format. Expected UUID.", 400);
      }

      const note = await getMedicalNoteById(id, {
        userId: ctx.userId,
        roles: ctx.roles,
        email: ctx.email,
      });

      if (!note) {
        return createErrorResponse("Medical note not found", 404);
      }

      // In simplified auth, users can access their own notes
      return createSuccessResponse(note);
    } catch (error) {
      console.error("Error fetching medical note:", error);
      return createErrorResponse(
        error instanceof Error ? error.message : "Failed to fetch medical note",
        500,
      );
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (ctx) => {
    try {
      const { id } = await params;

      if (!isValidUUID(id)) {
        return createErrorResponse("Invalid ID format. Expected UUID.", 400);
      }

      const updateData = await request.json();

      // In simplified auth, users can update their own notes
      const note = await updateMedicalNote(id, updateData, {
        userId: ctx.userId,
        roles: ctx.roles,
        email: ctx.email,
      });

      return createSuccessResponse(note);
    } catch (error) {
      console.error("Error updating medical note:", error);
      return createErrorResponse(
        error instanceof Error
          ? error.message
          : "Failed to update medical note",
        500,
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(request, async (ctx) => {
    try {
      const { id } = await params;

      if (!isValidUUID(id)) {
        return createErrorResponse("Invalid ID format. Expected UUID.", 400);
      }

      // In simplified auth, users can delete their own notes
      await deleteMedicalNote(id, {
        userId: ctx.userId,
        roles: ctx.roles,
        email: ctx.email,
      });

      return createSuccessResponse({
        message: "Medical note deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting medical note:", error);
      return createErrorResponse(
        error instanceof Error
          ? error.message
          : "Failed to delete medical note",
        500,
      );
    }
  });
}
