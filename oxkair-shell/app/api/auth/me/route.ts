import { NextRequest } from "next/server";
import { ProfileService } from "@/lib/services/profile-service";
import type { NormalizedUser } from "@/lib/auth/entra-utils";

// Helper functions to extract user info from principal (same logic as entra-utils)
function getOidFromPrincipal(principal: any): string {
  if (principal.oid) return principal.oid;

  if (principal.user_claims) {
    const oidClaim = principal.user_claims.find(
      (claim: any) =>
        claim.typ === "oid" ||
        claim.typ ===
          "http://schemas.microsoft.com/identity/claims/objectidentifier",
    );
    if (oidClaim) return oidClaim.val;
  }

  return "";
}

function getEmailFromPrincipal(principal: any): string {
  if (principal.email) return principal.email;
  if (principal.preferred_username) return principal.preferred_username;
  if (principal.user_id) return principal.user_id;

  if (principal.user_claims) {
    const emailClaim = principal.user_claims.find(
      (claim: any) =>
        claim.typ === "email" ||
        claim.typ === "preferred_username" ||
        claim.typ ===
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    );
    if (emailClaim) return emailClaim.val;
  }

  return "";
}

function getIssuerFromPrincipal(principal: any): string {
  if (principal.iss) return principal.iss;

  if (principal.user_claims) {
    const issClaim = principal.user_claims.find(
      (claim: any) => claim.typ === "iss",
    );
    if (issClaim) return issClaim.val;
  }

  return "";
}

function getNameIdentifierFromPrincipal(principal: any): string {
  if (principal.sub) return principal.sub;

  if (principal.user_claims) {
    const subClaim = principal.user_claims.find(
      (claim: any) =>
        claim.typ === "sub" ||
        claim.typ ===
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
    );
    if (subClaim) return subClaim.val;
  }

  return "";
}

function getNameFromPrincipal(principal: any): string {
  if (!principal.user_claims) return "";

  // Extract given name
  const givenNameClaim = principal.user_claims.find(
    (c: any) =>
      c.typ === "givenname" ||
      c.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
  );
  const givenName = givenNameClaim?.val || "";

  // Extract surname
  const surnameClaim = principal.user_claims.find(
    (c: any) =>
      c.typ === "surname" ||
      c.typ === "lastname" ||
      c.typ === "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
  );
  const surname = surnameClaim?.val || "";

  // Combine given name and surname
  if (givenName && surname) {
    return `${givenName} ${surname}`;
  }
  
  if (givenName) {
    return givenName;
  }
  
  if (surname) {
    return surname;
  }
  
  return "";
}

function getTenantIdFromPrincipal(principal: any): string {
  if (principal.tid) return principal.tid;

  if (principal.user_claims) {
    const tidClaim = principal.user_claims.find(
      (claim: any) =>
        claim.typ === "tid" ||
        claim.typ === "http://schemas.microsoft.com/identity/claims/tenantid",
    );
    if (tidClaim) return tidClaim.val;
  }

  return "";
}

