
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

import frameCommon from './assets/frame-common.png'
import frameRare from './assets/frame-rare.png'
import frameEpic from './assets/frame-epic.png'
import frameLegendary from './assets/frame-legendary.png'
import frameMythic from './assets/frame-mythic.png'

import DescriptionEditor from './DescriptionEditor'

import 'katex/dist/katex.min.css'
import katex from 'katex'

import * as htmlToImage from 'html-to-image'
import jsPDF from 'jspdf'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const SESSION_KEY = 'card_generator_session_v3'

const FONT_OPTIONS = [
  {
    value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
    label: 'Monospace',
  },
  { value: '"Trebuchet MS", "Segoe UI", sans-serif', label: 'Trebuchet' },
  { value: '"Georgia", "Times New Roman", serif', label: 'Serif' },
  { value: '"Verdana", "Geneva", sans-serif', label: 'Verdana' },
  { value: '"Tahoma", "Geneva", sans-serif', label: 'Tahoma' },
]

const DEFAULTS = {
  title: 'Card Name',
  titleColor: '#00ff88',
  titleFontFamily: FONT_OPTIONS[0].value,
  titleFontSize: 34,
  description: '<p><span style="color:#b6fff0">This is the card description.</span></p>',
  descFontFamily: FONT_OPTIONS[0].value,
  descFontSize: 20,
  imageUrl: 'https://via.placeholder.com/300x200',
  frameId: 'common',
  artTop: 140,
  artLeft: 70,
  artWidth: 466,
  artHeight: 320,
  titleTop: 60,
  descTop: 690,
}

const FRAMES = [
  { id: 'common', label: 'Common', src: frameCommon },
  { id: 'rare', label: 'Rare', src: frameRare },
  { id: 'epic', label: 'Epic', src: frameEpic },
  { id: 'legendary', label: 'Legendary', src: frameLegendary },
  { id: 'mythic', label: 'Mythic', src: frameMythic },
]

function toNumber(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function decodeUnicodeEscapes(text) {
  if (typeof text !== 'string') return text
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function renderDescriptionMath(html) {
  if (typeof window === 'undefined') return html

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const nodes = doc.querySelectorAll('span[data-type="math-inline"]')
  nodes.forEach((el) => {
    const latex = el.getAttribute('data-latex') || ''
    try {
      el.innerHTML = katex.renderToString(latex, { throwOnError: false })
    } catch {
      el.textContent = latex
    }
  })

  return doc.body.innerHTML
}

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.token || !parsed?.username) return null
    return parsed
  } catch {
    return null
  }
}

function saveStoredSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY)
}

async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { error: text }
    }
  }

  if (!res.ok) {
    const error = new Error(payload?.error || 'Request failed')
    error.status = res.status
    throw error
  }

  return payload
}

