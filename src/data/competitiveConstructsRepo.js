import { listApprovedTechniqueCatalogEntries, listPrivateCompetitiveTechniqueInventory } from './competitiveTechniquesRepo'
import { listCompetitiveExercisesByIds } from './competitiveExercisesRepo'
import { createLocalId, readLocalJson, sortByUpdatedAtDesc, writeLocalJson } from '../lib/localStore'

const CONSTRUCT_SELECT_FIELDS =
  'id, created_by, exercise_id, title, description, image_url, attack, armor, ingenuity_cost, effect_strength, effects, status, created_at, updated_at, reviewed_by, approved_at'

const CONSTRUCT_STEP_SELECT_FIELDS =
  'id, construct_id, solution_path, step_order, technique_id, progress_state, explanation, created_at'

const EXERCISE_MIN_SELECT_FIELDS =
  'id, source_title, source_work_title, source_author, source_location, page_number, exercise_number, statement, topic, subtopic, difficulty, status'
const TECHNIQUE_MIN_SELECT_FIELDS =
  'id, name, name_fr, topic, topic_fr, subtopic, subtopic_fr, effect_type, effect_type_fr, effect_description, effect_description_fr, status'

const CONSTRUCTS_KEY = 'inticore-competitive-constructs'
const CONSTRUCT_STEPS_KEY = 'inticore-competitive-construct-steps'

function normalizeConstructRow(row) {
  if (!row || typeof row !== 'object') return null

  return {
    id: String(row.id || '').trim(),
    created_by: String(row.created_by || '').trim(),
    exercise_id: String(row.exercise_id || '').trim() || null,
    title: String(row.title || '').trim(),
    description: String(row.description || '').trim(),
    image_url: String(row.image_url || '').trim(),
    attack: Number(row.attack ?? 0),
    armor: Number(row.armor ?? 0),
    ingenuity_cost: Number(row.ingenuity_cost ?? 0),
    effect_strength: Number(row.effect_strength ?? 0),
    effects: String(row.effects || '').trim(),
    status: String(row.status || 'draft').trim() || 'draft',
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
    reviewed_by: String(row.reviewed_by || '').trim() || null,
    approved_at: row.approved_at || null,
  }
}

function normalizeConstructStepRow(row) {
  if (!row || typeof row !== 'object') return null

  return {
    id: String(row.id || '').trim(),
    construct_id: String(row.construct_id || '').trim(),
    solution_path: String(row.solution_path || '').trim() || 'main',
    step_order: Number(row.step_order ?? 0),
    technique_id: String(row.technique_id || '').trim() || null,
    progress_state: String(row.progress_state || '').trim(),
    explanation: String(row.explanation || '').trim(),
    created_at: String(row.created_at || '').trim(),
  }
}

function readAllConstructs() {
  const rows = Array.isArray(readLocalJson(CONSTRUCTS_KEY, [])) ? readLocalJson(CONSTRUCTS_KEY, []) : []
  return sortByUpdatedAtDesc(rows.map(normalizeConstructRow).filter(Boolean))
}

function writeAllConstructs(rows) {
  writeLocalJson(CONSTRUCTS_KEY, Array.isArray(rows) ? rows : [])
}

function readAllConstructSteps() {
  const rows = Array.isArray(readLocalJson(CONSTRUCT_STEPS_KEY, [])) ? readLocalJson(CONSTRUCT_STEPS_KEY, []) : []
  return rows
    .map(normalizeConstructStepRow)
    .filter(Boolean)
    .sort((left, right) => {
      const pathCompare = String(left.solution_path || '').localeCompare(String(right.solution_path || ''))
      if (pathCompare !== 0) return pathCompare
      return Number(left.step_order || 0) - Number(right.step_order || 0)
    })
}

function writeAllConstructSteps(rows) {
  writeLocalJson(CONSTRUCT_STEPS_KEY, Array.isArray(rows) ? rows : [])
}

function getConstructById(constructId) {
  const safeConstructId = String(constructId || '').trim()
  if (!safeConstructId) return null
  return readAllConstructs().find((row) => row.id === safeConstructId) || null
}

