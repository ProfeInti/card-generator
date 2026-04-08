import { createLocalId, readLocalJson, writeLocalJson } from '../lib/localStore'

const MULTIPLAYER_DECKS_KEY = 'inticore-mp-player-decks'
const MULTIPLAYER_DECK_ITEMS_KEY = 'inticore-mp-player-deck-items'

const DECK_SELECT_FIELDS = 'id, user_id, name, created_at, updated_at'
const DECK_ITEM_SELECT_FIELDS = 'id, deck_id, construct_id, position_index, created_at'

function readDecks() {
  return Array.isArray(readLocalJson(MULTIPLAYER_DECKS_KEY, [])) ? readLocalJson(MULTIPLAYER_DECKS_KEY, []) : []
}

function writeDecks(rows) {
  writeLocalJson(MULTIPLAYER_DECKS_KEY, Array.isArray(rows) ? rows : [])
}

function readDeckItems() {
  return Array.isArray(readLocalJson(MULTIPLAYER_DECK_ITEMS_KEY, [])) ? readLocalJson(MULTIPLAYER_DECK_ITEMS_KEY, []) : []
}

function writeDeckItems(rows) {
  writeLocalJson(MULTIPLAYER_DECK_ITEMS_KEY, Array.isArray(rows) ? rows : [])
}

async function ensureMultiplayerDeck(userId) {
  const safeUserId = String(userId || '').trim()
  if (!safeUserId) {
    throw new Error('userId is required.')
  }

  const decks = readDecks()
  const existing = decks.find((row) => row.user_id === safeUserId) || null
  if (existing) return existing

  const timestamp = new Date().toISOString()
  const nextDeck = {
    id: createLocalId('mp-deck'),
    user_id: safeUserId,
    name: 'Multiplayer Deck',
    created_at: timestamp,
    updated_at: timestamp,
  }

  writeDecks([nextDeck, ...decks])
  return nextDeck
}

export async function getMultiplayerDeck(userId) {
  const deck = await ensureMultiplayerDeck(userId)
  const items = readDeckItems()
    .filter((row) => row.deck_id === deck.id)
    .sort((left, right) => Number(left.position_index || 0) - Number(right.position_index || 0))

  return {
    deck,
    items,
  }
}

export async function replaceMultiplayerDeckConstructs(userId, constructIds) {
  const deck = await ensureMultiplayerDeck(userId)
  const nextIds = [...new Set((constructIds || []).filter(Boolean))]
  const timestamp = new Date().toISOString()

  const nextItems = nextIds.map((constructId, index) => ({
    id: createLocalId('mp-deck-item'),
    deck_id: deck.id,
    construct_id: constructId,
    position_index: index + 1,
    created_at: timestamp,
  }))

  writeDeckItems([
    ...readDeckItems().filter((row) => row.deck_id !== deck.id),
    ...nextItems,
  ])

  const updatedDeck = {
    ...deck,
    updated_at: timestamp,
  }

  writeDecks(
    readDecks().map((row) => (row.id === deck.id ? updatedDeck : row))
  )

  return {
    deck: updatedDeck,
    items: nextItems,
  }
}

export async function listMultiplayerDeckSummariesByUserIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const decks = readDecks().filter((row) => ids.includes(row.user_id))
  const items = readDeckItems()
  const countByDeckId = items.reduce((acc, row) => {
    const deckId = String(row.deck_id || '').trim()
    if (!deckId) return acc
    acc[deckId] = (acc[deckId] || 0) + 1
    return acc
  }, {})

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
