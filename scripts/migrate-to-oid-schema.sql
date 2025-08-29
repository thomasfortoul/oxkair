-- Migration Script: Migrate to OID-Based Schema
-- This script implements the master plan to make Azure Entra OID the canonical user key
--
-- IMPORTANT:
-- 1. Backup your database before running this script
-- 2. Run in a maintenance window
-- 3. Test on staging environment first
-- 4. Have rollback plan ready

BEGIN;

-- Step 1: Create backup tables for rollback capability
DO $$
BEGIN
    -- Backup existing tables if they exist
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'medical_notes') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS backup_medical_notes_' || to_char(now(), 'YYYYMMDD_HH24MISS') || ' AS SELECT * FROM public.medical_notes';
        RAISE NOTICE 'Backed up medical_notes table';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_settings') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS backup_user_settings_' || to_char(now(), 'YYYYMMDD_HH24MISS') || ' AS SELECT * FROM public.user_settings';
        RAISE NOTICE 'Backed up user_settings table';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS backup_profiles_' || to_char(now(), 'YYYYMMDD_HH24MISS') || ' AS SELECT * FROM public.profiles';
        RAISE NOTICE 'Backed up profiles table';
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'institutions') THEN
        EXECUTE 'CREATE TABLE IF NOT EXISTS backup_institutions_' || to_char(now(), 'YYYYMMDD_HH24MISS') || ' AS SELECT * FROM public.institutions';
        RAISE NOTICE 'Backed up institutions table';
    END IF;
END$$;

-- Step 2: Create or update the trigger helper function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

RAISE NOTICE 'Created updated_at trigger function';

-- Step 3: Drop existing app tables in correct order (respecting foreign key constraints)
DROP TABLE IF EXISTS public.medical_notes CASCADE;
RAISE NOTICE 'Dropped medical_notes table';

DROP TABLE IF EXISTS public.user_settings CASCADE;
RAISE NOTICE 'Dropped user_settings table';

DROP TABLE IF EXISTS public.profiles CASCADE;
RAISE NOTICE 'Dropped profiles table';

DROP TABLE IF EXISTS public.institutions CASCADE;
RAISE NOTICE 'Dropped institutions table';

-- Step 4: Create fresh minimal schema with OID-based design

-- Institutions table (unchanged structure)
CREATE TABLE public.institutions (
  id            uuid PRIMARY KEY,
  name          varchar NOT NULL,
  email_domains text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

RAISE NOTICE 'Created institutions table';

-- Profiles table: id IS the Azure OID (canonical key)
-- Application MUST supply this value from the Azure token
CREATE TABLE public.profiles (
  id                   uuid PRIMARY KEY,     -- Azure OID; application MUST supply this value
  email                text,
  name                 text,
  user_category        text,
  npi                  text,
  recovery_email       text,
  phone_number         text,
  verification_status  text DEFAULT 'not verified',
  institution_id       uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_institution_id ON public.profiles(institution_id);

RAISE NOTICE 'Created profiles table with Azure OID as primary key';

-- User settings table: 1-to-1 relationship with profiles using same ID (Azure OID)
CREATE TABLE public.user_settings (
  id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme      text DEFAULT 'light',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

RAISE NOTICE 'Created user_settings table';

-- Medical notes table: all user references point to profiles.id (Azure OID)
CREATE TABLE public.medical_notes (
  id                    uuid PRIMARY KEY,
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  institution_id        uuid REFERENCES public.institutions(id) ON DELETE SET NULL,

  -- Patient/case identifiers
  mrn                   text,
  date_of_service       timestamptz,
  insurance_provider    text,
  status                text DEFAULT 'INCOMPLETE',

  -- Audit fields
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),

  -- Clinical notes
  operative_notes       text,
  admission_notes       text,
  discharge_notes       text,
  pathology_notes       text,
  progress_notes        text,
  bedside_notes         text,
  billable_notes        text,

  -- AI and structured data
  ai_raw_output         jsonb,
  panel_data            jsonb,
  final_processed_data  jsonb,
  summary_data          jsonb,

  -- Workflow
  workflow_status       text DEFAULT 'processing',
  case_number           text NOT NULL
);

-- Add indices for performance
CREATE INDEX IF NOT EXISTS idx_medical_notes_user_id          ON public.medical_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_medical_notes_provider_user_id ON public.medical_notes(provider_user_id);
CREATE INDEX IF NOT EXISTS idx_medical_notes_institution_id   ON public.medical_notes(institution_id);
CREATE INDEX IF NOT EXISTS idx_medical_notes_case_number      ON public.medical_notes(case_number);

RAISE NOTICE 'Created medical_notes table with OID-based foreign keys';

-- Step 5: Add automatic updated_at triggers
CREATE TRIGGER trg_institutions_updated
BEFORE UPDATE ON public.institutions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_settings_updated
BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_medical_notes_updated
BEFORE UPDATE ON public.medical_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

RAISE NOTICE 'Created updated_at triggers for all tables';

-- Step 6: Insert sample institution if needed (optional)
INSERT INTO public.institutions (id, name, email_domains)
VALUES (
  gen_random_uuid(),
  'Default Institution',
  'example.com'
)
ON CONFLICT (id) DO NOTHING;

RAISE NOTICE 'Inserted default institution (if needed)';

-- Step 7: Create audit table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action     text NOT NULL,
  user_id    text NOT NULL,  -- This will be the Azure OID
  metadata   jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

RAISE NOTICE 'Created/verified audit_logs table';

-- Step 8: Verification queries
DO $$
DECLARE
    institutions_count integer;
    profiles_count integer;
    user_settings_count integer;
    medical_notes_count integer;
BEGIN
    SELECT COUNT(*) INTO institutions_count FROM public.institutions;
    SELECT COUNT(*) INTO profiles_count FROM public.profiles;
    SELECT COUNT(*) INTO user_settings_count FROM public.user_settings;
    SELECT COUNT(*) INTO medical_notes_count FROM public.medical_notes;

    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'Table counts: institutions=%, profiles=%, user_settings=%, medical_notes=%',
        institutions_count, profiles_count, user_settings_count, medical_notes_count;
END$$;

COMMIT;

-- Migration Notes:
-- 1. All profiles will now have id = Azure OID (supplied by application)
-- 2. Medical notes user_id directly references profiles.id (the OID)
-- 3. User settings id matches profiles.id (the OID)
-- 4. No more dependency on auth.users table
-- 5. Application must supply UUIDs for all primary keys
-- 6. First user sign-in will create profile with OID as primary key

-- Rollback Instructions:
-- If you need to rollback this migration:
-- 1. Stop the application
-- 2. Restore from the backup tables created at the beginning
-- 3. Revert application code changes
-- 4. Restart with previous version

-- Post-Migration Testing:
-- 1. Verify application can create profiles with OID as id
-- 2. Test medical notes creation with user_id = OID
-- 3. Confirm user settings are created with id = OID
-- 4. Test authentication flow works with new schema
-- 5. Verify all foreign key constraints are working

RAISE NOTICE '=== MIGRATION TO OID-BASED SCHEMA COMPLETED ===';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Deploy updated application code';
RAISE NOTICE '2. Test user sign-in creates profile with OID';
RAISE NOTICE '3. Verify medical notes CRUD operations';
RAISE NOTICE '4. Monitor for any constraint violations';
RAISE NOTICE '5. Clean up backup tables after validation';
