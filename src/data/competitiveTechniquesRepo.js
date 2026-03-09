import { supabase } from '../lib/supabase'

const TECHNIQUE_SELECT_FIELDS =
  'id, created_by, reviewed_by, approved_at, status, name, topic, subtopic, effect_type, effect_description, worked_example, created_at, updated_at'

export async function listOwnCompetitiveTechniques(userId) {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .select(TECHNIQUE_SELECT_FIELDS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listVisibleCompetitiveTechniques(userId) {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .select(TECHNIQUE_SELECT_FIELDS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function listApprovedCompetitiveTechniques(userId) {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .select(TECHNIQUE_SELECT_FIELDS)
    .eq('created_by', userId)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function updateOwnCompetitiveTechnique(techniqueId, userId, payload) {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .update(payload)
    .eq('id', techniqueId)
    .eq('created_by', userId)
    .select(TECHNIQUE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function createCompetitiveTechnique(payload) {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .insert(payload)
    .select(TECHNIQUE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export async function listProposedCompetitiveTechniques() {
  const { data, error } = await supabase
    .from('competitive_techniques')
    .select(TECHNIQUE_SELECT_FIELDS)
    .eq('status', 'proposed')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function reviewProposedCompetitiveTechnique(techniqueId, teacherUserId, decision) {
  const nextStatus = decision === 'approve' ? 'approved' : 'rejected'
  const payload = {
    status: nextStatus,
    reviewed_by: teacherUserId,
    approved_at: decision === 'approve' ? new Date().toISOString() : null,
  }

  const { data, error } = await supabase
    .from('competitive_techniques')
    .update(payload)
    .eq('id', techniqueId)
    .eq('status', 'proposed')
    .select(TECHNIQUE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return data
}

export { TECHNIQUE_SELECT_FIELDS }
