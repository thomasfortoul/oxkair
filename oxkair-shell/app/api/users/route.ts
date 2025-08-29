import { NextRequest } from 'next/server'
import { withAuth, createSuccessResponse, createErrorResponse } from '../_lib/with-auth'
import { query } from '@/lib/db/pg-service'

export async function GET(request: NextRequest) {
  return withAuth(request, async (ctx) => {
    try {
      const { searchParams } = new URL(request.url)
      const role = searchParams.get('role')
      const institutionId = searchParams.get('institution_id')

      if (!role) {
        return createErrorResponse('Role parameter is required', 400)
      }

      // Build the query with optional institution filter
      let queryText = `
        SELECT id, first_name, last_name, user_category, institution_id, email
        FROM profiles
        WHERE user_category = $1
      `
      const queryParams = [role]

      if (institutionId) {
        queryText += ' AND institution_id = $2'
        queryParams.push(institutionId)
      }

      queryText += ' ORDER BY last_name ASC'

      const { rows } = await query(queryText, queryParams)

      // Format the response
      const formattedUsers = rows.map(user => ({
        id: user.id,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        email: user.email,
        role: user.user_category,
        institutionId: user.institution_id
      }))

      return createSuccessResponse(formattedUsers)
    } catch (error: any) {
      console.error('Error fetching users:', error)
      return createErrorResponse('Failed to fetch users', 500)
    }
  })
}