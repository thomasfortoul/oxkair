/**
 * Simplified authentication helper that uses a fixed OID from environment
 * Eliminates complex authentication verification
 */

export interface SimpleAuthContext {
  userId: string;
  roles: string[];
  email?: string;
}

/**
 * Simplified authentication wrapper that always uses a sample OID from environment
 * Eliminates all complex authentication verification
 */
export async function withSimpleAuth<T>(
  req: Request,
  handler: (ctx: SimpleAuthContext) => Promise<Response>
): Promise<Response> {
  try {
    // Always use sample OID from environment for simplicity in non-production environments
    let userId: string;
    if (process.env.NODE_ENV !== 'production') {
      userId = process.env.SAMPLE_USER_OID ||  '';
    } else {
      // In production, we should have a real user ID from the authentication context
      // This is a fallback that should not be reached in properly configured environments
      throw new Error('User not authenticated in production environment');
    }
    
    const ctx: SimpleAuthContext = {
      userId: userId,
      roles: ['user'], // Default role
      email: 'developer@example.com' // Sample email
    };
    
    console.log('[withSimpleAuth] Using simplified authentication with sample OID from env');
    return await handler(ctx);
  } catch (error: any) {
    console.error('Simplified auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Helper to create error responses
 */
export function createErrorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status, 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

/**
 * Helper to create success responses
 */
export function createSuccessResponse(data: any, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    { 
      status, 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}