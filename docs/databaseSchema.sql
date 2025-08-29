ROLLBACK;
BEGIN;

-- 0) Trigger helper (no extensions required)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1) Drop existing app tables (safe; FKs cascade)
DROP TABLE IF EXISTS public.medical_notes CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.institutions CASCADE;

-- 2) Create fresh minimal schema (no extension calls)

-- Institutions
-- NOTE: id is uuid but NO default; app should provide id (or enable server uuid extension later).
CREATE TABLE public.institutions (
  id            uuid PRIMARY KEY,
  name          varchar NOT NULL,
  email_domains text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Profiles: id IS the Azure OID (canonical key). App must insert id = oid from token.
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

CREATE INDEX IF NOT EXISTS idx_profiles_institution_id ON public.profiles(institution_id);

-- User settings (1–1 with profile id / Azure OID)
CREATE TABLE public.user_settings (
  id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme      text DEFAULT 'light',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Medical notes (all user refs -> profiles.id)
-- id is uuid with NO default; app should supply or enable DB UUID generation later.

-- 3) Add triggers (after tables exist)
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

COMMIT;
