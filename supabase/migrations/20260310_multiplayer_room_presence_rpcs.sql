create or replace function public.mp_leave_open_rooms()
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
  using public.mp_rooms r
  where rp.room_id = r.id
    and rp.user_id = auth.uid()
    and r.status = 'open';

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

grant execute on function public.mp_leave_open_rooms() to authenticated;

create or replace function public.mp_join_open_room(p_room_id uuid)
returns table(joined_room_id uuid, result_status text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.mp_rooms%rowtype;
  v_player_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_room
  from public.mp_rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.status <> 'open' then
    raise exception 'Room is not open.';
  end if;

  delete from public.mp_room_players rp
  using public.mp_rooms r
  where rp.room_id = r.id
    and rp.user_id = auth.uid()
    and r.status = 'open'
    and rp.room_id <> p_room_id;

  if exists (
    select 1
    from public.mp_room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = auth.uid()
  ) then
    return query
    select p_room_id, 'ok'::text, 'Room joined.'::text;
    return;
  end if;

  select count(*)
  into v_player_count
  from public.mp_room_players rp
  where rp.room_id = p_room_id;

  if v_player_count >= v_room.max_players then
    raise exception 'Room is already full.';
  end if;

  insert into public.mp_room_players (room_id, user_id)
  values (p_room_id, auth.uid())
  on conflict (room_id, user_id) do nothing;

  return query
  select p_room_id, 'ok'::text, 'Room joined.'::text;
end;
$$;

grant execute on function public.mp_join_open_room(uuid) to authenticated;

