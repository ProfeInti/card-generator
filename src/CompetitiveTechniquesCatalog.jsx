import { useCallback, useEffect, useMemo, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import {
  addTechniqueCatalogEntryToStudentCollection,
  archiveTechniqueCatalogEntryAsTeacher,
  deleteTechniqueCatalogEntryAsTeacher,
  listGlobalCompetitiveTechniqueCatalog,
  updateTechniqueCatalogEntryAsTeacher,
} from './data/competitiveTechniquesRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { getTechniqueTranslation, TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
import { hasMeaningfulHtmlContent, normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'

function buildCatalogForm(row) {
  return {
    name: String(row?.name || ''),
    nameFr: String(row?.name_fr || ''),
    topic: String(row?.topic || ''),
    subtopic: String(row?.subtopic || ''),
    effectType: String(row?.effect_type || ''),
    effectDescription: normalizeMathHtmlInput(row?.effect_description || ''),
    effectDescriptionFr: normalizeMathHtmlInput(row?.effect_description_fr || ''),
    workedExample: normalizeMathHtmlInput(row?.worked_example || ''),
    workedExampleFr: normalizeMathHtmlInput(row?.worked_example_fr || ''),
  }
}

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
  const [teacherEditLanguage, setTeacherEditLanguage] = useState('es')
  const [teacherEditForm, setTeacherEditForm] = useState(null)
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
      const rows = await listGlobalCompetitiveTechniqueCatalog()
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

  useEffect(() => {
    setTeacherEditForm(selected ? buildCatalogForm(selected) : null)
    setTeacherEditLanguage('es')
  }, [selectedId, selected])

  const handleTeacherDelete = async (technique) => {
    if (!isTeacher || !technique?.catalog_id) return
    if (!window.confirm(`Delete approved technique "${technique.name || 'Untitled technique'}" from the global catalog?`)) return

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      await deleteTechniqueCatalogEntryAsTeacher(technique.catalog_id)
      if (selectedId === technique.id) setSelectedId(null)
      await loadItems()
      setNotice('Technique deleted from the catalog.')
    } catch (err) {
      const isRestrictedDelete = err?.code === '23503' || /violates foreign key constraint|reference|restrict/i.test(String(err?.message || ''))

      if (isRestrictedDelete) {
        try {
          await archiveTechniqueCatalogEntryAsTeacher(technique.catalog_id)
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
    if (!technique?.catalog_id) return

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      await addTechniqueCatalogEntryToStudentCollection(session.userId, technique.catalog_id)
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

  const handleTeacherCatalogFieldChange = (key, value) => {
    setTeacherEditForm((prev) => (
      prev
        ? {
            ...prev,
            [key]: value,
          }
        : prev
    ))
  }

  const handleTeacherSave = async () => {
    if (!isTeacher || !selected?.catalog_id || !teacherEditForm) return

    if (!String(teacherEditForm.name || '').trim()) {
      setError('Spanish technique name is required.')
      setNotice('')
      return
    }

    if (!hasMeaningfulHtmlContent(teacherEditForm.effectDescription)) {
      setError('Spanish effect description is required.')
      setNotice('')
      return
    }

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      await updateTechniqueCatalogEntryAsTeacher(selected.catalog_id, {
        name: String(teacherEditForm.name || '').trim(),
        name_fr: String(teacherEditForm.nameFr || '').trim() || null,
        topic: String(teacherEditForm.topic || '').trim() || null,
        subtopic: String(teacherEditForm.subtopic || '').trim() || null,
        effect_type: String(teacherEditForm.effectType || '').trim() || null,
        effect_description: String(teacherEditForm.effectDescription || '').trim(),
        effect_description_fr: String(teacherEditForm.effectDescriptionFr || '').trim() || null,
        worked_example: String(teacherEditForm.workedExample || '').trim() || null,
        worked_example_fr: String(teacherEditForm.workedExampleFr || '').trim() || null,
        reviewed_by: session.userId,
      })
      await loadItems()
      setNotice('Technique catalog entry updated.')
    } catch (err) {
      setError(err?.message || 'Could not update technique in catalog.')
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

          <div className="saved-empty">This section shows the approved techniques shared across all accounts.</div>

          <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading catalog...</div>}
            {!loading && filteredItems.length === 0 && <div className="saved-empty">No approved techniques for current filters.</div>}
            {!loading && filteredItems.map((item) => (
              <div key={item.id} className="saved-item">
                <div className="saved-item-name">{getTechniqueTranslation(item, activeLanguage).name || 'Untitled technique'}</div>
                <div className="saved-item-tags">ES: {item.name || 'N/A'}</div>
                <div className="saved-item-tags">FR: {item.name_fr || item.name || 'N/A'}</div>
                <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                <div className="saved-item-tags">Creator: {creatorNamesById[item.created_by] || item.created_by || 'Unknown'}</div>
                <div className="saved-item-tags">Topic: {item.topic || 'N/A'} / {item.subtopic || 'N/A'}</div>
                {!item.has_catalog_entry && <div className="saved-item-tags">Pending catalog materialization</div>}
                <div className="saved-item-actions">
                  <button type="button" className="btn" onClick={() => setSelectedId(item.id)}>
                    View
                  </button>
                  <button type="button" className="btn" onClick={() => handleCopyToCollection(item)} disabled={actionLoading || !item.has_catalog_entry}>
                    {actionLoading ? 'Processing...' : 'Copy'}
                  </button>
                  {isTeacher && (
                    <button type="button" className="btn danger" onClick={() => handleTeacherDelete(item)} disabled={actionLoading || !item.has_catalog_entry}>
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
              {!selected.has_catalog_entry && <div className="saved-item-tags">This approved technique has not been materialized into the catalog table yet.</div>}

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
                <button type="button" className="btn" onClick={() => handleCopyToCollection(selected)} disabled={actionLoading || !selected.has_catalog_entry}>
                  {actionLoading ? 'Processing...' : 'Copy to My Collection'}
                </button>
                {isTeacher && (
                  <>
                    <button type="button" className="btn" onClick={handleTeacherSave} disabled={actionLoading || !selected.has_catalog_entry || !teacherEditForm}>
                      {actionLoading ? 'Processing...' : 'Save Catalog Changes'}
                    </button>
                    <button type="button" className="btn danger" onClick={() => handleTeacherDelete(selected)} disabled={actionLoading || !selected.has_catalog_entry}>
                      {actionLoading ? 'Processing...' : 'Delete Technique'}
                    </button>
                  </>
                )}
              </div>

              {isTeacher && teacherEditForm && selected.has_catalog_entry && (
                <div className="collection-toolbar" style={{ marginTop: 12 }}>
                  <div className="saved-title">Teacher Catalog Edit</div>
                  <div className="saved-empty">Teachers can directly update the approved catalog entry in both languages.</div>

                  <div className="competitive-grid">
                    <label className="field">
                      <span>Topic</span>
                      <input value={teacherEditForm.topic} onChange={(e) => handleTeacherCatalogFieldChange('topic', e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Subtopic</span>
                      <input value={teacherEditForm.subtopic} onChange={(e) => handleTeacherCatalogFieldChange('subtopic', e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Effect type</span>
                      <input value={teacherEditForm.effectType} onChange={(e) => handleTeacherCatalogFieldChange('effectType', e.target.value)} />
                    </label>
                  </div>

                  <div className="auth-tabs" style={{ marginTop: 8 }}>
                    {TECHNIQUE_LANGUAGE_OPTIONS.map((language) => (
                      <button
                        key={language.id}
                        type="button"
                        className={`auth-tab ${teacherEditLanguage === language.id ? 'active' : ''}`}
                        onClick={() => setTeacherEditLanguage(language.id)}
                      >
                        {language.label}
                      </button>
                    ))}
                  </div>

                  <label className="field">
                    <span>Name {teacherEditLanguage === 'es' ? '*' : ''}</span>
                    <input
                      value={teacherEditLanguage === 'fr' ? teacherEditForm.nameFr : teacherEditForm.name}
                      onChange={(e) => handleTeacherCatalogFieldChange(teacherEditLanguage === 'fr' ? 'nameFr' : 'name', e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Effect description {teacherEditLanguage === 'es' ? '*' : ''}</span>
                    <DescriptionEditor
                      value={teacherEditLanguage === 'fr' ? teacherEditForm.effectDescriptionFr : teacherEditForm.effectDescription}
                      onChange={(value) => handleTeacherCatalogFieldChange(teacherEditLanguage === 'fr' ? 'effectDescriptionFr' : 'effectDescription', value)}
                      baseFontFamily={EDITOR_FONT_FAMILY}
                      baseFontSize={18}
                    />
                  </label>

                  <label className="field">
                    <span>Worked example</span>
                    <DescriptionEditor
                      value={teacherEditLanguage === 'fr' ? teacherEditForm.workedExampleFr : teacherEditForm.workedExample}
                      onChange={(value) => handleTeacherCatalogFieldChange(teacherEditLanguage === 'fr' ? 'workedExampleFr' : 'workedExample', value)}
                      baseFontFamily={EDITOR_FONT_FAMILY}
                      baseFontSize={18}
                    />
                  </label>
                </div>
              )}
            </>
          )}

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}
        </div>
      </div>
    </div>
  )
}
