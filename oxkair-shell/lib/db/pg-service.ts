import { Pool } from "pg";

// Connection pool for Azure PostgreSQL via PgBouncer
const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING, // host same, port 6432 for PgBouncer
  ssl: { rejectUnauthorized: true },
  // keep pool small; PgBouncer multiplexes server conns
  max: 10,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 15000, // Increased from 2s to 10s for better reliability
});

// Request context type for authorization and auditing
export interface RequestContext {
  userId: string;
  roles: string[];
  email?: string;
}

// Audit log entry type
interface AuditEntry {
  action: string;
  userId: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

/**
 * Execute a parameterized SQL query
 */
export async function query<T = any>(
  text: string,
  params: any[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log("Executed query", {
      text: text.substring(0, 100),
      duration,
      rows: res.rowCount,
    });
    return { rows: res.rows, rowCount: res.rowCount || 0 };
  } catch (error) {
    const duration = Date.now() - start;
    console.error("Query error", {
      text: text.substring(0, 100),
      duration,
      error,
    });
    throw translateDbError(error);
  }
}

/**
 * Execute a query within a transaction
 */
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw translateDbError(error);
  } finally {
    client.release();
  }
}

/**
 * Audit logging function
 */
export async function audit(
  action: string,
  userId: string,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (action, user_id, metadata, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [action, userId, metadata ? JSON.stringify(metadata) : null],
    );
  } catch (error) {
    console.error("Audit logging failed:", error);
    // Don't throw - audit failures shouldn't break the main operation
  }
}

/**
 * Authorization helper functions - TEMPORARILY DISABLED FOR DEBUGGING
 * All role checks are bypassed to allow all users to create, read, and process cases
 */
export function assertCanReadCase(ctx: RequestContext, ownerId: string): void {
  // Role checks temporarily disabled - all users can read all cases
  return;
}

export function assertCanWriteCase(ctx: RequestContext, ownerId: string): void {
  // Role checks temporarily disabled - all users can write all cases
  return;
}

export function assertHasRole(ctx: RequestContext, requiredRole: string): void {
  // Role checks temporarily disabled - all users have all roles
  return;
}

function throwForbidden(): never {
  const error = new Error("Forbidden") as any;
  error.status = 403;
  throw error;
}

function throwUnauthorized(): never {
  const error = new Error("Unauthorized") as any;
  error.status = 401;
  throw error;
}

/**
 * Translate database errors into application-safe errors
 */
function translateDbError(error: any): Error {
  if (error.code === "23505") {
    // unique_violation
    const appError = new Error("Resource already exists") as any;
    appError.status = 409;
    return appError;
  }

  if (error.code === "23503") {
    // foreign_key_violation
    const appError = new Error("Referenced resource not found") as any;
    appError.status = 400;
    return appError;
  }

  if (error.code === "23514") {
    // check_violation
    const appError = new Error("Invalid data provided") as any;
    appError.status = 400;
    return appError;
  }

  // Log the original error for debugging but don't expose details
  console.error("Database error:", error);
  const appError = new Error("Internal server error") as any;
  appError.status = 500;
  return appError;
}

// Medical Notes service functions

/**
 * Get medical note by ID with authorization check
 */
export async function getMedicalNoteById(
  caseId: string,
  ctx: RequestContext,
): Promise<any | null> {
  const { rows } = await query(
    `SELECT id, user_id, status, final_processed_data, summary_data,
            case_number, mrn, date_of_service, insurance_provider,
            operative_notes, admission_notes, discharge_notes,
            pathology_notes, progress_notes, bedside_notes, billable_notes,
            panel_data, workflow_status, provider_user_id, institution_id,
            ai_raw_output, created_at, updated_at
     FROM medical_notes
     WHERE id = $1`,
    [caseId],
  );

  const note = rows[0];
  if (!note) return null;

  assertCanReadCase(ctx, note.user_id);
  await audit("READ_CASE", ctx.userId, { caseId });
  return note;
}

/**
 * Get medical notes for a user
 * userId is now always the Azure OID (profiles.id)
 */
