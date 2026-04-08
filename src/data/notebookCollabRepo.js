import { getAppAccessToken } from '../lib/authClient'

const NOTEBOOK_COLLAB_API_BASE_URL = String(import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')

function buildNotebookCollabApiUrl(pathname, query = null) {
  const url = new URL(`${NOTEBOOK_COLLAB_API_BASE_URL}${pathname}`, window.location.origin)
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return
      url.searchParams.set(key, String(value))
    })
  }
  return url.toString()
}

function normalizeNotebookCollabPage(row) {
  if (!row || typeof row !== 'object') return null

  return {
    ...row,
    exercise_snapshot: row.exercise_snapshot && typeof row.exercise_snapshot === 'object' ? row.exercise_snapshot : {},
    notebook_state: row.notebook_state && typeof row.notebook_state === 'object' ? row.notebook_state : {},
    share_code: String(row.share_code || '').trim().toUpperCase(),
  }
}

async function requestNotebookCollabApi(pathname, options = {}, fallbackMessage = 'No se pudo completar la operacion de colaboracion.') {
  const accessToken = await getAppAccessToken()
  if (!accessToken) {
    throw new Error('No active local or Supabase session was found.')
  }

  const response = await fetch(buildNotebookCollabApiUrl(pathname), {
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

export async function listAccessibleNotebookCollabPages(ownerUserId = '') {
  const body = await requestNotebookCollabApi(
    '/notebook-collab/pages',
    { method: 'POST', body: { ownerUserId: String(ownerUserId || '').trim() } },
    'No se pudieron listar las hojas colaborativas.',
  )

  return (Array.isArray(body?.pages) ? body.pages : []).map(normalizeNotebookCollabPage).filter(Boolean)
}

export async function getNotebookCollabPageById(pageId) {
  const body = await requestNotebookCollabApi(
    `/notebook-collab/pages/${encodeURIComponent(String(pageId || '').trim())}`,
    { method: 'GET' },
    'No se pudo cargar la hoja colaborativa.',
  )
  return normalizeNotebookCollabPage(body?.page)
}

export async function createNotebookCollabPage({
  ownerUserId,
  title,
  exerciseSnapshot,
  notebookState,
  visibility = 'code',
  lastEditorUserId,
}) {
  const body = await requestNotebookCollabApi(
    '/notebook-collab/pages',
    {
      method: 'PUT',
      body: {
        ownerUserId,
        title,
        exerciseSnapshot,
        notebookState,
        visibility,
        lastEditorUserId,
      },
    },
    'No se pudo crear la hoja colaborativa.',
  )

  return normalizeNotebookCollabPage(body?.page)
}

export async function updateNotebookCollabPage(pageId, userId, payload) {
  const body = await requestNotebookCollabApi(
    `/notebook-collab/pages/${encodeURIComponent(String(pageId || '').trim())}`,
    {
      method: 'PATCH',
      body: {
        userId,
        ...payload,
      },
    },
    'No se pudo actualizar la hoja colaborativa.',
  )

  return normalizeNotebookCollabPage(body?.page)
}

export async function joinNotebookCollabPageByCode(code, identity = {}) {
  const normalizedCode = String(code || '').trim().toUpperCase()
  if (!normalizedCode) {
    throw new Error('Introduce un codigo de hoja valido.')
  }

  const body = await requestNotebookCollabApi(
    '/notebook-collab/join',
    {
      method: 'POST',
      body: {
        inputCode: normalizedCode,
        userId: String(identity.userId || '').trim(),
        username: String(identity.username || '').trim(),
      },
    },
    'No se pudo unir la hoja colaborativa.',
  )

  return normalizeNotebookCollabPage(body?.page)
}

export async function subscribeToNotebookCollabPage(
  pageId,
  {
    clientId,
    presence,
    onSnapshot,
    onPresence,
    onNotebookSync,
    onError,
  } = {},
) {
  const safePageId = String(pageId || '').trim()
  const safeClientId = String(clientId || '').trim()
  if (!safePageId || !safeClientId) {
    throw new Error('No se encontro una sesion colaborativa valida para la hoja.')
  }

  const accessToken = await getAppAccessToken()
  if (!accessToken) {
    throw new Error('No active local or Supabase session was found.')
  }

  const source = new EventSource(buildNotebookCollabApiUrl(
    `/notebook-collab/pages/${encodeURIComponent(safePageId)}/events`,
    {
      accessToken,
      clientId: safeClientId,
      userId: String(presence?.userId || '').trim(),
      username: String(presence?.username || '').trim(),
      color: String(presence?.color || '').trim(),
      activity: String(presence?.activity || '').trim(),
      editingType: String(presence?.editingType || '').trim(),
      targetId: String(presence?.targetId || '').trim(),
    },
  ))

  source.addEventListener('snapshot', (event) => {
    try {
      const payload = JSON.parse(String(event?.data || '{}'))
      const page = normalizeNotebookCollabPage(payload?.page)
      if (page && typeof onSnapshot === 'function') {
        onSnapshot(page, payload)
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
      await requestNotebookCollabApi(
        `/notebook-collab/pages/${encodeURIComponent(safePageId)}/presence`,
        {
          method: 'POST',
          body: {
            clientId: safeClientId,
            ...nextPresence,
          },
        },
        'No se pudo actualizar la presencia colaborativa.',
      )
    },
    async send(payload) {
      await requestNotebookCollabApi(
        `/notebook-collab/pages/${encodeURIComponent(safePageId)}/broadcast`,
        {
          method: 'POST',
          body: {
            clientId: safeClientId,
            ...payload,
          },
        },
        'No se pudo emitir la actualizacion colaborativa.',
      )
    },
    close() {
      source.close()
    },
  }
}
