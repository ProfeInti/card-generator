import { createLocalId, readLocalJson, sortByUpdatedAtDesc, writeLocalJson } from '../lib/localStore'

const DUNGEONS_KEY = 'inticore-math-dungeons'
const DUNGEON_CHALLENGES_KEY = 'inticore-math-dungeon-challenges'
const DUNGEON_REWARDS_KEY = 'inticore-math-dungeon-rewards'
const DUNGEON_CHARACTERS_KEY = 'inticore-math-dungeon-characters'
const DUNGEON_RUNS_KEY = 'inticore-math-dungeon-runs'

function normalizeObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
}

function normalizeDungeon(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: String(row.id || '').trim(),
    created_by: String(row.created_by || '').trim(),
    visibility: row.visibility === 'published' ? 'published' : 'private',
    title: String(row.title || '').trim(),
    theme: String(row.theme || '').trim(),
    context_text: String(row.context_text || '').trim(),
    context_json: normalizeObject(row.context_json),
    player_defaults: normalizeObject(row.player_defaults),
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
  }
}

function normalizeChallenge(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: String(row.id || '').trim(),
    dungeon_id: String(row.dungeon_id || '').trim(),
    sort_order: Number(row.sort_order ?? 0),
    title: String(row.title || '').trim(),
    room_type: String(row.room_type || '').trim(),
    math_topic: String(row.math_topic || '').trim(),
    exercise_prompt: String(row.exercise_prompt || '').trim(),
    success_outcome: String(row.success_outcome || '').trim(),
    failure_outcome: String(row.failure_outcome || '').trim(),
    challenge_json: normalizeObject(row.challenge_json),
    created_at: String(row.created_at || '').trim(),
  }
}

function normalizeReward(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: String(row.id || '').trim(),
    dungeon_id: String(row.dungeon_id || '').trim(),
    sort_order: Number(row.sort_order ?? 0),
    name: String(row.name || '').trim(),
    reward_type: String(row.reward_type || '').trim(),
    rarity: String(row.rarity || '').trim(),
    description: String(row.description || '').trim(),
    reward_json: normalizeObject(row.reward_json),
    created_at: String(row.created_at || '').trim(),
  }
}

function normalizeCharacter(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: String(row.id || '').trim(),
    owner_user_id: String(row.owner_user_id || '').trim(),
    name: String(row.name || '').trim(),
    class_id: String(row.class_id || '').trim(),
    level: Number(row.level ?? 1),
    experience: Number(row.experience ?? 0),
    base_stats: normalizeObject(row.base_stats),
    current_stats: normalizeObject(row.current_stats),
    inventory: Array.isArray(row.inventory) ? row.inventory : [],
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
  }
}

function normalizeRun(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: String(row.id || '').trim(),
    player_user_id: String(row.player_user_id || '').trim(),
    character_id: String(row.character_id || '').trim(),
    dungeon_id: String(row.dungeon_id || '').trim(),
    status: String(row.status || '').trim(),
    current_room_id: String(row.current_room_id || '').trim(),
    character_snapshot: normalizeObject(row.character_snapshot),
    state_json: normalizeObject(row.state_json),
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
  }
}

function readRows(key, normalizer, sortRows = false) {
  const rows = Array.isArray(readLocalJson(key, [])) ? readLocalJson(key, []) : []
  const normalized = rows.map(normalizer).filter(Boolean)
  return sortRows ? sortByUpdatedAtDesc(normalized) : normalized
}

function writeRows(key, rows) {
  writeLocalJson(key, Array.isArray(rows) ? rows : [])
}

function readAllDungeons() {
  return readRows(DUNGEONS_KEY, normalizeDungeon, true)
}

function writeAllDungeons(rows) {
  writeRows(DUNGEONS_KEY, rows)
}

function readAllChallenges() {
  return readRows(DUNGEON_CHALLENGES_KEY, normalizeChallenge, false)
}

function writeAllChallenges(rows) {
  writeRows(DUNGEON_CHALLENGES_KEY, rows)
}

function readAllRewards() {
  return readRows(DUNGEON_REWARDS_KEY, normalizeReward, false)
}

function writeAllRewards(rows) {
  writeRows(DUNGEON_REWARDS_KEY, rows)
}

function readAllCharacters() {
  return readRows(DUNGEON_CHARACTERS_KEY, normalizeCharacter, true)
}

function writeAllCharacters(rows) {
  writeRows(DUNGEON_CHARACTERS_KEY, rows)
}

function readAllRuns() {
  return readRows(DUNGEON_RUNS_KEY, normalizeRun, true)
}

function writeAllRuns(rows) {
  writeRows(DUNGEON_RUNS_KEY, rows)
}

function getDungeonById(dungeonId) {
  const safeDungeonId = String(dungeonId || '').trim()
  return readAllDungeons().find((row) => row.id === safeDungeonId) || null
}

