import { createLocalId, readLocalJson, sortByUpdatedAtDesc, writeLocalJson } from '../lib/localStore'

const EXERCISE_SELECT_FIELDS =
  'id, created_by, reviewed_by, approved_at, status, source_title, source_work_title, source_type, source_author, source_year, source_location, page_number, exercise_number, statement, final_answer, topic, subtopic, difficulty, created_at, updated_at'

const COMPETITIVE_EXERCISES_KEY = 'inticore-competitive-exercises'

function normalizeExerciseRow(row) {
  if (!row || typeof row !== 'object') return null

  return {
    id: String(row.id || '').trim(),
    created_by: String(row.created_by || '').trim(),
    reviewed_by: String(row.reviewed_by || '').trim() || null,
    approved_at: row.approved_at || null,
    status: String(row.status || 'draft').trim() || 'draft',
    source_title: String(row.source_title || '').trim(),
    source_work_title: String(row.source_work_title || '').trim(),
    source_type: String(row.source_type || '').trim(),
    source_author: String(row.source_author || '').trim(),
    source_year: row.source_year ?? null,
    source_location: String(row.source_location || '').trim(),
    page_number: row.page_number ?? null,
    exercise_number: String(row.exercise_number || '').trim(),
    statement: String(row.statement || '').trim(),
    final_answer: String(row.final_answer || '').trim(),
    topic: String(row.topic || '').trim(),
    subtopic: String(row.subtopic || '').trim(),
    difficulty: String(row.difficulty || '').trim(),
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
  }
}

function readAllExercises() {
  return sortByUpdatedAtDesc(
    (Array.isArray(readLocalJson(COMPETITIVE_EXERCISES_KEY, [])) ? readLocalJson(COMPETITIVE_EXERCISES_KEY, []) : [])
      .map(normalizeExerciseRow)
      .filter(Boolean)
  )
}

function writeAllExercises(rows) {
  writeLocalJson(COMPETITIVE_EXERCISES_KEY, Array.isArray(rows) ? rows : [])
}

function upsertExerciseRow(row) {
  const rows = readAllExercises()
  const nextRows = rows.some((entry) => entry.id === row.id)
    ? rows.map((entry) => (entry.id === row.id ? row : entry))
    : [row, ...rows]

  writeAllExercises(nextRows)
  return row
}

export function getCompetitiveExerciseById(exerciseId) {
  const safeExerciseId = String(exerciseId || '').trim()
  if (!safeExerciseId) return null
  return readAllExercises().find((row) => row.id === safeExerciseId) || null
}

export async function listCompetitiveExercisesByIds(exerciseIds) {
  const ids = [...new Set((Array.isArray(exerciseIds) ? exerciseIds : []).map((value) => String(value || '').trim()).filter(Boolean))]
  if (!ids.length) return []
  return readAllExercises().filter((row) => ids.includes(row.id))
}

export async function listOwnCompetitiveExercises(userId) {
  const ownerUserId = String(userId || '').trim()
  return readAllExercises().filter((row) => row.created_by === ownerUserId)
}

export async function listVisibleCompetitiveExercises(userId) {
  return listOwnCompetitiveExercises(userId)
}

export async function listApprovedCompetitiveExercises(userId) {
  const ownerUserId = String(userId || '').trim()
  return readAllExercises().filter((row) => row.created_by === ownerUserId && row.status === 'approved')
}

export async function updateOwnCompetitiveExercise(exerciseId, userId, payload) {
  const current = getCompetitiveExerciseById(exerciseId)
  if (!current || current.created_by !== String(userId || '').trim()) {
    throw new Error('Exercise not found.')
  }

  const nextRow = normalizeExerciseRow({
    ...current,
    ...payload,
    id: current.id,
    created_by: current.created_by,
    updated_at: new Date().toISOString(),
  })

  return upsertExerciseRow(nextRow)
}

export async function createCompetitiveExercise(payload) {
  const timestamp = new Date().toISOString()
  const nextRow = normalizeExerciseRow({
    ...payload,
    id: payload?.id || createLocalId('cmp-exercise'),
    created_by: String(payload?.created_by || '').trim(),
    created_at: payload?.created_at || timestamp,
    updated_at: payload?.updated_at || timestamp,
    status: payload?.status || 'draft',
  })

  if (!nextRow?.created_by) {
    throw new Error('created_by is required.')
  }

  return upsertExerciseRow(nextRow)
}

export async function deleteOwnCompetitiveExercise(exerciseId, userId) {
  const safeExerciseId = String(exerciseId || '').trim()
  const ownerUserId = String(userId || '').trim()
  writeAllExercises(
    readAllExercises().filter((row) => !(row.id === safeExerciseId && row.created_by === ownerUserId))
  )
  return true
}

export async function listProposedCompetitiveExercises() {
  return readAllExercises().filter((row) => row.status === 'proposed')
}

export async function reviewProposedCompetitiveExercise(exerciseId, teacherUserId, decision) {
  const current = getCompetitiveExerciseById(exerciseId)
  if (!current || current.status !== 'proposed') {
    throw new Error('Exercise not found.')
  }

  const approved = decision === 'approve'
  const nextRow = normalizeExerciseRow({
    ...current,
    status: approved ? 'approved' : 'rejected',
    reviewed_by: String(teacherUserId || '').trim(),
    approved_at: approved ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  })

  return upsertExerciseRow(nextRow)
}

export { EXERCISE_SELECT_FIELDS }
