import { NextResponse, NextRequest } from "next/server";
import { validateEasyAuthHeaders } from "@/lib/auth/entra-utils";

// Dev-only header injection for local test harness
// Since Edge Runtime doesn't support fs/path, we'll use an environment variable
const SIMULATE_XMS =
  process.env.SIMULATE_XMS === "true" || process.env.NODE_ENV === "development";
const SIMULATED_XMS_BASE64 = process.env.DEV_XMS_HEADER;

export async function middleware(request: NextRequest) {
  // DEV-only injection: if header missing, inject it from environment
  if (SIMULATE_XMS) {
    try {
      const hasXmsHeader = !!(
        request.headers.get("x-ms-client-principal") ||
        request.headers.get("X-MS-CLIENT-PRINCIPAL")
      );
      if (!hasXmsHeader && SIMULATED_XMS_BASE64) {
        // Use a custom property to store the simulated header
        // This will be picked up by the validateEasyAuthHeaders function
        (request as any).simulatedXmsHeader = SIMULATED_XMS_BASE64;

        // Also accept an override header for per-request testing
        const localXms = request.headers.get("x-local-xms");
        if (localXms) {
          (request as any).simulatedXmsHeader = localXms;
        }

        console.log("[DEV] Set simulated x-ms-client-principal for request");
      }
    } catch (e) {
      console.warn("[DEV] Failed to set simulated x-ms header:", e);
    }
  }

  // Allow health check, debug endpoints, and auth endpoints through without authentication
  if (
    request.nextUrl.pathname === "/api/healthz" ||
    request.nextUrl.pathname === "/api/health" ||
    request.nextUrl.pathname === "/health" ||
    request.nextUrl.pathname === "/healthz" ||
    request.nextUrl.pathname === "/api/debug-headers" ||
    request.nextUrl.pathname === "/debug-auth" ||
    request.nextUrl.pathname.startsWith("/.auth/")
  ) {
    return NextResponse.next();
  }

  // Handle root path - be more favorable to authenticated users
  if (request.nextUrl.pathname === "/") {
    try {
      // Check if we have user headers from previous middleware processing
      // Even minimal user info should trigger redirect to dashboard
      const userOid = request.headers.get("x-user-oid");
      const userEmail = request.headers.get("x-user-email");
      const userId = request.headers.get("x-user-id"); // Additional check
      
      // Be more permissive - any user info indicates authenticated user
      if (userOid || userEmail || userId) {
        console.log("[Middleware] User info found, redirecting to dashboard:", {
          hasOid: !!userOid,
          hasEmail: !!userEmail,
          hasId: !!userId
        });
        return NextResponse.redirect(new URL("/coder/comprehensive", request.url));
      }
      
      // Only continue to landing page if truly no user info
      console.log("[Middleware] No user info found, continuing to landing page");
      return NextResponse.next();
    } catch (error) {
      console.error("[Middleware] Error in root path handling:", error);
      // Continue to landing page on error
      return NextResponse.next();
    }
  }

  // Redirect old /cases route to comprehensive dashboard
  if (request.nextUrl.pathname === "/cases") {
    return NextResponse.redirect(new URL("/coder/comprehensive", request.url));
  }

  // Handle case number routing - ensure case numbers (CASE-####) are properly routed
  const caseNumberPattern =
    /\/(?:cases|coder\/comprehensive)\/(CASE-\d{4})(?:\/|$)/;
  const match = request.nextUrl.pathname.match(caseNumberPattern);

  if (match) {
    const caseNumber = match[1];
    console.log(`Middleware: Routing request for case number ${caseNumber}`);
    // Allow the request to proceed - the components will handle case number resolution
    return NextResponse.next();
  }

  // Handle legacy UUID routing for backward compatibility
  const uuidPattern =
    /\/(?:cases|coder\/comprehensive)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/i;
  const uuidMatch = request.nextUrl.pathname.match(uuidPattern);

  if (uuidMatch) {
    const uuid = uuidMatch[1];
    console.log(`Middleware: Routing request for legacy UUID ${uuid}`);
    // Allow the request to proceed - the components will handle UUID lookup
    return NextResponse.next();
  }

  // Check if this is a protected route
  // const isProtectedRoute =
  //   request.nextUrl.pathname.startsWith("/api") ||
  //   request.nextUrl.pathname.startsWith("/coder");

  // if (isProtectedRoute) {
  //   // Skip auth validation for the /api/auth/me endpoint to avoid circular dependency
  //   // but still allow it to access the simulated header for development
  //   if (request.nextUrl.pathname === "/api/auth/me") {
  //     return NextResponse.next();
  //   }

  //   try {
  //     // Mark request as middleware context to avoid circular dependencies
  //     (request as any).isMiddleware = true;

  //     // First try the /.auth/me endpoint directly (works in Azure production)
  //     const authResponse = await fetch(
  //       new URL("/.auth/me", request.url).toString(),
  //       {
  //         headers: {
  //           Cookie: request.headers.get("Cookie") || "",
  //         },
  //       },
  //     );

  //     if (authResponse.ok) {
  //       const authData = await authResponse.json();
  //       console.log(
  //         "[Middleware] /.auth/me response data:",
  //         JSON.stringify(authData, null, 2),
  //       );

  //       // If we get valid auth data, extract user info and continue
  //       if (authData && authData.length > 0) {
  //         const principal = authData[0];

  //         console.log(
  //           "[Middleware] Principal user_claims:",
  //           JSON.stringify(principal.user_claims, null, 2),
  //         );

  //         // Extract OID from user_claims - be more thorough in searching
  //         const oidClaim = principal.user_claims?.find(
  //           (c: any) =>
  //             c.typ === "oid" ||
  //             c.typ ===
  //               "http://schemas.microsoft.com/identity/claims/objectidentifier" ||
  //             c.typ ===
  //               "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier" ||
  //             c.typ.toLowerCase().includes("objectidentifier"),
  //         );
  //         const oid = oidClaim?.val || "";

  //         // Extract email - be more thorough in searching
  //         const emailClaim = principal.user_claims?.find(
  //           (c: any) =>
  //             c.typ === "email" ||
  //             c.typ === "preferred_username" ||
  //             c.typ ===
  //               "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" ||
  //             c.typ.toLowerCase().includes("emailaddress"),
  //         );
  //         const email = emailClaim?.val || principal.user_id || "";

  //         console.log("[Middleware] Extracted claims:", {
  //           oidClaim: oidClaim
  //             ? {
  //                 typ: oidClaim.typ,
  //                 val: oidClaim.val?.substring(0, 8) + "...",
  //               }
  //             : null,
  //           emailClaim: emailClaim
  //             ? { typ: emailClaim.typ, val: emailClaim.val }
  //             : null,
  //           oid: oid?.substring(0, 8) + "...",
  //           email,
  //         });

  //         if (oid && email) {
  //           const requestHeaders = new Headers(request.headers);
  //           // Extract additional claims
  //           const issuerClaim = principal.user_claims?.find(
  //             (c: any) => c.typ === "iss",
  //           );
  //           const subClaim = principal.user_claims?.find(
  //             (c: any) =>
  //               c.typ === "sub" ||
  //               c.typ ===
  //                 "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
  //           );
  //           const tidClaim = principal.user_claims?.find(
  //             (c: any) =>
  //               c.typ === "tid" ||
  //               c.typ ===
  //                 "http://schemas.microsoft.com/identity/claims/tenantid",
  //           );

  //           requestHeaders.set("x-user-oid", oid);
  //           requestHeaders.set("x-user-email", email);
  //           requestHeaders.set("x-user-issuer", issuerClaim?.val || "");
  //           requestHeaders.set("x-user-name-identifier", subClaim?.val || "");
  //           requestHeaders.set("x-user-tenant-id", tidClaim?.val || "");
  //           requestHeaders.set(
  //             "x-user-provider-name",
  //             principal.provider_name || "aad",
  //           );
  //           requestHeaders.set("x-user-roles", "user");
  //           requestHeaders.set("x-user-raw", JSON.stringify(principal));

  //           const response = NextResponse.next({
  //             request: { headers: requestHeaders },
  //           });
  //           response.headers.set("x-user-oid", oid);
  //           response.headers.set("x-user-email", email);
  //           response.headers.set("x-user-issuer", issuerClaim?.val || "");
  //           response.headers.set("x-user-name-identifier", subClaim?.val || "");
  //           response.headers.set("x-user-tenant-id", tidClaim?.val || "");
  //           response.headers.set(
  //             "x-user-provider-name",
  //             principal.provider_name || "aad",
  //           );
  //           response.headers.set("x-user-roles", "user");
  //           response.headers.set("x-user-raw", JSON.stringify(principal));

  //           console.log(
  //             "[Middleware] Successfully authenticated user via /.auth/me:",
  //             {
  //               oid: oid.substring(0, 8) + "...",
  //               email,
  //               path: request.nextUrl.pathname,
  //             },
  //           );

  //           return response;
  //         }
  //       }
  //     }

  //     console.log(
  //       "[Middleware] /.auth/me call did not result in successful authentication. Trying Easy Auth headers fallback.",
  //     );

  //     // Fallback: Try to validate authentication using Easy Auth headers (works with simulated headers in dev)
  //     const user = await validateEasyAuthHeaders(request);

  //     const requestHeaders = new Headers(request.headers);
  //     requestHeaders.set("x-user-oid", user.oid);
  //     requestHeaders.set("x-user-email", user.email);
  //     requestHeaders.set("x-user-issuer", user.issuer);
  //     requestHeaders.set("x-user-name-identifier", user.nameIdentifier);
  //     requestHeaders.set("x-user-tenant-id", user.tenantId);
  //     requestHeaders.set("x-user-provider-name", user.providerName);
  //     requestHeaders.set("x-user-roles", user.roles.join(","));
  //     requestHeaders.set("x-user-raw", JSON.stringify(user.raw));

  //     const response = NextResponse.next({
  //       request: { headers: requestHeaders },
  //     });
  //     response.headers.set("x-user-oid", user.oid);
  //     response.headers.set("x-user-email", user.email);
  //     response.headers.set("x-user-issuer", user.issuer);
  //     response.headers.set("x-user-name-identifier", user.nameIdentifier);
  //     response.headers.set("x-user-tenant-id", user.tenantId);
  //     response.headers.set("x-user-provider-name", user.providerName);
  //     response.headers.set("x-user-roles", user.roles.join(","));
  //     response.headers.set("x-user-raw", JSON.stringify(user.raw));

  //     console.log(
  //       "[Middleware] Successfully authenticated user via X-MS-CLIENT-PRINCIPAL:",
  //       {
  //         oid: user.oid.substring(0, 8) + "...",
  //         email: user.email,
  //         path: request.nextUrl.pathname,
  //       },
  //     );

  //     return response;
  //   } catch (error) {
  //     console.error("Authentication failed in middleware:", error);

  //     // Completely passive authentication - never redirect to Microsoft login
  //     // For API routes, return 401
  //     if (request.nextUrl.pathname.startsWith("/api")) {
  //       return new Response(
  //         JSON.stringify({
  //           error: "Unauthorized",
  //           message: "Authentication required",
  //         }),
  //         { status: 401, headers: { "Content-Type": "application/json" } },
  //       );
  //     }

  //     // For UI routes, continue to the requested page without authentication
  //     // This prevents redirect loops while still allowing access to protected content
  //     console.log("[Middleware] Authentication failed, allowing access without redirect to login");
  //     return NextResponse.next();
  //   }
  // }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
