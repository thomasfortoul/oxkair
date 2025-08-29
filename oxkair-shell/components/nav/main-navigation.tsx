'use client';

import { useAuth } from '@/lib/auth/auth-context';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense } from 'react';

// Separate component that uses navigation hooks
function NavigationContent() {
  const { signOut, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  
  const handleSignOut = async () => {
    console.log('Navigation: Starting logout process with Supabase');
    await signOut();
    router.push('/auth/login');
  };
  
  // Don't show navigation on auth pages or case pages
  if (pathname?.startsWith('/auth') || pathname?.startsWith('/cases')) {
    return null;
  }
  
  return (
    <nav className="w-64 bg-white border-r border-gray-200 p-6 h-screen">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-blue-600">Oxkair Platform</h1>
        <p className="text-sm text-gray-500 mt-1">Medical AI Suite</p>
      </div>
      
      <ul className="space-y-2">
        <li>
          <Link
            href="/coder/comprehensive"
            className="flex items-center p-3 rounded transition-colors"
          >
            <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>Dashboard</span>
          </Link>
        </li>
        <li>
          <Link
            href="/coder"
            className={`flex items-center p-3 rounded transition-colors {
              pathname?.startsWith('/coder')
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Oxkair Coder
          </Link>
        </li>
        <li>
          <Link
            href="/editor"
            className={`flex items-center p-3 rounded transition-colors ${
              pathname?.startsWith('/editor')
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Oxkair Editor
          </Link>
        </li>
        <li className="mt-8 pt-8 border-t border-gray-200">
          <button
            onClick={handleSignOut}
            className="flex items-center p-3 text-gray-700 rounded hover:bg-red-50 hover:text-red-600 transition-colors w-full"
          >
            <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </li>
      </ul>
    </nav>
  );
}

// Main component that wraps the navigation content in a Suspense boundary
export function MainNavigation() {
  return (
    <Suspense fallback={
      <div className="w-64 bg-white border-r border-gray-200 p-6 h-screen">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-blue-600">Oxkair Platform</h1>
          <p className="text-sm text-gray-500 mt-1">Medical AI Suite</p>
        </div>
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
        </div>
      </div>
    }>
      <NavigationContent />
    </Suspense>
  );
}