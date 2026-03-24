import { useCallback, useEffect, useMemo, useState } from 'react'
import { listPrivateCompetitiveTechniqueInventory } from './data/competitiveTechniquesRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { getTechniqueTaxonomy, getTechniqueTranslation, TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
import {
  buildTechniqueCompendium,
  buildTechniquePreview,
  getTechniqueBookMeta,
} from './lib/competitiveTechniqueCompendium'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function normalize(v) {
  return String(v || '').trim().toLowerCase()
}

export default function CompetitiveTechniquesCollection({ session, onBackToCompetitive, onOpenCatalog, onOpenEditor, onLogout }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [selectedBookId, setSelectedBookId] = useState(null)
  const [screen, setScreen] = useState('books')
  const [activeLanguage, setActiveLanguage] = useState('es')
  const [creatorNamesById, setCreatorNamesById] = useState({})
  const [subtopicFilter, setSubtopicFilter] = useState('')
  const [effectTypeFilter, setEffectTypeFilter] = useState('')
  const [nameSearch, setNameSearch] = useState('')

  const selected = items.find((row) => row.id === selectedId) || null
  const selectedTranslation = useMemo(() => getTechniqueTranslation(selected, activeLanguage), [activeLanguage, selected])

  const renderedEffectDescription = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selectedTranslation.effectDescription)),
    [selectedTranslation.effectDescription]
  )

  const renderedWorkedExample = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selectedTranslation.workedExample)),
    [selectedTranslation.workedExample]
  )

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const rows = await listPrivateCompetitiveTechniqueInventory(session.userId)
      setItems(rows)

      try {
        const creatorNames = await listProfileUsernamesByIds(rows.map((row) => row.created_by))
        setCreatorNamesById(creatorNames)
      } catch {
        setCreatorNamesById({})
      }
    } catch (err) {
      setError(err?.message || 'Could not load techniques collection.')
    } finally {
      setLoading(false)
    }
  }, [session.userId])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const subtopics = useMemo(
    () => [...new Set(items.map((row) => String(getTechniqueTaxonomy(row, activeLanguage).subtopic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items, activeLanguage]
  )

  const effectTypes = useMemo(
    () => [...new Set(items.map((row) => String(getTechniqueTaxonomy(row, activeLanguage).effectType || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items, activeLanguage]
  )

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
      const search = normalize(nameSearch)
      if (search) {
        const primaryName = activeLanguage === 'fr' ? row.name_fr || row.name : row.name || row.name_fr
        const haystack = [
          primaryName,
          getTechniqueTaxonomy(row, activeLanguage).topic,
          getTechniqueTaxonomy(row, activeLanguage).subtopic,
          getTechniqueTaxonomy(row, activeLanguage).effectType,
          buildTechniquePreview(row, activeLanguage, 260),
        ].map((value) => normalize(value)).join(' ')
        if (!haystack.includes(search)) return false
      }
      const taxonomy = getTechniqueTaxonomy(row, activeLanguage)
      if (subtopicFilter && normalize(taxonomy.subtopic) !== normalize(subtopicFilter)) return false
      if (effectTypeFilter && normalize(taxonomy.effectType) !== normalize(effectTypeFilter)) return false
      return true
    })
  }, [items, nameSearch, subtopicFilter, effectTypeFilter, activeLanguage])

  const books = useMemo(() => buildTechniqueCompendium(filteredItems, activeLanguage), [filteredItems, activeLanguage])
  const selectedBook = useMemo(() => books.find((book) => book.id === selectedBookId) || null, [books, selectedBookId])
  const isSearchMode = Boolean(normalize(nameSearch))
  const visibleTechniques = selectedBook?.items || []

  useEffect(() => {
    if (screen === 'books') return

    if (screen === 'techniques') {
      const hasBook = books.some((book) => book.id === selectedBookId)
      if (!hasBook) {
        setSelectedBookId(null)
        setScreen('books')
      }
      return
    }

    if (screen === 'detail') {
      const hasSelected = filteredItems.some((row) => row.id === selectedId)
      if (!hasSelected) {
        setSelectedId(null)
        setScreen(selectedBookId ? 'techniques' : 'books')
      }
    }
  }, [books, filteredItems, screen, selectedBookId, selectedId])

  const openBook = (bookId) => {
    setSelectedBookId(bookId)
    setSelectedId(null)
    setScreen('techniques')
  }

  const openTechnique = (item) => {
    setSelectedBookId(getTechniqueBookMeta(item, activeLanguage).id)
    setSelectedId(item.id)
    setScreen('detail')
  }

  const goBack = () => {
    if (screen === 'detail') {
      setScreen(selectedBookId ? 'techniques' : 'books')
      return
    }

    if (screen === 'techniques') {
      setSelectedId(null)
      setScreen('books')
    }
  }

  const resultsLabel = isSearchMode ? 'Search Results' : 'My Technique Books'
  const isBooksStage = screen === 'books' && !isSearchMode

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Techniques Collection</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
          <button type="button" className="btn session-logout" onClick={onOpenCatalog}>
            Open Techniques Catalog
          </button>
          <button type="button" className="btn session-logout" onClick={onOpenEditor}>
            Open Techniques Editor
          </button>
          <button type="button" className="btn session-logout" onClick={onBackToCompetitive}>
            Competitive Menu
          </button>
          <button type="button" className="btn session-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className={`competitive-layout ${isBooksStage ? 'is-books' : ''}`}>
        <div className="assets-panel">
          <div className="saved-title">{resultsLabel}</div>

          <div className="auth-tabs" style={{ marginBottom: 12 }}>
            {TECHNIQUE_LANGUAGE_OPTIONS.map((language) => (
              <button
                key={language.id}
                type="button"
                className={`auth-tab ${activeLanguage === language.id ? 'active' : ''}`}
                onClick={() => setActiveLanguage(language.id)}
              >
                {language.label}
              </button>
            ))}
          </div>

          <div className="collection-toolbar">
            <label className="field">
              <span>Name</span>
              <input
                value={nameSearch}
                onChange={(e) => {
                  setNameSearch(e.target.value)
                  setScreen('books')
                }}
                placeholder={activeLanguage === 'fr' ? 'Search French name' : 'Search Spanish name'}
              />
            </label>

            <label className="field">
              <span>Subtopic</span>
              <select value={subtopicFilter} onChange={(e) => setSubtopicFilter(e.target.value)}>
                <option value="">All</option>
                {subtopics.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Effect type</span>
              <select value={effectTypeFilter} onChange={(e) => setEffectTypeFilter(e.target.value)}>
                <option value="">All</option>
                {effectTypes.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <button type="button" className="btn" onClick={loadItems} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="saved-empty">
            {isSearchMode
              ? 'El buscador muestra tecnicas relacionadas en lugar de libros.'
              : 'Primero se muestran solo los libros-compendio para mantener la seccion limpia.'}
          </div>

          {!isBooksStage && <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading collection...</div>}
            {!loading && isSearchMode && filteredItems.length === 0 && <div className="saved-empty">No matching techniques found.</div>}
            {!loading && isSearchMode && filteredItems.map((item) => (
              <button key={item.id} type="button" className="technique-preview-card" onClick={() => openTechnique(item)}>
                {(() => {
                  const taxonomy = getTechniqueTaxonomy(item, activeLanguage)
                  return (
                    <>
                <div className="technique-preview-card-top">
                  <span className="technique-preview-card-type">{taxonomy.effectType || 'Technique'}</span>
                  <span className="technique-preview-card-meta">{taxonomy.topic || 'Sin tema'}</span>
                </div>
                <div className="technique-preview-card-title">{getTechniqueTranslation(item, activeLanguage).name || 'Untitled technique'}</div>
                <div className="technique-preview-card-body">{buildTechniquePreview(item, activeLanguage, 180)}</div>
                    </>
                  )
                })()}
              </button>
            ))}
          </div>}
        </div>

        <div className="panel">
          {screen !== 'books' && (
            <div className="saved-item-actions" style={{ marginBottom: 14 }}>
              <button type="button" className="btn" onClick={goBack}>
                Back
              </button>
            </div>
          )}

          {screen === 'books' && (
            <>
              {!isSearchMode && (
                <>
                  <div className="saved-title">Libros-Compendio</div>
                  <div className="saved-empty">Ordenados alfabeticamente y presentados a pantalla completa para una exploracion mas limpia.</div>
                  <div className="compendium-book-grid" style={{ marginTop: 16 }}>
                    {loading && <div className="saved-empty">Loading collection...</div>}
                    {!loading && books.length === 0 && <div className="saved-empty">No techniques in your collection yet.</div>}
                    {!loading && books.map((book) => (
                      <div key={book.id} className="saved-item compendium-book-card">
                        <div className="compendium-book-cover">
                          <div>
                            <div className="compendium-book-kicker">Collection Book</div>
                            <div className="compendium-book-title">{book.title}</div>
                          </div>
                          <div className="compendium-book-summary">
                            Tecnicas agrupadas por tema con acceso directo a sus vistas de consulta.
                          </div>
                          <div className="compendium-book-footer">
                            <div className="compendium-book-stats">
                              <div className="compendium-book-stat">{book.count} tecnicas</div>
                              <div className="compendium-book-stat">Subtopics: {book.subtopics.join(', ') || 'N/A'}</div>
                            </div>
                            <button type="button" className="btn" onClick={() => openBook(book.id)}>
                              Open Book
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {isSearchMode && (
                <>
                  <div className="saved-title">Search Results</div>
                  <div className="saved-empty">Selecciona una tecnica del buscador para abrir su detalle.</div>
                </>
              )}
            </>
          )}

          {screen === 'techniques' && selectedBook && (
            <>
              <div className="saved-title">Techniques In {selectedBook.title}</div>
              <div className="saved-empty">Esta pantalla muestra solo las tecnicas del libro seleccionado.</div>

              <div className="technique-card-grid" style={{ marginTop: 12 }}>
                {visibleTechniques.map((item) => {
                  const translation = getTechniqueTranslation(item, activeLanguage)
                  const taxonomy = getTechniqueTaxonomy(item, activeLanguage)

                  return (
                    <button key={item.id} type="button" className="technique-preview-card" onClick={() => openTechnique(item)}>
                      <div className="technique-preview-card-top">
                        <span className="technique-preview-card-type">{taxonomy.effectType || 'Technique'}</span>
                        <span className="technique-preview-card-meta">{taxonomy.subtopic || 'General'}</span>
                      </div>
                      <div className="technique-preview-card-title">{translation.name || 'Untitled technique'}</div>
                      <div className="technique-preview-card-body">{buildTechniquePreview(item, activeLanguage, 220)}</div>
                      <div className="technique-preview-card-footer">
                        <span>{item.is_owner_copy ? 'Own approved' : 'Collection copy'}</span>
                        <span>{formatDate(item.collected_at)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {screen === 'detail' && selected && (
            <>
              <div className="saved-title">Technique Detail</div>
              <div className="saved-item-date">Added: {formatDate(selected.collected_at)}</div>
              <div className="saved-item-tags">Source: {selected.collection_source || 'copied'}</div>
              <div className="saved-item-tags">
                Scope: {selected.is_owner_copy ? 'My approved technique' : 'My collection copy'}
              </div>
              <div className="saved-item-tags">
                Original author: {creatorNamesById[selected.created_by] || selected.created_by || 'Unknown'}
              </div>
              {selected.created_by && selected.created_by !== session.userId && (
                <div className="saved-item-tags">This copy belongs to another creator's approved technique.</div>
              )}
              <div className="saved-item-tags">Approved for collection usage</div>

              <div className="auth-tabs" style={{ marginTop: 12 }}>
                {TECHNIQUE_LANGUAGE_OPTIONS.map((language) => (
                  <button
                    key={language.id}
                    type="button"
                    className={`auth-tab ${activeLanguage === language.id ? 'active' : ''}`}
                    onClick={() => setActiveLanguage(language.id)}
                  >
                    {language.label}
                  </button>
                ))}
              </div>

              <div className="collection-toolbar" style={{ marginTop: 12 }}>
                <div className="saved-title">Technique</div>
                {(() => {
                  const taxonomy = getTechniqueTaxonomy(selected, activeLanguage)
                  return (
                    <>
                <div className="saved-empty">Name: {selectedTranslation.name || 'N/A'}</div>
                <div className="saved-empty">Topic: {taxonomy.topic || 'N/A'} / {taxonomy.subtopic || 'N/A'}</div>
                <div className="saved-empty">Effect type: {taxonomy.effectType || 'N/A'}</div>
                    </>
                  )
                })()}
              </div>

              <label className="field">
                <span>Effect description</span>
                <div className="rt-editor" style={{ minHeight: 160 }}>
                  <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedEffectDescription }} />
                </div>
              </label>

              <label className="field">
                <span>Worked example</span>
                <div className="rt-editor" style={{ minHeight: 160 }}>
                  <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedWorkedExample }} />
                </div>
              </label>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