export async function getMedicalNotesByUser(
  userId: string,
  ctx: RequestContext,
): Promise<any[]> {
  console.log("[pg-service] getMedicalNotesByUser called with userId:", userId);
  console.log("[pg-service] getMedicalNotesByUser ctx:", {
    ctxUserId: ctx.userId,
    ctxRoles: ctx.roles,
    ctxEmail: ctx.email
  });
  
  // Authorization temporarily disabled - all users can see all notes

  // userId is now always the Azure OID - direct query against medical_notes.user_id
  console.log("[pg-service] Executing query with userId parameter:", userId);
  const { rows } = await query(
    `SELECT id, user_id, status, case_number, mrn, date_of_service,
            workflow_status, provider_user_id, institution_id,
            created_at, updated_at, panel_data
     FROM medical_notes
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  console.log("[pg-service] Query returned rows:", rows.length);

  await audit("LIST_CASES", ctx.userId, {
    targetUserId: userId,
    count: rows.length,
  });
  console.log("[pg-service] getMedicalNotesByUser returning rows:", rows.length);
  return rows;
}

/**
 * Create a new medical note
 * userId is now always the Azure OID (profiles.id)
 */
export async function createMedicalNote(
  userId: string,
  caseData: {
    id?: string;
    mrn?: string;
    date_of_service?: string | null;
    insurance_provider?: string | null;
    operative_notes?: string;
    admission_notes?: string;
    discharge_notes?: string;
    pathology_notes?: string;
    progress_notes?: string;
    bedside_notes?: string;
    billable_notes?: string[];
    panel_data?: any;
    status?:
      | "INCOMPLETE"
      | "PENDING_CODER_REVIEW"
      | "PENDING_PROVIDER_REVIEW"
      | "PENDING_BILLING";
    workflow_status?: string;
    provider_user_id?: string | null;
    summary_data?: any;
    institution_id?: string | null;
    ai_raw_output?: any;
    final_processed_data?: any;
    case_number?: string;
  },
  ctx: RequestContext,
): Promise<any> {
  // Authorization temporarily disabled - all users can create notes for any user

  // Validate MRN if provided
  if (caseData.mrn && !/^\d+$/.test(caseData.mrn)) {
    const error = new Error(
      "Invalid MRN: MRN must contain only numeric characters",
    ) as any;
    error.status = 400;
    throw error;
  }

  // userId is now always the Azure OID - use it directly as user_id
  const noteId = caseData.id || crypto.randomUUID();

  // case_number will be generated by the database

  const insertQuery = caseData.case_number
    ? `INSERT INTO medical_notes (
        id, user_id, mrn, date_of_service, insurance_provider,
        operative_notes, admission_notes, discharge_notes,
        pathology_notes, progress_notes, bedside_notes, billable_notes,
        panel_data, status, workflow_status, provider_user_id,
        summary_data, institution_id, ai_raw_output, final_processed_data, case_number
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *`
    : `INSERT INTO medical_notes (
        id, user_id, mrn, date_of_service, insurance_provider,
        operative_notes, admission_notes, discharge_notes,
        pathology_notes, progress_notes, bedside_notes, billable_notes,
        panel_data, status, workflow_status, provider_user_id,
        summary_data, institution_id, ai_raw_output, final_processed_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      ) RETURNING *`;

  const insertParams = caseData.case_number
    ? [
        noteId,
        userId,
        caseData.mrn,
        caseData.date_of_service,
        caseData.insurance_provider,
        caseData.operative_notes,
        caseData.admission_notes,
        caseData.discharge_notes,
        caseData.pathology_notes,
        caseData.progress_notes,
        caseData.bedside_notes,
        caseData.billable_notes,
        caseData.panel_data ? JSON.stringify(caseData.panel_data) : null,
        caseData.status || "INCOMPLETE",
        caseData.workflow_status || "processing",
        caseData.provider_user_id,
        caseData.summary_data ? JSON.stringify(caseData.summary_data) : null,
        caseData.institution_id,
        caseData.ai_raw_output ? JSON.stringify(caseData.ai_raw_output) : null,
        caseData.final_processed_data
          ? JSON.stringify(caseData.final_processed_data)
          : null,
        caseData.case_number,
      ]
    : [
        noteId,
        userId,
        caseData.mrn,
        caseData.date_of_service,
        caseData.insurance_provider,
        caseData.operative_notes,
        caseData.admission_notes,
        caseData.discharge_notes,
        caseData.pathology_notes,
        caseData.progress_notes,
        caseData.bedside_notes,
        caseData.billable_notes,
        caseData.panel_data ? JSON.stringify(caseData.panel_data) : null,
        caseData.status || "INCOMPLETE",
        caseData.workflow_status || "processing",
        caseData.provider_user_id,
        caseData.summary_data ? JSON.stringify(caseData.summary_data) : null,
        caseData.institution_id,
        caseData.ai_raw_output ? JSON.stringify(caseData.ai_raw_output) : null,
        caseData.final_processed_data
          ? JSON.stringify(caseData.final_processed_data)
          : null,
      ];

  const { rows } = await query(insertQuery, insertParams);

  const createdNote = rows[0];
  await audit("CREATE_CASE", ctx.userId, { caseId: noteId });
  return createdNote;
}

/**
 * Update a medical note
 */
export async function updateMedicalNote(
  noteId: string,
  updateData: {
    mrn?: string;
    date_of_service?: string | null;
    insurance_provider?: string | null;
    operative_notes?: string;
    admission_notes?: string;
    discharge_notes?: string;
    pathology_notes?: string;
    progress_notes?: string;
    bedside_notes?: string;
    billable_notes?: string[];
    panel_data?: any;
    status?:
      | "INCOMPLETE"
      | "PENDING_CODER_REVIEW"
      | "PENDING_PROVIDER_REVIEW"
      | "PENDING_BILLING";
    workflow_status?: string;
    ai_raw_output?: any;
    final_processed_data?: any;
    provider_user_id?: string | null;
    summary_data?: any;
    institution_id?: string | null;
  },
  ctx: RequestContext,
): Promise<any> {
  // First check if the note exists and get ownership info
  const { rows: existingRows } = await query(
    "SELECT user_id FROM medical_notes WHERE id = $1",
    [noteId],
  );

  if (existingRows.length === 0) {
    const error = new Error("Medical note not found") as any;
    error.status = 404;
    throw error;
  }

  assertCanWriteCase(ctx, existingRows[0].user_id);

  // Validate MRN if provided
  if (updateData.mrn && !/^\d+$/.test(updateData.mrn)) {
    const error = new Error(
      "Invalid MRN: MRN must contain only numeric characters",
    ) as any;
    error.status = 400;
    throw error;
  }

  // Build dynamic update query
  const updateFields: string[] = [];
  const updateValues: any[] = [];
  let paramIndex = 1;

  Object.entries(updateData).forEach(([key, value]) => {
    if (value !== undefined) {
      updateFields.push(`${key} = $${paramIndex}`);
      // Handle JSON fields
      if (
        [
          "panel_data",
          "summary_data",
          "ai_raw_output",
          "final_processed_data",
        ].includes(key)
      ) {
        updateValues.push(value ? JSON.stringify(value) : null);
      } else {
        updateValues.push(value);
      }
      paramIndex++;
    }
  });

  if (updateFields.length === 0) {
    const error = new Error("No fields to update") as any;
    error.status = 400;
    throw error;
  }

  updateFields.push(`updated_at = NOW()`);
  updateValues.push(noteId);

  const { rows } = await query(
    `UPDATE medical_notes SET ${updateFields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    updateValues,
  );

  await audit("UPDATE_CASE", ctx.userId, {
    caseId: noteId,
    fields: Object.keys(updateData),
  });
  return rows[0];
}

/**
 * Delete a medical note
 */
export async function deleteMedicalNote(
  noteId: string,
  ctx: RequestContext,
): Promise<void> {
  // First check if the note exists and get ownership info
  const { rows: existingRows } = await query(
    "SELECT user_id FROM medical_notes WHERE id = $1",
    [noteId],
  );

  if (existingRows.length === 0) {
    const error = new Error("Medical note not found") as any;
    error.status = 404;
    throw error;
  }

  assertCanWriteCase(ctx, existingRows[0].user_id);

  await query("DELETE FROM medical_notes WHERE id = $1", [noteId]);
  await audit("DELETE_CASE", ctx.userId, { caseId: noteId });
}

// User Profile functions

/**
 * Get user profile by OID
 * userId is now always the Azure OID (profiles.id)
 */
export async function getUserProfile(
  userId: string,
  ctx: RequestContext,
): Promise<any | null> {
  // Authorization temporarily disabled - all users can see all profiles

  const { rows } = await query(
    "SELECT id, email, name, user_category, npi, phone_number, verification_status, institution_id, created_at, updated_at FROM public.profiles WHERE id = $1",
    [userId],
  );

  return rows[0] || null;
}

/**
 * Update user profile by OID
 * userId is now always the Azure OID (profiles.id)
 */
export async function updateUserProfile(
  userId: string,
  profileData: {
    email?: string;
    name?: string;
    user_category?: string;
    verification_status?: string;
    npi?: string;
    phone_number?: string;
    institution_id?: string;
  },
  ctx: RequestContext,
): Promise<any> {
  // Authorization temporarily disabled - all users can update all profiles

  const { rows } = await query(
    `UPDATE public.profiles SET
       email = COALESCE($2, email),
       name = COALESCE($3, name),
       user_category = COALESCE($4, user_category),
       verification_status = COALESCE($5, verification_status),
       npi = COALESCE($6, npi),
       phone_number = COALESCE($7, phone_number),
       institution_id = COALESCE($8, institution_id),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      userId,
      profileData.email,
      profileData.name,
      profileData.user_category,
      profileData.verification_status,
      profileData.npi,
      profileData.phone_number,
      profileData.institution_id,
    ],
  );

  if (rows.length === 0) {
    const error = new Error("User profile not found") as any;
    error.status = 404;
    throw error;
  }

  await audit("UPDATE_PROFILE", ctx.userId, { targetUserId: userId });
  return rows[0];
}

// // Graceful shutdown
// process.on('SIGINT', () => {
//   console.log('Closing database pool...');
//   pool.end(() => {
//     console.log('Database pool closed.');
//     process.exit(0);
//   });
// });

// process.on('SIGTERM', () => {
//   console.log('Closing database pool...');
//   pool.end(() => {
//     console.log('Database pool closed.');
//     process.exit(0);
//   });
// });
