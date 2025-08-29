# Azure Database for PostgreSQL Flexible Server

This document provides a comprehensive overview of the Azure PostgreSQL database, including connection details, the target database schema, and security considerations for the HIPAA-compliant environment.

This plan corresponds to **Phase 2 (Migration Planning)** of the HIPAA Compliance Migration Plan.

---

## 1. Connection Information

The database is an Azure Database for PostgreSQL flexible server. Connection requires SSL.

**Server Name:** `oxkair-postgresql.postgres.database.azure.com`
**Database Name:** `postgres`
**Port:** `5432`

There are two methods to authenticate:

### Method 1: Azure AD Token-based Authentication

This method is recommended for developers and automated processes. It uses an access token from Azure CLI.

```bash
export PGHOST=oxkair-postgresql.postgres.database.azure.com
export PGUSER=thomas@edouardoxkair.onmicrosoft.com
export PGPORT=5432
export PGDATABASE=postgres
export PGPASSWORD="$(az account get-access-token --resource https://ossrdbms-aad.database.windows.net --query accessToken --output tsv)"
```

### Method 2: Standard Password-based Authentication

This method uses a standard database user and password. The password should be stored securely.

```bash
export PGHOST=oxkair-postgresql.postgres.database.azure.com
export PGUSER=oxkairadmin
export PGPORT=5432
export PGDATABASE=postgres
export PGPASSWORD="{your-password}"
```
**Note:** These connection details might need to be set in a `.env.local` file for the application.

---

## 2. Target Database Schema

The following schema is the target for the migration from Supabase. It has been redesigned to remove unused tables and fields, and to clarify column purposes.

### Tables to be Migrated

*   `medical_notes`
*   `profiles`
*   `user_settings`
*   `institutions`

### Tables to be Removed

The following tables from the Supabase schema will **not** be migrated:

*   `attestations`
*   `audit_trail`
*   `panel_flags`
*   `panel_submissions`
*   `medical_notes_with_lookup` (view)

---

### 2.1. User-Institution Linking and Signup

To ensure users are correctly associated with their institutions and to provide a seamless signup experience, the following approach will be implemented:

**Institution Linking:**

*   **Primary Link:** The `profiles.institution_id` field serves as the single source of truth for linking a user to an institution. This foreign key relationship ensures data integrity.
*   **Coder-Provider Visibility:** When a coder processes a case, the application will query the `profiles` table to find all users where `institution_id` matches the coder's `institution_id` and `user_category` is 'Provider'. This will provide the list of providers within the same institution to whom a case can be sent for review.

**User Signup Flow:**

To avoid displaying a long, unmanageable list of institutions in a dropdown during signup, a search-based approach will be used:

1.  **Institution Search:** During the signup process, the user will be presented with a search box to find their institution by name. The application will perform a real-time search against the `institutions` table.
2.  **Institution Selection:** The user selects their institution from the search results. The `institution_id` is then stored in their profile upon creation.
3.  **(Optional) Domain-based Suggestions:** To improve user experience, the system can suggest institutions based on the user's email domain. For example, if a user signs up with `john.doe@mayoclinic.org`, "Mayo Clinic" would be suggested. This requires adding a `domain` column to the `institutions` table.

**Schema Changes:**

*   The `affiliated_institution` column in the `profiles` table will be removed to eliminate redundancy and potential data conflicts with `institution_id`.
*   (Optional) An `email_domains` (e.g., `TEXT[]`) column can be added to the `institutions` table to support domain-based suggestions.

---

### Table: `medical_notes`

Stores the core medical case information. Fields have been pruned to retain only essential data.