function getCharacterById(characterId) {
  const safeCharacterId = String(characterId || '').trim()
  return readAllCharacters().find((row) => row.id === safeCharacterId) || null
}

function getRunById(runId) {
  const safeRunId = String(runId || '').trim()
  return readAllRuns().find((row) => row.id === safeRunId) || null
}

function upsertRow(rows, row) {
  return rows.some((entry) => entry.id === row.id)
    ? rows.map((entry) => (entry.id === row.id ? row : entry))
    : [row, ...rows]
}

export async function listMathDungeons(ownerUserId) {
  const userId = String(ownerUserId || '').trim()
  return readAllDungeons().filter((row) => row.created_by === userId)
}

export async function listPublishedMathDungeons() {
  return readAllDungeons().filter((row) => row.visibility === 'published')
}

export async function createMathDungeon(payload) {
  const timestamp = new Date().toISOString()
  const row = normalizeDungeon({
    ...payload,
    id: payload?.id || createLocalId('dungeon'),
    created_at: payload?.created_at || timestamp,
    updated_at: payload?.updated_at || timestamp,
  })

  if (!row?.created_by) {
    throw new Error('created_by is required.')
  }

  writeAllDungeons(upsertRow(readAllDungeons(), row))
  return row
}

export async function updateMathDungeon(dungeonId, ownerUserId, payload) {
  const current = getDungeonById(dungeonId)
  if (!current || current.created_by !== String(ownerUserId || '').trim()) {
    throw new Error('Dungeon not found.')
  }

  const row = normalizeDungeon({
    ...current,
    ...payload,
    id: current.id,
    created_by: current.created_by,
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
  })

  writeAllDungeons(upsertRow(readAllDungeons(), row))
  return row
}

export async function deleteMathDungeon(dungeonId, ownerUserId) {
  const safeDungeonId = String(dungeonId || '').trim()
  const safeOwnerUserId = String(ownerUserId || '').trim()

  writeAllDungeons(
    readAllDungeons().filter((row) => !(row.id === safeDungeonId && row.created_by === safeOwnerUserId))
  )
  writeAllChallenges(readAllChallenges().filter((row) => row.dungeon_id !== safeDungeonId))
  writeAllRewards(readAllRewards().filter((row) => row.dungeon_id !== safeDungeonId))
  writeAllRuns(readAllRuns().filter((row) => row.dungeon_id !== safeDungeonId))
  return true
}

async function listDungeonChallenges(dungeonId) {
  const safeDungeonId = String(dungeonId || '').trim()
  return readAllChallenges()
    .filter((row) => row.dungeon_id === safeDungeonId)
    .sort((left, right) => {
      if (Number(left.sort_order || 0) !== Number(right.sort_order || 0)) {
        return Number(left.sort_order || 0) - Number(right.sort_order || 0)
      }
      return String(left.created_at || '').localeCompare(String(right.created_at || ''))
    })
}

async function listDungeonRewards(dungeonId) {
  const safeDungeonId = String(dungeonId || '').trim()
  return readAllRewards()
    .filter((row) => row.dungeon_id === safeDungeonId)
    .sort((left, right) => {
      if (Number(left.sort_order || 0) !== Number(right.sort_order || 0)) {
        return Number(left.sort_order || 0) - Number(right.sort_order || 0)
      }
      return String(left.created_at || '').localeCompare(String(right.created_at || ''))
    })
}

export async function getMathDungeonDetail(dungeonId, ownerUserId) {
  const dungeon = getDungeonById(dungeonId)
  if (!dungeon || dungeon.created_by !== String(ownerUserId || '').trim()) {
    return null
  }

  const [challenges, rewards] = await Promise.all([
    listDungeonChallenges(dungeonId),
    listDungeonRewards(dungeonId),
  ])

  return {
    dungeon,
    challenges,
    rewards,
  }
}

export async function getMathDungeonPlayableDetail(dungeonId) {
  const dungeon = getDungeonById(dungeonId)
  if (!dungeon) return null

  const [challenges, rewards] = await Promise.all([
    listDungeonChallenges(dungeonId),
    listDungeonRewards(dungeonId),
  ])

  return {
    dungeon,
    challenges,
    rewards,
  }
}

async function syncDungeonChallenges(dungeonId, challenges) {
  const safeDungeonId = String(dungeonId || '').trim()
  const timestamp = new Date().toISOString()
  const existingRows = readAllChallenges().filter((row) => row.dungeon_id !== safeDungeonId)
  const nextRows = (Array.isArray(challenges) ? challenges : []).map((row, index) => normalizeChallenge({
    ...row,
    id: row?.id || createLocalId('dungeon-challenge'),
    dungeon_id: safeDungeonId,
    sort_order: index,
    created_at: row?.created_at || timestamp,
  }))

  writeAllChallenges([...existingRows, ...nextRows])
}

