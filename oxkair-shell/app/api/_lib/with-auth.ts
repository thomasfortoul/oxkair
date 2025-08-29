import { SimpleAuthContext } from './with-simple-auth';

export interface AuthContext {
  userId: string;
  roles: string[];
  email?: string;
}

/**
 * Simplified authentication wrapper that always uses a sample OID from environment
 * Eliminates all complex authentication verification
 */
export async function withAuth<T>(
  req: Request,
  handler: (ctx: AuthContext) => Promise<Response>
): Promise<Response> {
  try {
    console.log("[withAuth] Starting authentication process");

    let userId: string | undefined;

    if (process.env.NODE_ENV === 'development') {
      userId = process.env.SAMPLE_USER_OID || undefined;
      if (userId) {
        console.log("[withAuth] Using SAMPLE_USER_OID from env:", userId);
      } else {
        console.warn("[withAuth] SAMPLE_USER_OID is not set in development environment.");
      }
    } else {
      // In production, we should have a real user ID from the authentication context
      console.log("[withAuth] Production environment - checking for real user ID");
      
      const headers = req.headers;

      // 1. Primary: Check for our internal 'x-user-oid' header set by middleware
      userId = headers.get('x-user-oid') || undefined;
      if (userId) {
        console.log(`[withAuth] Found user ID in 'x-user-oid' header: ${userId.substring(0,8)}...`);
      }

      // 2. Fallback: Check for Azure's simple ID header
      if (!userId) {
        userId = headers.get('x-ms-client-principal-id') || undefined;
        if (userId) {
          console.log(`[withAuth] Found user ID in 'x-ms-client-principal-id' header: ${userId.substring(0,8)}...`);
        }
      }

      // 3. Last Resort: Decode the detailed principal header from Azure
      if (!userId) {
        const principalHeader = headers.get('x-ms-client-principal');
        if (principalHeader) {
          try {
            const decoded = Buffer.from(principalHeader, 'base64').toString('utf-8');
            const principal = JSON.parse(decoded);
            const oidClaim = principal.claims.find((c: any) => c.typ === 'http://schemas.microsoft.com/identity/claims/objectidentifier' || c.typ === 'oid');
            if (oidClaim && oidClaim.val) {
              userId = oidClaim.val;
              if (userId) {
                console.log(`[withAuth] Found user ID by decoding 'x-ms-client-principal' header: ${userId.substring(0,8)}...`);
              }
            }
          } catch (e) {
            console.error("[withAuth] Failed to decode 'x-ms-client-principal' header", e);
          }
        }
      }
    }

    // Validate that we have a user ID after all checks
    if (!userId) {
      const headers = req.headers;
      console.error('[withAuth] Unauthorized: Could not determine user ID. Headers available:', JSON.stringify(Object.fromEntries(headers.entries())));
      throw new Error('User not authenticated');
    }
    
    const ctx: AuthContext = {
      userId: userId, // TypeScript now knows userId is a string here
      roles: ['user'], // Default role
      email: 'developer@example.com' // Sample email
    };
    
    console.log('[withAuth] Using simplified authentication with user ID:', userId.substring(0, 8) + "...");
    return await handler(ctx);
  } catch (error: any) {
    console.error('[withAuth] Simplified auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Simplified role requirement middleware
 * In simplified auth, we allow access but track roles for future use
 */
export function requireRoles(requiredRoles: string[]) {
  return async function<T>(
    req: Request,
    handler: (ctx: AuthContext) => Promise<Response>
  ): Promise<Response> {
    return withAuth(req, async (ctx) => {
      // In simplified auth, we log role requirements but don't enforce them
      console.log('[requireRoles] Role check requested:', requiredRoles);
      console.log('[requireRoles] User roles:', ctx.roles);
      
      // Always allow access in simplified auth mode
      return handler(ctx);
    });
  };
}

/**
 * Simplified role assertion
 * In simplified auth, we check roles but don't block access
 */
export function assertRole(ctx: AuthContext, allowedRoles: string[]): void {
  // In simplified auth, we log role checks but don't enforce them
  console.log('[assertRole] Role assertion:', allowedRoles);
  console.log('[assertRole] User roles:', ctx.roles);
  
  // Always allow access in simplified auth mode
  return;
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