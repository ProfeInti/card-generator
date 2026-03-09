-- Multiplayer lobby foundation (phase 1)
-- Date: 2026-03-10

create table if not exists public.mp_rooms (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 3 and 80),
  status text not null default 'open' check (status in ('open', 'in_match', 'closed')),
  is_private boolean not null default false,
  max_players integer not null default 2 check (max_players = 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists mp_rooms_status_idx on public.mp_rooms (status);
create index if not exists mp_rooms_created_by_idx on public.mp_rooms (created_by);
create index if not exists mp_rooms_updated_at_idx on public.mp_rooms (updated_at desc);

create table if not exists public.mp_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mp_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  unique (room_id, user_id)
);

create index if not exists mp_room_players_room_idx on public.mp_room_players (room_id);
create index if not exists mp_room_players_user_idx on public.mp_room_players (user_id);

create or replace function public.set_mp_rooms_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_mp_rooms_updated_at on public.mp_rooms;
create trigger trg_mp_rooms_updated_at
before update on public.mp_rooms
for each row
execute function public.set_mp_rooms_updated_at();

create or replace function public.mp_is_room_member(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mp_room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = p_user_id
  );
$$;

create or replace function public.mp_room_has_slot(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mp_rooms r
    where r.id = p_room_id
      and r.status = 'open'
      and (
        select count(*)
        from public.mp_room_players rp
        where rp.room_id = r.id
      ) < r.max_players
  );
$$;

grant execute on function public.mp_is_room_member(uuid, uuid) to authenticated;
grant execute on function public.mp_room_has_slot(uuid) to authenticated;

create or replace function public.mp_add_room_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mp_room_players (room_id, user_id)
  values (new.id, new.created_by)
  on conflict (room_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_mp_rooms_add_owner_membership on public.mp_rooms;
create trigger trg_mp_rooms_add_owner_membership
after insert on public.mp_rooms
for each row
execute function public.mp_add_room_owner_membership();

alter table public.mp_rooms enable row level security;
alter table public.mp_room_players enable row level security;

drop policy if exists "mp_rooms_select_visible" on public.mp_rooms;
drop policy if exists "mp_rooms_insert_own" on public.mp_rooms;
drop policy if exists "mp_rooms_update_owner" on public.mp_rooms;
drop policy if exists "mp_rooms_delete_owner" on public.mp_rooms;

create policy "mp_rooms_select_visible"
on public.mp_rooms
for select
to authenticated
using (
  created_by = auth.uid()
  or (status = 'open' and coalesce(is_private, false) = false)
  or public.mp_is_room_member(id, auth.uid())
);

create policy "mp_rooms_insert_own"
on public.mp_rooms
for insert
to authenticated
with check (
  created_by = auth.uid()
  and status = 'open'
);

create policy "mp_rooms_update_owner"
on public.mp_rooms
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "mp_rooms_delete_owner"
on public.mp_rooms
for delete
to authenticated
using (created_by = auth.uid());

drop policy if exists "mp_room_players_select_visible" on public.mp_room_players;
drop policy if exists "mp_room_players_insert_self" on public.mp_room_players;
drop policy if exists "mp_room_players_delete_self_or_owner" on public.mp_room_players;

create policy "mp_room_players_select_visible"
on public.mp_room_players
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.mp_rooms r
    where r.id = room_id
      and (
        r.created_by = auth.uid()
        or (r.status = 'open' and coalesce(r.is_private, false) = false)
        or public.mp_is_room_member(r.id, auth.uid())
      )
  )
);

create policy "mp_room_players_insert_self"
on public.mp_room_players
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.mp_room_has_slot(room_id)
);

create policy "mp_room_players_delete_self_or_owner"
on public.mp_room_players
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.mp_rooms r
    where r.id = room_id
      and r.created_by = auth.uid()
  )
);
