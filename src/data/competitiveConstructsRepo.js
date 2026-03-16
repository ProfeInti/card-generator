import { supabase } from '../lib/supabase'

const CONSTRUCT_SELECT_FIELDS =
  'id, created_by, exercise_id, title, description, attack, armor, ingenuity_cost, effects, status, created_at, updated_at, reviewed_by, approved_at'

const CONSTRUCT_STEP_SELECT_FIELDS =
  'id, construct_id, solution_path, step_order, technique_id, progress_state, explanation, created_at'

const EXERCISE_MIN_SELECT_FIELDS =
  'id, source_title, source_work_title, source_author, source_location, page_number, exercise_number, statement, topic, subtopic, difficulty, status'
const TECHNIQUE_MIN_SELECT_FIELDS =
  'id, name, topic, subtopic, effect_type, effect_description, status'

export async function createConstruct(payload) {
  const { data, error } = await supabase
    .from('competitive_constructs')
    .insert(payload)
    .select(CONSTRUCT_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function updateConstruct(constructId, userId, payload) {
  const { data, error } = await supabase
    .from('competitive_constructs')
    .update(payload)
    .eq('id', constructId)
    .eq('created_by', userId)
    .select(CONSTRUCT_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function listOwnConstructs(userId) {
  const { data, error } = await supabase
    .from('competitive_constructs')
    .select(CONSTRUCT_SELECT_FIELDS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listVisibleConstructs(userId) {
  const { data, error } = await supabase
    .from('competitive_constructs')
    .select(CONSTRUCT_SELECT_FIELDS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listApprovedConstructs(userId) {
  const { data, error } = await supabase
    .from('competitive_constructs')
    .select(CONSTRUCT_SELECT_FIELDS)
    .eq('created_by', userId)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listProposedConstructsForReview() {
  const { data, error } = await supabase
    .from('competitive_constructs')
    .select(CONSTRUCT_SELECT_FIELDS)
    .eq('status', 'proposed')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function approveConstruct(constructId, teacherUserId) {
  const payload = {
    status: 'approved',
    reviewed_by: teacherUserId,
    approved_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('competitive_constructs')
    .update(payload)
    .eq('id', constructId)
    .eq('status', 'proposed')
    .select(CONSTRUCT_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function rejectConstruct(constructId, teacherUserId) {
  const payload = {
    status: 'rejected',
    reviewed_by: teacherUserId,
    approved_at: null,
  }

  const { data, error } = await supabase
    .from('competitive_constructs')
    .update(payload)
    .eq('id', constructId)
    .eq('status', 'proposed')
    .select(CONSTRUCT_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function deleteOwnConstruct(constructId, userId) {
  const { error } = await supabase
    .from('competitive_constructs')
    .delete()
    .eq('id', constructId)
    .eq('created_by', userId)

  if (error) throw error
  return true
}
export async function listConstructSteps(constructId) {
  const { data, error } = await supabase
    .from('competitive_construct_steps')
    .select(CONSTRUCT_STEP_SELECT_FIELDS)
    .eq('construct_id', constructId)
    .order('solution_path', { ascending: true })
    .order('step_order', { ascending: true })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function getConstructDetail(constructId) {
  const { data: construct, error: constructError } = await supabase
    .from('competitive_constructs')
    .select(CONSTRUCT_SELECT_FIELDS)
    .eq('id', constructId)
    .single()

  if (constructError) throw constructError

  const steps = await listConstructSteps(constructId)

  let exercise = null
  if (construct?.exercise_id) {
    const { data: exerciseData, error: exerciseError } = await supabase
      .from('competitive_exercises')
      .select(EXERCISE_MIN_SELECT_FIELDS)
      .eq('id', construct.exercise_id)
      .maybeSingle()

    if (exerciseError) throw exerciseError
    exercise = exerciseData || null
  }

  const techniqueIds = [...new Set(steps.map((step) => step.technique_id).filter(Boolean))]
  let techniquesById = {}

  if (techniqueIds.length > 0) {
    const { data: techniques, error: techniquesError } = await supabase
      .from('competitive_techniques')
      .select(TECHNIQUE_MIN_SELECT_FIELDS)
      .in('id', techniqueIds)

    if (techniquesError) throw techniquesError

    techniquesById = (Array.isArray(techniques) ? techniques : []).reduce((acc, row) => {
      acc[row.id] = row
      return acc
    }, {})

    const missingTechniqueIds = techniqueIds.filter((id) => !techniquesById[id])
    if (missingTechniqueIds.length > 0) {
      const { data: catalogTechniques, error: catalogTechniquesError } = await supabase
        .from('competitive_technique_catalog')
        .select('id, legacy_technique_id, name, topic, subtopic, effect_type, effect_description, status')
        .in('legacy_technique_id', missingTechniqueIds)

      if (catalogTechniquesError) throw catalogTechniquesError

      ;(Array.isArray(catalogTechniques) ? catalogTechniques : []).forEach((row) => {
        if (!row.legacy_technique_id) return
        techniquesById[row.legacy_technique_id] = {
          id: row.legacy_technique_id,
          name: row.name,
          topic: row.topic,
          subtopic: row.subtopic,
          effect_type: row.effect_type,
          effect_description: row.effect_description,
          status: row.status,
        }
      })
    }
  }

  return {
    construct,
    steps,
    exercise,
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
  const ids = [...new Set((exerciseIds || []).filter(Boolean))]
  if (!ids.length) return []

  const { data, error } = await supabase
    .from('competitive_exercises')
    .select(EXERCISE_MIN_SELECT_FIELDS)
    .in('id', ids)

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function addConstructStep(payload) {
  const { data, error } = await supabase
    .from('competitive_construct_steps')
    .insert(payload)
    .select(CONSTRUCT_STEP_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function updateConstructStep(stepId, payload) {
  const { data, error } = await supabase
    .from('competitive_construct_steps')
    .update(payload)
    .eq('id', stepId)
    .select(CONSTRUCT_STEP_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function deleteConstructStep(stepId) {
  const { error } = await supabase
    .from('competitive_construct_steps')
    .delete()
    .eq('id', stepId)

  if (error) throw error
  return true
}

export {
  CONSTRUCT_SELECT_FIELDS,
  CONSTRUCT_STEP_SELECT_FIELDS,
  EXERCISE_MIN_SELECT_FIELDS,
  TECHNIQUE_MIN_SELECT_FIELDS,
}

