// entra-utils.ts
// Improved, robust parsing of Easy Auth (X-MS-CLIENT-PRINCIPAL) payloads
// Keeps original development structure (simulated header, createDevAuth, etc.)
// Replaces claim extraction logic with tolerant checks for the variety of claim shapes
// seen in production (typ/val, type/value, schema URIs, short names, sub/nameid fallbacks).

export interface NormalizedUser {
  oid: string;
  email: string;
  name: string;
  issuer: string;
  nameIdentifier: string;
  tenantId: string;
  providerName: string;
  roles: string[];
  raw: any;
}

export type AppAuth = {
  userId: string; // Entra OID (oid)
  email?: string;
  roles: string[]; // appRoles (preferred) or mapped group names
  raw: any;
};

/**
 * Helper: safely get candidate arrays from principal using many possible keys
 */
function getClaimsArray(principal: any): any[] | undefined {
  if (!principal) return undefined;
  // Common keys we might see
  const keys = ['claims', 'user_claims', 'userClaims', 'user_claim', 'user_claims_array', 'user_claim_array'];
  for (const k of keys) {
    if (Array.isArray(principal[k])) return principal[k];
  }
  // Some Easy Auth variants wrap claims under "user_claims" or "claims" - if not found, try "claims" fallback
  if (Array.isArray((principal as any).claims)) return principal.claims;
  return undefined;
}

/**
 * Normalize a single claim object to { typ, val } shape regardless of source keys
 */
function normalizeClaim(claim: any): { typ: string; val: string } | null {
  if (!claim) return null;
  // possible type keys: typ, type, claimType
  const typ = (claim.typ || claim.type || claim.claimType || '').toString();
  // possible value keys: val, value
  const val = (claim.val || claim.value || claim.claimValue || '').toString();
  if (!typ && !val) return null;
  return { typ, val };
}

/**
 * Find a claim by candidate types (case-insensitive). Also supports heuristic matching.
 */
function findClaimValueFromArray(claims: any[] | undefined, candidates: string[] = []): { value: string | null; matchedType?: string | null } {
  if (!claims || !claims.length) return { value: null, matchedType: null };
  const lowerCandidates = candidates.map(c => c.toLowerCase());

  // First pass: exact match against normalized typ
  for (const rawClaim of claims) {
    const n = normalizeClaim(rawClaim);
    if (!n) continue;
    const t = n.typ.toLowerCase();
    for (const cand of lowerCandidates) {
      if (t === cand) {
        return { value: n.val || null, matchedType: n.typ };
      }
    }
  }

  // Second pass: endsWith / contains heuristics
  for (const rawClaim of claims) {
    const n = normalizeClaim(rawClaim);
    if (!n) continue;
    const t = n.typ.toLowerCase();
    // common schema URIs end with objectidentifier, emailaddress, upn, nameidentifier, or contain 'oid'
    if (t.endsWith('objectidentifier') || t.endsWith('/oid') || t.includes('/oid') || t.endsWith('nameidentifier')) {
      return { value: n.val || null, matchedType: n.typ };
    }
    if (t.endsWith('emailaddress') || t.includes('/email') || t.includes('emailaddress')) {
      return { value: n.val || null, matchedType: n.typ };
    }
    if (t.endsWith('/upn') || t.includes('preferred_username') || t.includes('upn')) {
      return { value: n.val || null, matchedType: n.typ };
    }
    if (t === 'sub') {
      return { value: n.val || null, matchedType: n.typ };
    }
  }

  // Last resort: return first non-empty value
  for (const rawClaim of claims) {
    const n = normalizeClaim(rawClaim);
    if (!n) continue;
    if (n.val) return { value: n.val, matchedType: n.typ };
  }

  return { value: null, matchedType: null };
}

/**
 * Extract OID from principal
 */
function getOid(principal: any): string {
  if (!principal) return '';

  // Direct properties often present
  if (principal.oid && typeof principal.oid === 'string' && principal.oid.trim()) return principal.oid;

  // Sometimes principal has short properties like 'sub' containing stable id
  if (principal.sub && typeof principal.sub === 'string' && principal.sub.trim()) {
    return principal.sub;
  }

  // Search claims arrays
  const claims = getClaimsArray(principal);
  // candidate names to check explicitly
  const oidCandidates = [
    'oid',
    'http://schemas.microsoft.com/identity/claims/objectidentifier',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/objectidentifier',
    'objectidentifier',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn'
  ];
  const { value } = findClaimValueFromArray(claims, oidCandidates);

  // If we got a UPN value (contains @), extract just the GUID part before @
  if (value && value.includes('@')) {
    const guidPart = value.split('@')[0];
    // Validate it looks like a GUID (basic check)
    if (guidPart && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guidPart)) {
      return guidPart;
    }
  }

  return value || '';
}

