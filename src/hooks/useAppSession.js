import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureProfile, emailToUsername } from '../lib/profileSession'
import { supabase } from '../lib/supabase'

export function useAppSession({ onSessionCleared } = {}) {
  const [session, setSession] = useState(null)
  const [bootLoading, setBootLoading] = useState(true)
  const bootstrapRunIdRef = useRef(0)
  const onSessionClearedRef = useRef(onSessionCleared)

  useEffect(() => {
    onSessionClearedRef.current = onSessionCleared
  }, [onSessionCleared])

  const setSessionFromUser = useCallback((user, profileInput) => {
    const fallbackUsername = emailToUsername(user?.email)
    const normalizedUsername =
      typeof profileInput === 'string'
        ? profileInput
        : typeof profileInput?.username === 'string' && profileInput.username
          ? profileInput.username
          : fallbackUsername

    const normalizedRole =
      typeof profileInput === 'object' && profileInput?.role === 'teacher' ? 'teacher' : 'student'

    const next = {
      userId: user.id,
      email: user.email,
      username: normalizedUsername,
      role: normalizedRole,
    }

    console.log('[session] set session', {
      userId: next.userId,
      username: next.username,
      role: next.role,
    })
    setSession(next)
  }, [])

  const hydrateSessionFromUser = useCallback(async (
    user,
    { blockOnProfile = true, source = 'unknown' } = {}
  ) => {
    if (!user) {
      console.log('[session] clear session', { source })
      setSession(null)
      return
    }

    const fallbackUsername = emailToUsername(user.email)
    setSessionFromUser(user, fallbackUsername)

    if (!blockOnProfile) {
      console.log('[profile] load scheduled (non-blocking)', { source, userId: user.id })
      ensureProfile(user)
        .then((resolvedUsername) => {
          setSessionFromUser(user, resolvedUsername)
        })
        .catch((error) => {
          console.error('[profile] non-blocking load failed', error)
        })
      return
    }

    try {
      console.log('[profile] load awaited (blocking)', { source, userId: user.id })
      const resolvedUsername = await ensureProfile(user)
      setSessionFromUser(user, resolvedUsername)
    } catch (error) {
      console.error('[profile] blocking load failed', error)
    }
  }, [setSessionFromUser])

  useEffect(() => {
    let active = true
    const runId = ++bootstrapRunIdRef.current
    console.log('[bootstrap] effect mount', { runId })

    const bootstrap = async () => {
      try {
        console.log('[bootstrap] VITE_SUPABASE_URL present:', Boolean(import.meta.env.VITE_SUPABASE_URL))
        console.log('[bootstrap] VITE_SUPABASE_ANON_KEY present:', Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY))
        console.log('[bootstrap] before getSession', { runId })

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        console.log('[bootstrap] after getSession', {
          runId,
          hasError: Boolean(sessionError),
          hasSession: Boolean(sessionData?.session),
          hasUser: Boolean(sessionData?.session?.user),
          userId: sessionData?.session?.user?.id ?? null,
        })

        if (sessionError) throw sessionError
        if (!active) return

        const sessionUser = sessionData?.session?.user ?? null
        if (sessionUser) {
          await hydrateSessionFromUser(sessionUser, { blockOnProfile: false, source: 'bootstrap' })
        } else {
          console.log('[bootstrap] no session user, clearing session')
          setSession(null)
        }
      } catch (error) {
        console.error('Session bootstrap failed:', error)
        if (active) setSession(null)
      } finally {
        if (active) {
          console.log('[bootstrap] setBootLoading(false)', { runId })
          setBootLoading(false)
        }
      }
    }

    bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      console.log('[bootstrap] auth state change:', {
        runId,
        event,
        hasSession: Boolean(nextSession),
        userId: nextSession?.user?.id ?? null,
      })

      try {
        if (!active) return

        if (nextSession?.user) {
          await hydrateSessionFromUser(nextSession.user, {
            blockOnProfile: false,
            source: 'auth_state:' + event,
          })
        } else {
          console.log('[bootstrap] auth state cleared session', { runId, event })
          setSession(null)
          onSessionClearedRef.current?.()
        }
      } catch (error) {
        console.error('Auth state change handler failed:', error)
        if (active) setSession(null)
      } finally {
        if (active) {
          console.log('[bootstrap] setBootLoading(false) from auth state change', { runId, event })
          setBootLoading(false)
        }
      }
    })

    return () => {
      active = false
      console.log('[bootstrap] effect cleanup', { runId })
      subscription.unsubscribe()
    }
  }, [hydrateSessionFromUser])

  const signOutAndClearSession = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    onSessionClearedRef.current?.()
  }, [])

  return {
    bootLoading,
    hydrateSessionFromUser,
    session,
    signOutAndClearSession,
  }
}
