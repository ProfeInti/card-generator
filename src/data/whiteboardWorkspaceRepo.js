import { supabase } from '../lib/supabase'

const WHITEBOARD_WORKSPACE_SELECT_FIELDS = [
  'id',
  'owner_user_id',
  'visibility',
  'source_workspace_id',
  'exercise_local_id',
  'exercise_title',
  'exercise_snapshot',
  'nodes',
  'links',
  'last_editor_user_id',
  'created_at',
  'updated_at',
].join(', ')

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeWorkspaceRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    exercise_snapshot: row.exercise_snapshot && typeof row.exercise_snapshot === 'object' ? row.exercise_snapshot : null,
    nodes: normalizeJsonArray(row.nodes),
    links: normalizeJsonArray(row.links),
  }
}

function getSingleWorkspaceRow(rows, emptyMessage) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(emptyMessage || 'No se encontro la pizarra colaborativa solicitada.')
  }
  return normalizeWorkspaceRow(rows[0])
}

export async function listWhiteboardWorkspaces(ownerUserId) {
  const { data, error } = await supabase
    .from('whiteboard_workspaces')
    .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)
    .eq('owner_user_id', ownerUserId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (Array.isArray(data) ? data : []).map(normalizeWorkspaceRow).filter(Boolean)
}

export async function listPublicWhiteboardWorkspaces() {
  const { data, error } = await supabase
    .from('whiteboard_workspaces')
    .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)
    .eq('visibility', 'public')
    .is('source_workspace_id', null)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (Array.isArray(data) ? data : []).map(normalizeWorkspaceRow).filter(Boolean)
}

export async function getWhiteboardWorkspaceById(workspaceId) {
  const { data, error } = await supabase
    .from('whiteboard_workspaces')
    .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)
    .eq('id', workspaceId)
    .maybeSingle()

  if (error) throw error
  return normalizeWorkspaceRow(data)
}

export async function getWhiteboardWorkspaceByExercise(ownerUserId, exerciseLocalId) {
  const { data, error } = await supabase
    .from('whiteboard_workspaces')
    .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)
    .eq('owner_user_id', ownerUserId)
    .eq('exercise_local_id', exerciseLocalId)
    .maybeSingle()

  if (error) throw error
  return normalizeWorkspaceRow(data)
}

export async function getRootWhiteboardWorkspaceByExercise(exerciseLocalId) {
  const { data, error } = await supabase
    .from('whiteboard_workspaces')
    .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)
    .eq('exercise_local_id', exerciseLocalId)
    .is('source_workspace_id', null)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw error
  return normalizeWorkspaceRow(Array.isArray(data) ? data[0] : null)
}

export async function ensureRootWhiteboardWorkspace({
  ownerUserId,
  exerciseLocalId,
  exerciseTitle,
  exerciseSnapshot,
  nodes,
  links,
  lastEditorUserId,
  visibility = 'public',
}) {
  const existing = await getRootWhiteboardWorkspaceByExercise(exerciseLocalId)
  if (existing) return existing

  try {
    const { data, error } = await supabase
      .from('whiteboard_workspaces')
      .insert({
        owner_user_id: ownerUserId,
        visibility,
        source_workspace_id: null,
        exercise_local_id: exerciseLocalId,
        exercise_title: exerciseTitle,
        exercise_snapshot: exerciseSnapshot,
        nodes: normalizeJsonArray(nodes),
        links: normalizeJsonArray(links),
        last_editor_user_id: lastEditorUserId || ownerUserId,
      })
      .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)

    if (error) throw error
    return getSingleWorkspaceRow(data, 'No se pudo crear la pizarra raiz del ejercicio.')
  } catch (error) {
    const fallback = await getRootWhiteboardWorkspaceByExercise(exerciseLocalId)
    if (fallback) return fallback
    throw error
  }
}

export async function ensureWhiteboardWorkspace({
  ownerUserId,
  visibility = 'public',
  sourceWorkspaceId = null,
  exerciseLocalId,
  exerciseTitle,
  exerciseSnapshot,
  nodes,
  links,
  lastEditorUserId,
}) {
  const { data, error } = await supabase
    .from('whiteboard_workspaces')
    .upsert({
      owner_user_id: ownerUserId,
      visibility,
      source_workspace_id: sourceWorkspaceId,
      exercise_local_id: exerciseLocalId,
      exercise_title: exerciseTitle,
      exercise_snapshot: exerciseSnapshot,
      nodes: normalizeJsonArray(nodes),
      links: normalizeJsonArray(links),
      last_editor_user_id: lastEditorUserId || ownerUserId,
    }, {
      onConflict: 'owner_user_id,exercise_local_id',
    })
    .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)

  if (error) throw error
  return getSingleWorkspaceRow(data, 'No se pudo crear o recuperar la pizarra colaborativa.')
}

export async function updateWhiteboardWorkspace(workspaceId, ownerUserId, payload) {
  const { data, error } = await supabase
    .from('whiteboard_workspaces')
    .update({
      visibility: payload.visibility || 'public',
      exercise_title: payload.exerciseTitle,
      exercise_snapshot: payload.exerciseSnapshot,
      nodes: normalizeJsonArray(payload.nodes),
      links: normalizeJsonArray(payload.links),
      last_editor_user_id: payload.lastEditorUserId || ownerUserId,
    })
    .eq('id', workspaceId)
    .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)

  if (error) throw error
  return getSingleWorkspaceRow(
    data,
    'No tienes permisos para editar esta pizarra colaborativa o ya no existe.'
  )
}

export async function cloneWhiteboardWorkspace({
  ownerUserId,
  sourceWorkspaceId = null,
  exerciseLocalId,
  exerciseTitle,
  exerciseSnapshot,
  nodes,
  links,
  visibility = 'private',
  lastEditorUserId,
}) {
  const { data, error } = await supabase
    .from('whiteboard_workspaces')
    .insert({
      owner_user_id: ownerUserId,
      source_workspace_id: sourceWorkspaceId,
      visibility,
      exercise_local_id: exerciseLocalId,
      exercise_title: exerciseTitle,
      exercise_snapshot: exerciseSnapshot,
      nodes: normalizeJsonArray(nodes),
      links: normalizeJsonArray(links),
      last_editor_user_id: lastEditorUserId || ownerUserId,
    })
    .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)

  if (error) throw error
  return getSingleWorkspaceRow(data, 'No se pudo clonar la pizarra colaborativa.')
}

export async function deleteWhiteboardWorkspace(workspaceId, ownerUserId) {
  const { error } = await supabase
    .from('whiteboard_workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('owner_user_id', ownerUserId)

  if (error) throw error
  return true
}

export async function deleteWhiteboardWorkspaceByExercise(ownerUserId, exerciseLocalId) {
  const { error } = await supabase
    .from('whiteboard_workspaces')
    .delete()
    .eq('owner_user_id', ownerUserId)
    .eq('exercise_local_id', exerciseLocalId)

  if (error) throw error
  return true
}
