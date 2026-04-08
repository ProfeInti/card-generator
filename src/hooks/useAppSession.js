import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCurrentLocalAuthUser, signOutAppAuth } from '../lib/authClient'

export function useAppSession({ onSessionCleared } = {}) {
  const [session, setSession] = useState(null)
  const [bootLoading, setBootLoading] = useState(true)
  const onSessionClearedRef = useRef(onSessionCleared)

  useEffect(() => {
    onSessionClearedRef.current = onSessionCleared
  }, [onSessionCleared])

  const hydrateLocalSession = useCallback((user) => {
    if (!user?.id) {
      setSession(null)
      return
    }

    setSession({
      userId: user.id,
      email: user.email,
      username: user.username || 'user',
      role: user.role === 'teacher' ? 'teacher' : 'student',
      provider: String(user.provider || user.source || 'local').trim() || 'local',
    })
  }, [])

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      try {
        const localUser = await fetchCurrentLocalAuthUser()
        if (!active) return
        hydrateLocalSession(localUser)
      } catch (error) {
        console.error('Session bootstrap failed:', error)
        if (active) setSession(null)
      } finally {
        if (active) {
          setBootLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [hydrateLocalSession])

  const signOutAndClearSession = useCallback(async () => {
    await signOutAppAuth()
    setSession(null)
    onSessionClearedRef.current?.()
  }, [])

  return {
    bootLoading,
    hydrateLocalSession,
    session,
    signOutAndClearSession,
  }
}
