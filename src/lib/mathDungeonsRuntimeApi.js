import { getAppAccessToken } from './authClient'

const runtimeApiBaseUrl = String(import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')

export async function requestMathDungeonRuntime(payload) {
  const accessToken = await getAppAccessToken()
  if (!accessToken) {
    throw new Error('No active local or Supabase session was found.')
  }

  const response = await fetch(`${runtimeApiBaseUrl}/math-dungeons/runtime-response`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error || 'Could not reach the Math Dungeons runtime API.')
  }

  return body
}
