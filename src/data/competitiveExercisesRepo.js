import { supabase } from '../lib/supabase'

const EXERCISE_SELECT_FIELDS =
  'id, created_by, reviewed_by, approved_at, status, source_title, source_type, source_author, source_year, source_location, page_number, exercise_number, statement, final_answer, topic, subtopic, difficulty, created_at, updated_at'

export async function listOwnCompetitiveExercises(userId) {
  const { data, error } = await supabase
    .from('competitive_exercises')
    .select(EXERCISE_SELECT_FIELDS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listVisibleCompetitiveExercises(userId) {
  const { data, error } = await supabase
    .from('competitive_exercises')
    .select(EXERCISE_SELECT_FIELDS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listApprovedCompetitiveExercises(userId) {
  const { data, error } = await supabase
    .from('competitive_exercises')
    .select(EXERCISE_SELECT_FIELDS)
    .eq('created_by', userId)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function updateOwnCompetitiveExercise(exerciseId, userId, payload) {
  const { data, error } = await supabase
    .from('competitive_exercises')
    .update(payload)
    .eq('id', exerciseId)
    .eq('created_by', userId)
    .select(EXERCISE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function createCompetitiveExercise(payload) {
  const { data, error } = await supabase
    .from('competitive_exercises')
    .insert(payload)
    .select(EXERCISE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function listProposedCompetitiveExercises() {
  const { data, error } = await supabase
    .from('competitive_exercises')
    .select(EXERCISE_SELECT_FIELDS)
    .eq('status', 'proposed')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function reviewProposedCompetitiveExercise(exerciseId, teacherUserId, decision) {
  const nextStatus = decision === 'approve' ? 'approved' : 'rejected'
  const payload = {
    status: nextStatus,
    reviewed_by: teacherUserId,
    approved_at: decision === 'approve' ? new Date().toISOString() : null,
  }

  const { data, error } = await supabase
    .from('competitive_exercises')
    .update(payload)
    .eq('id', exerciseId)
    .eq('status', 'proposed')
    .select(EXERCISE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export { EXERCISE_SELECT_FIELDS }
