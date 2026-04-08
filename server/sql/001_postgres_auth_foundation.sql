\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS legacy_import;

CREATE TABLE IF NOT EXISTS legacy_import.supabase_auth_users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  encrypted_password text NOT NULL,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS legacy_import.supabase_profiles (
  id uuid PRIMARY KEY,
  username text,
  created_at timestamptz,
  role text
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_confirmed_at timestamptz,
  source text NOT NULL DEFAULT 'local',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username));