/**
 * Extract email from principal
 */
function getEmail(principal: any): string {
  if (!principal) return '';

  // direct properties
  const directEmail = principal.email || principal.preferred_username || principal.upn || principal.user_id || principal.name;
  if (typeof directEmail === 'string' && directEmail.trim() && directEmail.includes('@')) return directEmail;

  // claims arrays
  const claims = getClaimsArray(principal);
  const emailCandidates = [
    'email',
    'emails',
    'preferred_username',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn',
    'upn'
  ];
  const { value } = findClaimValueFromArray(claims, emailCandidates);
  return value || '';
}

/**
 * Extract given name from principal
 */
function getGivenName(principal: any): string {
  if (!principal) return '';

  // claims arrays
  const claims = getClaimsArray(principal);
  const { value } = findClaimValueFromArray(claims, [
    'givenname',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'
  ]);
  return value || '';
}

/**
 * Extract surname from principal
 */
function getSurname(principal: any): string {
  if (!principal) return '';

  // claims arrays
  const claims = getClaimsArray(principal);
  const { value } = findClaimValueFromArray(claims, [
    'surname',
    'lastname',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'
  ]);
  return value || '';
}

/**
 * Extract full name from principal (given name + surname)
 */
function getName(principal: any): string {
  if (!principal) return '';

  const givenName = getGivenName(principal);
  const surname = getSurname(principal);
  
  if (givenName && surname) {
    return `${givenName} ${surname}`;
  }
  
  if (givenName) {
    return givenName;
  }
  
  if (surname) {
    return surname;
  }
  
  // Fallback to name property if available
  const directName = principal.name;
  if (typeof directName === 'string' && directName.trim()) {
    return directName;
  }
  
  return '';
}

/**
 * Extract issuer (iss) from principal
 */
function getIssuer(principal: any): string {
  if (!principal) return '';
  if (principal.iss && typeof principal.iss === 'string') return principal.iss;

  // claims arrays might include iss
  const claims = getClaimsArray(principal);
  const { value } = findClaimValueFromArray(claims, ['iss']);
  return value || '';
}

/**
 * Extract name identifier (sub / nameid) from principal
 */
function getNameIdentifier(principal: any): string {
  if (!principal) return '';
  if (principal.sub && typeof principal.sub === 'string') return principal.sub;

  const claims = getClaimsArray(principal);
  const { value } = findClaimValueFromArray(claims, [
    'sub',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
    'nameidentifier'
  ]);
  return value || '';
}

/**
 * Extract tenant id (tid) from principal
 */
function getTenantId(principal: any): string {
  if (!principal) return '';
  if (principal.tid && typeof principal.tid === 'string') return principal.tid;

  const claims = getClaimsArray(principal);
  const { value } = findClaimValueFromArray(claims, [
    'tid',
    'http://schemas.microsoft.com/identity/claims/tenantid',
    'tenantid'
  ]);
  return value || '';
}

/**
 * Provider name
 */
function getProviderName(principal: any): string {
  // principal.provider_name sometimes exists on .auth/me objects
  return principal && (principal.provider_name || principal.auth_typ || 'aad') || 'aad';
}

/**
 * Extract roles from principal
 */
function getRoles(principal: any): string[] {
  if (!principal) return [];

  // direct roles array
  if (Array.isArray(principal.userRoles) && principal.userRoles.length) return principal.userRoles;

  // try well-known claim arrays
  const claims = getClaimsArray(principal) || [];

  // Collect role claims from typical role claim names/schemas
  const roleCandidates = [
    'roles',
    'role',
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/roles'
  ];

  const roles: string[] = [];
  for (const rawClaim of claims) {
    const n = normalizeClaim(rawClaim);
    if (!n || !n.typ) continue;
    const t = n.typ.toLowerCase();
    if (roleCandidates.some(rc => t === rc || t.endsWith(rc) || t.includes('/role') || t.includes('/roles'))) {
      // claim.val may be a single role or comma separated list; be defensive
      if (!n.val) continue;
      const parts = String(n.val).split(',').map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!roles.includes(p)) roles.push(p);
      }
    }
  }

  // Some tokens include 'groups' claim which are GUIDs - map groups to roles if desired elsewhere
  // For now return roles found; mapping is handled by mapGroupsToRoles if used.
  return roles;
}



/**
 * Read user info from Easy Auth headers (X-MS-CLIENT-PRINCIPAL)
 * Simplified version - primarily for development/testing
 * Production should use /.auth/me endpoint via middleware
 */