async function syncDungeonRewards(dungeonId, rewards) {
  const safeDungeonId = String(dungeonId || '').trim()
  const timestamp = new Date().toISOString()
  const existingRows = readAllRewards().filter((row) => row.dungeon_id !== safeDungeonId)
  const nextRows = (Array.isArray(rewards) ? rewards : []).map((row, index) => normalizeReward({
    ...row,
    id: row?.id || createLocalId('dungeon-reward'),
    dungeon_id: safeDungeonId,
    sort_order: index,
    created_at: row?.created_at || timestamp,
  }))

  writeAllRewards([...existingRows, ...nextRows])
}

export async function saveMathDungeonGraph({
  dungeonId = null,
  ownerUserId,
  dungeon,
  challenges,
  rewards,
}) {
  const dungeonPayload = {
    created_by: ownerUserId,
    visibility: dungeon.visibility === 'published' ? 'published' : 'private',
    title: String(dungeon.title || '').trim(),
    theme: String(dungeon.theme || '').trim(),
    context_text: String(dungeon.context_text || '').trim(),
    context_json: normalizeObject(dungeon.context_json),
    player_defaults: normalizeObject(dungeon.player_defaults),
  }

  const savedDungeon = dungeonId
    ? await updateMathDungeon(dungeonId, ownerUserId, dungeonPayload)
    : await createMathDungeon(dungeonPayload)

  await syncDungeonChallenges(savedDungeon.id, challenges)
  await syncDungeonRewards(savedDungeon.id, rewards)

  return getMathDungeonDetail(savedDungeon.id, ownerUserId)
}

export async function listOwnMathDungeonCharacters(ownerUserId) {
  const userId = String(ownerUserId || '').trim()
  return readAllCharacters().filter((row) => row.owner_user_id === userId)
}

export async function createMathDungeonCharacter(payload) {
  const timestamp = new Date().toISOString()
  const row = normalizeCharacter({
    ...payload,
    id: payload?.id || createLocalId('dungeon-character'),
    created_at: payload?.created_at || timestamp,
    updated_at: payload?.updated_at || timestamp,
  })

  if (!row?.owner_user_id) {
    throw new Error('owner_user_id is required.')
  }

  writeAllCharacters(upsertRow(readAllCharacters(), row))
  return row
}

export async function updateMathDungeonCharacter(characterId, ownerUserId, payload) {
  const current = getCharacterById(characterId)
  if (!current || current.owner_user_id !== String(ownerUserId || '').trim()) {
    throw new Error('Character not found.')
  }

  const row = normalizeCharacter({
    ...current,
    ...payload,
    id: current.id,
    owner_user_id: current.owner_user_id,
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
  })

  writeAllCharacters(upsertRow(readAllCharacters(), row))
  return row
}

export async function deleteMathDungeonCharacter(characterId, ownerUserId) {
  const safeCharacterId = String(characterId || '').trim()
  const safeOwnerUserId = String(ownerUserId || '').trim()
  writeAllCharacters(
    readAllCharacters().filter((row) => !(row.id === safeCharacterId && row.owner_user_id === safeOwnerUserId))
  )
  writeAllRuns(readAllRuns().filter((row) => row.character_id !== safeCharacterId))
  return true
}

export async function listOwnMathDungeonRuns(playerUserId) {
  const userId = String(playerUserId || '').trim()
  return readAllRuns().filter((row) => row.player_user_id === userId)
}

export async function getMathDungeonRunDetail(runId, playerUserId) {
  const run = getRunById(runId)
  if (!run || run.player_user_id !== String(playerUserId || '').trim()) {
    return null
  }

  return run
}

export async function createMathDungeonRun(payload) {
  const timestamp = new Date().toISOString()
  const row = normalizeRun({
    ...payload,
    id: payload?.id || createLocalId('dungeon-run'),
    created_at: payload?.created_at || timestamp,
    updated_at: payload?.updated_at || timestamp,
  })

  if (!row?.player_user_id) {
    throw new Error('player_user_id is required.')
  }

  writeAllRuns(upsertRow(readAllRuns(), row))
  return row
}

export async function updateMathDungeonRun(runId, playerUserId, payload) {
  const current = getRunById(runId)
  if (!current || current.player_user_id !== String(playerUserId || '').trim()) {
    throw new Error('Run not found.')
  }

  const row = normalizeRun({
    ...current,
    ...payload,
    id: current.id,
    player_user_id: current.player_user_id,
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
  })

  writeAllRuns(upsertRow(readAllRuns(), row))
  return row
}

export async function deleteMathDungeonRun(runId, playerUserId) {
  const safeRunId = String(runId || '').trim()
  const safePlayerUserId = String(playerUserId || '').trim()
  writeAllRuns(
    readAllRuns().filter((row) => !(row.id === safeRunId && row.player_user_id === safePlayerUserId))
  )
  return true
}
