'use client';

import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { NavBar } from './NavBar';
import { SideBar } from './SideBar';
import { Footer } from './Footer';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Exclude navigation components from signup page
  const isSignupPage = pathname === '/auth/signup' || pathname === '/auth/login';
  
//   // Use full-screen layout for auth pages
//   if (isSignupPage) {
//     return <main className="min-h-screen">{children}</main>;
//   }
  
  // Use full layout with navbar, sidebar, and footer for other pages
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <div className="flex flex-1">
        <SideBar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col">
        {/* Loading NavBar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
        
        <div className="flex flex-1">
          {/* Loading SideBar */}
          <div className="w-64 bg-white border-r border-gray-200 p-4">
            <div className="space-y-4">
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
          
          {/* Loading Main Content */}
          <main className="flex-1 flex items-center justify-center">
            <div className="text-xl">Loading...</div>
          </main>
        </div>
        
        {/* Loading Footer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-6 w-20 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    }>
      <LayoutContent>{children}</LayoutContent>
    </Suspense>
  );
}