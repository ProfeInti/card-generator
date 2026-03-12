import { supabase } from '../lib/supabase'

const ROOM_SELECT_FIELDS =
  'id, created_by, name, status, is_private, max_players, created_at, updated_at'

const ROOM_PLAYER_SELECT_FIELDS = 'id, room_id, user_id, joined_at, is_ready, ready_at'

const MATCH_SELECT_FIELDS =
  'id, room_id, status, player1_id, player2_id, current_turn_user_id, turn_deadline_at, turn_seconds, winner_user_id, turn_number, started_at, finished_at, turn_started_at, created_at, updated_at'

const MATCH_PLAYER_SELECT_FIELDS =
  'id, match_id, user_id, life_total, ingenuity_current, ingenuity_max, cards_in_deck, cards_in_hand, cards_in_discard, created_at, updated_at'

const MATCH_CARD_SELECT_FIELDS =
  'id, match_id, owner_user_id, source_type, source_construct_id, source_technique_id, technique_name, technique_topic, technique_subtopic, technique_effect_type, technique_effect_description, technique_worked_example, zone, position_index, linked_match_construct_id, granted_by_opponent, created_at'

const MATCH_CONSTRUCT_SELECT_FIELDS =
  'id, match_id, owner_user_id, source_construct_id, source_exercise_id, title, description, attack, armor, ingenuity_cost, effects, exercise_statement, exercise_final_answer, selected_solution_path, stability_total, stability_remaining, slot_index, state, has_attacked_this_turn, summoned_turn_number, deconstruction_locked_until_turn, destroyed_at, created_at'

const MATCH_STEP_SELECT_FIELDS =
  'id, match_construct_id, step_order, source_step_id, technique_id, progress_state, explanation, solution_path, created_at'

const TECHNIQUE_CARD_SELECT_FIELDS =
  'id, name, topic, subtopic, effect_type, effect_description, worked_example, status'

export async function listVisibleMultiplayerRooms() {
  const { data, error } = await supabase
    .from('mp_rooms')
    .select(ROOM_SELECT_FIELDS)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listRoomPlayersByRoomIds(roomIds) {
  const ids = [...new Set((roomIds || []).filter(Boolean))]
  if (!ids.length) return []

  const { data, error } = await supabase
    .from('mp_room_players')
    .select(ROOM_PLAYER_SELECT_FIELDS)
    .in('room_id', ids)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listMatchesByRoomIds(roomIds) {
  const ids = [...new Set((roomIds || []).filter(Boolean))]
  if (!ids.length) return []

  const { data, error } = await supabase
    .from('mp_matches')
    .select(MATCH_SELECT_FIELDS)
    .in('room_id', ids)
    .order('created_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function getMultiplayerMatch(matchId) {
  const { data, error } = await supabase
    .from('mp_matches')
    .select(MATCH_SELECT_FIELDS)
    .eq('id', matchId)
    .single()

  if (error) throw error
  return data
}

export async function getMultiplayerRoom(roomId) {
  const { data, error } = await supabase
    .from('mp_rooms')
    .select(ROOM_SELECT_FIELDS)
    .eq('id', roomId)
    .single()

  if (error) throw error
  return data
}

export async function listMatchPlayers(matchId) {
  const { data, error } = await supabase
    .from('mp_match_players')
    .select(MATCH_PLAYER_SELECT_FIELDS)
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listMatchCards(matchId) {
  const { data, error } = await supabase
    .from('mp_match_cards')
    .select(MATCH_CARD_SELECT_FIELDS)
    .eq('match_id', matchId)
    .order('zone', { ascending: true })
    .order('position_index', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listTechniqueCardDetailsByIds(techniqueIds) {
  const ids = [...new Set((techniqueIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const { data, error } = await supabase
    .from('competitive_techniques')
    .select(TECHNIQUE_CARD_SELECT_FIELDS)
    .in('id', ids)

  if (error) return {}
  return (Array.isArray(data) ? data : []).reduce((acc, row) => {
    acc[row.id] = row
    return acc
  }, {})
}

export async function listMatchConstructs(matchId) {
  const { data, error } = await supabase
    .from('mp_match_constructs')
    .select(MATCH_CONSTRUCT_SELECT_FIELDS)
    .eq('match_id', matchId)
    .order('owner_user_id', { ascending: true })
    .order('slot_index', { ascending: true })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listMatchStepsByConstructIds(matchConstructIds) {
  const ids = [...new Set((matchConstructIds || []).filter(Boolean))]
  if (!ids.length) return []

  const { data, error } = await supabase
    .from('mp_match_steps')
    .select(MATCH_STEP_SELECT_FIELDS)
    .in('match_construct_id', ids)
    .order('match_construct_id', { ascending: true })
    .order('step_order', { ascending: true })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function createMultiplayerRoom(userId, payload) {
  const insertPayload = {
    created_by: userId,
    name: String(payload?.name || '').trim(),
    is_private: Boolean(payload?.isPrivate),
    status: 'open',
    max_players: 2,
  }

  const { data, error } = await supabase
    .from('mp_rooms')
    .insert(insertPayload)
    .select(ROOM_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function deleteMultiplayerRoom(roomId, userId) {
  const { error } = await supabase
    .from('mp_rooms')
    .delete()
    .eq('id', roomId)
    .eq('created_by', userId)

  if (error) throw error
  return true
}

export async function joinMultiplayerRoom(roomId) {
  const { data, error } = await supabase.rpc('mp_join_open_room', {
    p_room_id: roomId,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row || null
}

export async function leaveMultiplayerRoom(roomId, userId) {
  const { error } = await supabase
    .from('mp_room_players')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId)

  if (error) throw error
  return true
}

export async function leaveAllMultiplayerRooms() {
  const { data, error } = await supabase.rpc('mp_leave_all_rooms')

  if (error) throw error
  return Number(data || 0)
}

export async function setMultiplayerRoomReady(roomId, isReady) {
  const { data, error } = await supabase.rpc('mp_set_room_ready', {
    p_room_id: roomId,
    p_is_ready: Boolean(isReady),
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row || null
}

export async function startMatchForRoom(roomId, turnSeconds = 75) {
  const { data, error } = await supabase.rpc('mp_start_match', {
    p_room_id: roomId,
    p_turn_seconds: turnSeconds,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row || null
}

export async function playConstructFromHand(matchId, cardId, slotIndex) {
  const { data, error } = await supabase.rpc('mp_play_construct_from_hand', {
    p_match_id: matchId,
    p_card_id: cardId,
    p_slot_index: slotIndex,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row || null
}

export async function endMultiplayerTurn(matchId) {
  const { data, error } = await supabase.rpc('mp_end_turn', {
    p_match_id: matchId,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row || null
}

export {
  ROOM_SELECT_FIELDS,
  ROOM_PLAYER_SELECT_FIELDS,
  MATCH_SELECT_FIELDS,
  MATCH_PLAYER_SELECT_FIELDS,
  MATCH_CARD_SELECT_FIELDS,
  MATCH_CONSTRUCT_SELECT_FIELDS,
  MATCH_STEP_SELECT_FIELDS,
  TECHNIQUE_CARD_SELECT_FIELDS,
}
