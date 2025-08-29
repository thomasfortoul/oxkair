import { NextRequest } from "next/server";
import { withAuth, createSuccessResponse, createErrorResponse } from '../_lib/with-auth';
import { getMedicalNotesByUser } from '@/lib/db/pg-service';

/**
 * API route to test database connectivity and user authentication
 * This endpoint can be used to verify that the database connection is working
 * and that user authentication is properly configured
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (ctx) => {
    try {
      console.log('[DEBUG_DB] Testing database connectivity with user:', ctx.userId);
      
      // Test basic database query
      const notes = await getMedicalNotesByUser(ctx.userId, {
        userId: ctx.userId,
        roles: ctx.roles,
        email: ctx.email
      });

      console.log('[DEBUG_DB] Database query successful, found notes:', notes.length);
      
      return createSuccessResponse({
        success: true,
        message: "Database connectivity test successful",
        userId: ctx.userId,
        notesCount: notes.length,
        notes: notes.slice(0, 3) // Only return first 3 notes for debugging
      });
    } catch (error) {
      console.error('[DEBUG_DB] Database connectivity test failed:', error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Database connectivity test failed',
        500
      );
    }
  });
}