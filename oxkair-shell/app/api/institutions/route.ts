import { NextRequest } from 'next/server'
import { withAuth, createSuccessResponse, createErrorResponse } from '../_lib/with-auth'
import { query } from '@/lib/db/pg-service'

export async function GET(request: NextRequest) {
  return withAuth(request, async (ctx) => {
    try {
      const { rows } = await query(
        'SELECT id, name FROM institutions ORDER BY name'
      )

      return createSuccessResponse(rows)
    } catch (error: any) {
      console.error('Error fetching institutions:', error)
      return createErrorResponse('Failed to fetch institutions', 500)
    }
  })
}