"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export default function LandingPage() {
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const router = useRouter();
  const { signIn, user, isLoading, error } = useAuth();

  // Add debug API call
  const testAuthAPI = async () => {
    try {
      console.log("[LandingPage] Testing /api/auth/me...");
      const response = await fetch("/api/auth/me", {
        credentials: "include",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      const responseText = await response.text();
      console.log("[LandingPage] API Response:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText,
      });

      setDebugInfo({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[LandingPage] API Error:", err);
      setDebugInfo({
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Redirect if user is already logged in
  useEffect(() => {
    // Since users are already authenticated, be more favorable to redirect to dashboard
    // Even minimal user data should trigger redirect
    const hasUserData = user && (user.oid || user.email || user.id);

    if (hasUserData && !isLoading) {
      console.log(
        "[LandingPage] User has data, redirecting to dashboard:",
        {
          hasOid: !!user.oid,
          hasId: !!user.id,
          email: user.email,
          name: user.name,
          isLoading,
        },
      );

      // Immediate redirect
      router.push("/coder/comprehensive");

      // Fallback redirect after 1 second in case the first one fails
      const fallbackTimer = setTimeout(() => {
        console.log("[LandingPage] Executing fallback redirect to dashboard");
        window.location.href = "/coder/comprehensive";
      }, 1000);

      // Cleanup timer if component unmounts
      return () => clearTimeout(fallbackTimer);
    } else if (user && !isLoading) {
      console.log(
        "[LandingPage] User present but minimal data:",
        {
          hasUser: !!user,
          hasOid: !!user.oid,
          hasId: !!user.id,
          email: user.email,
          isLoading,
        },
      );
    }
  }, [user, router, isLoading]);

  const handleSignIn = async () => {
    // Completely passive authentication - never redirect to Microsoft login
    // Users are already authenticated via Azure App Service Easy Auth
    console.log("[LandingPage] Passive authentication - redirecting to dashboard...");
    
    // Always redirect to dashboard without initiating new auth flow
    window.location.href = "/coder/comprehensive";
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* Header with Logo */}
            <div className="text-center py-12 px-8">
              <div className="mb-8">
                <h1 className="text-4xl font-bold text-gray-900 mb-2">
                  Welcome to Oxkair CodeAssist
                </h1>
                <p className="text-gray-600">
                  Hello, {user.name || user.email}!
                </p>
              </div>

              {/* Dashboard CTA */}
              <div className="space-y-4">
                <button
                  onClick={() => router.push("/coder/comprehensive")}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                >
                  Go to Dashboard
                </button>

                {/* Show warning if using fallback data */}
                {(!user.id || !user.userId) && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-yellow-800 text-sm">
                      <strong>Note:</strong> Your profile is being set up. Some
                      features may be limited until setup is complete.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-8 text-gray-600 text-sm">
            <p>Advanced Medical Coding Platform</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header with Logo */}
          <div className="text-center py-12 px-8">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Oxkair CodeAssist
              </h1>
              <p className="text-gray-600">Faster Coding, Smarter Billing</p>
            </div>

            {/* Sign In Button */}
            <div className="space-y-4">
              <button
                onClick={handleSignIn}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              >
                Sign In with Microsoft
              </button>

              {/* Show error if any */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">
                    Authentication error: {error.message}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-600 text-sm">
          <p>Advanced Medical Coding Platform</p>
        </div>
      </div>
    </div>
  );
}
