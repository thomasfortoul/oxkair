import { NextRequest } from "next/server";
import {
  withAuth,
  createErrorResponse,
  createSuccessResponse,
} from "../../../_lib/with-auth";
import { query } from "@/lib/db/pg-service";

// Case number validation helper
function isValidCaseNumber(caseNumber: string): boolean {
  const caseNumberRegex = /^CASE-\d{6}$/;
  return caseNumberRegex.test(caseNumber);
}

/**
 * GET /api/cases/by-number/[caseNumber] - Get case UUID by case number
 * This is a convenience endpoint to convert human-readable case numbers to UUIDs
 * Accessible by: case owner, processors, admins
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseNumber: string }> },
) {
  const resolvedParams = await params;
  return withAuth(request, async (ctx) => {
    try {
      const { caseNumber } = resolvedParams;

      if (!isValidCaseNumber(caseNumber)) {
        return createErrorResponse(
          "Invalid case number format. Expected format: CASE-######",
          400,
        );
      }

      // Query to find the case by case_number
      const { rows } = await query(
        `SELECT id, case_number, status, created_at, updated_at, user_id
         FROM medical_notes
         WHERE case_number = $1`,
        [caseNumber],
      );

      if (rows.length === 0) {
        return createErrorResponse("Case not found", 404);
      }

      const caseData = rows[0];

      // Check if user has access to this case
      // For now, we'll use simple ownership check, but this could be expanded
      const canAccess =
        ctx.roles.includes("admin") ||
        ctx.roles.includes("processor") ||
        ctx.userId === caseData.user_id;

      if (!canAccess) {
        return createErrorResponse("Access denied", 403);
      }

      // Return minimal case information with the UUID
      return createSuccessResponse({
        id: caseData.id,
        case_number: caseData.case_number,
        status: caseData.status,
        created_at: caseData.created_at,
        updated_at: caseData.updated_at,
        // Note: We don't return user_id for privacy
      });
    } catch (error: any) {
      console.error("Error in GET /api/cases/by-number/[caseNumber]:", error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}
