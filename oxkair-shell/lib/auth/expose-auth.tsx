'use client';

import { useEffect } from 'react';
import { useAuth } from './auth-context';

declare global {
  interface Window {
    __OXKAIR_AUTH__?: {
      user: any;
      session: any;
      isLoading: boolean;
      isAuthenticated: boolean;
    };
  }
}

export function ExposeAuth() {
  const { user, session, isLoading } = useAuth();

  useEffect(() => {
    // Expose auth state to window for micro-frontend communication
    if (typeof window !== 'undefined') {
      window.__OXKAIR_AUTH__ = {
        user,
        session,
        isLoading,
        isAuthenticated: !!user
      };
    }
  }, [user, session, isLoading]);

  // This component doesn't render anything
  return null;
}