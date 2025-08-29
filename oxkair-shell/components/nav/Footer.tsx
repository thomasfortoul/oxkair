'use client';

import Image from 'next/image';

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 px-6 py-4 mt-auto">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo and Company Info */}
        <div className="flex items-center space-x-3">
          <Image
            src="/coder/images/oxkair-logo.png"
            alt="Oxkair Logo"
            width={24}
            height={24}
            className="h-6 w-6"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900">
              Code Assist
            </span>
            <span className="text-xs text-gray-500">
              Oxkair 2025
            </span>
          </div>
        </div>

        {/* Compliance Notice
        <div className="text-sm text-gray-600">
          <span className="font-medium text-red-600">Important!</span> Non-HIPAA Compliant, please see our Pro version for PHI usage
        </div> */}
      </div>
    </footer>
  );
}