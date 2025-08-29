import { NextRequest } from 'next/server';
import { requireRoles, createErrorResponse, createSuccessResponse, AuthContext } from '../../../../_lib/with-auth';
import { updateUserProfile } from '@/lib/db/pg-service';

/**
 * POST /api/admin/users/[userId]/verify - Verify a user (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const resolvedParams = await params;
  
  return requireRoles(['admin'])(request, async (ctx: AuthContext) => {
    try {
      const body = await request.json();
      const { verification_status } = body;
      
      if (!verification_status || !['verified', 'rejected', 'not verified'].includes(verification_status)) {
        return createErrorResponse('Invalid verification status', 400);
      }
      
      const updatedProfile = await updateUserProfile(
        resolvedParams.userId,
        { verification_status },
        ctx
      );
      
      return createSuccessResponse({ 
        user: updatedProfile,
        message: `User ${verification_status} successfully`
      });
    } catch (error: any) {
      console.error('Error updating user verification:', error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}