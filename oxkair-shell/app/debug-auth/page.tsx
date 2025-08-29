'use client';

import { useState, useEffect } from 'react';

export default function DebugAuthPage() {
  const [authData, setAuthData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('[DebugAuth] Checking authentication...');
        
        // Test the API endpoint
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        console.log('[DebugAuth] Response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          setAuthData(data);
        } else {
          const errorText = await response.text();
          setError(`HTTP ${response.status}: ${errorText}`);
        }
      } catch (err) {
        console.error('[DebugAuth] Error:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading authentication data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold mb-6">Authentication Debug</h1>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
              <p className="text-red-700">{error}</p>
            </div>
          )}
          
          {authData && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-green-800 mb-2">Authentication Successful</h2>
                <p className="text-green-700">User is authenticated</p>
              </div>
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-2">User Data</h2>
                <div className="space-y-2 text-sm">
                  <div><strong>OID:</strong> {authData.oid}</div>
                  <div><strong>Email:</strong> {authData.email}</div>
                  <div><strong>Profile ID:</strong> {authData.id || 'Not set'}</div>
                  <div><strong>User ID:</strong> {authData.userId || 'Not set'}</div>
                  <div><strong>Name:</strong> {authData.name || 'Not set'}</div>
                  <div><strong>Verification Status:</strong> {authData.verificationStatus || 'Not set'}</div>
                  <div><strong>Provider Name:</strong> {authData.providerName || 'Not set'}</div>
                  <div><strong>Roles:</strong> {authData.roles?.join(', ') || 'None'}</div>
                  {authData._fallback && (
                    <div className="text-orange-600">
                      <strong>Note:</strong> Using fallback data due to profile service error: {authData._profileError}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-gray-800 mb-2">Raw Response</h2>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-96">
                  {JSON.stringify(authData, null, 2)}
                </pre>
              </div>
            </div>
          )}
          
          <div className="mt-6 space-x-4">
            <button
              onClick={() => window.location.href = '/'}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            >
              Go to Home
            </button>
            <button
              onClick={() => window.location.href = '/coder/comprehensive'}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => window.location.href = '/.auth/logout'}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}