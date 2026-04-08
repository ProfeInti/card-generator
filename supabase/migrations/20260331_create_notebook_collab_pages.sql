create extension if not exists pgcrypto;

create or replace function public.set_notebook_collab_pages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.generate_notebook_page_share_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'NP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1
      from public.notebook_collab_pages
      where share_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

create table if not exists public.notebook_collab_pages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  last_editor_user_id uuid references auth.users (id) on delete set null,
  title text not null default '',
  exercise_snapshot jsonb not null default '{}'::jsonb,
  notebook_state jsonb not null default '{}'::jsonb,
  share_code text not null default public.generate_notebook_page_share_code(),
  visibility text not null default 'code',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notebook_collab_pages_share_code_unique unique (share_code),
  constraint notebook_collab_pages_visibility_check check (visibility in ('private', 'code'))
);

create table if not exists public.notebook_collab_page_members (
  page_id uuid not null references public.notebook_collab_pages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor',
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (page_id, user_id),
  constraint notebook_collab_page_members_role_check check (role in ('editor', 'viewer'))
);

create index if not exists notebook_collab_pages_owner_idx
  on public.notebook_collab_pages (owner_user_id);

create index if not exists notebook_collab_pages_share_code_idx
  on public.notebook_collab_pages (share_code);

create index if not exists notebook_collab_pages_updated_at_idx
  on public.notebook_collab_pages (updated_at desc);

create index if not exists notebook_collab_page_members_user_idx
  on public.notebook_collab_page_members (user_id);

drop trigger if exists trg_notebook_collab_pages_updated_at on public.notebook_collab_pages;
create trigger trg_notebook_collab_pages_updated_at
before update on public.notebook_collab_pages
for each row
execute function public.set_notebook_collab_pages_updated_at();

alter table public.notebook_collab_pages enable row level security;
alter table public.notebook_collab_page_members enable row level security;

create policy "notebook_collab_pages_select_scope"
on public.notebook_collab_pages
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or exists (
    select 1
    from public.notebook_collab_page_members as member
    where member.page_id = notebook_collab_pages.id
      and member.user_id = auth.uid()
  )
);

create policy "notebook_collab_pages_insert_own"
on public.notebook_collab_pages
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and visibility in ('private', 'code')
);

create policy "notebook_collab_pages_update_scope"
on public.notebook_collab_pages
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or exists (
    select 1
    from public.notebook_collab_page_members as member
    where member.page_id = notebook_collab_pages.id
      and member.user_id = auth.uid()
      and member.role = 'editor'
  )
)
with check (visibility in ('private', 'code'));

create policy "notebook_collab_pages_delete_owner"
on public.notebook_collab_pages
for delete
to authenticated
using (owner_user_id = auth.uid());

create policy "notebook_collab_page_members_select_scope"
on public.notebook_collab_page_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.notebook_collab_pages as page
    where page.id = notebook_collab_page_members.page_id
      and page.owner_user_id = auth.uid()
  )
);

create policy "notebook_collab_page_members_insert_self_or_owner"
on public.notebook_collab_page_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.notebook_collab_pages as page
    where page.id = notebook_collab_page_members.page_id
      and page.owner_user_id = auth.uid()
  )
);

create policy "notebook_collab_page_members_delete_self_or_owner"
on public.notebook_collab_page_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.notebook_collab_pages as page
    where page.id = notebook_collab_page_members.page_id
      and page.owner_user_id = auth.uid()
  )
);

create or replace function public.join_notebook_collab_page_by_code(input_code text)
returns table (
  page_id uuid,
  title text,
  share_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_page public.notebook_collab_pages%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into target_page
  from public.notebook_collab_pages
  where share_code = upper(trim(input_code))
    and visibility = 'code'
  limit 1;

  if target_page.id is null then
    raise exception 'Notebook page code not found.';
  end if;

  insert into public.notebook_collab_page_members (page_id, user_id, role)
  values (target_page.id, auth.uid(), 'editor')
  on conflict (page_id, user_id) do nothing;

  return query
  select target_page.id, target_page.title, target_page.share_code;
end;
$$;

grant execute on function public.join_notebook_collab_page_by_code(text) to authenticated;

alter publication supabase_realtime add table public.notebook_collab_pages;
alter publication supabase_realtime add table public.notebook_collab_page_members;
