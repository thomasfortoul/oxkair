import { NextRequest } from "next/server";
import {
  withAuth,
  createErrorResponse,
  createSuccessResponse,
} from "../../../_lib/with-auth";
import {
  getMedicalNoteById,
  updateMedicalNote,
  query,
} from "@/lib/db/pg-service";

// UUID validation helper to prevent 22P02 errors
function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// POST /api/cases/{caseId}/submit-approval
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const resolvedParams = await params;
  const { caseId } = resolvedParams;

  return withAuth(request, async (ctx) => {
    try {
      const body = await request.json();
      const { userType, submissionType, notes } = body;

      // Validate required fields
      if (!userType || !submissionType) {
        return createErrorResponse("Missing required fields", 400);
      }

      if (!isValidUUID(caseId)) {
        return createErrorResponse("Invalid ID format. Expected UUID.", 400);
      }

      // Get current case data
      const currentCase = await getMedicalNoteById(caseId, ctx);

      if (!currentCase) {
        return createErrorResponse("Case not found", 404);
      }

      // Determine new status based on submission type and user type
      let newStatus = currentCase.status;
      let newWorkflowStatus = currentCase.workflow_status;

      if (submissionType === "submit_to_provider" && userType === "coder") {
        newStatus = "PENDING_PROVIDER_REVIEW";
        newWorkflowStatus = "complete"; // Or a more specific sub-status if defined
      } else if (submissionType === "finalize_and_submit") {
        if (userType === "provider") {
          newStatus = "PENDING_BILLING";
          newWorkflowStatus = "complete";
        } else if (userType === "coder") {
          // Coder can only finalize if no provider review is required
          newStatus = "PENDING_BILLING";
          newWorkflowStatus = "complete";
        }
      } else if (
        submissionType === "approve_and_finalize" &&
        userType === "provider"
      ) {
        newStatus = "PENDING_BILLING";
        newWorkflowStatus = "complete";
      }

      // Check for unresolved flags
      const { rows: unresolvedFlags } = await query(
        "SELECT id, severity, message FROM panel_flags WHERE case_id = $1 AND resolved = false",
        [caseId],
      );

      // Block submission if there are high-severity unresolved flags
      const highSeverityFlags =
        unresolvedFlags?.filter((flag) => flag.severity === "ERROR") || [];
      if (highSeverityFlags.length > 0) {
        return createErrorResponse(
          "Cannot submit with unresolved high-severity flags",
          400,
        );
      }

      // Update the case status
      const updatedCase = await updateMedicalNote(
        caseId,
        {
          status: newStatus,
          workflow_status: newWorkflowStatus,
        },
        ctx,
      );

      // Create submission record for all panels
      const panelTypes = [
        "demographics",
        "diagnosis",
        "procedure",
        "assistant",
        "modifier",
        "compliance",
        "rvu",
        "summary",
      ];

      for (const panelType of panelTypes) {
        const panelData = currentCase.panel_data?.[panelType];
        if (panelData) {
          await query(
            `INSERT INTO panel_submissions (case_id, panel_type, submitted_by, user_type, panel_data, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              caseId,
              panelType,
              ctx.userId,
              userType,
              JSON.stringify(panelData),
            ],
          );
        }
      }

      return createSuccessResponse({
        success: true,
        newStatus,
        newWorkflowStatus,
        unresolvedFlags:
          unresolvedFlags?.filter((flag) => flag.severity !== "ERROR") || [],
      });
    } catch (error: any) {
      console.error(
        "Error in POST /api/cases/[caseId]/submit-approval:",
        error,
      );
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}
