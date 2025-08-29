import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '../_lib/with-auth';
import { getMedicalNotesByUser, createMedicalNote } from '@/lib/db/pg-service';

export async function GET(request: NextRequest) {
  console.log("[API] GET /api/medical-notes called");
  console.log("[API] Request URL:", request.url);
  console.log("[API] Request headers type:", typeof request.headers);
  console.log("[API] Request headers keys:", Object.keys(request.headers));
  
  // Log all headers for debugging
  console.log("[API] All headers:");
  try {
    request.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
    });
  } catch (e) {
    console.log("[API] Could not iterate headers:", e);
  }
  
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');
  console.log("[API] userId query parameter:", userIdParam?.substring(0, 8) + "...");
  
  return withAuth(request, async (ctx) => {
    try {
      console.log("[API] GET /api/medical-notes withAuth context:", {
        userId: ctx.userId?.substring(0, 8) + "...",
        roles: ctx.roles,
        email: ctx.email
      });
      // In simplified auth, users can access their own notes
      const userId = ctx.userId;
      console.log("[API] GET /api/medical-notes using userId:", userId?.substring(0, 8) + "...");

      const notes = await getMedicalNotesByUser(userId, {
        userId: ctx.userId,
        roles: ctx.roles,
        email: ctx.email
      });
      console.log("[API] GET /api/medical-notes returning notes:", notes.length);

      return createSuccessResponse(notes);
    } catch (error) {
      console.error('[API] Error fetching medical notes:', error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Failed to fetch medical notes',
        500
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (ctx) => {
    try {
      const body = await request.json();
      const { userId, ...caseData } = body;

      // In simplified auth, users can create notes for themselves
      const note = await createMedicalNote(ctx.userId, caseData, {
        userId: ctx.userId,
        roles: ctx.roles,
        email: ctx.email
      });

      return createSuccessResponse(note, 201);
    } catch (error) {
      console.error('Error creating medical note:', error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Failed to create medical note',
        500
      );
    }
  });
}