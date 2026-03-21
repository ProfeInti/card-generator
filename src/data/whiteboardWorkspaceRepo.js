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
    .single()

  if (error) throw error
  return normalizeWorkspaceRow(data)
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
    .eq('owner_user_id', ownerUserId)
    .select(WHITEBOARD_WORKSPACE_SELECT_FIELDS)
    .single()

  if (error) throw error
  return normalizeWorkspaceRow(data)
}

export async function cloneWhiteboardWorkspace({
  ownerUserId,
  sourceWorkspaceId = null,
  exerciseLocalId,
  exerciseTitle,
  exerciseSnapshot,
  nodes,
  links,
  visibility = 'public',
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
    .single()

  if (error) throw error
  return normalizeWorkspaceRow(data)
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
