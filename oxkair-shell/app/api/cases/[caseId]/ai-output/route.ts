import { NextRequest } from "next/server";
import {
  withAuth,
  createErrorResponse,
  createSuccessResponse,
} from "../../../_lib/with-auth";
import { getMedicalNoteById, updateMedicalNote } from "@/lib/db/pg-service";

// UUID validation helper to prevent 22P02 errors
function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// GET /api/cases/{caseId}/ai-output
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const resolvedParams = await params;
  const { caseId } = resolvedParams;

  return withAuth(request, async (ctx) => {
    try {
      if (!isValidUUID(caseId)) {
        return createErrorResponse("Invalid ID format. Expected UUID.", 400);
      }

      const caseData = await getMedicalNoteById(caseId, ctx);

      if (!caseData) {
        return createErrorResponse("Case not found", 404);
      }

      return createSuccessResponse({
        caseId,
        aiRawOutput: caseData.ai_raw_output || {},
        createdAt: caseData.created_at,
        updatedAt: caseData.updated_at,
      });
    } catch (error: any) {
      console.error("Error in GET /api/cases/[caseId]/ai-output:", error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}

// POST /api/cases/{caseId}/ai-output (for updating AI output)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const resolvedParams = await params;
  const { caseId } = resolvedParams;

  return withAuth(request, async (ctx) => {
    try {
      const body = await request.json();
      const { aiOutput, finalProcessedData, status } = body;

      // Prepare update data
      const updateData: any = {};

      // Add fields that are provided
      if (aiOutput !== undefined) updateData.ai_raw_output = aiOutput;
      if (finalProcessedData !== undefined)
        updateData.final_processed_data = finalProcessedData;
      if (status !== undefined) updateData.status = status;

      const updatedCase = await updateMedicalNote(caseId, updateData, ctx);

      return createSuccessResponse({ success: true, case: updatedCase });
    } catch (error: any) {
      console.error("Error in POST /api/cases/[caseId]/ai-output:", error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}
