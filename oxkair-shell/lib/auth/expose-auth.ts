'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from './auth-context';

/**
 * ExposeAuth component
 *
 * This component exposes the shell's authentication context to micro-frontends
 * by attaching it to the window object.
 */
export function ExposeAuth() {
  const auth = useAuth();

  // Use a ref to store subscribers to prevent them from being lost on re-renders
  const subscribersRef = useRef<Array<(user: any) => void>>([]);

  // Initialize the auth object only once
  useEffect(() => {
    if (typeof window === 'undefined') return;

    console.log("ExposeAuth: Initializing shell auth object");
    
    // Create the shell auth object with methods that always reference the current auth state
    (window as any).__SHELL_AUTH__ = {
      get user() {
        const userObj = auth.user ? {
          id: auth.user.id,
          email: auth.user.email || '',
          firstName: auth.user.user_metadata?.firstName || '',
          lastName: auth.user.user_metadata?.lastName || '',
          name: `${auth.user.user_metadata?.firstName || ''} ${auth.user.user_metadata?.lastName || ''}`.trim() || auth.user.email
        } : null;
        console.log("ExposeAuth: User getter called", userObj ? `User: ${userObj.email}` : 'No user');
        return userObj;
      },
      get isLoading() {
        console.log("ExposeAuth: isLoading getter called", auth.isLoading);
        return auth.isLoading;
      },
      get isAuthenticated() {
        const isAuth = !!auth.user;
        console.log("ExposeAuth: isAuthenticated getter called", isAuth);
        return isAuth;
      },
      get session() {
        return auth.session;
      },
      signOut: () => {
        console.log("ExposeAuth: signOut called from window object");
        auth.signOut();
      },
      
      // Add a subscription mechanism for micro-frontends to listen for auth changes
      subscribe(callback: (user: any) => void) {
        console.log("ExposeAuth: New subscriber added");
        subscribersRef.current.push(callback);
        
        // Immediately notify the new subscriber with the current state
        const userObject = auth.user ? {
          id: auth.user.id,
          email: auth.user.email || '',
          firstName: auth.user.user_metadata?.firstName || '',
          lastName: auth.user.user_metadata?.lastName || '',
          name: `${auth.user.user_metadata?.firstName || ''} ${auth.user.user_metadata?.lastName || ''}`.trim() || auth.user.email
        } : null;
        
        console.log("ExposeAuth: Notifying new subscriber", userObject ? `User: ${userObject.email}` : 'No user');
        callback(userObject);
        
        return () => {
          console.log("ExposeAuth: Subscriber removed");
          subscribersRef.current = subscribersRef.current.filter((cb: (user: any) => void) => cb !== callback);
        };
      },
      _notifySubscribers() {
        const userObject = auth.user ? {
          id: auth.user.id,
          email: auth.user.email || '',
          firstName: auth.user.user_metadata?.firstName || '',
          lastName: auth.user.user_metadata?.lastName || '',
          name: `${auth.user.user_metadata?.firstName || ''} ${auth.user.user_metadata?.lastName || ''}`.trim() || auth.user.email
        } : null;
        
        console.log(`ExposeAuth: Notifying ${subscribersRef.current.length} subscribers`, userObject ? `User: ${userObject.email}` : 'No user');
        subscribersRef.current.forEach((callback: (user: any) => void) => callback(userObject));
      }
    };
    
    console.log("ExposeAuth: Shell auth exposed to window");
    
    return () => {
      // Only clean up when the component is unmounted completely
      console.log("ExposeAuth: Cleaning up shell auth from window");
      delete (window as any).__SHELL_AUTH__;
    };
  }, []); // Empty dependency array means this only runs once on mount

  // Update subscribers when auth changes
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__SHELL_AUTH__) {
      console.log("ExposeAuth: Auth state changed", {
        hasUser: !!auth.user,
        user: auth.user,
        userEmail: auth.user?.email,
        isLoading: auth.isLoading
      });
      (window as any).__SHELL_AUTH__._notifySubscribers();
    }
  }, [auth.user, auth.isLoading, auth.session]);

  // This component doesn't render anything
  return null;
}