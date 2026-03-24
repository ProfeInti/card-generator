import { useCallback, useEffect, useMemo, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import {
  addTechniqueCatalogEntryToStudentCollection,
  archiveTechniqueCatalogEntryAsTeacher,
  listGlobalCompetitiveTechniqueCatalog,
  removeCompetitiveTechniqueFromGlobalCatalogAsTeacher,
  updateTechniqueCatalogEntryAsTeacher,
} from './data/competitiveTechniquesRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { getTechniqueTaxonomy, getTechniqueTranslation, TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
import {
  buildTechniqueCompendium,
  buildTechniquePreview,
  getTechniqueBookMeta,
} from './lib/competitiveTechniqueCompendium'
import {
  getTechniqueEffectTypeOptions,
  getTechniqueSubtopicOptions,
  getTechniqueTaxonomyNotes,
  getTechniqueTaxonomySelection,
  getTechniqueTopicOptions,
  resolveTechniqueTaxonomyFromIds,
} from './lib/competitiveTechniqueTaxonomy'
import { hasMeaningfulHtmlContent, normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'

function buildCatalogForm(row) {
  const taxonomySelection = getTechniqueTaxonomySelection(row, { fallbackPending: true })
  return {
    name: String(row?.name || ''),
    nameFr: String(row?.name_fr || ''),
    topicId: String(taxonomySelection.topicId || ''),
    subtopicId: String(taxonomySelection.subtopicId || ''),
    effectTypeId: String(taxonomySelection.effectTypeId || ''),
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
  const [selectedBookId, setSelectedBookId] = useState(null)
  const [screen, setScreen] = useState('books')
  const [activeLanguage, setActiveLanguage] = useState('es')
  const [creatorNamesById, setCreatorNamesById] = useState({})
  const [actionLoading, setActionLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [teacherEditLanguage, setTeacherEditLanguage] = useState('es')
  const [teacherEditForm, setTeacherEditForm] = useState(null)
  const [subtopicFilter, setSubtopicFilter] = useState('')
  const [effectTypeFilter, setEffectTypeFilter] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const isTeacher = session.role === 'teacher'
  const taxonomyNotes = useMemo(() => getTechniqueTaxonomyNotes(), [])
  const teacherTopicOptions = useMemo(() => getTechniqueTopicOptions(activeLanguage), [activeLanguage])
  const teacherSubtopicOptions = useMemo(() => getTechniqueSubtopicOptions(teacherEditForm?.topicId, activeLanguage), [teacherEditForm?.topicId, activeLanguage])
  const teacherEffectTypeOptions = useMemo(() => getTechniqueEffectTypeOptions(activeLanguage), [activeLanguage])

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
    } catch (err) {
      setError(err?.message || 'Could not load approved techniques catalog.')
    } finally {
      setLoading(false)
    }
  }, [])

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
  const isBooksStage = screen === 'books' && !isSearchMode

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

  useEffect(() => {
    setTeacherEditForm(selected ? buildCatalogForm(selected) : null)
    setTeacherEditLanguage('es')
  }, [selectedId, selected])

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

  const handleTeacherDelete = async (technique) => {
    if (!isTeacher || !technique?.id) return
    if (!window.confirm(`Delete approved technique "${technique.name || 'Untitled technique'}" from the global catalog?`)) return

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      await removeCompetitiveTechniqueFromGlobalCatalogAsTeacher({
        catalogId: technique.catalog_id,
        orphanedProposalId: technique.orphaned_proposal_id,
        legacyTechniqueId: technique.legacy_technique_id,
        teacherUserId: session.userId,
      })
      if (selectedId === technique.id) setSelectedId(null)
      await loadItems()
      setNotice('Technique deleted from the catalog.')
    } catch (err) {
      const isRestrictedDelete = err?.code === '23503' || /violates foreign key constraint|reference|restrict/i.test(String(err?.message || ''))

      if (isRestrictedDelete && technique.catalog_id) {
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
    setTeacherEditForm((prev) => {
      if (!prev) return prev
      if (key === 'topicId') {
        return {
          ...prev,
          topicId: value,
          subtopicId: '',
        }
      }
      return { ...prev, [key]: value }
    })
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

    if (!teacherEditForm.topicId || !teacherEditForm.subtopicId || !teacherEditForm.effectTypeId) {
      setError('Topic, subtopic, and effect type are required in both Spanish and French.')
      setNotice('')
      return
    }

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      const taxonomy = resolveTechniqueTaxonomyFromIds(teacherEditForm)
      await updateTechniqueCatalogEntryAsTeacher(selected.catalog_id, {
        name: String(teacherEditForm.name || '').trim(),
        name_fr: String(teacherEditForm.nameFr || '').trim() || null,
        topic: String(taxonomy.topic || '').trim() || null,
        topic_fr: String(taxonomy.topicFr || '').trim() || null,
        subtopic: String(taxonomy.subtopic || '').trim() || null,
        subtopic_fr: String(taxonomy.subtopicFr || '').trim() || null,
        effect_type: String(taxonomy.effectType || '').trim() || null,
        effect_type_fr: String(taxonomy.effectTypeFr || '').trim() || null,
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

      <div className={`competitive-layout ${isBooksStage ? 'is-books' : ''}`}>
        <div className="assets-panel">
          <div className="saved-title">{isSearchMode ? 'Search Results' : 'Catalog Books'}</div>

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
              ? 'El buscador muestra tecnicas del catalogo relacionadas.'
              : 'Primero se muestran solo los libros-compendio del catalogo para evitar saturacion.'}
          </div>

          {!isBooksStage && <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading catalog...</div>}
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
                  <div className="saved-title">Catalog Books</div>
                  <div className="saved-empty">Ordenados alfabeticamente y desplegados a pantalla completa para una navegacion mas elegante.</div>
                  <div className="compendium-book-grid" style={{ marginTop: 16 }}>
                    {loading && <div className="saved-empty">Loading catalog...</div>}
                    {!loading && books.length === 0 && <div className="saved-empty">No approved techniques for current filters.</div>}
                    {!loading && books.map((book) => (
                      <div key={book.id} className="saved-item compendium-book-card">
                        <div className="compendium-book-cover">
                          <div>
                            <div className="compendium-book-kicker">Global Catalog</div>
                            <div className="compendium-book-title">{book.title}</div>
                          </div>
                          <div className="compendium-book-summary">
                            Compendio tematico con tecnicas aprobadas y disponibles para consulta o copia.
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
                        <span>{creatorNamesById[item.created_by] || item.created_by || 'Unknown'}</span>
                        <span>{item.has_catalog_entry ? 'Ready' : 'Pending'}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {screen === 'detail' && selected && (
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

              <div className="saved-item-actions">
                <button type="button" className="btn" onClick={() => handleCopyToCollection(selected)} disabled={actionLoading || !selected.has_catalog_entry}>
                  {actionLoading ? 'Processing...' : 'Copy to My Collection'}
                </button>
                {isTeacher && (
                  <>
                    <button type="button" className="btn" onClick={handleTeacherSave} disabled={actionLoading || !selected.has_catalog_entry || !teacherEditForm}>
                      {actionLoading ? 'Processing...' : 'Save Catalog Changes'}
                    </button>
                    <button type="button" className="btn danger" onClick={() => handleTeacherDelete(selected)} disabled={actionLoading}>
                      {actionLoading ? 'Processing...' : 'Delete Technique'}
                    </button>
                  </>
                )}
              </div>

              {isTeacher && teacherEditForm && selected.has_catalog_entry && (
                <div className="collection-toolbar" style={{ marginTop: 12 }}>
                  <div className="saved-title">Teacher Catalog Edit</div>
                  <div className="saved-empty">Teachers can directly update the approved catalog entry in both languages.</div>
                  <div className="saved-empty">Topics canonicos: {taxonomyNotes.topics}</div>
                  <div className="saved-empty">Effect types canonicos: {taxonomyNotes.effectTypes}</div>

                  <div className="competitive-grid">
                    <label className="field">
                      <span>Topic</span>
                      <select value={teacherEditForm.topicId} onChange={(e) => handleTeacherCatalogFieldChange('topicId', e.target.value)}>
                        <option value="">Select topic</option>
                        {teacherTopicOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Subtopic</span>
                      <select value={teacherEditForm.subtopicId} onChange={(e) => handleTeacherCatalogFieldChange('subtopicId', e.target.value)} disabled={!teacherEditForm.topicId}>
                        <option value="">{teacherEditForm.topicId ? 'Select subtopic' : 'Select topic first'}</option>
                        {teacherSubtopicOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Effect type</span>
                      <select value={teacherEditForm.effectTypeId} onChange={(e) => handleTeacherCatalogFieldChange('effectTypeId', e.target.value)}>
                        <option value="">Select effect type</option>
                        {teacherEffectTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
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
