
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

import frameCommon from './assets/frame-common.png'
import frameRare from './assets/frame-rare.png'
import frameEpic from './assets/frame-epic.png'
import frameLegendary from './assets/frame-legendary.png'
import frameMythic from './assets/frame-mythic.png'

import DescriptionEditor from './DescriptionEditor'
import CompetitiveExerciseEditor from './CompetitiveExerciseEditor'
import CompetitiveReviewPanel from './CompetitiveReviewPanel'
import CompetitiveTechniqueEditor from './CompetitiveTechniqueEditor'
import CompetitiveTechniqueReviewPanel from './CompetitiveTechniqueReviewPanel'
import CompetitiveExercisesCollection from './CompetitiveExercisesCollection'
import CompetitiveTechniquesCollection from './CompetitiveTechniquesCollection'
import ConstructGenerator from './ConstructGenerator'
import CompetitiveConstructsCollection from './CompetitiveConstructsCollection'
import CompetitiveConstructReviewPanel from './CompetitiveConstructReviewPanel'
import CompetitiveTrainingMode from './CompetitiveTrainingMode'
import MultiplayerLobby from './MultiplayerLobby'
import MultiplayerMatch from './MultiplayerMatch'
import { COMPETITIVE_SECTIONS, CompetitiveModeShell, CreativeModeShell, MainMenu } from './components/ModeShells'

import 'katex/dist/katex.min.css'
import { renderMathInHtml } from './lib/mathHtml'

import * as htmlToImage from 'html-to-image'
import jsPDF from 'jspdf'
import { supabase } from './lib/supabase'

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

