import { supabase } from '../lib/supabase'

const DECK_SELECT_FIELDS = 'id, user_id, name, created_at, updated_at'
const DECK_ITEM_SELECT_FIELDS = 'id, deck_id, construct_id, position_index, created_at'

async function ensureMultiplayerDeck(userId) {
  const { data, error } = await supabase
    .from('mp_player_decks')
    .upsert({
      user_id: userId,
      name: 'Multiplayer Deck',
    }, {
      onConflict: 'user_id',
      ignoreDuplicates: false,
    })
    .select(DECK_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function getMultiplayerDeck(userId) {
  const deck = await ensureMultiplayerDeck(userId)

  const { data, error } = await supabase
    .from('mp_player_deck_items')
    .select(DECK_ITEM_SELECT_FIELDS)
    .eq('deck_id', deck.id)
    .order('position_index', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  return {
    deck,
    items: Array.isArray(data) ? data : [],
  }
}

export async function replaceMultiplayerDeckConstructs(userId, constructIds) {
  const deck = await ensureMultiplayerDeck(userId)
  const nextIds = [...new Set((constructIds || []).filter(Boolean))]

  const { error: deleteError } = await supabase
    .from('mp_player_deck_items')
    .delete()
    .eq('deck_id', deck.id)

  if (deleteError) throw deleteError

  if (nextIds.length > 0) {
    const payload = nextIds.map((constructId, index) => ({
      deck_id: deck.id,
      construct_id: constructId,
      position_index: index + 1,
    }))

    const { error: insertError } = await supabase
      .from('mp_player_deck_items')
      .insert(payload)

    if (insertError) throw insertError
  }

  const { data: updatedDeck, error: updateError } = await supabase
    .from('mp_player_decks')
    .update({ name: 'Multiplayer Deck' })
    .eq('id', deck.id)
    .select(DECK_SELECT_FIELDS)
    .single()

  if (updateError) throw updateError

  return {
    deck: updatedDeck,
    items: nextIds.map((constructId, index) => ({
      deck_id: deck.id,
      construct_id: constructId,
      position_index: index + 1,
    })),
  }
}

export async function listMultiplayerDeckSummariesByUserIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const { data: deckRows, error: deckError } = await supabase
    .from('mp_player_decks')
    .select(DECK_SELECT_FIELDS)
    .in('user_id', ids)

  if (deckError) throw deckError

  const decks = Array.isArray(deckRows) ? deckRows : []
  const deckIds = decks.map((row) => row.id)
  const countByDeckId = {}

  if (deckIds.length > 0) {
    const { data: itemRows, error: itemError } = await supabase
      .from('mp_player_deck_items')
      .select('deck_id')
      .in('deck_id', deckIds)

    if (itemError) throw itemError

    ;(Array.isArray(itemRows) ? itemRows : []).forEach((row) => {
      countByDeckId[row.deck_id] = (countByDeckId[row.deck_id] || 0) + 1
    })
  }

  return ids.reduce((acc, userId) => {
    const deck = decks.find((row) => row.user_id === userId) || null
    acc[userId] = {
      deckId: deck?.id || null,
      count: deck ? countByDeckId[deck.id] || 0 : 0,
      updatedAt: deck?.updated_at || null,
    }
    return acc
  }, {})
}

export { DECK_SELECT_FIELDS, DECK_ITEM_SELECT_FIELDS }