function upsertConstructRow(row) {
  const rows = readAllConstructs()
  const nextRows = rows.some((entry) => entry.id === row.id)
    ? rows.map((entry) => (entry.id === row.id ? row : entry))
    : [row, ...rows]

  writeAllConstructs(nextRows)
  return row
}

function upsertConstructStepRow(row) {
  const rows = readAllConstructSteps()
  const nextRows = rows.some((entry) => entry.id === row.id)
    ? rows.map((entry) => (entry.id === row.id ? row : entry))
    : [...rows, row]

  writeAllConstructSteps(nextRows)
  return row
}

async function buildTechniqueSnapshotById(techniqueIds) {
  const ids = [...new Set((Array.isArray(techniqueIds) ? techniqueIds : []).map((value) => String(value || '').trim()).filter(Boolean))]
  if (!ids.length) return {}

  const [privateItems, catalogItems] = await Promise.all([
    listPrivateCompetitiveTechniqueInventory(''),
    listApprovedTechniqueCatalogEntries(),
  ])

  const byId = {}

  ;[...(Array.isArray(privateItems) ? privateItems : []), ...(Array.isArray(catalogItems) ? catalogItems : [])].forEach((item) => {
    const itemId = String(item?.id || '').trim()
    const legacyId = String(item?.legacy_technique_id || '').trim()
    if (itemId) {
      byId[itemId] = {
        id: itemId,
        name: item.name || '',
        name_fr: item.name_fr || '',
        topic: item.topic || '',
        topic_fr: item.topic_fr || '',
        subtopic: item.subtopic || '',
        subtopic_fr: item.subtopic_fr || '',
        effect_type: item.effect_type || '',
        effect_type_fr: item.effect_type_fr || '',
        effect_description: item.effect_description || '',
        effect_description_fr: item.effect_description_fr || '',
        status: item.status || '',
      }
    }
    if (legacyId) {
      byId[legacyId] = {
        id: legacyId,
        name: item.name || '',
        name_fr: item.name_fr || '',
        topic: item.topic || '',
        topic_fr: item.topic_fr || '',
        subtopic: item.subtopic || '',
        subtopic_fr: item.subtopic_fr || '',
        effect_type: item.effect_type || '',
        effect_type_fr: item.effect_type_fr || '',
        effect_description: item.effect_description || '',
        effect_description_fr: item.effect_description_fr || '',
        status: item.status || '',
      }
    }
  })

  ids.forEach((id) => {
    if (!byId[id]) {
      byId[id] = {
        id,
        name: `Technique ${id}`,
        name_fr: '',
        topic: '',
        topic_fr: '',
        subtopic: '',
        subtopic_fr: '',
        effect_type: '',
        effect_type_fr: '',
        effect_description: '',
        effect_description_fr: '',
        status: 'unknown',
      }
    }
  })

  return byId
}

export async function createConstruct(payload) {
  const timestamp = new Date().toISOString()
  const nextRow = normalizeConstructRow({
    ...payload,
    id: payload?.id || createLocalId('construct'),
    created_at: payload?.created_at || timestamp,
    updated_at: payload?.updated_at || timestamp,
    status: payload?.status || 'draft',
  })

  if (!nextRow?.created_by) {
    throw new Error('created_by is required.')
  }

  return upsertConstructRow(nextRow)
}

export async function updateConstruct(constructId, userId, payload) {
  const current = getConstructById(constructId)
  if (!current || current.created_by !== String(userId || '').trim()) {
    throw new Error('Construct not found.')
  }

  const nextRow = normalizeConstructRow({
    ...current,
    ...payload,
    id: current.id,
    created_by: current.created_by,
    updated_at: new Date().toISOString(),
  })

  return upsertConstructRow(nextRow)
}

export async function listOwnConstructs(userId) {
  const ownerUserId = String(userId || '').trim()
  return readAllConstructs().filter((row) => row.created_by === ownerUserId)
}

