import { useEffect, useMemo, useRef, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import {
  createCompetitiveTechnique,
  listOwnCompetitiveTechniques,
  updateOwnCompetitiveTechnique,
} from './data/competitiveTechniquesRepo'
import { extractTextFromHtml, normalizeMathHtmlInput } from './lib/mathHtml'
import {
  buildTechniquesTemplateJson,
  downloadJsonFile,
  normalizeCompetitiveRichField,
  parseJsonFile,
  toAllowedStatus,
} from './lib/competitiveJson'

const STATUS_OPTIONS = ['draft', 'proposed', 'approved', 'rejected']
const STUDENT_STATUS_OPTIONS = ['draft', 'proposed']

const EMPTY_FORM = {
  status: 'draft',
  name: '',
  topic: '',
  subtopic: '',
  effectType: '',
  effectDescription: '',
  workedExample: '',
}

function toInputValue(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function toFormState(row, role) {
  if (!row || typeof row !== 'object') return EMPTY_FORM

  return {
    status: (role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS).includes(row.status) ? row.status : 'draft',
    name: toInputValue(row.name),
    topic: toInputValue(row.topic),
    subtopic: toInputValue(row.subtopic),
    effectType: toInputValue(row.effect_type),
    effectDescription: normalizeMathHtmlInput(row.effect_description),
    workedExample: normalizeMathHtmlInput(row.worked_example),
  }
}

function toNullableText(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function toPayload(form, userId, role) {
  const allowedStatuses = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS
  const status = allowedStatuses.includes(form.status) ? form.status : 'draft'

  return {
    created_by: userId,
    status,
    reviewed_by: role === 'teacher' && (status === 'approved' || status === 'rejected') ? userId : null,
    approved_at: role === 'teacher' && status === 'approved' ? new Date().toISOString() : null,
    name: String(form.name || '').trim(),
    topic: toNullableText(form.topic),
    subtopic: toNullableText(form.subtopic),
    effect_type: toNullableText(form.effectType),
    effect_description: String(form.effectDescription || '').trim(),
    worked_example: String(form.workedExample || '').trim() || null,
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
  const [form, setForm] = useState(EMPTY_FORM)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const importFileRef = useRef(null)
  const [notice, setNotice] = useState('')

  const canSave = useMemo(() => {
    const descriptionText = extractTextFromHtml(form.effectDescription)
    return Boolean(String(form.name || '').trim() && descriptionText)
  }, [form.effectDescription, form.name])

  const loadTechniques = async () => {
    setLoading(true)
    setError('')

    try {
      const rows = await listOwnCompetitiveTechniques(session.userId)
      setRecords(rows)
    } catch (err) {
      setError(err?.message || 'Could not load competitive techniques.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTechniques()
  }, [session.userId, role])

  const startNewDraft = () => {
    setTechniqueId(null)
    setForm(EMPTY_FORM)
    setError('')
    setNotice('Ready to create a new technique draft.')
  }

  const loadIntoForm = (row) => {
    const reviewedRow = role === 'student' && ['approved', 'rejected'].includes(String(row?.status || '').toLowerCase())
    setTechniqueId(row.id)
    setForm(toFormState(row, role))
    setError('')
    setNotice(reviewedRow ? 'Reviewed technique loaded as draft. You can edit and propose again.' : 'Technique loaded for editing.')
  }

  const onFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const exportTechniquesJson = async () => {
    setError('')
    setNotice('')

    try {
      const rows = await listOwnCompetitiveTechniques(session.userId)
      downloadJsonFile('inticore-competitive-techniques.json', {
        ...buildTechniquesTemplateJson(),
        generatedAt: new Date().toISOString(),
        techniques: rows.map((row) => ({
          name: row.name || '',
          topic: row.topic || '',
          subtopic: row.subtopic || '',
          effectType: row.effect_type || '',
          status: row.status || 'draft',
          effectDescription: row.effect_description || '',
          workedExample: row.worked_example || '',
        })),
      })
      setNotice('Techniques exported to JSON.')
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
      const records = Array.isArray(json?.techniques) ? json.techniques : []
      if (!records.length) throw new Error('No techniques found in JSON file.')

      const allowedStatuses = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS
      let importedCount = 0

      for (const item of records) {
        const payload = {
          created_by: session.userId,
          status: toAllowedStatus(item?.status, allowedStatuses, 'proposed'),
          name: String(item?.name || '').trim(),
          topic: toNullableText(item?.topic),
          subtopic: toNullableText(item?.subtopic),
          effect_type: toNullableText(item?.effectType),
          effect_description: normalizeCompetitiveRichField(item?.effectDescription),
          worked_example: normalizeCompetitiveRichField(item?.workedExample) || null,
          reviewed_by: null,
          approved_at: null,
        }

        if (!payload.name) continue
        if (!extractTextFromHtml(payload.effect_description)) continue

        await createCompetitiveTechnique(payload)
        importedCount += 1
      }

      if (!importedCount) throw new Error('No valid technique entries found to import.')
      await loadTechniques()
      setNotice('Imported ' + importedCount + ' techniques from JSON.')
    } catch (err) {
      setError(err?.message || 'Could not import techniques JSON.')
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
        throw new Error('Technique name is required.')
      }

      if (!extractTextFromHtml(payload.effect_description)) {
        throw new Error('Effect description is required.')
      }

      if (techniqueId) {
        const row = await updateOwnCompetitiveTechnique(techniqueId, session.userId, payload)
        setTechniqueId(row.id)
        setForm(toFormState(row, role))
      } else {
        const row = await createCompetitiveTechnique(payload)
        setTechniqueId(row.id)
        setForm(toFormState(row, role))
      }

      setNotice('Technique saved successfully.')
      await loadTechniques()
    } catch (err) {
      setError(err?.message || 'Could not save technique.')
    } finally {
      setSaving(false)
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

      <div className="competitive-layout">
        <div className="assets-panel">
          <div className="saved-title">My Competitive Techniques</div>

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
            {loading && <div className="saved-empty">Loading techniques...</div>}
            {!loading && records.length === 0 && <div className="saved-empty">No techniques yet.</div>}
            {!loading &&
              records.map((item) => (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">{item.name || 'Untitled technique'}</div>
                  <div className="saved-item-date">{formatDate(item.updated_at)}</div>
                  <div className="saved-item-tags">Status: {item.status}</div>
                  <button type="button" className="btn" onClick={() => loadIntoForm(item)}>
                    Edit
                  </button>
                </div>
              ))}
          </div>
        </div>

        <div className="panel">
          <div className="saved-title">Techniques Editor</div>
          <div className="saved-empty">Entity type: competitive_techniques</div>

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

          <label className="field">
            <span>Name *</span>
            <input value={form.name} onChange={(e) => onFormChange('name', e.target.value)} />
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

          <label className="field">
            <span>Effect description *</span>
            <div className="saved-empty">Use "Add Img URL" in the toolbar for graph or diagram references.</div>
            <DescriptionEditor
              value={form.effectDescription}
              onChange={(value) => onFormChange('effectDescription', value)}
              baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
              baseFontSize={18}
            />
          </label>

          <label className="field">
            <span>Worked example</span>
            <div className="saved-empty">Supports math and optional image references.</div>
            <DescriptionEditor
              value={form.workedExample}
              onChange={(value) => onFormChange('workedExample', value)}
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


