import { getAppAccessToken } from './authClient'

const notebookApiBaseUrl = String(import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')

async function requestNotebookApi(pathname, payload, fallbackMessage) {
  const accessToken = await getAppAccessToken()
  if (!accessToken) {
    throw new Error('No active local or Supabase session was found.')
  }

  const response = await fetch(`${notebookApiBaseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error || fallbackMessage)
  }

  return body
}

export async function requestWhiteboardNotebookAssistant(payload) {
  return requestNotebookApi('/whiteboard-notebook/block-assistant', payload, 'Could not reach the notebook assistant API.')
}

export async function applyWhiteboardNotebookTechnique(payload) {
  return requestNotebookApi('/whiteboard-notebook/apply-technique', payload, 'Could not apply the notebook technique.')
}

export async function describeWhiteboardNotebookTechnique(payload) {
  return requestNotebookApi('/whiteboard-notebook/describe-technique', payload, 'Could not describe the notebook technique.')
}
