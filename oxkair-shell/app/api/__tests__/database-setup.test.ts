/**
 * Database Setup and Connection Tests
 * Tests basic connectivity and schema validation for Azure PostgreSQL
 */

import { Pool } from 'pg';

describe('Database Setup Tests', () => {
  let pool: Pool;

  beforeAll(async () => {
    // Skip tests if database credentials are not available
    if (!process.env.PGHOST || !process.env.PGUSER) {
      console.log('⚠️  Skipping database tests - missing credentials');
      return;
    }

    // Test both authentication methods
    const config = {
      host: process.env.PGHOST || 'oxkair-postresql.postgres.database.azure.com',
      port: parseInt(process.env.PGPORT || '5432'),
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: {
        rejectUnauthorized: false
      },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    pool = new Pool(config);
  }, 15000);

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  test('should connect to Azure PostgreSQL', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    expect(client).toBeDefined();
    
    const result = await client.query('SELECT NOW()');
    expect(result.rows).toHaveLength(1);
    
    client.release();
  });

  test('should verify SSL connection', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      // Check if SSL is enabled by querying connection info
      const result = await client.query(`
        SELECT 
          CASE WHEN ssl THEN 'on' ELSE 'off' END as ssl_status
        FROM pg_stat_ssl 
        WHERE pid = pg_backend_pid()
      `);
      
      if (result.rows.length > 0) {
        expect(result.rows[0].ssl_status).toBe('on');
      } else {
        // Fallback: check SSL settings
        const sslSettings = await client.query(`
          SELECT setting 
          FROM pg_settings 
          WHERE name = 'ssl'
        `);
        expect(sslSettings.rows[0].setting).toBe('on');
      }
    } finally {
      client.release();
    }
  });

  test('should have required tables', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      const tables = ['medical_notes', 'profiles', 'user_settings', 'institutions'];
      
      for (const table of tables) {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [table]);
        
        expect(result.rows[0].exists).toBe(true);
      }
    } finally {
      client.release();
    }
  });

  test('should verify foreign key constraints', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      const constraints = [
        'medical_notes_user_id_fkey',
        'medical_notes_provider_user_id_fkey',
        'fk_medical_notes_institution',
        'profiles_id_fkey',
        'fk_profiles_institution',
        'user_settings_id_fkey'
      ];
      
      for (const constraint of constraints) {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.table_constraints 
            WHERE constraint_name = $1
          )
        `, [constraint]);
        
        expect(result.rows[0].exists).toBe(true);
      }
    } finally {
      client.release();
    }
  });
});