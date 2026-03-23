import { useCallback, useEffect, useMemo, useState } from 'react'
import { listPrivateCompetitiveTechniqueInventory } from './data/competitiveTechniquesRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { getTechniqueTranslation, TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
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
  const [activeLanguage, setActiveLanguage] = useState('es')
  const [creatorNamesById, setCreatorNamesById] = useState({})

  const [topicFilter, setTopicFilter] = useState('')
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

      if (!selectedId && rows.length > 0) {
        setSelectedId(rows[0].id)
      }

      if (selectedId && !rows.some((row) => row.id === selectedId)) {
        setSelectedId(rows[0]?.id ?? null)
      }
    } catch (err) {
      setError(err?.message || 'Could not load techniques collection.')
    } finally {
      setLoading(false)
    }
  }, [selectedId, session.userId])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const topics = useMemo(
    () => [...new Set(items.map((row) => String(row.topic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const subtopics = useMemo(
    () => [...new Set(items.map((row) => String(row.subtopic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const effectTypes = useMemo(
    () => [...new Set(items.map((row) => String(row.effect_type || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
      const search = normalize(nameSearch)
      if (search) {
        const primaryName = activeLanguage === 'fr' ? row.name_fr || row.name : row.name || row.name_fr
        const haystack = [primaryName].map((value) => normalize(value)).join(' ')
        if (!haystack.includes(search)) return false
      }
      if (topicFilter && normalize(row.topic) !== normalize(topicFilter)) return false
      if (subtopicFilter && normalize(row.subtopic) !== normalize(subtopicFilter)) return false
      if (effectTypeFilter && normalize(row.effect_type) !== normalize(effectTypeFilter)) return false
      return true
    })
  }, [items, nameSearch, topicFilter, subtopicFilter, effectTypeFilter, activeLanguage])

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

      <div className="competitive-layout">
        <div className="assets-panel">
          <div className="saved-title">My Approved Techniques</div>

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
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder={activeLanguage === 'fr' ? 'Search French name' : 'Search Spanish name'}
              />
            </label>

            <label className="field">
              <span>Topic</span>
              <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="">All</option>
                {topics.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
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

          <div className="saved-empty">This collection includes your approved techniques plus approved copies you collected from the global catalog.</div>

          <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading collection...</div>}
            {!loading && filteredItems.length === 0 && <div className="saved-empty">No techniques in your collection yet.</div>}
            {!loading && filteredItems.map((item) => (
              <div key={item.id} className="saved-item">
                <div className="saved-item-name">{getTechniqueTranslation(item, activeLanguage).name || 'Untitled technique'}</div>
                <div className="saved-item-tags">ES: {item.name || 'N/A'}</div>
                <div className="saved-item-tags">FR: {item.name_fr || item.name || 'N/A'}</div>
                <div className="saved-item-date">Added: {formatDate(item.collected_at)}</div>
                <div className="saved-item-tags">
                  Scope: {item.is_owner_copy ? 'My approved technique' : 'My collection copy'}
                </div>
                <div className="saved-item-tags">
                  Original author: {creatorNamesById[item.created_by] || item.created_by || 'Unknown'}
                </div>
                {item.created_by && item.created_by !== session.userId && (
                  <div className="saved-item-tags">Copied from another creator</div>
                )}
                <div className="saved-item-tags">Topic: {item.topic || 'N/A'} / {item.subtopic || 'N/A'}</div>
                <button type="button" className="btn" onClick={() => setSelectedId(item.id)}>
                  View
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          {!selected && <div className="saved-empty">Select a technique from your collection.</div>}

          {selected && (
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
                <div className="saved-empty">Name: {selectedTranslation.name || 'N/A'}</div>
                <div className="saved-empty">Topic: {selected.topic || 'N/A'} / {selected.subtopic || 'N/A'}</div>
                <div className="saved-empty">Effect type: {selected.effect_type || 'N/A'}</div>
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
