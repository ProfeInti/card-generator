\set ON_ERROR_STOP on

WITH normalized AS (
  SELECT
    id,
    coalesce(nullif(trim(username), ''), 'user_' || substr(replace(id::text, '-', ''), 1, 8)) AS username,
    coalesce(created_at, timezone('utc', now())) AS created_at,
    CASE
      WHEN role = 'teacher' THEN 'teacher'
      ELSE 'student'
    END AS role
  FROM legacy_import.supabase_profiles
),
deduped AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY lower(username)
      ORDER BY created_at, id
    ) AS username_rank
  FROM normalized
),
prepared AS (
  SELECT
    id,
    created_at,
    role,
    CASE
      WHEN username_rank = 1 THEN username
      ELSE username || '_' || username_rank::text
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
  role,
  created_at,
  timezone('utc', now())
FROM prepared
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  updated_at = EXCLUDED.updated_at;
