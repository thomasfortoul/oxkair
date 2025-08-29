/**
 * Jest Global Setup
 * Loads environment variables for database tests
 */

import { config } from 'dotenv';
import { join } from 'path';

export default async function globalSetup() {
  // Load environment variables from .env.local
  config({ path: join(__dirname, '.env.local') });
  
  // Validate required environment variables for database tests
  const requiredEnvVars = ['PGHOST', 'PGUSER', 'PGDATABASE'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn(`⚠️  Missing database environment variables: ${missingVars.join(', ')}`);
    console.warn('Database tests may be skipped. Create .env.local with Azure PostgreSQL credentials.');
  } else {
    console.log('✅ Database environment variables loaded for testing');
  }
}