**Schema Definition:**
```sql
CREATE TABLE public.medical_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, -- Foreign key to auth.users table
  mrn text,
  date_of_service timestamp with time zone,
  insurance_provider text,
  status text DEFAULT 'INCOMPLETE'::text CHECK (status = ANY (ARRAY['INCOMPLETE'::text, 'PENDING_CODER_REVIEW'::text, 'PENDING_PROVIDER_REVIEW'::text, 'PENDING_BILLING'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  operative_notes text,
  admission_notes text,
  discharge_notes text,
  pathology_notes text,
  progress_notes text,
  bedside_notes text,
  billable_notes ARRAY,
  -- Field for storing the original, unmodified output from the AI model.
  ai_raw_output jsonb,
  -- Field for storing data related to the "panel" UI component. Needs further definition.
  panel_data jsonb,
  -- Field for storing the final, reviewed data after coder and provider approval.
  final_processed_data jsonb,
  -- Field for storing summary data. The type of summary (AI vs. human) needs to be defined.
  summary_data jsonb,
  workflow_status character varying DEFAULT 'processing'::character varying,
  case_number character varying NOT NULL UNIQUE,
  provider_user_id uuid, -- Foreign key to auth.users table for the provider
  institution_id uuid, -- Foreign key to institutions table
  CONSTRAINT medical_notes_pkey PRIMARY KEY (id),
  CONSTRAINT medical_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT medical_notes_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_medical_notes_institution FOREIGN KEY (institution_id) REFERENCES public.institutions(id)
);
```

**Removed Fields:** `title`, `content`, `tags`, `source`.

---

### Table: `profiles`

Stores user profile information, linking to the authentication service and institution.

**Schema Definition:**
```sql
CREATE TABLE public.profiles (
  id uuid NOT NULL, -- Corresponds to the user ID from the authentication service
  first_name text,
  last_name text,
  name text GENERATED ALWAYS AS (
    CASE
        WHEN first_name IS NULL AND last_name IS NULL THEN NULL
        WHEN first_name IS NULL THEN last_name
        WHEN last_name IS NULL THEN first_name
        ELSE (first_name || ' ' || last_name)
    END
  ) STORED,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_category text CHECK (user_category = ANY (ARRAY['Provider'::text, 'Medical Coder'::text])),
  npi text,
  recovery_email text,
  phone_number text,
  verification_status text DEFAULT 'not verified'::text,
  institution_id uuid, -- Foreign key to institutions table
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT fk_profiles_institution FOREIGN KEY (institution_id) REFERENCES public.institutions(id)
);
```
**Note:** The `name` column is now a generated column for consistency.

---

### Table: `user_settings`

Stores user-specific application settings, like UI preferences.

**Schema Definition:**
```sql
CREATE TABLE public.user_settings (
  id uuid NOT NULL, -- Corresponds to the user ID from the authentication service
  theme text DEFAULT 'light'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_settings_pkey PRIMARY KEY (id),
  CONSTRAINT user_settings_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
```

---

### Table: `institutions`

Stores information about medical institutions that users can be affiliated with.

**Schema Definition:**
```sql
CREATE TABLE public.institutions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  email_domains text[], -- For suggesting institutions based on email domain
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT institutions_pkey PRIMARY KEY (id)
);
```
**Linking:** Users are linked to institutions via the `institution_id` in the `profiles` table, which is set during the signup process. Cases (`medical_notes`) are also linked via `institution_id` to ensure all case data is associated with the correct institution.

---

## 3. Authentication

The authentication system will be migrated from Supabase Auth to a new provider on Azure.

**Options under consideration:**
1.  **Azure Active Directory (AD) B2C:** A comprehensive identity and access management service.
2.  **Custom JWT-based Flow:** A custom implementation using JSON Web Tokens.

A new `auth.users` table will be created to store core user authentication data, replacing the Supabase `auth.users` table. The `user_id` in `medical_notes` and `profiles` will reference this new table. The exact schema for `auth.users` will depend on the chosen provider.

---

## 4. Security & Compliance (HIPAA)

The following security  measures will be implemented in the Azure PostgreSQL database:

*   **Encryption:**
    *   **At Rest:** Enabled by default on Azure PostgreSQL Flexible Server.
    *   **In Transit:** SSL/TLS will be enforced for all connections.
*   **Row-Level Security (RLS):** RLS policies will be implemented to ensure that users can only access data they are authorized to see. This is critical for restricting access to Protected Health Information (PHI) in tables like `medical_notes`.
*   **Least-Privilege Access:** Database roles will be configured with the minimum necessary permissions.
*   **Auditing:** Database-level auditing will be enabled to log all access and modifications to sensitive data, as required by HIPAA.
*   **Backups:** Point-in-time restore and long-term backup retention (minimum 6 years) will be configured to meet HIPAA requirements.