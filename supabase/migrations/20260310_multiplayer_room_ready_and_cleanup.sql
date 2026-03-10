create or replace function public.mp_delete_empty_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.mp_rooms r
  where r.id = old.room_id
    and not exists (
      select 1
      from public.mp_room_players rp
      where rp.room_id = old.room_id
    );

  return old;
end;
$$;

drop trigger if exists trg_mp_room_players_delete_empty_room on public.mp_room_players;
create trigger trg_mp_room_players_delete_empty_room
after delete on public.mp_room_players
for each row
execute function public.mp_delete_empty_room();

create or replace function public.mp_delete_closed_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'closed' then
    delete from public.mp_rooms r
    where r.id = new.id;
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_mp_rooms_delete_closed_room on public.mp_rooms;
create trigger trg_mp_rooms_delete_closed_room
after update on public.mp_rooms
for each row
execute function public.mp_delete_closed_room();

alter table public.mp_room_players
  add column if not exists is_ready boolean not null default false,
  add column if not exists ready_at timestamptz;

update public.mp_room_players
set is_ready = coalesce(is_ready, false)
where is_ready is null;

create or replace function public.mp_set_room_ready(p_room_id uuid, p_is_ready boolean)
returns table(room_id uuid, ready_state boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.mp_rooms%rowtype;
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
    raise exception 'Room is no longer open.';
  end if;

  if not exists (
    select 1
    from public.mp_room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this room.';
  end if;

  update public.mp_room_players rp
  set is_ready = p_is_ready,
      ready_at = case when p_is_ready then timezone('utc', now()) else null end
  where rp.room_id = p_room_id
    and rp.user_id = auth.uid();

  return query
  select p_room_id, p_is_ready, case when p_is_ready then 'Player marked as ready.' else 'Player is no longer ready.' end;
end;
$$;

grant execute on function public.mp_set_room_ready(uuid, boolean) to authenticated;