export async function validateEasyAuthHeaders(request: Request): Promise<NormalizedUser> {
  let clientPrincipal = (request.headers.get('X-MS-CLIENT-PRINCIPAL') || request.headers.get('x-ms-client-principal')) as string | null;

  // DEV-only: Check for simulated header from middleware
  if (!clientPrincipal && (request as any).simulatedXmsHeader) {
    clientPrincipal = (request as any).simulatedXmsHeader;
    console.log('[DEV] Using simulated X-MS-CLIENT-PRINCIPAL header');
  }

  if (!clientPrincipal) {
    throwUnauthorized('Missing authentication headers - Easy Auth not configured');
  }

  try {
    // Decode base64 client principal
    const decoded = Buffer.from(clientPrincipal, 'base64').toString('utf-8');
    let principal: any = JSON.parse(decoded);

    // Handle case where the decoded JSON is an array (some Easy Auth variants)
    if (Array.isArray(principal)) {
      if (principal.length === 0) {
        throwUnauthorized('Invalid authentication: empty principal array');
      }
      principal = principal[0];
    }

    // Normalized extraction
    const oid = getOid(principal);
    const email = getEmail(principal);
    const name = getName(principal);
    const issuer = getIssuer(principal);
    const nameIdentifier = getNameIdentifier(principal);
    const tenantId = getTenantId(principal);
    const providerName = getProviderName(principal);
    let roles = getRoles(principal);

    // If no roles found, look for groups -> map to roles (mapGroupsToRoles) if implemented
    if ((!roles || roles.length === 0) && Array.isArray(principal.groups)) {
      roles = mapGroupsToRoles(principal.groups);
    }

    // If still no roles, try extracting from claims that might be list-like
    if ((!roles || roles.length === 0)) {
      // fallback default role
      roles = ['user'];
    }

    if (!oid) {
      // Helpful debug: include a preview of claims in logs (avoid full PII in production)
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AUTH] Missing oid claim. Principal preview:', JSON.stringify(principal).slice(0, 1000));
      } else {
        console.warn('[AUTH] Missing oid claim for request - principal present but no oid resolved');
      }
      throwUnauthorized('Invalid authentication: missing user identifier');
    }

    console.log('[AUTH] Successfully parsed X-MS-CLIENT-PRINCIPAL header');
    return {
      oid,
      email,
      name,
      issuer,
      nameIdentifier,
      tenantId,
      providerName,
      roles,
      raw: principal
    };
  } catch (error: any) {
    console.error('Easy Auth header parsing failed:', error && error.message ? error.message : error);
    throwUnauthorized('Invalid authentication headers');
  }
}

/**
 * Map Entra ID group IDs to application role names
 * Configure this mapping based on your Entra ID group setup
 */
function mapGroupsToRoles(groups: string[] = []): string[] {
  const groupRoleMap: Record<string, string> = {
    // Example mappings - replace with your actual group IDs
    '11111111-1111-1111-1111-111111111111': 'admin',
    '22222222-2222-2222-2222-222222222222': 'processor',
    '33333333-3333-3333-3333-333333333333': 'provider',
    '44444444-4444-4444-4444-444444444444': 'user'
  };

  return groups
    .map(groupId => groupRoleMap[groupId])
    .filter(Boolean) as string[];
}

/**
 * Extract user context from request headers (legacy compatibility)
 */
export async function getUserContextFromRequest(request: Request): Promise<AppAuth> {
  const normalizedUser = await validateEasyAuthHeaders(request);
  return {
    userId: normalizedUser.oid,
    email: normalizedUser.email,
    roles: normalizedUser.roles,
    raw: normalizedUser.raw
  };
}

/**
 * Check if user has required role
 */
export function hasRole(auth: AppAuth, requiredRole: string): boolean {
  return auth.roles.includes('admin') || auth.roles.includes(requiredRole);
}

/**
 * Check if user has any of the required roles
 */
export function hasAnyRole(auth: AppAuth, requiredRoles: string[]): boolean {
  if (auth.roles.includes('admin')) return true;
  return requiredRoles.some(role => auth.roles.includes(role));
}

/**
 * Throw unauthorized error
 */
function throwUnauthorized(message: string = 'Unauthorized'): never {
  const error = new Error(message) as any;
  error.status = 401;
  throw error;
}

/**
 * Development mode bypass for testing
 * Only use in development environment with proper safeguards
 */
export function createDevAuth(userId: string, roles: string[] = ['user']): AppAuth {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development auth bypass not allowed in production');
  }

  console.warn('Using development auth bypass - not for production use');
  return {
    userId,
    email: `dev-user-${userId}@example.com`,
    roles,
    raw: { dev: true }
  };
}
