import { getAppAccessToken } from '../lib/authClient'

const WHITEBOARD_WORKSPACE_API_BASE_URL = String(import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')

function buildWhiteboardWorkspaceApiUrl(pathname, query = null) {
  const url = new URL(`${WHITEBOARD_WORKSPACE_API_BASE_URL}${pathname}`, window.location.origin)
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return
      url.searchParams.set(key, String(value))
    })
  }
  return url.toString()
}

function normalizeWorkspaceRow(row) {
  if (!row || typeof row !== 'object') return null

  return {
    ...row,
    exercise_snapshot: row.exercise_snapshot && typeof row.exercise_snapshot === 'object' ? row.exercise_snapshot : null,
    notebook_state: row.notebook_state && typeof row.notebook_state === 'object' ? row.notebook_state : null,
    nodes: Array.isArray(row.nodes) ? row.nodes : [],
    links: Array.isArray(row.links) ? row.links : [],
  }
}

async function requestWhiteboardWorkspaceRealtimeApi(pathname, options = {}, fallbackMessage) {
  const accessToken = await getAppAccessToken()
  if (!accessToken) {
    throw new Error('No active local or Supabase session was found.')
  }

  const response = await fetch(buildWhiteboardWorkspaceApiUrl(pathname), {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error || fallbackMessage)
  }

  return body
}

export async function subscribeToWhiteboardWorkspace(
  workspaceId,
  {
    clientId,
    presence,
    onSnapshot,
    onPresence,
    onBoardSync,
    onNotebookSync,
    onError,
  } = {}
) {
  const safeWorkspaceId = String(workspaceId || '').trim()
  const safeClientId = String(clientId || '').trim()

  if (!safeWorkspaceId || !safeClientId) {
    throw new Error('No se encontro una sesion colaborativa valida para la pizarra.')
  }

  const accessToken = await getAppAccessToken()
  if (!accessToken) {
    throw new Error('No active local or Supabase session was found.')
  }

  const source = new EventSource(buildWhiteboardWorkspaceApiUrl(
    `/whiteboard-workspaces/${encodeURIComponent(safeWorkspaceId)}/events`,
    {
      accessToken,
      clientId: safeClientId,
      userId: String(presence?.userId || '').trim(),
      username: String(presence?.username || '').trim(),
      color: String(presence?.color || '').trim(),
      activity: String(presence?.activity || '').trim(),
      editingType: String(presence?.editingType || '').trim(),
      targetId: String(presence?.targetId || '').trim(),
    }
  ))

  source.addEventListener('snapshot', (event) => {
    try {
      const payload = JSON.parse(String(event?.data || '{}'))
      const workspace = normalizeWorkspaceRow(payload?.workspace)
      if (workspace && typeof onSnapshot === 'function') {
        onSnapshot(workspace, payload)
      }
    } catch (error) {
      onError?.(error)
    }
  })

  source.addEventListener('presence', (event) => {
    try {
      const payload = JSON.parse(String(event?.data || '{}'))
      const collaborators = Array.isArray(payload?.collaborators) ? payload.collaborators : []
      onPresence?.(collaborators)
    } catch (error) {
      onError?.(error)
    }
  })

  source.addEventListener('board-sync', (event) => {
    try {
      const payload = JSON.parse(String(event?.data || '{}'))
      onBoardSync?.(payload)
    } catch (error) {
      onError?.(error)
    }
  })

  source.addEventListener('notebook-sync', (event) => {
    try {
      const payload = JSON.parse(String(event?.data || '{}'))
      onNotebookSync?.(payload)
    } catch (error) {
      onError?.(error)
    }
  })

  source.onerror = (error) => {
    onError?.(error)
  }

  return {
    async track(nextPresence) {
      await requestWhiteboardWorkspaceRealtimeApi(
        `/whiteboard-workspaces/${encodeURIComponent(safeWorkspaceId)}/presence`,
        {
          method: 'POST',
          body: {
            clientId: safeClientId,
            ...nextPresence,
          },
        },
        'Could not update the collaborative presence.'
      )
    },
    async sendBoardSync(payload) {
      await requestWhiteboardWorkspaceRealtimeApi(
        `/whiteboard-workspaces/${encodeURIComponent(safeWorkspaceId)}/broadcast`,
        {
          method: 'POST',
          body: {
            clientId: safeClientId,
            event: 'board-sync',
            ...payload,
          },
        },
        'Could not broadcast the whiteboard changes.'
      )
    },
    async sendNotebookSync(payload) {
      await requestWhiteboardWorkspaceRealtimeApi(
        `/whiteboard-workspaces/${encodeURIComponent(safeWorkspaceId)}/broadcast`,
        {
          method: 'POST',
          body: {
            clientId: safeClientId,
            event: 'notebook-sync',
            ...payload,
          },
        },
        'Could not broadcast the notebook changes.'
      )
    },
    close() {
      source.close()
    },
  }
}
