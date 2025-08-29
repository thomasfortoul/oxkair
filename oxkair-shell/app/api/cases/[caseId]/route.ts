import { NextRequest } from "next/server";
import {
  withAuth,
  createErrorResponse,
  createSuccessResponse,
  assertRole,
} from "../../_lib/with-auth";
import {
  getMedicalNoteById,
  updateMedicalNote,
  deleteMedicalNote,
} from "@/lib/db/pg-service";

// UUID validation helper to prevent 22P02 errors
function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * GET /api/cases/[caseId] - Get a specific medical case
 * Accessible by: case owner, processors, admins
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const resolvedParams = await params;
  return withAuth(request, async (ctx) => {
    try {
      if (!isValidUUID(resolvedParams.caseId)) {
        return createErrorResponse("Invalid ID format. Expected UUID.", 400);
      }

      const note = await getMedicalNoteById(resolvedParams.caseId, ctx);

      if (!note) {
        return createErrorResponse("Case not found", 404);
      }

      // Return minimal necessary fields based on user role
      const responseData = {
        id: note.id,
        case_number: note.case_number,
        status: note.status,
        workflow_status: note.workflow_status,
        created_at: note.created_at,
        updated_at: note.updated_at,
        user_id: note.user_id,
        provider_user_id: note.provider_user_id,
        institution_id: note.institution_id,
        // Include sensitive data only for authorized users
        ...((ctx.roles.includes("admin") ||
          ctx.roles.includes("processor") ||
          ctx.userId === note.user_id) && {
          mrn: note.mrn,
          date_of_service: note.date_of_service,
          insurance_provider: note.insurance_provider,
          operative_notes: note.operative_notes,
          admission_notes: note.admission_notes,
          discharge_notes: note.discharge_notes,
          pathology_notes: note.pathology_notes,
          progress_notes: note.progress_notes,
          bedside_notes: note.bedside_notes,
          billable_notes: note.billable_notes,
          panel_data: note.panel_data,
          summary_data: note.summary_data,
          final_processed_data: note.final_processed_data,
          ai_raw_output: note.ai_raw_output,
        }),
      };

      return createSuccessResponse({ case: responseData });
    } catch (error: any) {
      console.error("Error fetching case:", error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}

/**
 * PUT /api/cases/[caseId] - Update a medical case
 * Accessible by: processors, admins, case owner (limited fields)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const resolvedParams = await params;
  return withAuth(request, async (ctx) => {
    try {
      if (!isValidUUID(resolvedParams.caseId)) {
        return createErrorResponse("Invalid ID format. Expected UUID.", 400);
      }

      const body = await request.json();

      // Different update permissions based on role
      if (ctx.roles.includes("processor") || ctx.roles.includes("admin")) {
        // Processors and admins can update all fields
        const updatedNote = await updateMedicalNote(
          resolvedParams.caseId,
          body,
          ctx,
        );
        return createSuccessResponse({ case: updatedNote });
      } else {
        // Regular users can only update limited fields on their own cases
        const allowedFields = [
          "mrn",
          "date_of_service",
          "insurance_provider",
          "operative_notes",
          "admission_notes",
          "discharge_notes",
          "pathology_notes",
          "progress_notes",
          "bedside_notes",
          "billable_notes",
          "final_processed_data",
          "panel_data",
          "provider_user_id",
          "institution_id",
        ];

        const filteredBody = Object.keys(body)
          .filter((key) => allowedFields.includes(key))
          .reduce((obj: any, key) => {
            obj[key] = body[key];
            return obj;
          }, {});

        if (Object.keys(filteredBody).length === 0) {
          return createErrorResponse("No allowed fields to update", 400);
        }

        const updatedNote = await updateMedicalNote(
          resolvedParams.caseId,
          filteredBody,
          ctx,
        );
        return createSuccessResponse({ case: updatedNote });
      }
    } catch (error: any) {
      console.error("Error updating case:", error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}

/**
 * DELETE /api/cases/[caseId] - Delete a medical case
 * Accessible by: admins only
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const resolvedParams = await params;
  return withAuth(request, async (ctx) => {
    try {
      if (!isValidUUID(resolvedParams.caseId)) {
        return createErrorResponse("Invalid ID format. Expected UUID.", 400);
      }

      // Only admins can delete cases
      assertRole(ctx, ["admin"]);

      await deleteMedicalNote(resolvedParams.caseId, ctx);
      return createSuccessResponse({ message: "Case deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting case:", error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}
