'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';

export function NavBar() {
  const { user } = useAuth();

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-3">
          <Image
            src="/coder/images/oxkair-logo.png"
            alt="Oxkair Logo"
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <span className="text-xl font-bold text-blue-600">Oxkair</span>
        </Link>

        {/* User Info */}
        {user && (
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              Welcome, {user.email}
            </span>
            <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-blue-600">
                {user.email?.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}