import type { NextConfig } from "next";

// Define remote URLs
const remoteUrls = {
  editor: process.env.EDITOR_URL || 'http://localhost:3002',
  // coder: process.env.CODER_URL || 'http://localhost:3001', // No longer needed
};

const nextConfig: NextConfig = {
  output: 'standalone',

  // Add environment variables to be available at build time
  env: {
    NEXT_PUBLIC_EDITOR_URL: remoteUrls.editor,
    VERCEL: process.env.VERCEL || "true",
    // NEXT_PUBLIC_CODER_URL: remoteUrls.coder, // No longer needed
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },

  // Configure for serverless functions
  serverExternalPackages: ['@ai-sdk/openai', 'openai'],

  // Add CORS headers to allow communication between apps
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
          },
        ],
      },
    ];
  },

  // Ensure Azure auth paths are passed through
  async rewrites() {
    return [
      {
        source: '/.auth/:path*',
        destination: '/.auth/:path*', // pass-through to Azure
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Optimize AI SDK for serverless
      config.externals.push({
        '@ai-sdk/openai': '@ai-sdk/openai',
        'openai': 'openai'
      });
    }

    // Optimize bundle size
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    return config;
  },
};

export default nextConfig;
