export const MULTIPLAYER_DISABLED_MESSAGE =
  'El multijugador esta desactivado temporalmente mientras retiramos su dependencia de Supabase.'

function throwMultiplayerDisabled() {
  throw new Error(MULTIPLAYER_DISABLED_MESSAGE)
}

export async function listVisibleMultiplayerRooms() {
  return []
}

export async function listRoomPlayersByRoomIds() {
  return []
}

export async function listMatchesByRoomIds() {
  return []
}

export async function getMultiplayerMatch() {
  throwMultiplayerDisabled()
}

export async function getMultiplayerRoom() {
  throwMultiplayerDisabled()
}

export async function listMatchPlayers() {
  return []
}

export async function listMatchCards() {
  return []
}

export async function listTechniqueCardDetailsByIds() {
  return {}
}

export async function listMatchConstructs() {
  return []
}

export async function listMatchStepsByConstructIds() {
  return []
}

export async function createMultiplayerRoom() {
  throwMultiplayerDisabled()
}

export async function deleteMultiplayerRoom() {
  throwMultiplayerDisabled()
}

export async function joinMultiplayerRoom() {
  throwMultiplayerDisabled()
}

export async function leaveMultiplayerRoom() {
  throwMultiplayerDisabled()
}

export async function leaveAllMultiplayerRooms() {
  return 0
}

export async function setMultiplayerRoomReady() {
  throwMultiplayerDisabled()
}

export async function startMatchForRoom() {
  throwMultiplayerDisabled()
}

export async function playConstructFromHand() {
  throwMultiplayerDisabled()
}

export async function attackMatchConstruct() {
  throwMultiplayerDisabled()
}

export async function attackMatchPlayer() {
  throwMultiplayerDisabled()
}

export async function playMatchSpellCard() {
  throwMultiplayerDisabled()
}

export async function resolveMatchDeconstructionAttempt() {
  throwMultiplayerDisabled()
}

export async function endMultiplayerTurn() {
  throwMultiplayerDisabled()
}

export async function surrenderMultiplayerMatch() {
  throwMultiplayerDisabled()
}

export async function submitMatchMulligan() {
  throwMultiplayerDisabled()
}

export const ROOM_SELECT_FIELDS = ''
export const ROOM_PLAYER_SELECT_FIELDS = ''
export const MATCH_SELECT_FIELDS = ''
export const MATCH_PLAYER_SELECT_FIELDS = ''
export const MATCH_CARD_SELECT_FIELDS = ''
export const MATCH_CONSTRUCT_SELECT_FIELDS = ''
export const MATCH_STEP_SELECT_FIELDS = ''
export const TECHNIQUE_CARD_SELECT_FIELDS = ''
