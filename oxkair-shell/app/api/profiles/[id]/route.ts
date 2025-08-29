import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '../../_lib/with-auth';
import { getUserProfile, updateUserProfile } from '@/lib/db/pg-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (ctx) => {
    try {
      const { id } = await params;
      const profile = await getUserProfile(id, {
        userId: ctx.userId,
        roles: ctx.roles,
        email: ctx.email
      });

      if (!profile) {
        return createErrorResponse('User profile not found', 404);
      }

      return createSuccessResponse(profile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Failed to fetch user profile',
        500
      );
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (ctx) => {
    try {
      const { id } = await params;
      const profileData = await request.json();
      
      const profile = await updateUserProfile(id, profileData, {
        userId: ctx.userId,
        roles: ctx.roles,
        email: ctx.email
      });

      return createSuccessResponse(profile);
    } catch (error) {
      console.error('Error updating user profile:', error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Failed to update user profile',
        500
      );
    }
  });
}