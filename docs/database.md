
Last updated: 2025-08-21 12:00 UTC

# Database

This document provides an overview of the PostgreSQL database used by the Qwen application, including the schema, data access layer, and migration process.

## 1. Overview

The application uses a PostgreSQL database to store all persistent data. The schema is designed to be relational, with UUIDs used as primary keys for most tables. The Azure Object ID (OID) from Entra ID is used as the canonical key for user-related tables.

## 2. Schema

The database schema is defined in `ddatabaseSchema.sql`. The main tables are:

### `public.institutions`

Stores information about medical institutions.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Primary Key. |
| `name` | `varchar` | The name of the institution. |
| `email_domains` | `text` | A comma-separated list of email domains associated with the institution. |

### `public.profiles`

Stores user profile information. The `id` column is the Azure Object ID (OID) from the user's Entra ID token, making it the canonical key for a user.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Primary Key (Azure OID). |
| `email` | `text` | The user's email address. |
| `name` | `text` | The user's full name. |
| `user_category` | `text` | The user's role (e.g., "coder", "Provider"). |
| `institution_id` | `uuid` | Foreign key to the `institutions` table. |

### `public.user_settings`

Stores user-specific settings, with a one-to-one relationship with the `profiles` table.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Primary Key (references `profiles.id`). |
| `theme` | `text` | The user's preferred UI theme (e.g., "light", "dark"). |

### `public.medical_notes`

Stores the medical case notes and the results of the AI processing workflow.

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Primary Key. |
| `user_id` | `uuid` | Foreign key to the `profiles` table (the user who created the note). |
| `operative_notes` | `text` | The main medical note text. |
| `ai_raw_output` | `jsonb` | The raw JSON output from the AI agent workflow. |
| `final_processed_data` | `jsonb` | The final, cleaned-up data after any user review. |
| `status` | `text` | The current status of the case (e.g., "INCOMPLETE", "PENDING_CODER_REVIEW"). |
| `workflow_status` | `text` | The status of the AI processing (e.g., "processing", "complete"). |

## 3. Data Access Layer

The application interacts with the database through a dedicated data access layer.

*   **Low-Level Access**: `oxkair-shell/lib/db/pg-service.ts`
    *   This file manages the connection pool to the PostgreSQL database using the `pg` library.
    *   It provides a generic `query` function for executing parameterized SQL queries.
    *   It also includes functions for handling transactions (`withTransaction`).
    *   All database operations for `medical_notes` are handled by functions in this file (e.g., `getMedicalNoteById`, `createMedicalNote`).

*   **Service-Level Abstractions**: `oxkair-shell/lib/services/`
    *   Higher-level services are built on top of `pg-service.ts` to encapsulate business logic.
    *   **`profile-service.ts`**: Manages the logic for finding or creating user profiles. The `findOrCreateProfile` function performs an "upsert" operation, ensuring that a profile exists for every authenticated user without creating duplicates.

## 4. Migrations

Database schema changes are managed through SQL migration scripts.

*   **Schema Definition**: The canonical schema is defined in `development/databaseSchema.sql`.
*   **Migration Scripts**: Individual migration scripts are located in `development/DB-migration/` and `scripts/`. For example, `scripts/migrate-to-oid-schema.sql` contains the logic for migrating the database to use the Azure OID as the primary key for users.

---

## Update Checklist

*   [ ] Update the schema section when tables or columns are added, removed, or modified.
*   [ ] Add any new key functions to the Data Access Layer section.
*   [ ] Document any changes to the migration process or the location of migration scripts.
