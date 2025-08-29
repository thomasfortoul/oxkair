/**
 * Utility functions for case management
 */

/**
 * Generate a case number from medical note data
 * Replicates the logic from the old supabase-service getCaseNumber function
 */
export function getCaseNumber(medicalNote: any): string {
  return medicalNote.case_number || `Case ${medicalNote.id?.slice(0, 8) || 'Unknown'}`;
}

/**
 * Create a RequestContext object from user data for pg-service calls
 * Updated to work with both old Supabase user format and new Easy Auth format
 */
export function createRequestContext(user: any): { userId: string; roles: string[]; email?: string } {
  // Handle Easy Auth format (from server auth context)
  if (user.roles && Array.isArray(user.roles)) {
    return {
      userId: user.oid || user.userId || user.id, // Use OID first, then fallback to userId, then id
      roles: user.roles,
      email: user.email
    };
  }
  
  // Handle legacy Supabase format for backward compatibility
  const userCategory = user?.user_metadata?.userCategory || 'coder';
  
  // Map user categories to roles
  const roleMapping: { [key: string]: string[] } = {
    'Provider': ['provider'],
    'coder': ['coder'],
    'Admin': ['admin']
  };

  return {
    userId: user.id,
    roles: roleMapping[userCategory] || ['coder'],
    email: user.email
  };
}