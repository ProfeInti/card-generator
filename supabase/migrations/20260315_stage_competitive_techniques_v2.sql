-- Stage a zero-loss migration for competitive techniques:
-- catalog master records, student collection entries, and proposals separated.
-- Date: 2026-03-15

create extension if not exists pgcrypto;

create table if not exists public.competitive_technique_catalog (
  id uuid primary key default gen_random_uuid(),
  legacy_technique_id uuid unique null references public.competitive_techniques(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid null references auth.users(id) on delete set null,
  status text not null default 'approved' check (status in ('approved', 'archived')),
  published_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz null,
  name text not null,
  name_fr text null,
  topic text null,
  subtopic text null,
  effect_type text null,
  effect_description text not null,
  effect_description_fr text null,
  worked_example text null,
  worked_example_fr text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists competitive_technique_catalog_created_by_idx
  on public.competitive_technique_catalog(created_by);
create index if not exists competitive_technique_catalog_status_idx
  on public.competitive_technique_catalog(status);
create index if not exists competitive_technique_catalog_updated_at_idx
  on public.competitive_technique_catalog(updated_at desc);

create or replace function public.set_competitive_technique_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_competitive_technique_catalog_updated_at on public.competitive_technique_catalog;
create trigger trg_competitive_technique_catalog_updated_at
before update on public.competitive_technique_catalog
for each row
execute function public.set_competitive_technique_catalog_updated_at();

alter table public.competitive_technique_catalog enable row level security;

drop policy if exists "competitive_technique_catalog_select_all" on public.competitive_technique_catalog;
drop policy if exists "competitive_technique_catalog_insert_teacher" on public.competitive_technique_catalog;
drop policy if exists "competitive_technique_catalog_update_teacher" on public.competitive_technique_catalog;
drop policy if exists "competitive_technique_catalog_delete_teacher" on public.competitive_technique_catalog;

create policy "competitive_technique_catalog_select_all"
on public.competitive_technique_catalog
for select
to authenticated
using (true);

create policy "competitive_technique_catalog_insert_teacher"
on public.competitive_technique_catalog
for insert
to authenticated
with check (public.current_profile_role() = 'teacher');

create policy "competitive_technique_catalog_update_teacher"
on public.competitive_technique_catalog
for update
to authenticated
using (public.current_profile_role() = 'teacher')
with check (public.current_profile_role() = 'teacher');

create policy "competitive_technique_catalog_delete_teacher"
on public.competitive_technique_catalog
for delete
to authenticated
using (public.current_profile_role() = 'teacher');

create table if not exists public.competitive_technique_student_collection (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references auth.users(id) on delete cascade,
  catalog_technique_id uuid not null references public.competitive_technique_catalog(id) on delete cascade,
  source text not null default 'copied' check (source in ('copied', 'seeded_from_legacy_approved')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (student_user_id, catalog_technique_id)
);

create index if not exists competitive_technique_student_collection_student_idx
  on public.competitive_technique_student_collection(student_user_id);
create index if not exists competitive_technique_student_collection_catalog_idx
  on public.competitive_technique_student_collection(catalog_technique_id);

alter table public.competitive_technique_student_collection enable row level security;

drop policy if exists "competitive_technique_student_collection_select_scope" on public.competitive_technique_student_collection;
drop policy if exists "competitive_technique_student_collection_insert_scope" on public.competitive_technique_student_collection;
drop policy if exists "competitive_technique_student_collection_delete_scope" on public.competitive_technique_student_collection;

create policy "competitive_technique_student_collection_select_scope"
on public.competitive_technique_student_collection
for select
to authenticated
using (
  student_user_id = auth.uid()
  or public.current_profile_role() = 'teacher'
);

create policy "competitive_technique_student_collection_insert_scope"
on public.competitive_technique_student_collection
for insert
to authenticated
with check (
  student_user_id = auth.uid()
  or public.current_profile_role() = 'teacher'
);

create policy "competitive_technique_student_collection_delete_scope"
on public.competitive_technique_student_collection
for delete
to authenticated
using (
  student_user_id = auth.uid()
  or public.current_profile_role() = 'teacher'
);

create table if not exists public.competitive_technique_proposals (
  id uuid primary key default gen_random_uuid(),
  legacy_technique_id uuid unique null references public.competitive_techniques(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid null references auth.users(id) on delete set null,
  published_catalog_id uuid null references public.competitive_technique_catalog(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'proposed', 'rejected', 'approved')),
  approved_at timestamptz null,
  name text not null,
  name_fr text null,
  topic text null,
  subtopic text null,
  effect_type text null,
  effect_description text not null,
  effect_description_fr text null,
  worked_example text null,
  worked_example_fr text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists competitive_technique_proposals_created_by_idx
  on public.competitive_technique_proposals(created_by);
create index if not exists competitive_technique_proposals_status_idx
  on public.competitive_technique_proposals(status);
create index if not exists competitive_technique_proposals_updated_at_idx
  on public.competitive_technique_proposals(updated_at desc);

create or replace function public.set_competitive_technique_proposals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_competitive_technique_proposals_updated_at on public.competitive_technique_proposals;
create trigger trg_competitive_technique_proposals_updated_at
before update on public.competitive_technique_proposals
for each row
execute function public.set_competitive_technique_proposals_updated_at();

alter table public.competitive_technique_proposals enable row level security;

drop policy if exists "competitive_technique_proposals_select_scope" on public.competitive_technique_proposals;
drop policy if exists "competitive_technique_proposals_insert_scope" on public.competitive_technique_proposals;
drop policy if exists "competitive_technique_proposals_update_student_own" on public.competitive_technique_proposals;
drop policy if exists "competitive_technique_proposals_update_teacher" on public.competitive_technique_proposals;
drop policy if exists "competitive_technique_proposals_delete_scope" on public.competitive_technique_proposals;

create policy "competitive_technique_proposals_select_scope"
on public.competitive_technique_proposals
for select
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);

create policy "competitive_technique_proposals_insert_scope"
on public.competitive_technique_proposals
for insert
to authenticated
with check (created_by = auth.uid());

create policy "competitive_technique_proposals_update_student_own"
on public.competitive_technique_proposals
for update
to authenticated
using (
  created_by = auth.uid()
  and public.current_profile_role() = 'student'
)
with check (
  created_by = auth.uid()
  and public.current_profile_role() = 'student'
  and status in ('draft', 'proposed')
);

create policy "competitive_technique_proposals_update_teacher"
on public.competitive_technique_proposals
for update
to authenticated
using (public.current_profile_role() = 'teacher')
with check (public.current_profile_role() = 'teacher');

create policy "competitive_technique_proposals_delete_scope"
on public.competitive_technique_proposals
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.current_profile_role() = 'teacher'
);

insert into public.competitive_technique_catalog (
  legacy_technique_id,
  created_by,
  reviewed_by,
  status,
  published_at,
  archived_at,
  name,
  name_fr,
  topic,
  subtopic,
  effect_type,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  created_at,
  updated_at
)
select
  t.id,
  t.created_by,
  t.reviewed_by,
  'approved',
  coalesce(t.approved_at, t.updated_at, t.created_at, timezone('utc', now())),
  null,
  t.name,
  t.name_fr,
  t.topic,
  t.subtopic,
  t.effect_type,
  t.effect_description,
  t.effect_description_fr,
  t.worked_example,
  t.worked_example_fr,
  t.created_at,
  t.updated_at
from public.competitive_techniques t
where t.status = 'approved'
on conflict (legacy_technique_id) do update
set
  reviewed_by = excluded.reviewed_by,
  published_at = excluded.published_at,
  name = excluded.name,
  name_fr = excluded.name_fr,
  topic = excluded.topic,
  subtopic = excluded.subtopic,
  effect_type = excluded.effect_type,
  effect_description = excluded.effect_description,
  effect_description_fr = excluded.effect_description_fr,
  worked_example = excluded.worked_example,
  worked_example_fr = excluded.worked_example_fr,
  updated_at = excluded.updated_at;

insert into public.competitive_technique_student_collection (
  student_user_id,
  catalog_technique_id,
  source,
  created_at
)
select
  t.created_by,
  c.id,
  'seeded_from_legacy_approved',
  coalesce(t.approved_at, t.created_at, timezone('utc', now()))
from public.competitive_techniques t
join public.competitive_technique_catalog c on c.legacy_technique_id = t.id
where t.status = 'approved'
on conflict (student_user_id, catalog_technique_id) do nothing;

insert into public.competitive_technique_proposals (
  legacy_technique_id,
  created_by,
  reviewed_by,
  published_catalog_id,
  status,
  approved_at,
  name,
  name_fr,
  topic,
  subtopic,
  effect_type,
  effect_description,
  effect_description_fr,
  worked_example,
  worked_example_fr,
  created_at,
  updated_at
)
select
  t.id,
  t.created_by,
  t.reviewed_by,
  null,
  t.status,
  t.approved_at,
  t.name,
  t.name_fr,
  t.topic,
  t.subtopic,
  t.effect_type,
  t.effect_description,
  t.effect_description_fr,
  t.worked_example,
  t.worked_example_fr,
  t.created_at,
  t.updated_at
from public.competitive_techniques t
where t.status <> 'approved'
on conflict (legacy_technique_id) do update
set
  reviewed_by = excluded.reviewed_by,
  status = excluded.status,
  approved_at = excluded.approved_at,
  name = excluded.name,
  name_fr = excluded.name_fr,
  topic = excluded.topic,
  subtopic = excluded.subtopic,
  effect_type = excluded.effect_type,
  effect_description = excluded.effect_description,
  effect_description_fr = excluded.effect_description_fr,
  worked_example = excluded.worked_example,
  worked_example_fr = excluded.worked_example_fr,
  updated_at = excluded.updated_at;
