
import { lazy, Suspense, startTransition, useCallback, useEffect, useState } from 'react'
import './App.css'

import AppWorkspaceRouter from './AppWorkspaceRouter'

import 'katex/dist/katex.min.css'

import {
  loginWithLocalAuth,
  registerWithLocalAuth,
} from './lib/authClient'
import { emailToUsername } from './lib/profileSession'
import { useAppSession } from './hooks/useAppSession'

const LazyCardWorkspace = lazy(() => import('./CardWorkspace'))

function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Please enter a valid email.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      if (mode === 'register') {
        const username = emailToUsername(normalizedEmail)
        const { user } = await registerWithLocalAuth({
          email: normalizedEmail,
          password,
          username,
        })

        if (user) {
          await onAuthSuccess(user)
        }
      } else {
        const { user } = await loginWithLocalAuth({
          email: normalizedEmail,
          password,
        })

        if (user) {
          await onAuthSuccess(user)
        }
      }
    } catch (err) {
      setError(err.message || 'Could not authenticate.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Card Generator</h1>
        <p className="auth-subtitle">Sign in to save cards per account (multi-device).</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            Create Account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: user@example.com"
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}

          <button type="submit" className="btn auth-submit" disabled={loading}>
            {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
function WelcomeScreen({ onContinue }) {
  return (
    <div className="welcome-shell">
      <div className="welcome-card">
        <p className="welcome-overline">INTICORE PLATFORM</p>
        <h1 className="welcome-title">Welcome to Inticore</h1>
        <p className="welcome-subtitle">Design, save and manage your custom cards from any device.</p>
        <button type="button" className="btn welcome-btn" onClick={onContinue}>Get Started</button>
      </div>
    </div>
  )
}

function App() {
  const [entryScreen, setEntryScreen] = useState('welcome')
  const [workspaceTarget, setWorkspaceTarget] = useState(null)
  const [activeMultiplayerMatchId, setActiveMultiplayerMatchId] = useState(null)
  const [activeMathDungeonRunId, setActiveMathDungeonRunId] = useState(null)

  const handleSessionCleared = useCallback(() => {
    setWorkspaceTarget(null)
    setActiveMathDungeonRunId(null)
  }, [])

  const { bootLoading, hydrateLocalSession, session, signOutAndClearSession } = useAppSession({
    onSessionCleared: handleSessionCleared,
  })

  const handleAuthSuccess = async (user) => {
    hydrateLocalSession(user, { source: 'auth_success' })
    setWorkspaceTarget(null)
  }

  const handleLogout = async () => {
    await signOutAndClearSession()
    setEntryScreen('welcome')
  }

  useEffect(() => {
    if (!session || workspaceTarget || typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const sharedNotebookCode = String(url.searchParams.get('notebookShare') || '').trim()
    if (!sharedNotebookCode) return

    startTransition(() => {
      setWorkspaceTarget('notebooks')
    })
  }, [session, workspaceTarget])

  if (bootLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">Card Generator</h1>
          <p className="auth-subtitle">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    if (entryScreen === 'welcome') {
      return <WelcomeScreen onContinue={() => setEntryScreen('auth')} />
    }

    return <AuthScreen onAuthSuccess={handleAuthSuccess} />
  }

  return (
    <AppWorkspaceRouter
      activeMathDungeonRunId={activeMathDungeonRunId}
      activeMultiplayerMatchId={activeMultiplayerMatchId}
      renderCardWorkspace={(initialView, onBackToMenu) => (
        <Suspense
          fallback={(
            <div className="auth-shell">
              <div className="auth-card">
                <h1 className="auth-title">Card Generator</h1>
                <p className="auth-subtitle">Loading workspace...</p>
              </div>
            </div>
          )}
        >
          <LazyCardWorkspace
            session={session}
            onLogout={handleLogout}
            initialView={initialView}
            onBackToMenu={onBackToMenu}
          />
        </Suspense>
      )}
      onLogout={handleLogout}
      session={session}
      setActiveMathDungeonRunId={setActiveMathDungeonRunId}
      setActiveMultiplayerMatchId={setActiveMultiplayerMatchId}
      setWorkspaceTarget={setWorkspaceTarget}
      workspaceTarget={workspaceTarget}
    />
  )
}

export default App
