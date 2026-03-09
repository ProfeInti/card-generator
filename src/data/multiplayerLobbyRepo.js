import { supabase } from '../lib/supabase'

const ROOM_SELECT_FIELDS =
  'id, created_by, name, status, is_private, max_players, created_at, updated_at'

const ROOM_PLAYER_SELECT_FIELDS = 'id, room_id, user_id, joined_at'

const MATCH_SELECT_FIELDS =
  'id, room_id, status, player1_id, player2_id, current_turn_user_id, turn_deadline_at, turn_seconds, winner_user_id, created_at, updated_at'

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

export async function joinMultiplayerRoom(roomId, userId) {
  const { data, error } = await supabase
    .from('mp_room_players')
    .insert({ room_id: roomId, user_id: userId })
    .select(ROOM_PLAYER_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
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

export async function startMatchForRoom(roomId, turnSeconds = 10) {
  const { data, error } = await supabase.rpc('mp_start_match', {
    p_room_id: roomId,
    p_turn_seconds: turnSeconds,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row || null
}

export { ROOM_SELECT_FIELDS, ROOM_PLAYER_SELECT_FIELDS, MATCH_SELECT_FIELDS }
