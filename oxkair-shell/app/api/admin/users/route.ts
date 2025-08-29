import { NextRequest } from 'next/server';
import { requireRoles, createErrorResponse, createSuccessResponse } from '../../_lib/with-auth';
import { query } from '@/lib/db/pg-service';

/**
 * GET /api/admin/users - Get all users (admin only)
 */
export async function GET(request: NextRequest) {
  return requireRoles(['admin'])(request, async (ctx) => {
    try {
      const url = new URL(request.url);
      const category = url.searchParams.get('category');
      const verificationStatus = url.searchParams.get('verification_status');
      
      let queryText = `
        SELECT id, user_category, verification_status, created_at, updated_at
        FROM profiles
        WHERE 1=1
      `;
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      if (category) {
        queryText += ` AND user_category = $${paramIndex}`;
        queryParams.push(category);
        paramIndex++;
      }
      
      if (verificationStatus) {
        queryText += ` AND verification_status = $${paramIndex}`;
        queryParams.push(verificationStatus);
        paramIndex++;
      }
      
      queryText += ` ORDER BY created_at DESC`;
      
      const { rows } = await query(queryText, queryParams);
      
      return createSuccessResponse({ 
        users: rows,
        total: rows.length,
        filters: { category, verificationStatus }
      });
    } catch (error: any) {
      console.error('Error fetching users:', error);
      return createErrorResponse(error.message, error.status || 500);
    }
  });
}