const DEFAULT_ART_DATA_URL = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='606' height='320' viewBox='0 0 606 320'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23131f2b'/%3E%3Cstop offset='100%25' stop-color='%232a3f56'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='606' height='320' fill='url(%23g)'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23b6fff0' font-family='Verdana, sans-serif' font-size='24'%3EUpload or paste an image%3C/text%3E%3C/svg%3E`

const DEFAULTS = {
  title: 'Card Name',
  titleColor: '#00ff88',
  titleFontFamily: FONT_OPTIONS[0].value,
  titleFontSize: 34,
  description: '<p><span style="color:#b6fff0">This is the card description.</span></p>',
  descTextAlign: 'left',
  descFontFamily: FONT_OPTIONS[0].value,
  descFontSize: 20,
  imageUrl: DEFAULT_ART_DATA_URL,
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

const THEME_SUGGESTIONS = [
  'Algebra',
  'Arithmetic',
  'Fractions',
  'Geometry',
  'Trigonometry',
  'Functions',
  'Statistics',
]

const SUBTHEME_SUGGESTIONS = [
  'Factorization',
  'Equations',
  'Powers',
  'Radicals',
  'Linear Functions',
  'Proportionality',
  'Area',
  'Angles',
  'Simplification',
]

const EFFECT_TYPE_SUGGESTIONS = [
  'transform',
  'simplify',
  'solve',
  'verify',
  'hint',
  'support',
  'correct_error',
]

const DIFFICULTY_SUGGESTIONS = ['Beginner', 'Intermediate', 'Advanced', 'Olympiad']

const RARITY_SUGGESTIONS = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic']
const DESCRIPTION_ALIGN_OPTIONS = ['left', 'center', 'right', 'justify']

function toNumber(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function decodeUnicodeEscapes(text) {
  if (typeof text !== 'string') return text
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function sanitizeMetaText(value) {
  if (typeof value !== 'string') return ''
  return decodeUnicodeEscapes(value).trim()
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value
      .map((tag) => sanitizeMetaText(tag))
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => sanitizeMetaText(tag))
      .filter(Boolean)
  }

  return []
}

function tagsToInputValue(tags) {
  return parseTags(tags).join(', ')
}

function normalizeMetaForDb(value) {
  const normalized = sanitizeMetaText(value)
  return normalized || null
}

function normalizeTagsForDb(tagsInput) {
  const tags = parseTags(tagsInput)
  return tags.length ? tags : null
}

function toCardResponse(row) {
  let state

  if (row && Object.prototype.hasOwnProperty.call(row, 'state_json')) {
    if (row?.state_json && typeof row.state_json === 'object') {
      state = row.state_json
    } else if (typeof row?.state_json === 'string') {
      try {
        state = JSON.parse(row.state_json)
      } catch {
        state = undefined
      }
    }
  }

  return {
    id: row.id,
    name: row.name,
    cardKey: row.card_key || '',
    quantity: toNumber(row.quantity, 1),
    state,
    theme: sanitizeMetaText(row.theme),
    subtheme: sanitizeMetaText(row.subtheme),
    effectType: sanitizeMetaText(row.effect_type),
    difficulty: sanitizeMetaText(row.difficulty),
    rarity: sanitizeMetaText(row.rarity),
    isFavorite: Boolean(row.is_favorite),
    tags: parseTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function emailToUsername(email) {
  if (!email || typeof email !== 'string') return 'User'
  return email.split('@')[0] || 'User'
}

async function ensureProfile(user) {
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
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              username: emailToUsername(normalizedEmail),
            },
          },
        })

        if (signUpError) throw signUpError

        if (!data.session) {
          setNotice('Account created. Check your email to confirm your account.')
          setMode('login')
          return
        }

        if (data.user) {
          await onAuthSuccess(data.user)
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

        if (signInError) throw signInError

        if (data.user) {
          await onAuthSuccess(data.user)
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
function CardWorkspace({ session, onLogout, initialView = 'generator', onBackToMenu }) {
  const [title, setTitle] = useState(DEFAULTS.title)
  const [titleColor, setTitleColor] = useState(DEFAULTS.titleColor)
  const [titleFontFamily, setTitleFontFamily] = useState(DEFAULTS.titleFontFamily)
  const [titleFontSize, setTitleFontSize] = useState(DEFAULTS.titleFontSize)

  const [description, setDescription] = useState(DEFAULTS.description)
  const [descTextAlign, setDescTextAlign] = useState(DEFAULTS.descTextAlign)
  const [descFontFamily, setDescFontFamily] = useState(DEFAULTS.descFontFamily)
  const [descFontSize, setDescFontSize] = useState(DEFAULTS.descFontSize)

  const [imageUrl, setImageUrl] = useState(DEFAULTS.imageUrl)
  const [artUrlInput, setArtUrlInput] = useState('')
  const [frameId, setFrameId] = useState(DEFAULTS.frameId)

  const [artTop, setArtTop] = useState(DEFAULTS.artTop)
  const [artLeft, setArtLeft] = useState(DEFAULTS.artLeft)
  const [artWidth, setArtWidth] = useState(DEFAULTS.artWidth)
  const [artHeight, setArtHeight] = useState(DEFAULTS.artHeight)

  const [titleTop, setTitleTop] = useState(DEFAULTS.titleTop)
  const [descTop, setDescTop] = useState(DEFAULTS.descTop)

  const [theme, setTheme] = useState('')
  const [subtheme, setSubtheme] = useState('')
  const [effectType, setEffectType] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [rarity, setRarity] = useState('')
  const [isFavorite, setIsFavorite] = useState(false)
  const [tagsInput, setTagsInput] = useState('')

  const [saveName, setSaveName] = useState('')
  const [savedCards, setSavedCards] = useState([])
  const [savingCard, setSavingCard] = useState(false)
  const [loadingCards, setLoadingCards] = useState(false)
  const [loadingCardId, setLoadingCardId] = useState(null)
  const [activeView, setActiveView] = useState(initialView)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterTheme, setFilterTheme] = useState('')
  const [filterSubtheme, setFilterSubtheme] = useState('')
  const [filterEffectType, setFilterEffectType] = useState('')
  const [filterDifficulty, setFilterDifficulty] = useState('')
  const [filterRarity, setFilterRarity] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sortBy, setSortBy] = useState('updated_desc')

  const frame = FRAMES.find((f) => f.id === frameId)?.src ?? frameCommon
  const cardRef = useRef(null)
  const importRef = useRef(null)

  useEffect(() => {
    setActiveView(initialView)
  }, [initialView])

  const renderedDescription = useMemo(() => renderMathInHtml(description), [description])

  const applyMetadataFromSource = (source) => {
    const metadata = source?.metadata && typeof source.metadata === 'object' ? source.metadata : source

    setTheme(sanitizeMetaText(metadata?.theme))
    setSubtheme(sanitizeMetaText(metadata?.subtheme))
    setEffectType(sanitizeMetaText(metadata?.effectType ?? metadata?.effect_type))
    setDifficulty(sanitizeMetaText(metadata?.difficulty))
    setRarity(sanitizeMetaText(metadata?.rarity))
    setIsFavorite(Boolean(metadata?.isFavorite ?? metadata?.is_favorite))
    setTagsInput(tagsToInputValue(metadata?.tags))
  }

  const loadSavedCards = async () => {
    console.log('[cards] load start', { userId: session.userId })
    setLoadingCards(true)

    try {
      const { data, error } = await supabase
        .from('user_cards')
        .select('id, name, card_key, quantity, theme, subtheme, effect_type, difficulty, rarity, is_favorite, tags, created_at, updated_at')
        .eq('user_id', session.userId)
        .order('updated_at', { ascending: false })

      if (error) throw error
      const normalized = Array.isArray(data) ? data.map(toCardResponse) : []
      setSavedCards(normalized)
      console.log('[cards] load done', { userId: session.userId, count: normalized.length })
    } catch (err) {
      console.error('[cards] load error', err)
      alert(err?.message || 'Could not load saved cards.')
    } finally {
      console.log('[cards] setLoadingCards(false)')
      setLoadingCards(false)
    }
  }

  useEffect(() => {
    if (activeView !== 'collection') return
    loadSavedCards()
  }, [session.userId, activeView])

  const visibleCards = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    const filtered = savedCards.filter((card) => {
      if (normalizedSearch && !card.name.toLowerCase().includes(normalizedSearch)) return false
      if (filterTheme && card.theme !== filterTheme) return false
      if (filterSubtheme && card.subtheme !== filterSubtheme) return false
      if (filterEffectType && card.effectType !== filterEffectType) return false
      if (filterDifficulty && card.difficulty !== filterDifficulty) return false
      if (filterRarity && card.rarity !== filterRarity) return false
      if (favoritesOnly && !card.isFavorite) return false
      return true
    })

    filtered.sort((a, b) => {
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name)
      }

      if (sortBy === 'quantity_desc') {
        return toNumber(b.quantity, 0) - toNumber(a.quantity, 0)
      }

      if (sortBy === 'created_desc') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      }

      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    })

    return filtered
  }, [
    savedCards,
    searchQuery,
    filterTheme,
    filterSubtheme,
    filterEffectType,
    filterDifficulty,
    filterRarity,
    favoritesOnly,
    sortBy,
  ])

  const uniqueThemes = useMemo(
    () => [...new Set(savedCards.map((card) => card.theme).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [savedCards]
  )

  const uniqueSubthemes = useMemo(
    () => [...new Set(savedCards.map((card) => card.subtheme).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [savedCards]
  )

  const uniqueEffectTypes = useMemo(
    () => [...new Set(savedCards.map((card) => card.effectType).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [savedCards]
  )

  const uniqueDifficulties = useMemo(
    () => [...new Set(savedCards.map((card) => card.difficulty).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [savedCards]
  )

  const uniqueRarities = useMemo(
    () => [...new Set(savedCards.map((card) => card.rarity).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [savedCards]
  )

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
    descTextAlign,
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
    metadata: {
      theme: sanitizeMetaText(theme),
      subtheme: sanitizeMetaText(subtheme),
      effectType: sanitizeMetaText(effectType),
      difficulty: sanitizeMetaText(difficulty),
      rarity: sanitizeMetaText(rarity),
      isFavorite,
      tags: parseTags(tagsInput),
    },
  })

  const applyCardState = (data) => {
    if (typeof data !== 'object' || !data) return

    if (typeof data.title === 'string') setTitle(decodeUnicodeEscapes(data.title))
    if (typeof data.titleColor === 'string') setTitleColor(data.titleColor)
    if (typeof data.titleFontFamily === 'string') setTitleFontFamily(data.titleFontFamily)
    setTitleFontSize(toNumber(data.titleFontSize, DEFAULTS.titleFontSize))

    if (typeof data.description === 'string') setDescription(decodeUnicodeEscapes(data.description))
    if (typeof data.descTextAlign === 'string' && DESCRIPTION_ALIGN_OPTIONS.includes(data.descTextAlign)) {
      setDescTextAlign(data.descTextAlign)
    } else {
      setDescTextAlign(DEFAULTS.descTextAlign)
    }
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

    applyMetadataFromSource(data)
  }

  const saveCardForUser = async () => {
    const name = saveName.trim()
    if (!name) {
      alert('Enter a name to save this card.')
      return
    }

    setSavingCard(true)

    try {
      const now = new Date().toISOString()
      const payload = {
        user_id: session.userId,
        name,
        card_key: name.toLowerCase().replace(/\s+/g, '-'),
        quantity: 1,
        state_json: getCardState(),
        theme: normalizeMetaForDb(theme),
        subtheme: normalizeMetaForDb(subtheme),
        effect_type: normalizeMetaForDb(effectType),
        difficulty: normalizeMetaForDb(difficulty),
        rarity: normalizeMetaForDb(rarity),
        is_favorite: Boolean(isFavorite),
        tags: normalizeTagsForDb(tagsInput),
        updated_at: now,
      }

      const { error } = await supabase.from('user_cards').upsert(payload, {
        onConflict: 'user_id,name',
      })

      if (error) throw error

      setSaveName('')
      if (activeView === 'collection') {
        await loadSavedCards()
      }
    } catch (err) {
      alert(err?.message || 'Could not save card.')
    } finally {
      setSavingCard(false)
    }
  }

  const loadCardInGenerator = async (card) => {
    if (!card?.id) return
    setLoadingCardId(card.id)

    try {
      const { data, error } = await supabase
        .from('user_cards')
        .select('id, name, state_json, theme, subtheme, effect_type, difficulty, rarity, is_favorite, tags, created_at, updated_at')
        .eq('id', card.id)
        .eq('user_id', session.userId)
        .single()

      if (error) throw error

      const normalized = toCardResponse(data)
      if (normalized.state) {
        applyCardState(normalized.state)
      }
      applyMetadataFromSource(normalized)
      setSaveName(normalized.name || '')
      setActiveView('generator')
    } catch (err) {
      console.error('[cards] load single error', err)
      alert(err?.message || 'Could not load card for editing.')
    } finally {
      setLoadingCardId(null)
    }
  }

  const deleteSavedCard = async (id) => {
    const ok = window.confirm('Delete this saved card?')
    if (!ok) return

    try {
      const { error } = await supabase
        .from('user_cards')
        .delete()
        .eq('id', id)
        .eq('user_id', session.userId)

      if (error) throw error
      await loadSavedCards()
    } catch (err) {
      alert(err?.message || 'Could not delete card.')
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

  const applyArtUrl = () => {
    const url = artUrlInput.trim()
    if (!url) return

    if (!/^https?:\/\//i.test(url) && !url.startsWith('data:image/')) {
      alert('Please enter a valid image URL (http/https) or a data URL.')
      return
    }

    setImageUrl(url)
  }

  const exportPNG = async () => {
    const el = cardRef.current
    if (!el) return

    const prevTransform = el.style.transform
    const prevOrigin = el.style.transformOrigin

    try {
      el.style.transform = 'none'
      el.style.transformOrigin = 'top left'

      const dataUrl = await htmlToImage.toPng(el, {
        pixelRatio: 2,
        cacheBust: true,
        imagePlaceholder: DEFAULT_ART_DATA_URL,
      })
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

      const dataUrl = await htmlToImage.toPng(el, {
        pixelRatio: 2,
        cacheBust: true,
        imagePlaceholder: DEFAULT_ART_DATA_URL,
      })

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

  const openCollection = () => {
    setActiveView('collection')
  }

  if (activeView === 'collection') {
    return (
      <div className="page">
        <div className="session-row">
          <h1 className="page-title">Saved Cards Collection</h1>
          <div className="session-user-row">
            <span className="session-user">User: {session.username}</span>
            <button type="button" className="btn session-logout" onClick={onBackToMenu}>
              Menu
            </button>
            <button type="button" className="btn session-logout" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>

        <div className="collection-layout">
          <div className="assets-panel">
            <div className="saved-title">My saved cards</div>

            <div className="collection-toolbar">
              <label className="field">
                <span>Search by name</span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search cards..."
                />
              </label>

              <div className="collection-grid-filters">
                <label className="field">
                  <span>Theme</span>
                  <select value={filterTheme} onChange={(e) => setFilterTheme(e.target.value)}>
                    <option value="">All</option>
                    {uniqueThemes.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Subtheme</span>
                  <select value={filterSubtheme} onChange={(e) => setFilterSubtheme(e.target.value)}>
                    <option value="">All</option>
                    {uniqueSubthemes.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Effect</span>
                  <select value={filterEffectType} onChange={(e) => setFilterEffectType(e.target.value)}>
                    <option value="">All</option>
                    {uniqueEffectTypes.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Difficulty</span>
                  <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)}>
                    <option value="">All</option>
                    {uniqueDifficulties.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Rarity</span>
                  <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value)}>
                    <option value="">All</option>
                    {uniqueRarities.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Sort</span>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="updated_desc">Updated (newest)</option>
                    <option value="created_desc">Created (newest)</option>
                    <option value="name_asc">Name (A-Z)</option>
                    <option value="quantity_desc">Quantity (high-low)</option>
                  </select>
                </label>
              </div>

              <label className="collection-favorites-toggle">
                <input
                  type="checkbox"
                  checked={favoritesOnly}
                  onChange={(e) => setFavoritesOnly(e.target.checked)}
                />
                Favorites only
              </label>
            </div>

            <div className="saved-list collection-list">
              {loadingCards && <div className="saved-empty">Loading cards...</div>}
              {!loadingCards && visibleCards.length === 0 && (
                <div className="saved-empty">No cards match the current filters.</div>
              )}
              {visibleCards.map((card) => (
                <div key={card.id} className="saved-item">
                  <div className="saved-item-meta">
                    <div className="saved-item-name">
                      {card.name}
                      {card.isFavorite ? ' [Fav]' : ''}
                    </div>
                    <div className="saved-item-date">
                      {card.updatedAt ? new Date(card.updatedAt).toLocaleString() : ''}
                    </div>
                    <div className="saved-item-taxonomy">
                      <span>Theme: {card.theme || 'Unclassified'}</span>
                      <span>Subtheme: {card.subtheme || 'Unclassified'}</span>
                      <span>Effect: {card.effectType || 'Unclassified'}</span>
                      <span>Difficulty: {card.difficulty || 'Unclassified'}</span>
                      <span>Rarity: {card.rarity || 'Unclassified'}</span>
                      <span>Qty: {card.quantity}</span>
                    </div>
                    {card.tags.length > 0 && (
                      <div className="saved-item-tags">Tags: {card.tags.join(', ')}</div>
                    )}
                  </div>
                  <div className="saved-item-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={loadingCardId === card.id}
                      onClick={() => loadCardInGenerator(card)}
                    >
                      {loadingCardId === card.id ? 'Loading...' : 'Load in Generator'}
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => deleteSavedCard(card.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="collection-actions">
              <button type="button" className="btn" onClick={() => setActiveView('generator')}>
                Go to Generator
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }


  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Card Generator - Profe Inti</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username}</span>
          <button type="button" className="btn session-logout" onClick={onBackToMenu}>
            Menu
          </button>
          <button type="button" className="btn session-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className="layout">
        <div className="panel">
          <label className="field">
            <span>Name (Title)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Example: Mean Value Theorem"
            />
          </label>
          <label className="field">
            <span>Title color</span>
            <input type="color" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} />
          </label>
          <label className="field">
            <span>Title font</span>
            <select value={titleFontFamily} onChange={(e) => setTitleFontFamily(e.target.value)}>
              {FONT_OPTIONS.map((font) => (
                <option key={font.label} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Title size (px)</span>
            <input
              type="number"
              min="16"
              max="72"
              value={titleFontSize}
              onChange={(e) => setTitleFontSize(toNumber(e.target.value, DEFAULTS.titleFontSize))}
            />
          </label>
          <label className="field">
            <span>Description font</span>
            <select value={descFontFamily} onChange={(e) => setDescFontFamily(e.target.value)}>
              {FONT_OPTIONS.map((font) => (
                <option key={font.label} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Description size (px)</span>
            <input
              type="number"
              min="12"
              max="48"
              value={descFontSize}
              onChange={(e) => setDescFontSize(toNumber(e.target.value, DEFAULTS.descFontSize))}
            />
          </label>
          <label className="field">
            <span>Description align</span>
            <select value={descTextAlign} onChange={(e) => setDescTextAlign(e.target.value)}>
              {DESCRIPTION_ALIGN_OPTIONS.map((align) => (
                <option key={align} value={align}>
                  {align}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Rich description</span>
            <DescriptionEditor
              value={description}
              onChange={setDescription}
              baseFontFamily={descFontFamily}
              baseFontSize={descFontSize}
            />
          </label>
          <div className="metadata-section">
            <div className="saved-title">Mathematical Classification</div>

            <label className="field">
              <span>Theme</span>
              <input
                list="theme-suggestions"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="Algebra, Geometry, Statistics..."
              />
            </label>
            <datalist id="theme-suggestions">
              {THEME_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>

            <label className="field">
              <span>Subtheme</span>
              <input
                list="subtheme-suggestions"
                value={subtheme}
                onChange={(e) => setSubtheme(e.target.value)}
                placeholder="Factorization, Angles, Radicals..."
              />
            </label>
            <datalist id="subtheme-suggestions">
              {SUBTHEME_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>

            <label className="field">
              <span>Effect type</span>
              <input
                list="effect-type-suggestions"
                value={effectType}
                onChange={(e) => setEffectType(e.target.value)}
                placeholder="solve, simplify, verify..."
              />
            </label>
            <datalist id="effect-type-suggestions">
              {EFFECT_TYPE_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>

            <label className="field">
              <span>Difficulty</span>
              <input
                list="difficulty-suggestions"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                placeholder="Beginner, Intermediate..."
              />
            </label>
            <datalist id="difficulty-suggestions">
              {DIFFICULTY_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>

            <label className="field">
              <span>Rarity (optional)</span>
              <input
                list="rarity-suggestions"
                value={rarity}
                onChange={(e) => setRarity(e.target.value)}
                placeholder="Common, Rare..."
              />
            </label>
            <datalist id="rarity-suggestions">
              {RARITY_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>

            <label className="field">
              <span>Tags (comma separated)</span>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="equations, quadratic, proof"
              />
            </label>

            <button
              type="button"
              className={'btn favorite-toggle ' + (isFavorite ? 'active' : '')}
              onClick={() => setIsFavorite((prev) => !prev)}
            >
              {isFavorite ? 'Favorite card' : 'Mark as favorite'}
            </button>
          </div>
        </div>

        <div className="sliders-panel">
          <div className="sliders">
            <div className="slider">
              <span>Art top: {artTop}px</span>
              <input type="range" min="0" max="500" value={artTop} onChange={(e) => setArtTop(Number(e.target.value))} />
            </div>
            <div className="slider">
              <span>Art left: {artLeft}px</span>
              <input type="range" min="0" max="200" value={artLeft} onChange={(e) => setArtLeft(Number(e.target.value))} />
            </div>
            <div className="slider">
              <span>Art width: {artWidth}px</span>
              <input type="range" min="200" max="606" value={artWidth} onChange={(e) => setArtWidth(Number(e.target.value))} />
            </div>
            <div className="slider">
              <span>Art height: {artHeight}px</span>
              <input type="range" min="150" max="600" value={artHeight} onChange={(e) => setArtHeight(Number(e.target.value))} />
            </div>
            <div className="slider">
              <span>{`Title top: ${titleTop}px`}</span>
              <input type="range" min="0" max="300" value={titleTop} onChange={(e) => setTitleTop(Number(e.target.value))} />
            </div>
            <div className="slider">
              <span>{`Description top: ${descTop}px`}</span>
              <input type="range" min="350" max="980" value={descTop} onChange={(e) => setDescTop(Number(e.target.value))} />
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setTitleTop(DEFAULTS.titleTop)
                setDescTop(DEFAULTS.descTop)
                setArtTop(DEFAULTS.artTop)
                setArtLeft(DEFAULTS.artLeft)
                setArtWidth(DEFAULTS.artWidth)
                setArtHeight(DEFAULTS.artHeight)
              }}
            >
              Reset positions
            </button>
          </div>
        </div>

        <div className="assets-panel">
          <div className="assets-title">Account & Assets</div>
          <label className="field">
            <span>Art (main image)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onloadend = () => setImageUrl(reader.result)
                reader.readAsDataURL(file)
              }}
            />
          </label>

          <label className="field">
            <span>Art image URL (recommended to save Supabase space)</span>
            <input
              type="url"
              value={artUrlInput}
              onChange={(e) => setArtUrlInput(e.target.value)}
              placeholder="https://..."
            />
            <button type="button" className="btn" onClick={applyArtUrl}>Use URL</button>
          </label>

          <div className="rarity-selector">
            <div className="rarity-title">Rarity (Frame)</div>
            <div className="rarity-options">
              {FRAMES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`rarity-item ${frameId === f.id ? 'active' : ''}`}
                  onClick={() => setFrameId(f.id)}
                  title={f.label}
                >
                  <img src={f.src} alt={f.label} className="rarity-thumb" />
                  <div className="rarity-label">{f.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="export-row">
            <button type="button" className="btn" onClick={exportPNG}>Export PNG</button>
            <button type="button" className="btn" onClick={exportPDF}>Export PDF</button>
            <button type="button" className="btn" onClick={exportJSON}>Export JSON</button>
            <button type="button" className="btn" onClick={triggerImport}>Import JSON</button>
            <input ref={importRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onImportFile} />
          </div>

          <div className="saved-section">
            <div className="saved-title">Save current card</div>
            <div className="saved-save-row">
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Save name" />
              <button type="button" className="btn" onClick={saveCardForUser} disabled={savingCard}>
                {savingCard ? 'Saving...' : 'Save'}
              </button>
            </div>
            <button type="button" className="btn" onClick={openCollection}>
              Open Collection
            </button>
          </div>
        </div>

        <div className="preview-wrap">
          <div className="card" ref={cardRef}>
            <div className="art" style={{ top: artTop, left: artLeft, width: artWidth, height: artHeight, right: 'auto' }}>
              <img src={imageUrl} alt="Art" onError={(e) => { e.currentTarget.onerror = null; setImageUrl(DEFAULT_ART_DATA_URL) }} />
            </div>
            <img className="frame" src={frame} alt="Frame" />
            <div className="title-box" style={{ top: titleTop }}>
              <h2 className="card-title" style={{ color: titleColor, fontFamily: titleFontFamily, fontSize: `${titleFontSize}px` }}>{title}</h2>
            </div>
            <div className="desc-box" style={{ top: descTop }}>
              <div
                className="card-description"
                style={{ fontFamily: descFontFamily, fontSize: `${descFontSize}px`, textAlign: descTextAlign }}
                dangerouslySetInnerHTML={{ __html: renderedDescription }}
              />
            </div>
          </div>
        </div>
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
  const [session, setSession] = useState(null)
  const [bootLoading, setBootLoading] = useState(true)
  const [entryScreen, setEntryScreen] = useState('welcome')
  const [workspaceTarget, setWorkspaceTarget] = useState(null)
  const [activeMultiplayerMatchId, setActiveMultiplayerMatchId] = useState(null)
  const bootstrapRunIdRef = useRef(0)

  const setSessionFromUser = (user, profileInput) => {
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
  }

  const hydrateSessionFromUser = async (
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
  }

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
          setWorkspaceTarget(null)
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
  }, [])

  const handleAuthSuccess = async (user) => {
    await hydrateSessionFromUser(user, { blockOnProfile: false, source: 'auth_success' })
    setWorkspaceTarget(null)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setWorkspaceTarget(null)
    setEntryScreen('welcome')
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

  if (!session) {
    if (entryScreen === 'welcome') {
      return <WelcomeScreen onContinue={() => setEntryScreen('auth')} />
    }

    return <AuthScreen onAuthSuccess={handleAuthSuccess} />
  }

  if (!workspaceTarget) {
    return (
      <MainMenu
        session={session}
        onOpenCreative={() => setWorkspaceTarget('creative')}
        onOpenCompetitive={() => setWorkspaceTarget('competitive')}
        onOpenMultiplayer={() => setWorkspaceTarget('multiplayer')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'creative') {
    return (
      <CreativeModeShell
        session={session}
        onOpenGenerator={() => setWorkspaceTarget('creative-generator')}
        onOpenCollection={() => setWorkspaceTarget('creative-collection')}
        onBack={() => setWorkspaceTarget(null)}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'multiplayer') {
    return (
      <MultiplayerLobby
        session={session}
        onBackToMenu={() => setWorkspaceTarget(null)}
        onOpenMatch={(matchId) => { setActiveMultiplayerMatchId(matchId); setWorkspaceTarget('multiplayer-match') }}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'multiplayer-match') {
    return (
      <MultiplayerMatch
        session={session}
        matchId={activeMultiplayerMatchId}
        onBackToLobby={() => setWorkspaceTarget('multiplayer')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-exercises') {
    return (
      <CompetitiveExerciseEditor
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-exercises-collection') {
    return (
      <CompetitiveExercisesCollection
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onOpenEditor={() => setWorkspaceTarget('competitive-exercises')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-construct-generator') {
    return (
      <ConstructGenerator
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-constructs-collection') {
    return (
      <CompetitiveConstructsCollection
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onOpenGenerator={() => setWorkspaceTarget('competitive-construct-generator')}
        onLogout={handleLogout}
      />
    )
  }
  if (workspaceTarget === 'competitive-techniques') {
    return (
      <CompetitiveTechniqueEditor
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-techniques-collection') {
    return (
      <CompetitiveTechniquesCollection
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onOpenEditor={() => setWorkspaceTarget('competitive-techniques')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-review' || workspaceTarget === 'competitive-exercises-review') {
    if (session.role !== 'teacher') {
      return (
        <CompetitiveModeShell
          session={session}
          activeSectionId={COMPETITIVE_SECTIONS[0].id}
          onSelectSection={(nextSectionId) => setWorkspaceTarget(nextSectionId)}
          onOpenExercisesReview={() => setWorkspaceTarget('competitive-exercises-review')}
          onOpenTechniquesReview={() => setWorkspaceTarget('competitive-techniques-review')}
          onOpenConstructsReview={() => setWorkspaceTarget('competitive-constructs-review')}
          onBack={() => setWorkspaceTarget(null)}
          onLogout={handleLogout}
        />
      )
    }

    return (
      <CompetitiveReviewPanel
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-techniques-review') {
    if (session.role !== 'teacher') {
      return (
        <CompetitiveModeShell
          session={session}
          activeSectionId={'competitive-techniques'}
          onSelectSection={(nextSectionId) => setWorkspaceTarget(nextSectionId)}
          onOpenExercisesReview={() => setWorkspaceTarget('competitive-exercises-review')}
          onOpenTechniquesReview={() => setWorkspaceTarget('competitive-techniques-review')}
          onOpenConstructsReview={() => setWorkspaceTarget('competitive-constructs-review')}
          onBack={() => setWorkspaceTarget(null)}
          onLogout={handleLogout}
        />
      )
    }

    return (
      <CompetitiveTechniqueReviewPanel
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-constructs-review') {
    if (session.role !== 'teacher') {
      return (
        <CompetitiveModeShell
          session={session}
          activeSectionId={'competitive-constructs-collection'}
          onSelectSection={(nextSectionId) => setWorkspaceTarget(nextSectionId)}
          onOpenExercisesReview={() => setWorkspaceTarget('competitive-exercises-review')}
          onOpenTechniquesReview={() => setWorkspaceTarget('competitive-techniques-review')}
          onOpenConstructsReview={() => setWorkspaceTarget('competitive-constructs-review')}
          onBack={() => setWorkspaceTarget(null)}
          onLogout={handleLogout}
        />
      )
    }

    return (
      <CompetitiveConstructReviewPanel
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'competitive-training') {
    return (
      <CompetitiveTrainingMode
        session={session}
        onBackToCompetitive={() => setWorkspaceTarget('competitive')}
        onLogout={handleLogout}
      />
    )
  }
  if (workspaceTarget.startsWith('competitive')) {
    const activeSectionId = workspaceTarget === 'competitive' ? COMPETITIVE_SECTIONS[0].id : workspaceTarget

    return (
      <CompetitiveModeShell
        session={session}
        activeSectionId={activeSectionId}
        onSelectSection={(nextSectionId) => setWorkspaceTarget(nextSectionId)}
        onOpenExercisesReview={() => setWorkspaceTarget('competitive-exercises-review')}
        onOpenTechniquesReview={() => setWorkspaceTarget('competitive-techniques-review')}

        onOpenConstructsReview={() => setWorkspaceTarget('competitive-constructs-review')}
        onBack={() => setWorkspaceTarget(null)}
        onLogout={handleLogout}
      />
    )
  }

  if (workspaceTarget === 'generator' || workspaceTarget === 'collection') {
    return (
      <CardWorkspace
        session={session}
        onLogout={handleLogout}
        initialView={workspaceTarget}
        onBackToMenu={() => setWorkspaceTarget('creative')}
      />
    )
  }

  if (workspaceTarget === 'creative-generator' || workspaceTarget === 'creative-collection') {
    const creativeView = workspaceTarget === 'creative-collection' ? 'collection' : 'generator'

    return (
      <CardWorkspace
        session={session}
        onLogout={handleLogout}
        initialView={creativeView}
        onBackToMenu={() => setWorkspaceTarget('creative')}
      />
    )
  }

  return (
    <MainMenu
      session={session}
      onOpenCreative={() => setWorkspaceTarget('creative')}
      onOpenCompetitive={() => setWorkspaceTarget('competitive')}
      onOpenMultiplayer={() => setWorkspaceTarget('multiplayer')}
      onLogout={handleLogout}
    />
  )
}

export default App

























