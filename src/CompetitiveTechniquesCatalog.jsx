import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addTechniqueCatalogEntryToStudentCollection,
  archiveTechniqueCatalogEntryAsTeacher,
  deleteTechniqueCatalogEntryAsTeacher,
  listApprovedTechniqueCatalogEntries,
} from './data/competitiveTechniquesRepo'
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

export default function CompetitiveTechniquesCatalog({ session, onBackToCompetitive, onOpenCollection, onOpenEditor, onLogout }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [activeLanguage, setActiveLanguage] = useState('es')
  const [creatorNamesById, setCreatorNamesById] = useState({})
  const [actionLoading, setActionLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const isTeacher = session.role === 'teacher'

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
      const rows = await listApprovedTechniqueCatalogEntries()
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
      setError(err?.message || 'Could not load approved techniques catalog.')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

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
        const haystack = [row.name, row.name_fr].map((value) => normalize(value)).join(' ')
        if (!haystack.includes(search)) return false
      }
      if (topicFilter && normalize(row.topic) !== normalize(topicFilter)) return false
      if (subtopicFilter && normalize(row.subtopic) !== normalize(subtopicFilter)) return false
      if (effectTypeFilter && normalize(row.effect_type) !== normalize(effectTypeFilter)) return false
      return true
    })
  }, [items, nameSearch, topicFilter, subtopicFilter, effectTypeFilter])

  const handleTeacherDelete = async (technique) => {
    if (!isTeacher || !technique?.id) return
    if (!window.confirm(`Delete approved technique "${technique.name || 'Untitled technique'}" from the global catalog?`)) return

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      await deleteTechniqueCatalogEntryAsTeacher(technique.id)
      if (selectedId === technique.id) setSelectedId(null)
      await loadItems()
      setNotice('Technique deleted from the catalog.')
    } catch (err) {
      const isRestrictedDelete = err?.code === '23503' || /violates foreign key constraint|reference|restrict/i.test(String(err?.message || ''))

      if (isRestrictedDelete) {
        try {
          await archiveTechniqueCatalogEntryAsTeacher(technique.id)
          if (selectedId === technique.id) setSelectedId(null)
          await loadItems()
          setNotice('Technique was archived and removed from the active catalog.')
        } catch (archiveErr) {
          setError(archiveErr?.message || 'Could not remove technique from catalog.')
        }
      } else {
        setError(err?.message || 'Could not delete technique from catalog.')
      }
    } finally {
      setActionLoading(false)
    }
  }

  const handleCopyToCollection = async (technique) => {
    if (!technique?.id) return

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      await addTechniqueCatalogEntryToStudentCollection(session.userId, technique.id)
      setNotice('Technique added to your collection.')
    } catch (err) {
      const isDuplicate = err?.code === '23505' || /duplicate key/i.test(String(err?.message || ''))
      if (isDuplicate) {
        setNotice('This technique is already in your collection.')
      } else {
        setError(err?.message || 'Could not copy technique to your collection.')
      }
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Techniques Catalog</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
          <button type="button" className="btn session-logout" onClick={onOpenCollection}>
            Open My Collection
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
          <div className="saved-title">Approved Global Catalog</div>

          <div className="collection-toolbar">
            <label className="field">
              <span>Name</span>
              <input
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder="Search ES or FR name"
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

          <div className="saved-empty">This section shows the approved techniques shared across all accounts.</div>

          <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading catalog...</div>}
            {!loading && filteredItems.length === 0 && <div className="saved-empty">No approved techniques for current filters.</div>}
            {!loading && filteredItems.map((item) => (
              <div key={item.id} className="saved-item">
                <div className="saved-item-name">{item.name || 'Untitled technique'}</div>
                {item.name_fr && <div className="saved-item-tags">FR: {item.name_fr}</div>}
                <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                <div className="saved-item-tags">Creator: {creatorNamesById[item.created_by] || item.created_by || 'Unknown'}</div>
                <div className="saved-item-tags">Topic: {item.topic || 'N/A'} / {item.subtopic || 'N/A'}</div>
                <div className="saved-item-actions">
                  <button type="button" className="btn" onClick={() => setSelectedId(item.id)}>
                    View
                  </button>
                  <button type="button" className="btn" onClick={() => handleCopyToCollection(item)} disabled={actionLoading}>
                    {actionLoading ? 'Processing...' : 'Copy'}
                  </button>
                  {isTeacher && (
                    <button type="button" className="btn danger" onClick={() => handleTeacherDelete(item)} disabled={actionLoading}>
                      {actionLoading ? 'Processing...' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          {!selected && <div className="saved-empty">Select an approved technique from the global catalog.</div>}

          {selected && (
            <>
              <div className="saved-title">Catalog Detail</div>
              <div className="saved-item-date">Updated: {formatDate(selected.updated_at)}</div>
              <div className="saved-item-tags">Status: {selected.status}</div>
              <div className="saved-item-tags">Creator: {creatorNamesById[selected.created_by] || selected.created_by || 'Unknown'}</div>
              <div className="saved-item-tags">Scope: Global approved catalog</div>

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

              <div className="saved-item-actions">
                <button type="button" className="btn" onClick={() => handleCopyToCollection(selected)} disabled={actionLoading}>
                  {actionLoading ? 'Processing...' : 'Copy to My Collection'}
                </button>
                {isTeacher && (
                  <button type="button" className="btn danger" onClick={() => handleTeacherDelete(selected)} disabled={actionLoading}>
                    {actionLoading ? 'Processing...' : 'Delete Technique'}
                  </button>
                )}
              </div>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}
        </div>
      </div>
    </div>
  )
}
