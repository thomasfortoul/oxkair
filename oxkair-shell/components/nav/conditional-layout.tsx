'use client';

import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { MainNavigation } from './main-navigation';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Use full-screen layout for auth and case pages
  const isFullScreen = pathname?.startsWith('/auth') || pathname?.startsWith('/cases');
  
  if (isFullScreen) {
    return <main className="min-h-screen">{children}</main>;
  }
  
  // Use sidebar layout for other pages
  return (
    <div className="flex min-h-screen">
      <MainNavigation />
      <main className="flex-1">{children}</main>
    </div>
  );
}

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen">
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
        <main className="flex-1">
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-xl">Loading...</div>
          </div>
        </main>
      </div>
    }>
      <LayoutContent>{children}</LayoutContent>
    </Suspense>
  );
}