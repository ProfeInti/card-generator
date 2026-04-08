import { getAppAccessToken } from '../lib/authClient'

const whiteboardWorkspaceApiBaseUrl = String(import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeWorkspaceRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    exercise_snapshot: row.exercise_snapshot && typeof row.exercise_snapshot === 'object' ? row.exercise_snapshot : null,
    notebook_state: row.notebook_state && typeof row.notebook_state === 'object' ? row.notebook_state : null,
    nodes: normalizeJsonArray(row.nodes),
    links: normalizeJsonArray(row.links),
  }
}

async function requestWhiteboardWorkspaceApi(pathname, options = {}, fallbackMessage) {
  const accessToken = await getAppAccessToken()
  if (!accessToken) {
    throw new Error('No active local or Supabase session was found.')
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  }

  const response = await fetch(`${whiteboardWorkspaceApiBaseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) {
    return {}
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error || fallbackMessage)
  }

  return body
}

export async function listWhiteboardWorkspaces(_ownerUserId) {
  const body = await requestWhiteboardWorkspaceApi(
    '/whiteboard-workspaces',
    {},
    'Could not load the synced whiteboards.'
  )

  return (Array.isArray(body?.workspaces) ? body.workspaces : []).map(normalizeWorkspaceRow).filter(Boolean)
}

export async function listPublicWhiteboardWorkspaces() {
  const body = await requestWhiteboardWorkspaceApi(
    '/whiteboard-workspaces/public',
    {},
    'Could not load the public whiteboards.'
  )

  return (Array.isArray(body?.workspaces) ? body.workspaces : []).map(normalizeWorkspaceRow).filter(Boolean)
}

export async function getWhiteboardWorkspaceById(workspaceId) {
  const body = await requestWhiteboardWorkspaceApi(
    `/whiteboard-workspaces/${encodeURIComponent(String(workspaceId || '').trim())}`,
    {},
    'Could not load the requested whiteboard.'
  )

  return normalizeWorkspaceRow(body?.workspace)
}

export async function getWhiteboardWorkspaceByExercise(_ownerUserId, exerciseLocalId) {
  const body = await requestWhiteboardWorkspaceApi(
    `/whiteboard-workspaces/by-exercise/${encodeURIComponent(String(exerciseLocalId || '').trim())}`,
    {},
    'Could not load the requested whiteboard.'
  )

  return normalizeWorkspaceRow(body?.workspace)
}

export async function getRootWhiteboardWorkspaceByExercise(exerciseLocalId) {
  const body = await requestWhiteboardWorkspaceApi(
    `/whiteboard-workspaces/root/${encodeURIComponent(String(exerciseLocalId || '').trim())}`,
    {},
    'Could not load the root whiteboard.'
  )

  return normalizeWorkspaceRow(body?.workspace)
}

export async function ensureRootWhiteboardWorkspace({
  ownerUserId,
  exerciseLocalId,
  exerciseTitle,
  exerciseSnapshot,
  notebookState = null,
  nodes,
  links,
  lastEditorUserId,
  visibility = 'public',
}) {
  const body = await requestWhiteboardWorkspaceApi(
    '/whiteboard-workspaces/ensure-root',
    {
      method: 'POST',
      body: {
        ownerUserId,
        exerciseLocalId,
        exerciseTitle,
        exerciseSnapshot,
        notebookState,
        nodes: normalizeJsonArray(nodes),
        links: normalizeJsonArray(links),
        lastEditorUserId,
        visibility,
      },
    },
    'Could not create or recover the root whiteboard.'
  )

  return normalizeWorkspaceRow(body?.workspace)
}

export async function ensureWhiteboardWorkspace({
  ownerUserId,
  visibility = 'public',
  sourceWorkspaceId = null,
  exerciseLocalId,
  exerciseTitle,
  exerciseSnapshot,
  notebookState = null,
  nodes,
  links,
  lastEditorUserId,
}) {
  const body = await requestWhiteboardWorkspaceApi(
    '/whiteboard-workspaces/ensure',
    {
      method: 'POST',
      body: {
        ownerUserId,
        visibility,
        sourceWorkspaceId,
        exerciseLocalId,
        exerciseTitle,
        exerciseSnapshot,
        notebookState,
        nodes: normalizeJsonArray(nodes),
        links: normalizeJsonArray(links),
        lastEditorUserId,
      },
    },
    'Could not create or recover the whiteboard.'
  )

  return normalizeWorkspaceRow(body?.workspace)
}

export async function updateWhiteboardWorkspace(workspaceId, ownerUserId, payload) {
  const body = await requestWhiteboardWorkspaceApi(
    `/whiteboard-workspaces/${encodeURIComponent(String(workspaceId || '').trim())}`,
    {
      method: 'PATCH',
      body: {
        ownerUserId,
        clientId: payload.clientId,
        visibility: payload.visibility || 'public',
        exerciseTitle: payload.exerciseTitle,
        exerciseSnapshot: payload.exerciseSnapshot,
        notebookState: payload.notebookState,
        nodes: normalizeJsonArray(payload.nodes),
        links: normalizeJsonArray(payload.links),
        lastEditorUserId: payload.lastEditorUserId || ownerUserId,
      },
    },
    'Could not update the whiteboard workspace.'
  )

  return normalizeWorkspaceRow(body?.workspace)
}

export async function cloneWhiteboardWorkspace({
  ownerUserId,
  sourceWorkspaceId = null,
  exerciseLocalId,
  exerciseTitle,
  exerciseSnapshot,
  notebookState = null,
  nodes,
  links,
  visibility = 'private',
  lastEditorUserId,
}) {
  const body = await requestWhiteboardWorkspaceApi(
    '/whiteboard-workspaces/clone',
    {
      method: 'POST',
      body: {
        ownerUserId,
        sourceWorkspaceId,
        exerciseLocalId,
        exerciseTitle,
        exerciseSnapshot,
        notebookState,
        nodes: normalizeJsonArray(nodes),
        links: normalizeJsonArray(links),
        visibility,
        lastEditorUserId,
      },
    },
    'Could not clone the whiteboard.'
  )

  return normalizeWorkspaceRow(body?.workspace)
}

export async function deleteWhiteboardWorkspace(workspaceId, _ownerUserId) {
  await requestWhiteboardWorkspaceApi(
    `/whiteboard-workspaces/${encodeURIComponent(String(workspaceId || '').trim())}`,
    { method: 'DELETE' },
    'Could not delete the whiteboard.'
  )

  return true
}

export async function deleteWhiteboardWorkspaceByExercise(_ownerUserId, exerciseLocalId) {
  await requestWhiteboardWorkspaceApi(
    `/whiteboard-workspaces/by-exercise/${encodeURIComponent(String(exerciseLocalId || '').trim())}`,
    { method: 'DELETE' },
    'Could not delete the whiteboard exercise.'
  )

  return true
}