export async function GET(request: NextRequest) {
  try {
    console.log("[/api/auth/me] Processing authentication request");

    const headersObject: { [key: string]: string } = {};
    request.headers.forEach((value, key) => {
      headersObject[key] = value;
    });
    console.log(
      "[/api/auth/me] Incoming headers:",
      JSON.stringify(headersObject, null, 2),
    );

    let user: NormalizedUser;

    // Primary: Use middleware-provided user info (this should always be available for authenticated users)
    const userOid = request.headers.get("x-user-oid");
    const userEmail = request.headers.get("x-user-email");

    console.log("[/api/auth/me] Middleware headers:", {
      hasOid: !!userOid,
      hasEmail: !!userEmail,
      oid: userOid?.substring(0, 8) + "...",
      email: userEmail,
    });

    // Be more favorable to authenticated users - use any available user info
    if (userOid || userEmail) {
      // Even minimal user info should be considered valid since users are pre-authenticated
      user = {
        oid: userOid || "",
        email: userEmail || "",
        name: request.headers.get("x-user-name") || userEmail || "",
        issuer: request.headers.get("x-user-issuer") || "",
        nameIdentifier: request.headers.get("x-user-name-identifier") || "",
        tenantId: request.headers.get("x-user-tenant-id") || "",
        providerName: request.headers.get("x-user-provider-name") || "aad",
        roles: (request.headers.get("x-user-roles") || "user").split(","),
        raw: request.headers.get("x-user-raw") ? JSON.parse(request.headers.get("x-user-raw")!) : {},
      };

      console.log("[/api/auth/me] Using middleware user data:", {
        hasOid: !!user.oid,
        hasEmail: !!user.email
      });
    } else {
      // Only if no OID, try other methods (shouldn't happen for authenticated users)
      // Check for development mode simulated header first
      const hasXmsHeader =
        request.headers.get("x-ms-client-principal") ||
        request.headers.get("X-MS-CLIENT-PRINCIPAL");
      const isDevMode = process.env.SIMULATE_XMS === "true";
      const devXmsHeader = process.env.DEV_XMS_HEADER;

      console.log("[/api/auth/me] No middleware headers. Checking dev mode:", {
        isDevMode,
        hasXmsHeader: !!hasXmsHeader,
        hasDevXmsHeader: !!devXmsHeader,
      });

      if (isDevMode && !hasXmsHeader && devXmsHeader) {
        console.log("[/api/auth/me] Using development simulated header");
        // Simulate the header by creating a mock request
        const mockRequest = {
          headers: {
            get: (name: string) => {
              if (name.toLowerCase() === "x-ms-client-principal") {
                return devXmsHeader;
              }
              return request.headers.get(name);
            },
          },
        } as any;

        try {
          // Import and use validateEasyAuthHeaders with simulated data
          const { validateEasyAuthHeaders } = await import(
            "@/lib/auth/entra-utils"
          );
          user = await validateEasyAuthHeaders(mockRequest);
          console.log("[/api/auth/me] Successfully parsed simulated header");
        } catch (error) {
          console.error(
            "[/api/auth/me] Failed to parse simulated header:",
            error,
          );
          return new Response(
            JSON.stringify({
              error: "Invalid simulated authentication",
              details: error instanceof Error ? error.message : String(error),
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
      } else {
        // Fallback: Call /.auth/me directly (same as middleware does)
        console.log("[/api/auth/me] No dev header, calling /.auth/me directly");

        const baseUrl = request.headers.get("host")
          ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}`
          : process.env.NEXTAUTH_URL || "http://localhost:3000";

        console.log("[/api/auth/me] Fetching from:", `${baseUrl}/.auth/me`);
        const authResponse = await fetch(`${baseUrl}/.auth/me`, {
          headers: {
            Cookie: request.headers.get("Cookie") || "",
          },
        });

        console.log("[/api/auth/me] /.auth/me response:", {
          status: authResponse.status,
          ok: authResponse.ok,
        });

        if (!authResponse.ok) {
          console.log(
            "[/api/auth/me] /.auth/me failed, user not authenticated",
          );
          return new Response(
            JSON.stringify({
              error: "Not authenticated",
              details: "Easy Auth endpoint returned non-200 status",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const authData = await authResponse.json();
        console.log("[/api/auth/me] /.auth/me data:", {
          isArray: Array.isArray(authData),
          length: authData?.length,
          hasData: !!authData,
        });

        if (!authData || authData.length === 0) {
          console.log(
            "[/api/auth/me] No authentication data in /.auth/me response",
          );
          return new Response(
            JSON.stringify({
              error: "No authentication data found",
              details: "Empty response from Easy Auth",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const principal = authData[0];

        console.log(
          "[/api/auth/me] Principal user_claims:",
          JSON.stringify(principal.user_claims, null, 2),
        );

        // Extract OID from user_claims - be more thorough in searching
        const oidClaim = principal.user_claims?.find(
          (c: any) =>
            c.typ === "oid" ||
            c.typ ===
              "http://schemas.microsoft.com/identity/claims/objectidentifier" ||
            c.typ ===
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier" ||
            c.typ.toLowerCase().includes("objectidentifier"),
        );
        const oid = oidClaim?.val || "";

        // Extract email - be more thorough in searching
        const emailClaim = principal.user_claims?.find(
          (c: any) =>
            c.typ === "email" ||
            c.typ === "preferred_username" ||
            c.typ ===
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" ||
            c.typ.toLowerCase().includes("emailaddress"),
        );
        const email = emailClaim?.val || principal.user_id || "";

        console.log("[/api/auth/me] Extracted claims:", {
          oidClaim: oidClaim
            ? { typ: oidClaim.typ, val: oidClaim.val?.substring(0, 8) + "..." }
            : null,
          emailClaim: emailClaim
            ? { typ: emailClaim.typ, val: emailClaim.val }
            : null,
          oid: oid?.substring(0, 8) + "...",
          email,
        });

        // Extract additional claims
        const issuerClaim = principal.user_claims?.find(
          (c: any) => c.typ === "iss",
        );
        const subClaim = principal.user_claims?.find(
          (c: any) =>
            c.typ === "sub" ||
            c.typ ===
              "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
        );
        const tidClaim = principal.user_claims?.find(
          (c: any) =>
            c.typ === "tid" ||
            c.typ === "http://schemas.microsoft.com/identity/claims/tenantid",
        );
        
        // Extract name
        const name = getNameFromPrincipal(principal);

        user = {
          oid,
          email,
          name,
          issuer: issuerClaim?.val || "",
          nameIdentifier: subClaim?.val || "",
          tenantId: tidClaim?.val || "",
          providerName: principal.provider_name || "aad",
          roles: ["user"],
          raw: principal,
        };

        console.log("[/api/auth/me] Extracted user from /.auth/me:", {
          oid: user.oid?.substring(0, 8) + "...",
          email: user.email,
          hasIssuer: !!user.issuer,
        });
      }
    }

    if (!user.oid) {
      console.error("[/api/auth/me] Missing user OID after authentication");
      return new Response(
        JSON.stringify({
          error: "Invalid user data",
          message: "Missing user identifier",
          userInfo: { hasEmail: !!user.email, hasIssuer: !!user.issuer },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Use ProfileService to find or create profile
    console.log("[/api/auth/me] Creating/finding profile for user:", {
      oid: user.oid?.substring(0, 8) + "...",
      email: user.email,
    });

    let profile;
    try {
      const profileService = new ProfileService();
      const result = await profileService.findOrCreateProfile(user);
      profile = result.profile;

      console.log("[/api/auth/me] Profile service result:", {
        profileId: profile.id?.substring(0, 8) + "...",
        profileEmail: profile.email,
        isOidBased: profile.id === user.oid,
      });

      // Return combined user and profile data
      // Key change: id and userId are now both the OID
      const responseData = {
        // User identity claims
        oid: user.oid,
        email: user.email,
        issuer: user.issuer,
        nameIdentifier: user.nameIdentifier,
        tenantId: user.tenantId,
        providerName: user.providerName,
        roles: user.roles,

        // Profile data - id is now the OID
        id: profile.id, // This is the OID (canonical identifier)
        userId: profile.id, // Legacy compatibility - also the OID
        name: profile.name || user.email,
        userCategory: profile.user_category,
        npi: profile.npi,
        recoveryEmail: profile.recovery_email,
        phoneNumber: profile.phone_number,
        verificationStatus: profile.verification_status || "not verified",
        institutionId: profile.institution_id,

        // Metadata
        user_metadata: {
          userCategory: profile.user_category,
          institutionId: profile.institution_id,
          npi: profile.npi,
          verificationStatus: profile.verification_status || "not verified",
        },
      };

      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (profileError) {
      console.error("[/api/auth/me] Profile service failed:", profileError);

      // Return fallback user data when the profile service is unavailable
      // Key change: Use OID as both id and userId in fallback
      const fallbackData = {
        // User identity claims
        oid: user.oid,
        email: user.email,
        issuer: user.issuer,
        nameIdentifier: user.nameIdentifier,
        tenantId: user.tenantId,
        providerName: user.providerName,
        roles: user.roles,

        // Fallback profile data (using OID as ID)
        id: user.oid, // Use OID as primary identifier
        userId: user.oid, // Legacy compatibility - also use OID
        name: user.email, // Use email as display name
        userCategory: null,
        npi: null,
        recoveryEmail: null,
        phoneNumber: null,
        verificationStatus: "not verified",
        institutionId: null,

        // Metadata
        user_metadata: {
          verificationStatus: "not verified",
        },

        // Mark as fallback data
        _fallback: true,
        _profileError:
          profileError instanceof Error
            ? profileError.message
            : String(profileError),
      };

      return new Response(JSON.stringify(fallbackData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Error in /api/auth/me:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
