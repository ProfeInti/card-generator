import { isSupabaseConfigured, supabase } from './supabase'

const authApiBaseUrl = String(import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')
const LOCAL_AUTH_TOKEN_KEY = 'inticore.localAuthToken'

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function getLocalAuthToken() {
  if (!canUseStorage()) return ''
  return String(window.localStorage.getItem(LOCAL_AUTH_TOKEN_KEY) || '').trim()
}

function setLocalAuthToken(token) {
  if (!canUseStorage()) return
  window.localStorage.setItem(LOCAL_AUTH_TOKEN_KEY, String(token || '').trim())
}

export function clearLocalAuthToken() {
  if (!canUseStorage()) return
  window.localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY)
}

async function requestAuthJson(pathname, options = {}, fallbackMessage = 'Request failed.') {
  const response = await fetch(`${authApiBaseUrl}${pathname}`, options)
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(body?.error || fallbackMessage)
  }

  return body
}

function normalizeSupabaseRole(user) {
  const metadataRole = String(
    user?.app_metadata?.role
    || user?.user_metadata?.role
    || ''
  ).trim().toLowerCase()

  return metadataRole === 'teacher' ? 'teacher' : 'student'
}

function normalizeSupabaseUsername(user) {
  const explicitUsername = String(
    user?.user_metadata?.username
    || user?.user_metadata?.name
    || ''
  ).trim()

  if (explicitUsername) return explicitUsername

  const email = String(user?.email || '').trim().toLowerCase()
  if (!email.includes('@')) return 'user'
  return email.split('@')[0] || 'user'
}

function normalizeSupabaseUser(user) {
  if (!user?.id) return null

  return {
    id: String(user.id || '').trim(),
    email: String(user.email || '').trim().toLowerCase(),
    username: normalizeSupabaseUsername(user),
    role: normalizeSupabaseRole(user),
    provider: 'supabase',
    source: 'supabase',
  }
}

async function getSupabaseSessionAccessToken() {
  if (!isSupabaseConfigured || !supabase) return ''

  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw new Error(error.message || 'Could not restore the Supabase session.')
  }

  return String(data?.session?.access_token || '').trim()
}

export async function registerWithLocalAuth({ email, password, username }) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    })

    if (error) {
      throw new Error(error.message || 'Could not create the account.')
    }

    const accessToken = String(data?.session?.access_token || '').trim()
    const user = normalizeSupabaseUser(data?.user || data?.session?.user)

    if (!accessToken || !user) {
      throw new Error('Cuenta creada en Supabase. Confirma el correo antes de iniciar sesion.')
    }

    clearLocalAuthToken()
    return {
      token: accessToken,
      user,
    }
  }

  const body = await requestAuthJson(
    '/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username }),
    },
    'Could not create the account.',
  )

  if (body?.token) {
    setLocalAuthToken(body.token)
  }

  return {
    token: String(body?.token || '').trim(),
    user: body?.user || null,
  }
}

export async function loginWithLocalAuth({ email, password }) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw new Error(error.message || 'Could not sign in.')
    }

    const accessToken = String(data?.session?.access_token || '').trim()
    const user = normalizeSupabaseUser(data?.user || data?.session?.user)

    if (!accessToken || !user) {
      throw new Error('Could not sign in.')
    }

    clearLocalAuthToken()
    return {
      token: accessToken,
      user,
    }
  }

  const body = await requestAuthJson(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    'Could not sign in.',
  )

  if (body?.token) {
    setLocalAuthToken(body.token)
  }

  return {
    token: String(body?.token || '').trim(),
    user: body?.user || null,
  }
}

export async function fetchCurrentLocalAuthUser() {
  if (isSupabaseConfigured && supabase) {
    try {
      const accessToken = await getSupabaseSessionAccessToken()
      if (!accessToken) return null

      const { data, error } = await supabase.auth.getUser(accessToken)
      if (error) {
        throw error
      }

      return normalizeSupabaseUser(data?.user)
    } catch (error) {
      console.warn('[auth] supabase session restore failed', error)
      return null
    }
  }

  const token = getLocalAuthToken()
  if (!token) return null

  try {
    const body = await requestAuthJson(
      '/auth/me',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      'Could not restore the current session.',
    )

    return body?.user || null
  } catch (error) {
    console.warn('[auth] local session restore failed', error)
    clearLocalAuthToken()
    return null
  }
}

export async function getAppAccessToken() {
  if (isSupabaseConfigured && supabase) {
    try {
      return await getSupabaseSessionAccessToken()
    } catch (error) {
      console.warn('[auth] supabase access token lookup failed', error)
    }
  }

  const localToken = getLocalAuthToken()
  if (localToken) return localToken
  return ''
}

export async function signOutAppAuth() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw error
      }
    } catch (error) {
      console.warn('[auth] supabase logout request failed', error)
    }
  }

  const localToken = getLocalAuthToken()

  if (localToken) {
    try {
      await requestAuthJson(
        '/auth/logout',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localToken}`,
          },
        },
        'Could not sign out.',
      )
    } catch (error) {
      console.warn('[auth] local logout request failed', error)
    }
  }

  clearLocalAuthToken()
}

export async function syncLegacySupabaseLogin({ email, password }) {
  if (!isSupabaseConfigured || !supabase) {
    void email
    void password
    return false
  }

  await loginWithLocalAuth({ email, password })
  return true
}

export async function syncLegacySupabaseRegister({ email, password, username }) {
  if (!isSupabaseConfigured || !supabase) {
    void email
    void password
    void username
    return false
  }

  await registerWithLocalAuth({ email, password, username })
  return true
}
