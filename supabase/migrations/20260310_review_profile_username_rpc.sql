-- Expose profile username lookup for teacher review panels
-- Date: 2026-03-10

create or replace function public.list_profile_usernames_by_ids(p_user_ids uuid[])
returns table (id uuid, username text)
language sql
stable
security definer
set search_path = public
as 
  select p.id, p.username
  from public.profiles p
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]));
;

grant execute on function public.list_profile_usernames_by_ids(uuid[]) to authenticated;
