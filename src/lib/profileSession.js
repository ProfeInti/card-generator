import { supabase } from './supabase'

export function emailToUsername(email) {
  if (!email || typeof email !== 'string') return 'User'
  return email.split('@')[0] || 'User'
}

export async function ensureProfile(user) {
  const fallbackUsername = emailToUsername(user?.email)
  console.log('[profile] load start', { userId: user?.id ?? null })

  const { error: upsertError } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      username: fallbackUsername,
    },
    { onConflict: 'id' }
  )

  if (upsertError) {
    console.error('[profile] upsert error', upsertError)
    throw upsertError
  }

  let data = null
  let error = null

  const roleQuery = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', user.id)
    .maybeSingle()

  data = roleQuery.data
  error = roleQuery.error

  if (error && String(error.message || '').toLowerCase().includes('role')) {
    const legacyQuery = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()

    data = legacyQuery.data
    error = legacyQuery.error
  }

  if (error) {
    console.error('[profile] select error', error)
    throw error
  }

  const resolvedProfile = {
    username: data?.username || fallbackUsername,
    role: data?.role === 'teacher' ? 'teacher' : 'student',
  }

  console.log('[profile] load done', { userId: user?.id ?? null, resolvedProfile })
  return resolvedProfile
}
