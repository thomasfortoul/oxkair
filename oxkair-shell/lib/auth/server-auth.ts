import { headers } from 'next/headers';
import type { AppAuth } from '@/lib/auth/entra-utils';

export interface ServerAuthContext {
  userId: string;
  roles: string[];
  email?: string;
  user_metadata?: {
    firstName?: string;
    lastName?: string;
    userCategory?: string;
    institutionId?: string;
    npi?: string;
  };
}

/**
 * Server-side authentication utility functions
 * Handles user authentication and authorization for server-side operations
 */

import { cookies } from 'next/headers';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { NextRequest } from 'next/server';

interface AuthenticatedUser {
  oid: string;
  email?: string;
  roles: string[];
  [key: string]: any;
}

// JWKS endpoint for validating tokens
const JWKS = process.env.JWKS_ENDPOINT 
  ? createRemoteJWKSet(new URL(process.env.JWKS_ENDPOINT))
  : null;

/**
 * Authenticate a user from a request
 * In development, uses a sample OID
 */
export async function authenticateUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  // In non-production environments, use sample OID
  if (process.env.NODE_ENV === 'development') {
    const userId = process.env.SAMPLE_USER_OID ||  '';
    return {
      oid: userId,
      email: 'developer@example.com',
      roles: ['user']
    };
  }
  
  // In production, we should have real authentication
  // This is a placeholder - in a real implementation, we would validate the token
  throw new Error('User not authenticated in production environment');
}

/**
 * Get user context for server-side operations
 * In development, uses a sample OID
 */
export async function getUserContext(): Promise<{ userId: string; roles: string[] }> {
  // In non-production environments, use sample OID
  if (process.env.NODE_ENV === 'development') {
    const userId = process.env.SAMPLE_USER_OID ||  '';
    return {
      userId,
      roles: ['user']
    };
  }
  
  // In production, extract user ID from headers (similar to withAuth)
  // We need to access headers in a Next.js server action context
  const headersList = await headers();
  
  let userId: string | undefined;

  // 1. Primary: Check for our internal 'x-user-oid' header set by middleware
  userId = headersList.get('x-user-oid') || undefined;

  // 2. Fallback: Check for Azure's simple ID header
  if (!userId) {
    userId = headersList.get('x-ms-client-principal-id') || undefined;
  }

  // 3. Last Resort: Decode the detailed principal header from Azure
  if (!userId) {
    const principalHeader = headersList.get('x-ms-client-principal');
    if (principalHeader) {
      try {
        const decoded = Buffer.from(principalHeader, 'base64').toString('utf-8');
        const principal = JSON.parse(decoded);
        // Handle both array and object formats
        const principalData = Array.isArray(principal) ? principal[0] : principal;
        
        // Look for OID in claims
        if (principalData.claims && Array.isArray(principalData.claims)) {
          const oidClaim = principalData.claims.find(
            (c: any) => c.typ === 'http://schemas.microsoft.com/identity/claims/objectidentifier' || c.typ === 'oid'
          );
          if (oidClaim && oidClaim.val) {
            userId = oidClaim.val;
          }
        }
        
        // Fallback to oid property directly
        if (!userId && principalData.oid) {
          userId = principalData.oid;
        }
      } catch (e) {
        console.error("[getUserContext] Failed to decode 'x-ms-client-principal' header", e);
      }
    }
  }

  // Validate that we have a user ID
  if (!userId) {
    const headersObj: Record<string, string> = {};
    headersList.forEach((value, key) => {
      // Avoid logging sensitive header values
      if (!key.toLowerCase().includes('authorization') && !key.toLowerCase().includes('cookie')) {
        headersObj[key] = value.length > 100 ? `${value.substring(0, 100)}...` : value;
      }
    });
    console.error('[getUserContext] Unauthorized: Could not determine user ID. Available headers:', JSON.stringify(headersObj));
    throw new Error('User not authenticated in production environment');
  }
  
  return {
    userId,
    roles: ['user']
  };
}

/**
 * Assert that the user has required roles in server actions
 * In simplified auth, we log but don't block access
 */
export function assertServerRole(ctx: ServerAuthContext, allowedRoles: string[]): void {
  // In simplified auth, we log role checks but don't enforce them
  console.log('[assertServerRole] Role assertion:', allowedRoles);
  console.log('[assertServerRole] User roles:', ctx.roles);
  
  // Always allow access in simplified auth mode
  return;
}

/**
 * Create RequestContext for pg-service from server auth context
 */
export function createRequestContextFromServer(ctx: ServerAuthContext): { userId: string; roles: string[]; email?: string } {
  return {
    userId: ctx.userId,
    roles: ctx.roles,
    email: ctx.email
  };
}