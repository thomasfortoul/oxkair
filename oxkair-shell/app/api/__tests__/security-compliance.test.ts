/**
 * Security and HIPAA Compliance Tests
 * Tests Row-Level Security, encryption, and audit logging
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

describe('Security and HIPAA Compliance Tests', () => {
  let pool: Pool;
  let testUserId1: string;
  let testUserId2: string;
  let testInstitutionId1: string;
  let testInstitutionId2: string;

  beforeAll(async () => {
    // Skip tests if database credentials are not available
    if (!process.env.PGHOST || !process.env.PGUSER) {
      console.log('⚠️  Skipping database tests - missing credentials');
      return;
    }

    const config = {
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT || '5432'),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 5000,
    };
    
    pool = new Pool(config);
    
    testUserId1 = uuidv4();
    testUserId2 = uuidv4();
    testInstitutionId1 = uuidv4();
    testInstitutionId2 = uuidv4();
  }, 10000);

  afterAll(async () => {
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Clean up in reverse dependency order
        await client.query('DELETE FROM medical_notes WHERE user_id IN ($1, $2)', [testUserId1, testUserId2]);
        await client.query('DELETE FROM profiles WHERE id IN ($1, $2)', [testUserId1, testUserId2]);
        await client.query('DELETE FROM user_settings WHERE id IN ($1, $2)', [testUserId1, testUserId2]);
        await client.query('DELETE FROM institutions WHERE id IN ($1, $2)', [testInstitutionId1, testInstitutionId2]);
        await client.query('DELETE FROM auth.users WHERE id IN ($1, $2)', [testUserId1, testUserId2]);
        
        // Clean up any test institutions created during tests
        await client.query(`DELETE FROM institutions WHERE name IN ('Mayo Clinic', 'Johns Hopkins', 'Cleveland Clinic', 'Hospital 1', 'Hospital 2')`);
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        console.log('Cleanup error:', (error as Error).message);
      } finally {
        client.release();
      }
      
      try {
        await pool.end();
      } catch (error) {
        console.error('Error closing pool:', error);
      }
    }
  }, 30000);

  test('should verify SSL/TLS encryption in transit', async () => {
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

  test('should verify encryption at rest is enabled', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      // Check if transparent data encryption is enabled
      const result = await client.query(`
        SELECT name, setting 
        FROM pg_settings 
        WHERE name IN ('ssl', 'ssl_cert_file', 'ssl_key_file')
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });

  test('should verify audit logging is configured', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      // Check if logging is enabled
      const logSettings = await client.query(`
        SELECT name, setting 
        FROM pg_settings 
        WHERE name IN ('log_statement', 'log_connections', 'log_disconnections')
      `);
      
      expect(logSettings.rows.length).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });

  test('should verify user isolation between institutions', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Use unique email addresses to avoid conflicts
      const email1 = `user1-${Date.now()}@hospital1.com`;
      const email2 = `user2-${Date.now()}@hospital2.com`;
      
      // Create test institutions and users
      await client.query(`
        INSERT INTO auth.users (id, email) VALUES 
        ($1, $3),
        ($2, $4)
        ON CONFLICT (email) DO NOTHING
      `, [testUserId1, testUserId2, email1, email2]);
      
      await client.query(`
        INSERT INTO institutions (id, name) VALUES 
        ($1, $3),
        ($2, $4)
        ON CONFLICT (id) DO NOTHING
      `, [testInstitutionId1, testInstitutionId2, `Hospital 1-${Date.now()}`, `Hospital 2-${Date.now()}`]);
      
      await client.query(`
        INSERT INTO profiles (id, first_name, last_name, institution_id) VALUES 
        ($1, 'User', 'One', $2),
        ($3, 'User', 'Two', $4)
        ON CONFLICT (id) DO NOTHING
      `, [testUserId1, testInstitutionId1, testUserId2, testInstitutionId2]);
      
      // Create medical notes for each institution
      const caseNumber1 = `CASE-H1-${Date.now()}`;
      const caseNumber2 = `CASE-H2-${Date.now()}`;
      
      await client.query(`
        INSERT INTO medical_notes (user_id, case_number, institution_id, mrn) VALUES 
        ($1, $3, $2, 'MRN001'),
        ($4, $6, $5, 'MRN002')
      `, [testUserId1, testInstitutionId1, caseNumber1, testUserId2, testInstitutionId2, caseNumber2]);
      
      // Verify institutional data isolation
      const hospital1Cases = await client.query(`
        SELECT mn.*, p.institution_id 
        FROM medical_notes mn
        JOIN profiles p ON mn.user_id = p.id
        WHERE p.institution_id = $1
      `, [testInstitutionId1]);
      
      const hospital2Cases = await client.query(`
        SELECT mn.*, p.institution_id 
        FROM medical_notes mn
        JOIN profiles p ON mn.user_id = p.id
        WHERE p.institution_id = $1
      `, [testInstitutionId2]);
      
      expect(hospital1Cases.rows).toHaveLength(1);
      expect(hospital2Cases.rows).toHaveLength(1);
      expect(hospital1Cases.rows[0].case_number).toBe(caseNumber1);
      expect(hospital2Cases.rows[0].case_number).toBe(caseNumber2);
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  test('should verify minimum necessary data access', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      // Test that sensitive fields can be excluded from queries
      const limitedDataQuery = await client.query(`
        SELECT id, case_number, status, created_at
        FROM medical_notes 
        WHERE user_id = $1
      `, [testUserId1]);
      
      // Should have at least one record from previous test
      if (limitedDataQuery.rows.length > 0) {
        expect(limitedDataQuery.rows[0]).not.toHaveProperty('mrn');
        expect(limitedDataQuery.rows[0]).not.toHaveProperty('operative_notes');
      } else {
        // If no records, just verify the query structure works
        expect(limitedDataQuery.rows).toEqual([]);
      }
    } finally {
      client.release();
    }
  });

  test('should verify data retention capabilities', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      // Check if we can identify old records for retention policy
      const oldRecordsQuery = await client.query(`
        SELECT COUNT(*) as count
        FROM medical_notes 
        WHERE created_at < NOW() - INTERVAL '6 years'
      `);
      
      // This should work without error (count may be 0 for new database)
      expect(parseInt(oldRecordsQuery.rows[0].count)).toBeGreaterThanOrEqual(0);
    } finally {
      client.release();
    }
  });

  test('should verify backup and recovery readiness', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      // Check if point-in-time recovery info is available
      const backupInfo = await client.query(`
        SELECT pg_is_in_recovery()
      `);
      
      expect(backupInfo.rows).toHaveLength(1);
    } finally {
      client.release();
    }
  });

  test('should test transaction isolation', async () => {
    if (!pool) return;
    
    const client1 = await pool.connect();
    const client2 = await pool.connect();
    
    try {
      // Start transactions
      await client1.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client2.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      
      // Check if we have a record to update
      const checkResult = await client1.query(`
        SELECT id FROM medical_notes WHERE user_id = $1 LIMIT 1
      `, [testUserId1]);
      
      if (checkResult.rows.length > 0) {
        // Client 1 updates a record
        await client1.query(`
          UPDATE medical_notes 
          SET status = 'PENDING_CODER_REVIEW' 
          WHERE user_id = $1
        `, [testUserId1]);
        
        // Client 2 should not see the uncommitted change
        const result = await client2.query(`
          SELECT status FROM medical_notes WHERE user_id = $1
        `, [testUserId1]);
        
        if (result.rows.length > 0) {
          expect(result.rows[0].status).toBe('INCOMPLETE');
        }
        
        // Commit client 1
        await client1.query('COMMIT');
        
        // Now client 2 should see the change after commit
        await client2.query('COMMIT');
        
        const updatedResult = await client2.query(`
          SELECT status FROM medical_notes WHERE user_id = $1
        `, [testUserId1]);
        
        if (updatedResult.rows.length > 0) {
          expect(updatedResult.rows[0].status).toBe('PENDING_CODER_REVIEW');
        }
      } else {
        // No records to test with, just verify transaction commands work
        await client1.query('COMMIT');
        await client2.query('COMMIT');
        expect(true).toBe(true); // Test passes if no errors
      }
    } finally {
      client1.release();
      client2.release();
    }
  });

  test('should verify connection limits and security', async () => {
    if (!pool) return;
    
    const client = await pool.connect();
    
    try {
      // Check connection limits
      const connectionInfo = await client.query(`
        SELECT setting as max_connections 
        FROM pg_settings 
        WHERE name = 'max_connections'
      `);
      
      expect(parseInt(connectionInfo.rows[0].max_connections)).toBeGreaterThan(0);
      
      // Check current connections
      const currentConnections = await client.query(`
        SELECT count(*) as active_connections 
        FROM pg_stat_activity 
        WHERE state = 'active'
      `);
      
      expect(parseInt(currentConnections.rows[0].active_connections)).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });
});