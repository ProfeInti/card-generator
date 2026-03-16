import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import {
  createCompetitiveTechniqueProposal,
  deleteOwnCompetitiveTechniqueProposal,
  listEditableCompetitiveTechniqueProposals,
  updateOwnCompetitiveTechniqueProposal,
} from './data/competitiveTechniquesRepo'
import { TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
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
  es: {
    name: '',
    effectDescription: '',
    workedExample: '',
  },
  fr: {
    name: '',
    effectDescription: '',
    workedExample: '',
  },
}

function toInputValue(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function buildTechniqueImportKey(values) {
  return [values?.name, values?.topic, values?.subtopic].map(normalizeKey).join('||')
}

function buildEmptyForm() {
  return {
    status: 'draft',
    topic: '',
    subtopic: '',
    effectType: '',
    translations: {
      es: { ...EMPTY_TRANSLATIONS.es },
      fr: { ...EMPTY_TRANSLATIONS.fr },
    },
  }
}

function toFormState(row, role) {
  if (!row || typeof row !== 'object') return buildEmptyForm()

  return {
    status: (role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS).includes(row.status) ? row.status : 'draft',
    topic: toInputValue(row.topic),
    subtopic: toInputValue(row.subtopic),
    effectType: toInputValue(row.effect_type),
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

  return {
    created_by: userId,
    status,
    reviewed_by: role === 'teacher' && (status === 'approved' || status === 'rejected') ? userId : null,
    approved_at: role === 'teacher' && status === 'approved' ? new Date().toISOString() : null,
    name: String(spanish.name || '').trim(),
    name_fr: toNullableText(french.name),
    topic: toNullableText(form.topic),
    subtopic: toNullableText(form.subtopic),
    effect_type: toNullableText(form.effectType),
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

export default function CompetitiveTechniqueEditor({ session, onBackToCompetitive, onLogout }) {
  const role = session.role === 'teacher' ? 'teacher' : 'student'
  const allowedStatusOptions = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS
  const [techniqueId, setTechniqueId] = useState(null)
  const [form, setForm] = useState(buildEmptyForm)
  const [activeLanguage, setActiveLanguage] = useState('es')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const importFileRef = useRef(null)
  const [notice, setNotice] = useState('')

  const canSave = useMemo(() => {
    const spanish = form.translations?.es || EMPTY_TRANSLATIONS.es
    return Boolean(String(spanish.name || '').trim() && hasMeaningfulHtmlContent(spanish.effectDescription))
  }, [form.translations])

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

  const startNewDraft = () => {
    setTechniqueId(null)
    setForm(buildEmptyForm())
    setActiveLanguage('es')
    setError('')
    setNotice('Ready to create a new technique draft.')
  }

  const loadIntoForm = (row) => {
    const reviewedRow = role === 'student' && ['approved', 'rejected'].includes(String(row?.status || '').toLowerCase())
    setTechniqueId(row.id)
    setForm(toFormState(row, role))
    setActiveLanguage('es')
    setError('')
    setNotice(reviewedRow ? 'Reviewed proposal loaded as draft. You can edit and propose again.' : 'Technique proposal loaded for editing.')
  }

  const onFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
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
      if (!techniqueId) {
        throw new Error('Load a proposal with Edit before exporting JSON.')
      }

      const item = {
        name: form.translations?.es?.name || '',
        nameFr: form.translations?.fr?.name || '',
        topic: form.topic || '',
        subtopic: form.subtopic || '',
        effectType: form.effectType || '',
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

      for (const item of importedRecords) {
        const importedStatus = toAllowedStatus(item?.status, allowedStatuses, 'proposed')
        const payload = {
          created_by: session.userId,
          status: importedStatus,
          name: String(item?.name || '').trim(),
          name_fr: toNullableText(item?.nameFr),
          topic: toNullableText(item?.topic),
          subtopic: toNullableText(item?.subtopic),
          effect_type: toNullableText(item?.effectType),
          effect_description: normalizeCompetitiveRichField(item?.effectDescription),
          effect_description_fr: normalizeCompetitiveRichField(item?.effectDescriptionFr) || null,
          worked_example: normalizeCompetitiveRichField(item?.workedExample) || null,
          worked_example_fr: normalizeCompetitiveRichField(item?.workedExampleFr) || null,
          reviewed_by: role === 'teacher' && (importedStatus === 'approved' || importedStatus === 'rejected') ? session.userId : null,
          approved_at: role === 'teacher' && importedStatus === 'approved' ? new Date().toISOString() : null,
        }

        const importKey = buildTechniqueImportKey(item)
        if (!payload.name || !hasMeaningfulHtmlContent(payload.effect_description) || !importKey) {
          skippedCount += 1
          continue
        }

        if (fileSeen.has(importKey)) {
          skippedCount += 1
          continue
        }
        fileSeen.add(importKey)

        const existing = existingByKey.get(importKey)
        if (existing) {
          const row = await updateOwnCompetitiveTechniqueProposal(existing.id, session.userId, payload)
          existingByKey.set(importKey, row)
          updatedCount += 1
        } else {
          const row = await createCompetitiveTechniqueProposal(payload)
          existingByKey.set(importKey, row)
          createdCount += 1
        }
      }

      if (!createdCount && !updatedCount) throw new Error('No valid technique entries found to import.')
      await loadTechniques()
      setNotice(`Technique import complete. Created: ${createdCount}, updated: ${updatedCount}, skipped: ${skippedCount}.`)
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
      if (techniqueId === row.id) {
        setTechniqueId(null)
        setForm(buildEmptyForm())
        setActiveLanguage('es')
      }
      await loadTechniques()
      setNotice('Technique proposal deleted successfully.')
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

      if (!payload.name) {
        throw new Error('Spanish technique name is required.')
      }

      if (!hasMeaningfulHtmlContent(payload.effect_description)) {
        throw new Error('Spanish effect description is required.')
      }

      if (techniqueId) {
        const row = await updateOwnCompetitiveTechniqueProposal(techniqueId, session.userId, payload)
        setTechniqueId(row.id)
        setForm(toFormState(row, role))
      } else {
        const row = await createCompetitiveTechniqueProposal(payload)
        setTechniqueId(row.id)
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

  const activeTranslation = form.translations?.[activeLanguage] || EMPTY_TRANSLATIONS.es

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

      <div className="competitive-layout">
        <div className="assets-panel">
          <div className="saved-title">My Technique Proposals</div>

          <div className="saved-item-actions">
            <button type="button" className="btn" onClick={startNewDraft}>
              New Draft
            </button>
            <button type="button" className="btn" onClick={exportTechniquesJson}>
              Export JSON
            </button>
            <button type="button" className="btn" onClick={() => importFileRef.current?.click()} disabled={saving}>
              Import JSON
            </button>
            <button type="button" className="btn" onClick={downloadTechniquesTemplate}>
              Want to create an Inticore-compatible JSON externally? Download the format here
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={importTechniquesJson}
            />
          </div>

          <div className="saved-list competitive-list">
            {loading && <div className="saved-empty">Loading technique proposals...</div>}
            {!loading && records.length === 0 && <div className="saved-empty">No technique proposals yet.</div>}
            {!loading &&
              records.map((item) => (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">{item.name || 'Untitled technique'}</div>
                  {item.name_fr && <div className="saved-item-tags">FR: {item.name_fr}</div>}
                  <div className="saved-item-date">{formatDate(item.updated_at)}</div>
                  <div className="saved-item-tags">Status: {item.status}</div>
                  <div className="saved-item-actions">
                    <button type="button" className="btn" onClick={() => loadIntoForm(item)}>
                      Edit
                    </button>
                    <button type="button" className="btn danger" onClick={() => deleteTechnique(item)} disabled={saving}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="panel">
          <div className="saved-title">Techniques Editor</div>
          <div className="saved-empty">Entity type: competitive_technique_proposals</div>
          <div className="saved-empty">Spanish fields are required for compatibility. French fields are optional and can be completed from the language switcher.</div>

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
              <span>Topic</span>
              <input value={form.topic} onChange={(e) => onFormChange('topic', e.target.value)} />
            </label>
            <label className="field">
              <span>Subtopic</span>
              <input value={form.subtopic} onChange={(e) => onFormChange('subtopic', e.target.value)} />
            </label>
            <label className="field">
              <span>Effect type</span>
              <input value={form.effectType} onChange={(e) => onFormChange('effectType', e.target.value)} placeholder="transform / simplify / solve" />
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
            <div className="saved-empty">Use "Add Img URL" in the toolbar for graph or diagram references.</div>
            <DescriptionEditor
              value={activeTranslation.effectDescription}
              onChange={(value) => onTranslationChange(activeLanguage, 'effectDescription', value)}
              baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
              baseFontSize={18}
            />
          </label>

          <label className="field">
            <span>Worked example</span>
            <div className="saved-empty">Supports math and optional image references.</div>
            <DescriptionEditor
              value={activeTranslation.workedExample}
              onChange={(value) => onTranslationChange(activeLanguage, 'workedExample', value)}
              baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
              baseFontSize={18}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}

          <button type="button" className="btn" onClick={saveTechnique} disabled={saving || !canSave}>
            {saving ? 'Saving...' : techniqueId ? 'Update Technique' : 'Save Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}
