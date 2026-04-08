create or replace function public.generate_notebook_page_share_code()
returns text
language plpgsql
security definer
set search_path = public
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

create or replace function public.is_notebook_collab_page_owner(target_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notebook_collab_pages as page
    where page.id = target_page_id
      and page.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_notebook_collab_page_member(
  target_page_id uuid,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notebook_collab_page_members as member
    where member.page_id = target_page_id
      and member.user_id = auth.uid()
      and (
        allowed_roles is null
        or member.role = any(allowed_roles)
      )
  );
$$;

grant execute on function public.is_notebook_collab_page_owner(uuid) to authenticated;
grant execute on function public.is_notebook_collab_page_member(uuid, text[]) to authenticated;

drop policy if exists "notebook_collab_pages_select_scope" on public.notebook_collab_pages;
drop policy if exists "notebook_collab_pages_insert_own" on public.notebook_collab_pages;
drop policy if exists "notebook_collab_pages_update_scope" on public.notebook_collab_pages;
drop policy if exists "notebook_collab_pages_delete_owner" on public.notebook_collab_pages;

create policy "notebook_collab_pages_select_scope"
on public.notebook_collab_pages
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_notebook_collab_page_member(id)
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
  or public.is_notebook_collab_page_member(id, array['editor'])
)
with check (visibility in ('private', 'code'));

create policy "notebook_collab_pages_delete_owner"
on public.notebook_collab_pages
for delete
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "notebook_collab_page_members_select_scope" on public.notebook_collab_page_members;
drop policy if exists "notebook_collab_page_members_insert_self_or_owner" on public.notebook_collab_page_members;
drop policy if exists "notebook_collab_page_members_delete_self_or_owner" on public.notebook_collab_page_members;

create policy "notebook_collab_page_members_select_scope"
on public.notebook_collab_page_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_notebook_collab_page_owner(page_id)
);

create policy "notebook_collab_page_members_insert_self_or_owner"
on public.notebook_collab_page_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_notebook_collab_page_owner(page_id)
);

create policy "notebook_collab_page_members_delete_self_or_owner"
on public.notebook_collab_page_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_notebook_collab_page_owner(page_id)
);
