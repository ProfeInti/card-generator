import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import {
  createCompetitiveTechniqueProposal,
  deleteOwnCompetitiveTechniqueProposal,
  listEditableCompetitiveTechniqueProposals,
  updateOwnCompetitiveTechniqueProposal,
} from './data/competitiveTechniquesRepo'
import { getTechniqueTaxonomy, getTechniqueTranslation, TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
import {
  buildTechniqueCompendium,
  buildTechniquePreview,
  getTechniqueBookMeta,
} from './lib/competitiveTechniqueCompendium'
import {
  canonicalizeTechniqueTaxonomyInput,
  getTechniqueEffectTypeOptions,
  getTechniqueSubtopicOptions,
  getTechniqueTaxonomyNotes,
  getTechniqueTaxonomySelection,
  getTechniqueTopicOptions,
  resolveTechniqueTaxonomyFromIds,
} from './lib/competitiveTechniqueTaxonomy'
import { hasMeaningfulHtmlContent, normalizeMathHtmlInput } from './lib/mathHtml'
import {
  buildTechniquesTemplateJson,
  downloadJsonFile,
  normalizeCompetitiveRichField,
  parseJsonFile,
  toAllowedStatus,
} from './lib/competitiveJson'

const STATUS_OPTIONS = ['draft', 'proposed', 'approved', 'rejected']
const STUDENT_STATUS_OPTIONS = ['draft', 'proposed']

const EMPTY_TRANSLATIONS = {
  es: { name: '', effectDescription: '', workedExample: '' },
  fr: { name: '', effectDescription: '', workedExample: '' },
}

function toInputValue(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function buildTechniqueImportKey(values) {
  return [values?.name, values?.topic, values?.subtopic, values?.effectType || values?.effect_type].map(normalizeKey).join('||')
}

function buildEmptyForm() {
  return {
    status: 'draft',
    topicId: '',
    subtopicId: '',
    effectTypeId: '',
    translations: {
      es: { ...EMPTY_TRANSLATIONS.es },
      fr: { ...EMPTY_TRANSLATIONS.fr },
    },
  }
}

function toFormState(row, role) {
  if (!row || typeof row !== 'object') return buildEmptyForm()
  const taxonomySelection = getTechniqueTaxonomySelection(row, { fallbackPending: true })

  return {
    status: (role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS).includes(row.status) ? row.status : 'draft',
    topicId: toInputValue(taxonomySelection.topicId),
    subtopicId: toInputValue(taxonomySelection.subtopicId),
    effectTypeId: toInputValue(taxonomySelection.effectTypeId),
    translations: {
      es: {
        name: toInputValue(row.name),
        effectDescription: normalizeMathHtmlInput(row.effect_description),
        workedExample: normalizeMathHtmlInput(row.worked_example),
      },
      fr: {
        name: toInputValue(row.name_fr),
        effectDescription: normalizeMathHtmlInput(row.effect_description_fr),
        workedExample: normalizeMathHtmlInput(row.worked_example_fr),
      },
    },
  }
}

function toNullableText(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function toPayload(form, userId, role) {
  const allowedStatuses = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS
  const status = allowedStatuses.includes(form.status) ? form.status : 'draft'
  const spanish = form.translations?.es || EMPTY_TRANSLATIONS.es
  const french = form.translations?.fr || EMPTY_TRANSLATIONS.fr
  const taxonomy = resolveTechniqueTaxonomyFromIds(form)

  return {
    created_by: userId,
    status,
    reviewed_by: role === 'teacher' && (status === 'approved' || status === 'rejected') ? userId : null,
    approved_at: role === 'teacher' && status === 'approved' ? new Date().toISOString() : null,
    name: String(spanish.name || '').trim(),
    name_fr: toNullableText(french.name),
    topic: toNullableText(taxonomy.topic),
    topic_fr: toNullableText(taxonomy.topicFr),
    subtopic: toNullableText(taxonomy.subtopic),
    subtopic_fr: toNullableText(taxonomy.subtopicFr),
    effect_type: toNullableText(taxonomy.effectType),
    effect_type_fr: toNullableText(taxonomy.effectTypeFr),
    effect_description: String(spanish.effectDescription || '').trim(),
    effect_description_fr: String(french.effectDescription || '').trim() || null,
    worked_example: String(spanish.workedExample || '').trim() || null,
    worked_example_fr: String(french.workedExample || '').trim() || null,
  }
}

function formatDate(dateValue) {
  if (!dateValue) return ''
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

export default function CompetitiveTechniqueEditor({ session, onBackToCompetitive, onLogout }) {
  const role = session.role === 'teacher' ? 'teacher' : 'student'
  const allowedStatusOptions = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS
  const [techniqueId, setTechniqueId] = useState(null)
  const [selectedRecordId, setSelectedRecordId] = useState(null)
  const [selectedBookId, setSelectedBookId] = useState(null)
  const [screen, setScreen] = useState('books')
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [form, setForm] = useState(buildEmptyForm)
  const [activeLanguage, setActiveLanguage] = useState('es')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const importFileRef = useRef(null)
  const taxonomyNotes = useMemo(() => getTechniqueTaxonomyNotes(), [])
  const topicOptions = useMemo(() => getTechniqueTopicOptions(activeLanguage), [activeLanguage])
  const subtopicOptions = useMemo(() => getTechniqueSubtopicOptions(form.topicId, activeLanguage), [form.topicId, activeLanguage])
  const effectTypeOptions = useMemo(() => getTechniqueEffectTypeOptions(activeLanguage), [activeLanguage])

  const canSave = useMemo(() => {
    const spanish = form.translations?.es || EMPTY_TRANSLATIONS.es
    return Boolean(
      String(spanish.name || '').trim()
      && hasMeaningfulHtmlContent(spanish.effectDescription)
      && String(form.topicId || '').trim()
      && String(form.subtopicId || '').trim()
      && String(form.effectTypeId || '').trim()
    )
  }, [form.effectTypeId, form.subtopicId, form.topicId, form.translations])

  const loadTechniques = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const rows = await listEditableCompetitiveTechniqueProposals(session.userId)
      setRecords(rows)
    } catch (err) {
      setError(err?.message || 'Could not load competitive technique proposals.')
    } finally {
      setLoading(false)
    }
  }, [session.userId])

  useEffect(() => {
    loadTechniques()
  }, [loadTechniques])

  const filteredRecords = useMemo(() => {
    return records.filter((row) => {
      const search = normalize(nameSearch)
      if (!search) return true

      const haystack = [
        row.name,
        row.name_fr,
        row.topic,
        row.topic_fr,
        row.subtopic,
        row.subtopic_fr,
        row.effect_type,
        row.effect_type_fr,
        buildTechniquePreview(row, activeLanguage, 260),
      ].map((value) => normalize(value)).join(' ')

      return haystack.includes(search)
    })
  }, [records, nameSearch, activeLanguage])

  const books = useMemo(() => buildTechniqueCompendium(filteredRecords, activeLanguage), [filteredRecords, activeLanguage])
  const selectedBook = useMemo(() => books.find((book) => book.id === selectedBookId) || null, [books, selectedBookId])
  const isSearchMode = Boolean(normalize(nameSearch))
  const activeTranslation = form.translations?.[activeLanguage] || EMPTY_TRANSLATIONS.es
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

    if (screen === 'editor') {
      if (isCreatingNew) return
      const hasSelected = filteredRecords.some((row) => row.id === selectedRecordId)
      if (!hasSelected) {
        setSelectedRecordId(null)
        setTechniqueId(null)
        setScreen(selectedBookId ? 'techniques' : 'books')
      }
    }
  }, [books, filteredRecords, isCreatingNew, screen, selectedBookId, selectedRecordId])

  const startNewDraft = (bookId = selectedBookId) => {
    const book = books.find((item) => item.id === bookId) || null
    const seedTechnique = book?.items?.[0] || null
    const seedTaxonomyEs = getTechniqueTaxonomy(seedTechnique, 'es')
    const seedTaxonomyFr = getTechniqueTaxonomy(seedTechnique, 'fr')
    setTechniqueId(null)
    setSelectedRecordId(null)
    setSelectedBookId(bookId || null)
    setIsCreatingNew(true)
    setForm({
      ...buildEmptyForm(),
      ...getTechniqueTaxonomySelection({
        topic: seedTaxonomyEs.topic || '',
        topic_fr: seedTaxonomyFr.topic || '',
        subtopic: seedTaxonomyEs.subtopic || '',
        subtopic_fr: seedTaxonomyFr.subtopic || '',
        effect_type: seedTaxonomyEs.effectType || '',
        effect_type_fr: seedTaxonomyFr.effectType || '',
      }, { fallbackPending: true }),
    })
    setActiveLanguage('es')
    setError('')
    setNotice('Ready to create a new technique draft.')
    setScreen('editor')
  }

  const loadIntoForm = (row) => {
    const reviewedRow = role === 'student' && ['approved', 'rejected'].includes(String(row?.status || '').toLowerCase())
    setTechniqueId(row.id)
    setSelectedRecordId(row.id)
    setSelectedBookId(getTechniqueBookMeta(row, activeLanguage).id)
    setIsCreatingNew(false)
    setForm(toFormState(row, role))
    setActiveLanguage('es')
    setError('')
    setNotice(reviewedRow ? 'Reviewed proposal loaded as draft. You can edit and propose again.' : 'Technique proposal loaded for editing.')
    setScreen('editor')
  }

  const onFormChange = (key, value) => {
    setForm((prev) => {
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

  const onTranslationChange = (language, key, value) => {
    setForm((prev) => ({
      ...prev,
      translations: {
        ...prev.translations,
        [language]: {
          ...prev.translations[language],
          [key]: value,
        },
      },
    }))
  }

  const exportTechniquesJson = async () => {
    setError('')
    setNotice('')

    try {
      if (!techniqueId) throw new Error('Load a proposal before exporting JSON.')

      const item = {
        name: form.translations?.es?.name || '',
        nameFr: form.translations?.fr?.name || '',
        topicKey: form.topicId || '',
        subtopicKey: form.subtopicId || '',
        effectTypeKey: form.effectTypeId || '',
        ...resolveTechniqueTaxonomyFromIds(form),
        status: form.status || 'draft',
        effectDescription: form.translations?.es?.effectDescription || '',
        effectDescriptionFr: form.translations?.fr?.effectDescription || '',
        workedExample: form.translations?.es?.workedExample || '',
        workedExampleFr: form.translations?.fr?.workedExample || '',
      }

      if (!String(item.name || '').trim() || !hasMeaningfulHtmlContent(item.effectDescription)) {
        throw new Error('The loaded proposal is not valid for export yet.')
      }

      downloadJsonFile('inticore-competitive-techniques.json', {
        ...buildTechniquesTemplateJson(),
        generatedAt: new Date().toISOString(),
        techniques: [item],
      })
      setNotice('Technique proposal exported to JSON.')
    } catch (err) {
      setError(err?.message || 'Could not export techniques JSON.')
    }
  }

  const downloadTechniquesTemplate = () => {
    downloadJsonFile('inticore-techniques-format.json', buildTechniquesTemplateJson())
    setNotice('Inticore-compatible technique JSON format downloaded.')
  }

  const importTechniquesJson = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const json = await parseJsonFile(file)
      const importedRecords = Array.isArray(json?.techniques) ? json.techniques : []
      if (!importedRecords.length) throw new Error('No techniques found in JSON file.')

      const allowedStatuses = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS
      const existingRows = await listEditableCompetitiveTechniqueProposals(session.userId)
      const existingByKey = new Map()
      existingRows.forEach((row) => {
        const key = buildTechniqueImportKey(row)
        if (key && !existingByKey.has(key)) existingByKey.set(key, row)
      })

      const fileSeen = new Set()
      let createdCount = 0
      let updatedCount = 0
      let skippedCount = 0
      let lastImportedRow = null

      for (const item of importedRecords) {
        const importedStatus = toAllowedStatus(item?.status, allowedStatuses, 'proposed')
        const taxonomy = canonicalizeTechniqueTaxonomyInput(item)
        if (taxonomy.error) {
          skippedCount += 1
          continue
        }
        const payload = {
          created_by: session.userId,
          status: importedStatus,
          name: String(item?.name || '').trim(),
          name_fr: toNullableText(item?.nameFr),
          topic: toNullableText(taxonomy.topic),
          topic_fr: toNullableText(taxonomy.topicFr),
          subtopic: toNullableText(taxonomy.subtopic),
          subtopic_fr: toNullableText(taxonomy.subtopicFr),
          effect_type: toNullableText(taxonomy.effectType),
          effect_type_fr: toNullableText(taxonomy.effectTypeFr),
          effect_description: normalizeCompetitiveRichField(item?.effectDescription),
          effect_description_fr: normalizeCompetitiveRichField(item?.effectDescriptionFr) || null,
          worked_example: normalizeCompetitiveRichField(item?.workedExample) || null,
          worked_example_fr: normalizeCompetitiveRichField(item?.workedExampleFr) || null,
          reviewed_by: role === 'teacher' && (importedStatus === 'approved' || importedStatus === 'rejected') ? session.userId : null,
          approved_at: role === 'teacher' && importedStatus === 'approved' ? new Date().toISOString() : null,
        }

        const importKey = buildTechniqueImportKey(item)
        if (
          !payload.name
          || !hasMeaningfulHtmlContent(payload.effect_description)
          || !payload.topic
          || !payload.topic_fr
          || !payload.subtopic
          || !payload.subtopic_fr
          || !payload.effect_type
          || !payload.effect_type_fr
          || !importKey
        ) {
          skippedCount += 1
          continue
        }

        if (fileSeen.has(importKey)) {
          skippedCount += 1
          continue
        }
        fileSeen.add(importKey)

        const existing = existingByKey.get(importKey)
        try {
          if (existing) {
            const row = await updateOwnCompetitiveTechniqueProposal(existing.id, session.userId, payload)
            existingByKey.set(importKey, row)
            lastImportedRow = row
            updatedCount += 1
          } else {
            const row = await createCompetitiveTechniqueProposal(payload)
            existingByKey.set(importKey, row)
            lastImportedRow = row
            createdCount += 1
          }
        } catch {
          skippedCount += 1
        }
      }

      if (!createdCount && !updatedCount) throw new Error('No valid technique entries found to import.')
      await loadTechniques()
      if (lastImportedRow) {
        setTechniqueId(lastImportedRow.id)
        setSelectedRecordId(lastImportedRow.id)
        setSelectedBookId(getTechniqueBookMeta(lastImportedRow, activeLanguage).id)
        setIsCreatingNew(false)
        setForm(toFormState(lastImportedRow, role))
        setActiveLanguage('es')
        setScreen('editor')
      }
      setNotice(`Technique import complete. Created: ${createdCount}, updated: ${updatedCount}, skipped: ${skippedCount}. Imported technique loaded in the editor.`)
    } catch (err) {
      setError(err?.message || 'Could not import techniques JSON.')
    } finally {
      setSaving(false)
    }
  }

  const deleteTechnique = async (row) => {
    if (!row?.id) return
    if (!window.confirm(`Delete technique proposal "${row.name || 'Untitled technique'}"?`)) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      await deleteOwnCompetitiveTechniqueProposal(row.id, session.userId)
      setTechniqueId(null)
      setSelectedRecordId(null)
      setIsCreatingNew(false)
      setForm(buildEmptyForm())
      await loadTechniques()
      setNotice('Technique proposal deleted successfully.')
      setScreen(selectedBookId ? 'techniques' : 'books')
    } catch (err) {
      setError(err?.message || 'Could not delete technique proposal.')
    } finally {
      setSaving(false)
    }
  }

  const saveTechnique = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const payload = toPayload(form, session.userId, role)

      if (!payload.name) throw new Error('Spanish technique name is required.')
      if (!hasMeaningfulHtmlContent(payload.effect_description)) throw new Error('Spanish effect description is required.')
      if (!payload.topic || !payload.topic_fr || !payload.subtopic || !payload.subtopic_fr || !payload.effect_type || !payload.effect_type_fr) {
        throw new Error('Topic, subtopic, and effect type are required in both Spanish and French.')
      }

      if (techniqueId) {
        const row = await updateOwnCompetitiveTechniqueProposal(techniqueId, session.userId, payload)
        setTechniqueId(row.id)
        setSelectedRecordId(row.id)
        setSelectedBookId(getTechniqueBookMeta(row, activeLanguage).id)
        setIsCreatingNew(false)
        setForm(toFormState(row, role))
      } else {
        const row = await createCompetitiveTechniqueProposal(payload)
        setTechniqueId(row.id)
        setSelectedRecordId(row.id)
        setSelectedBookId(getTechniqueBookMeta(row, activeLanguage).id)
        setIsCreatingNew(false)
        setForm(toFormState(row, role))
      }

      setNotice('Technique proposal saved successfully.')
      await loadTechniques()
    } catch (err) {
      setError(err?.message || 'Could not save technique proposal.')
    } finally {
      setSaving(false)
    }
  }

  const openBook = (bookId) => {
    setSelectedBookId(bookId)
    setSelectedRecordId(null)
    setScreen('techniques')
  }

  const goBack = () => {
    if (screen === 'editor') {
      setScreen(selectedBookId ? 'techniques' : 'books')
      return
    }

    if (screen === 'techniques') {
      setScreen('books')
      setSelectedRecordId(null)
    }
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Competitive Techniques</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({role})</span>
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
          <div className="saved-title">{isSearchMode ? 'Search Results' : 'Technique Books'}</div>

          <div className="saved-item-actions">
            <button type="button" className="btn" onClick={() => startNewDraft()}>
              New Draft
            </button>
            <button type="button" className="btn" onClick={exportTechniquesJson}>
              Export JSON
            </button>
            <button type="button" className="btn" onClick={() => importFileRef.current?.click()} disabled={saving}>
              Import JSON
            </button>
            <button type="button" className="btn" onClick={downloadTechniquesTemplate}>
              Download Format
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={importTechniquesJson}
            />
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
          </div>

          <div className="saved-empty">
            {isSearchMode
              ? 'El buscador muestra tecnicas para entrar directo al editor.'
              : 'Primero se muestran solo los libros-compendio para navegar sin saturar la pantalla.'}
          </div>

          {!isBooksStage && <div className="saved-list competitive-list">
            {loading && <div className="saved-empty">Loading technique proposals...</div>}
            {!loading && isSearchMode && filteredRecords.length === 0 && <div className="saved-empty">No matching techniques found.</div>}
            {!loading && isSearchMode && filteredRecords.map((item) => (
              <button key={item.id} type="button" className="technique-preview-card" onClick={() => loadIntoForm(item)}>
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
                  <div className="saved-title">Technique Books</div>
                  <div className="saved-empty">Libros ordenados alfabeticamente y desplegados a pantalla completa para priorizar el tema antes de editar.</div>
                  <div className="compendium-book-grid" style={{ marginTop: 16 }}>
                    {loading && <div className="saved-empty">Loading technique proposals...</div>}
                    {!loading && books.length === 0 && <div className="saved-empty">No technique proposals yet.</div>}
                    {!loading && books.map((book) => (
                      <div key={book.id} className="saved-item compendium-book-card">
                        <div className="compendium-book-cover">
                          <div>
                            <div className="compendium-book-kicker">Technique Editor</div>
                            <div className="compendium-book-title">{book.title}</div>
                          </div>
                          <div className="compendium-book-summary">
                            Entra al compendio para editar tecnicas existentes o crear nuevos borradores dentro del mismo tema.
                          </div>
                          <div className="compendium-book-footer">
                            <div className="compendium-book-stats">
                              <div className="compendium-book-stat">{book.count} tecnicas</div>
                              <div className="compendium-book-stat">Subtopics: {book.subtopics.join(', ') || 'N/A'}</div>
                            </div>
                            <div className="saved-item-actions">
                              <button type="button" className="btn" onClick={() => openBook(book.id)}>
                                Open Book
                              </button>
                              <button type="button" className="btn" onClick={() => startNewDraft(book.id)}>
                                New In Book
                              </button>
                            </div>
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
                  <div className="saved-empty">Selecciona una tecnica del buscador para abrir su editor.</div>
                </>
              )}
            </>
          )}

          {screen === 'techniques' && selectedBook && (
            <>
              <div className="saved-title">Techniques In {selectedBook.title}</div>
              <div className="saved-empty">Esta pantalla muestra solo las tecnicas del libro seleccionado.</div>

              <div className="saved-item-actions" style={{ marginBottom: 12 }}>
                <button type="button" className="btn" onClick={() => startNewDraft(selectedBook.id)}>
                  New Draft In This Book
                </button>
              </div>

              <div className="technique-card-grid">
                {selectedBook.items.map((item) => {
                  const translation = getTechniqueTranslation(item, activeLanguage)
                  const taxonomy = getTechniqueTaxonomy(item, activeLanguage)

                  return (
                    <button key={item.id} type="button" className="technique-preview-card" onClick={() => loadIntoForm(item)}>
                      <div className="technique-preview-card-top">
                        <span className="technique-preview-card-type">{taxonomy.effectType || 'Technique'}</span>
                        <span className="technique-preview-card-meta">{taxonomy.subtopic || 'General'}</span>
                      </div>
                      <div className="technique-preview-card-title">{translation.name || 'Untitled technique'}</div>
                      <div className="technique-preview-card-body">{buildTechniquePreview(item, activeLanguage, 220)}</div>
                      <div className="technique-preview-card-footer">
                        <span>{item.status}</span>
                        <span>{formatDate(item.updated_at)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {screen === 'editor' && (
            <>
              <div className="saved-title">{isCreatingNew ? 'Techniques Editor - New Draft' : 'Techniques Editor'}</div>
              <div className="saved-empty">Entity type: competitive_technique_proposals</div>
              <div className="saved-empty">Spanish and French fields are both required for the technique taxonomy and the main localized content.</div>
              <div className="saved-empty">A technique should describe a reusable mathematical method, criterion, transformation, or operation.</div>
              <div className="saved-empty">Topics canonicos: {taxonomyNotes.topics}</div>
              <div className="saved-empty">Effect types canonicos: {taxonomyNotes.effectTypes}</div>

              <label className="field">
                <span>Status</span>
                <select value={form.status} onChange={(e) => onFormChange('status', e.target.value)}>
                  {allowedStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <div className="competitive-grid">
                <label className="field">
                  <span>Topic *</span>
                  <select value={form.topicId} onChange={(e) => onFormChange('topicId', e.target.value)}>
                    <option value="">Select topic</option>
                    {topicOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Subtopic *</span>
                  <select value={form.subtopicId} onChange={(e) => onFormChange('subtopicId', e.target.value)} disabled={!form.topicId}>
                    <option value="">{form.topicId ? 'Select subtopic' : 'Select topic first'}</option>
                    {subtopicOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Effect type *</span>
                  <select value={form.effectTypeId} onChange={(e) => onFormChange('effectTypeId', e.target.value)}>
                    <option value="">Select effect type</option>
                    {effectTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="auth-tabs" style={{ marginBottom: 14 }}>
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

              <label className="field">
                <span>Name {activeLanguage === 'es' ? '*' : ''}</span>
                <input
                  value={activeTranslation.name}
                  onChange={(e) => onTranslationChange(activeLanguage, 'name', e.target.value)}
                  placeholder={activeLanguage === 'fr' ? 'French version of the technique name' : ''}
                />
              </label>

              <label className="field">
                <span>Effect description {activeLanguage === 'es' ? '*' : ''}</span>
                <DescriptionEditor
                  value={activeTranslation.effectDescription}
                  onChange={(value) => onTranslationChange(activeLanguage, 'effectDescription', value)}
                  baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
                  baseFontSize={18}
                />
              </label>

              <label className="field">
                <span>Worked example</span>
                <DescriptionEditor
                  value={activeTranslation.workedExample}
                  onChange={(value) => onTranslationChange(activeLanguage, 'workedExample', value)}
                  baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
                  baseFontSize={18}
                />
              </label>

              {error && <div className="auth-error">{error}</div>}
              {!error && notice && <div className="saved-empty">{notice}</div>}

              <div className="saved-item-actions">
                <button type="button" className="btn" onClick={saveTechnique} disabled={saving || !canSave}>
                  {saving ? 'Saving...' : techniqueId ? 'Update Technique' : 'Save Draft'}
                </button>
                {!isCreatingNew && selectedRecordId && (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      const row = records.find((item) => item.id === selectedRecordId)
                      if (row) deleteTechnique(row)
                    }}
                    disabled={saving}
                  >
                    Delete Technique
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
