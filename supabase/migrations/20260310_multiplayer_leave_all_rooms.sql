create or replace function public.mp_leave_all_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  delete from public.mp_room_players rp
  where rp.user_id = auth.uid();

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

grant execute on function public.mp_leave_all_rooms() to authenticated;
