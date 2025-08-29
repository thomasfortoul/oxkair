Last updated: 2025-08-21 12:00 UTC

# Authentication

This document provides a detailed overview of the authentication system in the Qwen application, tracing the flow from the initial request to the final authenticated state on the client.

## 1. Overview

The Qwen system uses a **passive authentication** model built on **Azure App Service's "Easy Auth"** feature with Azure Entra ID. This means the Next.js application itself does not handle logins or redirects to identity providers. Instead, it trusts Azure to manage the authentication process and expects user identity information to be present in the request headers.

The core principle is to validate the headers provided by Azure, establish a user session, and then manage that session on both the server and client.

## 2. Authentication Flow

The authentication process can be broken down into four main stages:

### Stage 1: Azure Easy Auth (External)

1.  A user attempts to access a protected route in the application.
2.  Azure App Service intercepts the request. If the user is not authenticated, it redirects them to the configured Azure Entra ID login page.
3.  After a successful login, Azure sets encrypted cookies and forwards the request to the Next.js application, injecting headers with the user's identity information, most notably `X-MS-CLIENT-PRINCIPAL`.

### Stage 2: Middleware Processing

The middleware is the first point of contact for all incoming requests within the Next.js application.

*   **File**: `oxkair-shell/middleware.ts`

1.  **Header Injection (Development)**: In a local development environment, the middleware injects a simulated `X-MS-CLIENT-PRINCIPAL` header from the `DEV_XMS_HEADER` environment variable to mimic the Azure environment.
2.  **Authentication Validation**: The middleware calls `validateEasyAuthHeaders` to parse and validate the `X-MS-CLIENT-PRINCIPAL` header. This function decodes the base64-encoded header and extracts a normalized user object.
3.  **Header Propagation**: The normalized user information (OID, email, roles, etc.) is injected into the request headers with the `x-user-*` prefix (e.g., `x-user-oid`, `x-user-email`).
4.  **Request Forwarding**: The request, now enriched with user identity headers, is forwarded to the appropriate API route or page.

### Stage 3: API-Side User & Profile Hydration

The `/api/auth/me` endpoint is responsible for taking the user identity from the headers and associating it with a user profile from the database.

*   **File**: `oxkair-shell/app/api/auth/me/route.ts`

1.  **Header Consumption**: The endpoint reads the `x-user-*` headers that were set by the middleware.
2.  **Profile Service**: It uses the `ProfileService` to find a user profile in the PostgreSQL database matching the `x-user-oid`.
3.  **Profile Creation**: If no profile exists, a new one is created on-the-fly.
4.  **Combined Response**: The endpoint returns a JSON object that combines the user's authentication claims (from the headers) and their profile information (from the database). This becomes the canonical user object for the client-side session.

### Stage 4: Client-Side Session Management

The `AuthProvider` component manages the user's session in the browser.

*   **File**: `oxkair-shell/lib/auth/auth-context.tsx`

1.  **Initial Fetch**: When the application loads, the `AuthProvider` makes a `fetch` request to `/api/auth/me`.
2.  **State Hydration**: Upon receiving a successful response, it populates the `user` object in the `AuthContext` with the combined auth and profile data.
3.  **Context Provision**: The `user` object, along with `isLoading` and `error` states, is made available to all components wrapped by the provider.
4.  **Accessing User Data**: Components like the `ComprehensiveDashboardPage` can then use the `useAuth()` hook to access the authenticated user's information (e.g., `user.id`, `user.email`) to fetch user-specific data.

## 3. Protecting API Routes

API routes are protected using the `withAuth` higher-order function.

*   **File**: `oxkair-shell/app/api/_lib/with-auth.ts`

This wrapper inspects the request headers for the `x-user-oid` (or falls back to Azure's `x-ms-client-principal-id`) to ensure that a request is authenticated before allowing it to proceed to the handler. If no user ID is found, it returns a `401 Unauthorized` response.

## 4. Key Files

| File | Role |
| --- | --- |
| `oxkair-shell/middleware.ts` | Intercepts all requests, validates auth headers, and injects user info into request headers. |
| `oxkair-shell/lib/auth/entra-utils.ts` | Contains the logic for parsing and normalizing the `X-MS-CLIENT-PRINCIPAL` header. |
| `oxkair-shell/app/api/auth/me/route.ts` | API endpoint that serves as the bridge between the server-side auth headers and the client-side session. Finds or creates a user profile. |
| `oxkair-shell/lib/auth/auth-context.tsx` | React context provider that fetches the user from `/api/auth/me` and manages the client-side session state. |
| `oxkair-shell/app/api/_lib/with-auth.ts` | A wrapper function used to protect API routes by verifying the presence of a user ID in the headers. |
| `oxkair-shell/app/coder/comprehensive/page.tsx` | An example of a protected page that uses the `useAuth()` hook to get the user's data and fetch their cases. |

---

## Update Checklist

*   [ ] Update the authentication flow diagram if the sequence of events changes.
*   [ ] Add any new key files or services involved in the authentication process.
*   [ ] Document any changes to the header names (`X-MS-CLIENT-PRINCIPAL`, `x-user-*`) used for passing identity.
*   [ ] Update the development simulation section if the environment variables or process changes.