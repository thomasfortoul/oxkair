import { NextRequest } from "next/server";
import {
  withAuth,
  createErrorResponse,
  createSuccessResponse,
  assertRole,
} from "../_lib/with-auth";
import { getMedicalNotesByUser, createMedicalNote } from "@/lib/db/pg-service";

/**
 * GET /api/cases - Get medical cases
 * Query params:
 * - userId: specific user ID (admin/processor only)
 * - status: filter by status
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (ctx) => {
    try {
      const url = new URL(request.url);
      const requestedUserId = url.searchParams.get("userId");
      const status = url.searchParams.get("status");

      // Determine which user's cases to fetch
      let targetUserId = ctx.userId;

      if (requestedUserId && requestedUserId !== ctx.userId) {
        // Only admins and processors can view other users' cases
        assertRole(ctx, ["admin", "processor"]);
        targetUserId = requestedUserId;
      }

      const cases = await getMedicalNotesByUser(targetUserId, ctx);

      // Filter by status if provided
      const filteredCases = status
        ? cases.filter((c) => c.status === status)
        : cases;

      // Return minimal fields for list view
      const responseCases = filteredCases.map((c) => ({
        id: c.id,
        case_number: c.case_number,
        status: c.status,
        workflow_status: c.workflow_status,
        created_at: c.created_at,
        updated_at: c.updated_at,
        user_id: c.user_id,
        provider_user_id: c.provider_user_id,
        institution_id: c.institution_id,
        // Include MRN only for authorized users
        ...((ctx.roles.includes("admin") ||
          ctx.roles.includes("processor") ||
          ctx.userId === c.user_id) && {
          mrn: c.mrn,
          date_of_service: c.date_of_service,
          insurance_provider: c.insurance_provider,
        }),
      }));

      return createSuccessResponse({
        cases: responseCases,
        total: responseCases.length,
        userId: targetUserId,
      });
    } catch (error: any) {
      console.error("Error fetching cases:", error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}

/**
 * POST /api/cases - Create a new medical case
 * Accessible by: all authenticated users
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (ctx) => {
    try {
      const body = await request.json();

      // Users can only create cases for themselves unless they're admin
      const targetUserId = body.userId || ctx.userId;
      if (targetUserId !== ctx.userId && !ctx.roles.includes("admin")) {
        return createErrorResponse("Cannot create cases for other users", 403);
      }

      // Validate required fields - at least one note type should be provided
      if (
        !body.operative_notes &&
        !body.admission_notes &&
        !body.discharge_notes &&
        !body.pathology_notes &&
        !body.progress_notes &&
        !body.bedside_notes &&
        !body.billable_notes
      ) {
        return createErrorResponse("At least one note type is required", 400);
      }

      // Set default values
      const caseData = {
        ...body,
        status: body.status || "INCOMPLETE",
        workflow_status: body.workflow_status || "processing",
      };

      const newCase = await createMedicalNote(targetUserId, caseData, ctx);

      return createSuccessResponse({ case: newCase }, 201);
    } catch (error: any) {
      console.error("Error creating case:", error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}
