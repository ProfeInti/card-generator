import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import { renderMathInHtml } from './lib/mathHtml'
import {
  DEFAULTS,
  DEFAULT_ART_DATA_URL,
  DESCRIPTION_ALIGN_OPTIONS,
  DIFFICULTY_SUGGESTIONS,
  EFFECT_TYPE_SUGGESTIONS,
  FONT_OPTIONS,
  FRAMES,
  RARITY_SUGGESTIONS,
  SUBTHEME_SUGGESTIONS,
  THEME_SUGGESTIONS,
  decodeUnicodeEscapes,
  normalizeMetaForDb,
  normalizeTagsForDb,
  parseTags,
  sanitizeMetaText,
  tagsToInputValue,
  toCardResponse,
  toNumber,
} from './lib/cardWorkspace'
import { createLocalId, readLocalJson, writeLocalJson } from './lib/localStore'
import * as htmlToImage from 'html-to-image'
import jsPDF from 'jspdf'

const USER_CARDS_STORAGE_KEY = 'inticore-user-cards'

function readStoredCards() {
  return Array.isArray(readLocalJson(USER_CARDS_STORAGE_KEY, [])) ? readLocalJson(USER_CARDS_STORAGE_KEY, []) : []
}

function writeStoredCards(rows) {
  writeLocalJson(USER_CARDS_STORAGE_KEY, Array.isArray(rows) ? rows : [])
}

export default function CardWorkspace({ session, onLogout, initialView = 'generator', onBackToMenu }) {
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

  const frame = FRAMES.find((f) => f.id === frameId)?.src ?? FRAMES[0]?.src
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

  const loadSavedCards = useCallback(async () => {
    console.log('[cards] load start', { userId: session.userId })
    setLoadingCards(true)

    try {
      const normalized = readStoredCards()
        .filter((row) => row.user_id === session.userId)
        .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')))
        .map(toCardResponse)

      setSavedCards(normalized)
      console.log('[cards] load done', { userId: session.userId, count: normalized.length })
    } catch (err) {
      console.error('[cards] load error', err)
      alert(err?.message || 'Could not load saved cards.')
    } finally {
      console.log('[cards] setLoadingCards(false)')
      setLoadingCards(false)
    }
  }, [session.userId])

  useEffect(() => {
    if (activeView !== 'collection') return
    loadSavedCards()
  }, [activeView, loadSavedCards])

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
        id: createLocalId('user-card'),
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

      const storedCards = readStoredCards()
      const existingCard = storedCards.find((row) => row.user_id === session.userId && row.name === name) || null
      const nextCard = existingCard
        ? {
            ...existingCard,
            ...payload,
            id: existingCard.id,
            created_at: existingCard.created_at || now,
          }
        : {
            ...payload,
            created_at: now,
          }

      writeStoredCards(
        existingCard
          ? storedCards.map((row) => (row.id === existingCard.id ? nextCard : row))
          : [nextCard, ...storedCards]
      )

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
      const storedCard = readStoredCards().find((row) => row.id === card.id && row.user_id === session.userId) || null
      if (!storedCard) {
        throw new Error('Could not load card for editing.')
      }

      const normalized = toCardResponse(storedCard)
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
      writeStoredCards(
        readStoredCards().filter((row) => !(row.id === id && row.user_id === session.userId))
      )
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

