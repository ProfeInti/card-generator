import { getAppAccessToken } from '../lib/authClient'

const profilesApiBaseUrl = String(import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')

async function requestProfilesApi(pathname, options = {}, fallbackMessage = 'Request failed.') {
  const accessToken = await getAppAccessToken()
  if (!accessToken) {
    throw new Error('No active local or Supabase session was found.')
  }

  const response = await fetch(`${profilesApiBaseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error || fallbackMessage)
  }

  return body
}

export async function listProfileUsernamesByIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))]
  if (!ids.length) return {}

  const search = new URLSearchParams()
  search.set('ids', ids.join(','))

  const body = await requestProfilesApi(
    `/profiles/usernames?${search.toString()}`,
    {},
    'Could not load usernames.',
  )

  const rows = Array.isArray(body?.profiles) ? body.profiles : []
  return rows.reduce((acc, row) => {
    const id = String(row?.id || '').trim()
    if (!id) return acc
    acc[id] = String(row?.username || '').trim() || id
    return acc
  }, {})
}
