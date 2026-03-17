alter table public.mp_match_constructs
  alter column slot_index drop not null;

alter table public.mp_match_constructs
  drop constraint if exists mp_match_constructs_slot_index_check;

alter table public.mp_match_constructs
  add constraint mp_match_constructs_slot_index_check
  check (slot_index is null or slot_index between 1 and 3);

update public.mp_match_constructs mc
set slot_index = null
where mc.slot_index is not null
  and (
    mc.destroyed_at is not null
    or mc.state = 'destroyed'
    or not exists (
      select 1
      from public.mp_match_cards c
      where c.match_id = mc.match_id
        and c.owner_user_id = mc.owner_user_id
        and c.linked_match_construct_id = mc.id
        and c.zone = 'board'
    )
  );

create or replace function public.mp_resolve_deconstruction_attempt(
  p_match_id uuid,
  p_target_construct_id uuid,
  p_technique_ids uuid[]
)
returns table(
  target_construct_id uuid,
  was_success boolean,
  target_state text,
  target_armor integer,
  target_stability_remaining integer,
  acting_player_life integer,
  match_status text,
  winner_user_id uuid,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.mp_matches%rowtype;
  v_target public.mp_match_constructs%rowtype;
  v_target_card public.mp_match_cards%rowtype;
  v_acting_player public.mp_match_players%rowtype;
  v_expected_sequence uuid[];
  v_input_sequence uuid[];
  v_recoil_damage integer;
  v_discard_index integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_match
  from public.mp_matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if v_match.status <> 'active' then
    raise exception 'Match is not active.';
  end if;

  if v_match.current_turn_user_id <> auth.uid() then
    raise exception 'It is not your turn.';
  end if;

  select *
  into v_target
  from public.mp_match_constructs mc
  where mc.id = p_target_construct_id
    and mc.match_id = p_match_id
    and mc.owner_user_id <> auth.uid()
  for update;

  if not found then
    raise exception 'Target construct not found.';
  end if;

  if v_target.destroyed_at is not null or v_target.state = 'destroyed' then
    raise exception 'The target construct is already destroyed.';
  end if;

  if v_target.state <> 'vulnerable' or coalesce(v_target.armor, 0) > 0 then
    raise exception 'Only vulnerable constructs with 0 armor can be deconstructed.';
  end if;

  if coalesce(v_target.deconstruction_locked_until_turn, 0) >= coalesce(v_match.turn_number, 1) then
    raise exception 'This construct cannot be deconstructed again this turn.';
  end if;

  select *
  into v_target_card
  from public.mp_match_cards c
  where c.match_id = p_match_id
    and c.owner_user_id = v_target.owner_user_id
    and c.linked_match_construct_id = v_target.id
    and c.zone = 'board'
  for update;

  if not found then
    raise exception 'The target construct is not on the battlefield.';
  end if;

  select *
  into v_acting_player
  from public.mp_match_players p
  where p.match_id = p_match_id
    and p.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Acting player state not found.';
  end if;

  select array_agg(ms.technique_id order by ms.step_order asc)
  into v_expected_sequence
  from public.mp_match_steps ms
  where ms.match_construct_id = v_target.id;

  if coalesce(array_length(v_expected_sequence, 1), 0) = 0 then
    raise exception 'The target construct has no deconstruction steps.';
  end if;

  v_input_sequence := coalesce(p_technique_ids, array[]::uuid[]);

  if v_input_sequence = v_expected_sequence then
    update public.mp_match_constructs mc
    set state = 'destroyed',
        armor = 0,
        stability_remaining = 0,
        destroyed_at = timezone('utc', now()),
        deconstruction_locked_until_turn = null,
        slot_index = null
    where mc.id = v_target.id
    returning mc.state, mc.armor, mc.stability_remaining
    into target_state, target_armor, target_stability_remaining;

    select coalesce(max(c.position_index), 0) + 1
    into v_discard_index
    from public.mp_match_cards c
    where c.match_id = p_match_id
      and c.owner_user_id = v_target.owner_user_id
      and c.zone = 'discard';

    update public.mp_match_cards c
    set zone = 'discard',
        position_index = v_discard_index
    where c.id = v_target_card.id;

    update public.mp_match_players p
    set cards_in_discard = (
          select count(*)
          from public.mp_match_cards c
          where c.match_id = p.match_id
            and c.owner_user_id = p.user_id
            and c.zone = 'discard'
        )
    where p.match_id = p_match_id
      and p.user_id = v_target.owner_user_id;

    target_construct_id := v_target.id;
    was_success := true;
    acting_player_life := v_acting_player.life_total;
    match_status := v_match.status;
    winner_user_id := v_match.winner_user_id;
    message := 'Deconstruction successful. The construct was destroyed and moved to discard.';
    return next;
  end if;

  v_recoil_damage := greatest(coalesce(v_target.attack, 0), 0);

  update public.mp_match_players p
  set life_total = greatest(coalesce(p.life_total, 0) - v_recoil_damage, 0)
  where p.id = v_acting_player.id
  returning p.life_total
  into acting_player_life;

  update public.mp_match_constructs mc
  set armor = 1,
      state = 'protected',
      stability_remaining = mc.stability_total,
      deconstruction_locked_until_turn = coalesce(v_match.turn_number, 1)
  where mc.id = v_target.id
  returning mc.state, mc.armor, mc.stability_remaining
  into target_state, target_armor, target_stability_remaining;

  if acting_player_life <= 0 then
    update public.mp_matches m
    set status = 'finished',
        winner_user_id = v_target.owner_user_id,
        finished_at = timezone('utc', now())
    where m.id = p_match_id
    returning m.status, m.winner_user_id
    into match_status, winner_user_id;
  else
    match_status := v_match.status;
    winner_user_id := v_match.winner_user_id;
  end if;

  target_construct_id := v_target.id;
  was_success := false;
  message := 'Deconstruction failed. You received retaliatory damage, and the construct recovered 1 armor.';
  return next;
end;
$$;

grant execute on function public.mp_resolve_deconstruction_attempt(uuid, uuid, uuid[]) to authenticated;
