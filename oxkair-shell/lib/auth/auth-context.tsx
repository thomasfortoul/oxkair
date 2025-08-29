"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

export interface SignUpData {
  firstName: string;
  lastName: string;
  userCategory: "Provider" | "coder";
  npi?: string;
  recoveryEmail?: string;
  phoneNumber?: string;
  affiliatedInstitutions?: string[];
  verificationStatus?: string;
  productAccessType?: string;
}

interface EasyAuthUser {
  id: string; // Azure OID (canonical identifier)
  userId: string; // Legacy compatibility - also the OID
  oid: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  userCategory?: string;
  npi?: string;
  recoveryEmail?: string;
  phoneNumber?: string;
  verificationStatus?: string;
  institutionId?: string;
  issuer?: string;
  nameIdentifier?: string;
  tenantId?: string;
  providerName?: string;
  roles?: string[];
  user_metadata?: {
    firstName?: string;
    lastName?: string;
    userCategory?: string;
    institutionId?: string;
    npi?: string;
    verificationStatus?: string;
    [key: string]: any;
  };
}

interface AuthContextType {
  user: EasyAuthUser | null;
  session: { access_token?: string } | null;
  error: Error | null;
  isLoading: boolean;
  signIn: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  signUp: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<EasyAuthUser | null>(null);
  const [session, setSession] = useState<{ access_token?: string } | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if user is authenticated via Easy Auth
    const checkAuth = async (retryCount = 0) => {
      const maxRetries = 3;
      const retryDelay = 1000; // 1 second

      try {
        console.log(
          "[AuthContext] Checking authentication...",
          retryCount > 0 ? `(retry ${retryCount})` : "",
        );

        // Make a request to get current user info from Easy Auth
        const response = await fetch("/api/auth/me", {
          credentials: "include", // Include cookies for Easy Auth
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });

        console.log("[AuthContext] Auth response status:", response.status);

        if (response.ok) {
          const userData = await response.json();
          console.log("[AuthContext] User data received:", {
            hasId: !!userData.id,
            hasUserId: !!userData.userId,
            hasOid: !!userData.oid,
            email: userData.email,
            name: userData.name,
            verificationStatus: userData.verificationStatus,
            isFallback: !!userData._fallback,
          });

          // Simplified validation: Be more favorable to authenticated users
          // Even minimal user data should be considered valid since users are pre-authenticated
          const hasOid = userData.oid && typeof userData.oid === "string";
          const hasEmail = userData.email && typeof userData.email === "string";
          const hasId = userData.id || userData.userId;
          
          // Be more permissive - any of these indicates an authenticated user
          const isValidUser = hasOid || hasEmail || hasId;

          if (isValidUser) {
            if (userData._fallback) {
              console.warn(
                "[AuthContext] Using fallback user data. Profile service may be down or user profile is missing.",
                "Error:",
                userData._profileError,
              );
            }

            // Ensure we have a consistent user object with fallbacks
            // Prioritize OID, fallback to other identifiers
            const userObject = {
              id: userData.oid || userData.id || userData.userId || "",
              userId: userData.oid || userData.userId || userData.id || "",
              oid: userData.oid || userData.id || "",
              email: userData.email || "",
              name: userData.name || userData.email || "User",
              firstName: userData.firstName,
              lastName: userData.lastName,
              userCategory: userData.userCategory,
              npi: userData.npi,
              recoveryEmail: userData.recoveryEmail,
              phoneNumber: userData.phoneNumber,
              verificationStatus: userData.verificationStatus || "not verified",
              institutionId: userData.institutionId,
              issuer: userData.issuer,
              nameIdentifier: userData.nameIdentifier,
              tenantId: userData.tenantId,
              providerName: userData.providerName || "aad",
              roles: Array.isArray(userData.roles) ? userData.roles : ["user"],
              user_metadata: userData.user_metadata || {},
            };

            console.log("[AuthContext] Setting user object:", {
              id: userObject.id?.substring(0, 8) + "...",
              oid: userObject.oid?.substring(0, 8) + "...",
              email: userObject.email,
              providerName: userObject.providerName,
            });

            setUser(userObject);
            setSession({ access_token: "easy-auth-session" }); // Placeholder since Easy Auth handles tokens
            setError(null);
          } else {
            console.log(
              "[AuthContext] Invalid user data - no identifying information:",
              { hasOid, hasEmail, hasId, email: userData.email, id: userData.id }
            );
            
            // Only set user to null if there's truly no identifying information
            setUser(null);
            setSession(null);
            setError(null);
          }
        } else {
          // Handle non-OK responses
          const responseText = await response.text();
          console.log("[AuthContext] User not authenticated:", {
            status: response.status,
            statusText: response.statusText,
            body:
              responseText.substring(0, 200) +
              (responseText.length > 200 ? "..." : ""),
          });

          // If it's a server error (5xx) and we haven't exhausted retries, try again
          if (response.status >= 500 && retryCount < maxRetries) {
            console.log(
              `[AuthContext] Server error, retrying in ${retryDelay}ms...`,
            );
            setTimeout(() => checkAuth(retryCount + 1), retryDelay);
            return; // Don't set final state yet
          }

          setUser(null);
          setSession(null);
          setError(null);
        }
      } catch (err) {
        console.error("[AuthContext] Error checking auth:", err);

        // If it's a network error and we haven't exhausted retries, try again
        if (
          retryCount < maxRetries &&
          ((err instanceof TypeError && err.message.includes("fetch")) ||
            (err instanceof Error &&
              (err.message.includes("network") ||
                err.message.includes("offline"))))
        ) {
          console.log(
            `[AuthContext] Network error, retrying in ${retryDelay}ms...`,
          );
          setTimeout(() => checkAuth(retryCount + 1), retryDelay);
          return; // Don't set final state yet
        }

        setError(err instanceof Error ? err : new Error(String(err)));
        setUser(null);
        setSession(null);
      } finally {
        // Only set loading to false if this is the final attempt
        if (retryCount >= maxRetries) {
          setIsLoading(false);
        } else {
          // For successful responses or non-retryable errors, also set loading to false
          const shouldStopLoading = true; // We'll set this in the success/failure branches above
          if (shouldStopLoading) {
            setIsLoading(false);
          }
        }
      }
    };

    checkAuth();
  }, []);

  const signIn = async () => {
    // Completely passive authentication - never redirect to Microsoft login
    // Users are already authenticated via Azure App Service Easy Auth
    console.log("[AuthContext] Passive authentication - redirecting to dashboard...");
    
    // Always redirect to dashboard without initiating new auth flow
    window.location.href = "/coder/comprehensive";
    return { error: null };
  };

  const signOut = async () => {
    try {
      // Completely passive sign out - never redirect to Microsoft logout
      // Just clear local state and redirect to landing page
      console.log("[AuthContext] Passive sign out - clearing local state");
      setUser(null);
      setSession(null);
      window.location.href = "/";
    } catch (err) {
      console.error("[AuthContext] Sign out error:", err);
    }
  };

  const signUp = async () => {
    // Completely passive sign up - never redirect to Microsoft login
    // Users are already authenticated via Azure App Service Easy Auth
    console.log("[AuthContext] Passive sign up - redirecting to dashboard...");
    
    // Always redirect to dashboard without initiating new auth flow
    window.location.href = "/coder/comprehensive";
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{ user, session, error, isLoading, signIn, signOut, signUp }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