function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const normalizedUsername = username.trim().toLowerCase()
    if (normalizedUsername.length < 3) {
      setError('Username must be at least 3 characters.')
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
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login'
      const data = await apiRequest(endpoint, {
        method: 'POST',
        body: { username: normalizedUsername, password },
      })

      const session = {
        token: data.token,
        userId: data.user.id,
        username: data.user.username,
      }

      saveStoredSession(session)
      onAuthSuccess(session)
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
          <button type="button" className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            Sign In
          </button>
          <button type="button" className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
            Create Account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ex: kory" autoComplete="username" />
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>

          {mode === 'register' && (
            <label className="field">
              <span>Confirm password</span>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn auth-submit" disabled={loading}>
            {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
function CardWorkspace({ session, onLogout, onSessionExpired }) {
  const [title, setTitle] = useState(DEFAULTS.title)
  const [titleColor, setTitleColor] = useState(DEFAULTS.titleColor)
  const [titleFontFamily, setTitleFontFamily] = useState(DEFAULTS.titleFontFamily)
  const [titleFontSize, setTitleFontSize] = useState(DEFAULTS.titleFontSize)

  const [description, setDescription] = useState(DEFAULTS.description)
  const [descFontFamily, setDescFontFamily] = useState(DEFAULTS.descFontFamily)
  const [descFontSize, setDescFontSize] = useState(DEFAULTS.descFontSize)

  const [imageUrl, setImageUrl] = useState(DEFAULTS.imageUrl)
  const [frameId, setFrameId] = useState(DEFAULTS.frameId)

  const [artTop, setArtTop] = useState(DEFAULTS.artTop)
  const [artLeft, setArtLeft] = useState(DEFAULTS.artLeft)
  const [artWidth, setArtWidth] = useState(DEFAULTS.artWidth)
  const [artHeight, setArtHeight] = useState(DEFAULTS.artHeight)

  const [titleTop, setTitleTop] = useState(DEFAULTS.titleTop)
  const [descTop, setDescTop] = useState(DEFAULTS.descTop)

  const [saveName, setSaveName] = useState('')
  const [savedCards, setSavedCards] = useState([])
  const [savingCard, setSavingCard] = useState(false)
  const [loadingCards, setLoadingCards] = useState(false)

  const frame = FRAMES.find((f) => f.id === frameId)?.src ?? frameCommon
  const cardRef = useRef(null)
  const importRef = useRef(null)

  const renderedDescription = useMemo(() => renderDescriptionMath(description), [description])

  const handleApiError = (err, fallbackMessage) => {
    if (err?.status === 401) {
      onSessionExpired()
      return
    }

    alert(err?.message || fallbackMessage)
  }

  const loadSavedCards = async () => {
    setLoadingCards(true)
    try {
      const data = await apiRequest('/cards', { token: session.token })
      setSavedCards(Array.isArray(data?.cards) ? data.cards : [])
    } catch (err) {
      handleApiError(err, 'Could not load saved cards.')
    } finally {
      setLoadingCards(false)
    }
  }

  useEffect(() => {
    loadSavedCards()
  }, [session.token])

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const getCardState = () => ({
    version: 1,
    title,
    titleColor,
    titleFontFamily,
    titleFontSize,
    description,
    descFontFamily,
    descFontSize,
    imageUrl,
    frameId,
    artTop,
    artLeft,
    artWidth,
    artHeight,
    titleTop,
    descTop,
  })

  const applyCardState = (data) => {
    if (typeof data !== 'object' || !data) return

    if (typeof data.title === 'string') setTitle(decodeUnicodeEscapes(data.title))
    if (typeof data.titleColor === 'string') setTitleColor(data.titleColor)
    if (typeof data.titleFontFamily === 'string') setTitleFontFamily(data.titleFontFamily)
    setTitleFontSize(toNumber(data.titleFontSize, DEFAULTS.titleFontSize))

    if (typeof data.description === 'string') setDescription(decodeUnicodeEscapes(data.description))
    if (typeof data.descFontFamily === 'string') setDescFontFamily(data.descFontFamily)
    setDescFontSize(toNumber(data.descFontSize, DEFAULTS.descFontSize))

    if (typeof data.imageUrl === 'string') setImageUrl(decodeUnicodeEscapes(data.imageUrl))

    if (typeof data.frameId === 'string' && FRAMES.some((f) => f.id === data.frameId)) {
      setFrameId(data.frameId)
    }

    setArtTop(toNumber(data.artTop, DEFAULTS.artTop))
    setArtLeft(toNumber(data.artLeft, DEFAULTS.artLeft))
    setArtWidth(toNumber(data.artWidth, DEFAULTS.artWidth))
    setArtHeight(toNumber(data.artHeight, DEFAULTS.artHeight))
    setTitleTop(toNumber(data.titleTop, DEFAULTS.titleTop))
    setDescTop(toNumber(data.descTop, DEFAULTS.descTop))
  }

  const saveCardForUser = async () => {
    const name = saveName.trim()
    if (!name) {
      alert('Enter a name to save this card.')
      return
    }

    setSavingCard(true)
    try {
      await apiRequest('/cards/upsert', {
        method: 'POST',
        token: session.token,
        body: { name, state: getCardState() },
      })
      setSaveName('')
      await loadSavedCards()
    } catch (err) {
      handleApiError(err, 'Could not save card.')
    } finally {
      setSavingCard(false)
    }
  }

  const deleteSavedCard = async (id) => {
    const ok = window.confirm('Delete this saved card?')
    if (!ok) return

    try {
      await apiRequest(`/cards/${id}`, { method: 'DELETE', token: session.token })
      await loadSavedCards()
    } catch (err) {
      handleApiError(err, 'Could not delete card.')
    }
  }

  const exportJSON = () => {
    const data = getCardState()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    downloadBlob(blob, 'card.json')
  }

  const triggerImport = () => importRef.current?.click()

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      applyCardState(data)
    } catch (err) {
      alert('Invalid JSON or corrupted file.')
      console.error(err)
    }
  }
  const exportPNG = async () => {
    const el = cardRef.current
    if (!el) return

    const prevTransform = el.style.transform
    const prevOrigin = el.style.transformOrigin

    try {
      el.style.transform = 'none'
      el.style.transformOrigin = 'top left'

      const dataUrl = await htmlToImage.toPng(el, { pixelRatio: 2, cacheBust: true })
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      downloadBlob(blob, 'card.png')
    } catch (err) {
      console.error(err)
      alert('Could not export PNG. Check the console.')
    } finally {
      el.style.transform = prevTransform
      el.style.transformOrigin = prevOrigin
    }
  }

  const exportPDF = async () => {
    const el = cardRef.current
    if (!el) return

    const prevTransform = el.style.transform
    const prevOrigin = el.style.transformOrigin

    try {
      el.style.transform = 'none'
      el.style.transformOrigin = 'top left'

      const dataUrl = await htmlToImage.toPng(el, { pixelRatio: 2, cacheBust: true })

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [606, 1039] })
      pdf.addImage(dataUrl, 'PNG', 0, 0, 606, 1039)
      pdf.save('card.pdf')
    } catch (err) {
      console.error(err)
      alert('Could not export PDF. Check the console.')
    } finally {
      el.style.transform = prevTransform
      el.style.transformOrigin = prevOrigin
    }
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Card Generator - Profe Inti</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username}</span>
          <button type="button" className="btn session-logout" onClick={onLogout}>Log out</button>
        </div>
      </div>

      <div className="layout">
        <div className="panel">
          <label className="field"><span>Name (Title)</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Example: Mean Value Theorem" /></label>
          <label className="field"><span>Title color</span><input type="color" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} /></label>
          <label className="field"><span>Title font</span><select value={titleFontFamily} onChange={(e) => setTitleFontFamily(e.target.value)}>{FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}</select></label>
          <label className="field"><span>Title size (px)</span><input type="number" min="16" max="72" value={titleFontSize} onChange={(e) => setTitleFontSize(toNumber(e.target.value, DEFAULTS.titleFontSize))} /></label>
          <label className="field"><span>Description font</span><select value={descFontFamily} onChange={(e) => setDescFontFamily(e.target.value)}>{FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}</select></label>
          <label className="field"><span>Description size (px)</span><input type="number" min="12" max="48" value={descFontSize} onChange={(e) => setDescFontSize(toNumber(e.target.value, DEFAULTS.descFontSize))} /></label>
          <label className="field"><span>Rich description</span><DescriptionEditor value={description} onChange={setDescription} baseFontFamily={descFontFamily} baseFontSize={descFontSize} /></label>
        </div>

        <div className="sliders-panel"><div className="sliders">
          <div className="slider"><span>Art top: {artTop}px</span><input type="range" min="0" max="500" value={artTop} onChange={(e) => setArtTop(Number(e.target.value))} /></div>
          <div className="slider"><span>Art left: {artLeft}px</span><input type="range" min="0" max="200" value={artLeft} onChange={(e) => setArtLeft(Number(e.target.value))} /></div>
          <div className="slider"><span>Art width: {artWidth}px</span><input type="range" min="200" max="606" value={artWidth} onChange={(e) => setArtWidth(Number(e.target.value))} /></div>
          <div className="slider"><span>Art height: {artHeight}px</span><input type="range" min="150" max="600" value={artHeight} onChange={(e) => setArtHeight(Number(e.target.value))} /></div>
          <div className="slider"><span>{`Title top: ${titleTop}px`}</span><input type="range" min="0" max="300" value={titleTop} onChange={(e) => setTitleTop(Number(e.target.value))} /></div>
          <div className="slider"><span>{`Description top: ${descTop}px`}</span><input type="range" min="350" max="980" value={descTop} onChange={(e) => setDescTop(Number(e.target.value))} /></div>
          <button type="button" className="btn" onClick={() => { setTitleTop(DEFAULTS.titleTop); setDescTop(DEFAULTS.descTop); setArtTop(DEFAULTS.artTop); setArtLeft(DEFAULTS.artLeft); setArtWidth(DEFAULTS.artWidth); setArtHeight(DEFAULTS.artHeight) }}>Reset positions</button>
        </div></div>

        <div className="assets-panel">
          <div className="assets-title">Account & Assets</div>
          <label className="field"><span>Art (main image)</span><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onloadend = () => setImageUrl(reader.result); reader.readAsDataURL(file) }} /></label>
          <div className="rarity-selector"><div className="rarity-title">Rarity (Frame)</div><div className="rarity-options">{FRAMES.map((f) => <button key={f.id} type="button" className={`rarity-item ${frameId === f.id ? 'active' : ''}`} onClick={() => setFrameId(f.id)} title={f.label}><img src={f.src} alt={f.label} className="rarity-thumb" /><div className="rarity-label">{f.label}</div></button>)}</div></div>
          <div className="export-row"><button type="button" className="btn" onClick={exportPNG}>Export PNG</button><button type="button" className="btn" onClick={exportPDF}>Export PDF</button><button type="button" className="btn" onClick={exportJSON}>Export JSON</button><button type="button" className="btn" onClick={triggerImport}>Import JSON</button><input ref={importRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onImportFile} /></div>
          <div className="saved-section"><div className="saved-title">My saved cards</div><div className="saved-save-row"><input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Save name" /><button type="button" className="btn" onClick={saveCardForUser} disabled={savingCard}>{savingCard ? 'Saving...' : 'Save to account'}</button></div><div className="saved-list">{loadingCards && <div className="saved-empty">Loading cards...</div>}{!loadingCards && savedCards.length === 0 && <div className="saved-empty">No saved cards yet.</div>}{savedCards.map((card) => <div key={card.id} className="saved-item"><div className="saved-item-meta"><div className="saved-item-name">{card.name}</div><div className="saved-item-date">{new Date(card.updatedAt).toLocaleString()}</div></div><div className="saved-item-actions"><button type="button" className="btn" onClick={() => applyCardState(card.state)}>Load</button><button type="button" className="btn danger" onClick={() => deleteSavedCard(card.id)}>Delete</button></div></div>)}</div></div>
        </div>

        <div className="preview-wrap"><div className="card" ref={cardRef}><div className="art" style={{ top: artTop, left: artLeft, width: artWidth, height: artHeight, right: 'auto' }}><img src={imageUrl} alt="Art" /></div><img className="frame" src={frame} alt="Frame" /><div className="title-box" style={{ top: titleTop }}><h2 className="card-title" style={{ color: titleColor, fontFamily: titleFontFamily, fontSize: `${titleFontSize}px` }}>{title}</h2></div><div className="desc-box" style={{ top: descTop }}><div className="card-description" style={{ fontFamily: descFontFamily, fontSize: `${descFontSize}px` }} dangerouslySetInnerHTML={{ __html: renderedDescription }} /></div></div></div>
      </div>
    </div>
  )
}
function App() {
  const [session, setSession] = useState(null)
  const [bootLoading, setBootLoading] = useState(true)

  useEffect(() => {
    const bootstrap = async () => {
      const stored = getStoredSession()
      if (!stored) {
        setBootLoading(false)
        return
      }

      try {
        const data = await apiRequest('/auth/me', { token: stored.token })
        const validSession = { token: stored.token, userId: data.user.id, username: data.user.username }
        saveStoredSession(validSession)
        setSession(validSession)
      } catch {
        clearStoredSession()
        setSession(null)
      } finally {
        setBootLoading(false)
      }
    }

    bootstrap()
  }, [])

  const handleAuthSuccess = (nextSession) => setSession(nextSession)

  const handleLogout = () => {
    clearStoredSession()
    setSession(null)
  }

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

  if (!session) return <AuthScreen onAuthSuccess={handleAuthSuccess} />

  return <CardWorkspace session={session} onLogout={handleLogout} onSessionExpired={handleLogout} />
}

export default App