export async function listVisibleConstructs(userId) {
  return listOwnConstructs(userId)
}

export async function listApprovedConstructs(userId) {
  const ownerUserId = String(userId || '').trim()
  return readAllConstructs().filter((row) => row.created_by === ownerUserId && row.status === 'approved')
}

export async function listProposedConstructsForReview() {
  return readAllConstructs().filter((row) => row.status === 'proposed')
}

export async function approveConstruct(constructId, teacherUserId) {
  const current = getConstructById(constructId)
  if (!current || current.status !== 'proposed') {
    throw new Error('Construct not found.')
  }

  return upsertConstructRow(normalizeConstructRow({
    ...current,
    status: 'approved',
    reviewed_by: String(teacherUserId || '').trim(),
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
}

export async function rejectConstruct(constructId, teacherUserId) {
  const current = getConstructById(constructId)
  if (!current || current.status !== 'proposed') {
    throw new Error('Construct not found.')
  }

  return upsertConstructRow(normalizeConstructRow({
    ...current,
    status: 'rejected',
    reviewed_by: String(teacherUserId || '').trim(),
    approved_at: null,
    updated_at: new Date().toISOString(),
  }))
}

export async function deleteOwnConstruct(constructId, userId) {
  const safeConstructId = String(constructId || '').trim()
  const ownerUserId = String(userId || '').trim()

  writeAllConstructs(
    readAllConstructs().filter((row) => !(row.id === safeConstructId && row.created_by === ownerUserId))
  )
  writeAllConstructSteps(
    readAllConstructSteps().filter((row) => row.construct_id !== safeConstructId)
  )
  return true
}

export async function listConstructSteps(constructId) {
  const safeConstructId = String(constructId || '').trim()
  return readAllConstructSteps().filter((row) => row.construct_id === safeConstructId)
}

export async function getConstructDetail(constructId) {
  const construct = getConstructById(constructId)
  if (!construct) {
    throw new Error('Construct not found.')
  }

  const steps = await listConstructSteps(constructId)
  const [exerciseRows, techniquesById] = await Promise.all([
    construct.exercise_id ? listCompetitiveExercisesByIds([construct.exercise_id]) : Promise.resolve([]),
    buildTechniqueSnapshotById(steps.map((step) => step.technique_id)),
  ])

  return {
    construct,
    steps,
    exercise: Array.isArray(exerciseRows) ? exerciseRows[0] || null : null,
    techniquesById,
  }
}

export async function getApprovedConstructDetailForTraining(constructId) {
  const detail = await getConstructDetail(constructId)
  if (!detail?.construct || detail.construct.status !== 'approved') {
    throw new Error('Construct is not approved for training.')
  }

  return detail
}

export async function listConstructExerciseSummariesByIds(exerciseIds) {
  return listCompetitiveExercisesByIds(exerciseIds)
}

export async function addConstructStep(payload) {
  const nextRow = normalizeConstructStepRow({
    ...payload,
    id: payload?.id || createLocalId('construct-step'),
    created_at: payload?.created_at || new Date().toISOString(),
  })

  if (!nextRow?.construct_id) {
    throw new Error('construct_id is required.')
  }

  return upsertConstructStepRow(nextRow)
}

export async function updateConstructStep(stepId, payload) {
  const safeStepId = String(stepId || '').trim()
  const current = readAllConstructSteps().find((row) => row.id === safeStepId) || null
  if (!current) {
    throw new Error('Construct step not found.')
  }

  return upsertConstructStepRow(normalizeConstructStepRow({
    ...current,
    ...payload,
    id: current.id,
  }))
}

export async function deleteConstructStep(stepId) {
  const safeStepId = String(stepId || '').trim()
  writeAllConstructSteps(readAllConstructSteps().filter((row) => row.id !== safeStepId))
  return true
}

export {
  CONSTRUCT_SELECT_FIELDS,
  CONSTRUCT_STEP_SELECT_FIELDS,
  EXERCISE_MIN_SELECT_FIELDS,
  TECHNIQUE_MIN_SELECT_FIELDS,
}
