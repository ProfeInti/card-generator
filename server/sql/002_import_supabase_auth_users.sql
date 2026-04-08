\set ON_ERROR_STOP on

WITH normalized AS (
  SELECT
    id,
    lower(trim(email)) AS email,
    encrypted_password AS password_hash,
    email_confirmed_at,
    raw_user_meta_data,
    coalesce(created_at, timezone('utc', now())) AS created_at,
    coalesce(updated_at, timezone('utc', now())) AS updated_at,
    nullif(
      trim(
        coalesce(
          raw_user_meta_data ->> 'username',
          split_part(email, '@', 1)
        )
      ),
      ''
    ) AS requested_username
  FROM legacy_import.supabase_auth_users
),
deduped AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY lower(coalesce(requested_username, ''))
      ORDER BY created_at, id
    ) AS username_rank
  FROM normalized
),
prepared AS (
  SELECT
    id,
    email,
    password_hash,
    email_confirmed_at,
    created_at,
    updated_at,
    CASE
      WHEN requested_username IS NULL THEN 'user_' || substr(replace(id::text, '-', ''), 1, 8)
      WHEN username_rank = 1 THEN requested_username
      ELSE requested_username || '_' || username_rank::text
    END AS final_username
  FROM deduped
)
INSERT INTO public.users (
  id,
  email,
  password_hash,
  email_confirmed_at,
  source,
  created_at,
  updated_at
)
SELECT
  id,
  email,
  password_hash,
  email_confirmed_at,
  'supabase',
  created_at,
  updated_at
FROM prepared
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  source = EXCLUDED.source,
  updated_at = EXCLUDED.updated_at;

WITH normalized AS (
  SELECT
    id,
    lower(trim(email)) AS email,
    raw_user_meta_data,
    coalesce(created_at, timezone('utc', now())) AS created_at,
    coalesce(updated_at, timezone('utc', now())) AS updated_at,
    nullif(
      trim(
        coalesce(
          raw_user_meta_data ->> 'username',
          split_part(email, '@', 1)
        )
      ),
      ''
    ) AS requested_username
  FROM legacy_import.supabase_auth_users
),
deduped AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY lower(coalesce(requested_username, ''))
      ORDER BY created_at, id
    ) AS username_rank
  FROM normalized
),
prepared AS (
  SELECT
    id,
    created_at,
    updated_at,
    CASE
      WHEN requested_username IS NULL THEN 'user_' || substr(replace(id::text, '-', ''), 1, 8)
      WHEN username_rank = 1 THEN requested_username
      ELSE requested_username || '_' || username_rank::text
    END AS final_username
  FROM deduped
)
INSERT INTO public.profiles (
  id,
  username,
  role,
  created_at,
  updated_at
)
SELECT
  id,
  final_username,
  'student',
  created_at,
  updated_at
FROM prepared
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  updated_at = EXCLUDED.updated_at;
