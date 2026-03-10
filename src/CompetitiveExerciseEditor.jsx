import { useEffect, useMemo, useRef, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import {
  createCompetitiveExercise,
  deleteOwnCompetitiveExercise,
  listOwnCompetitiveExercises,
  updateOwnCompetitiveExercise,
} from './data/competitiveExercisesRepo'
import { hasMeaningfulHtmlContent, normalizeMathHtmlInput } from './lib/mathHtml'
import {
  buildExercisesTemplateJson,
  downloadJsonFile,
  normalizeCompetitiveRichField,
  parseJsonFile,
  toAllowedStatus,
} from './lib/competitiveJson'

const STATUS_OPTIONS = ['draft', 'proposed', 'approved', 'rejected']
const STUDENT_STATUS_OPTIONS = ['draft', 'proposed']

const EMPTY_FORM = {
  status: 'draft',
  sourceTitle: '',
  sourceType: '',
  sourceAuthor: '',
  sourceYear: '',
  sourceLocation: '',
  pageNumber: '',
  exerciseNumber: '',
  statement: '',
  finalAnswer: '',
  topic: '',
  subtopic: '',
  difficulty: '',
}

function toInputValue(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function buildExerciseTitle(values) {
  const sourceAuthor = String(values?.sourceAuthor || '').trim()
  const topic = String(values?.topic || '').trim()
  const exerciseNumber = String(values?.exerciseNumber || '').trim()
  const pageNumber = String(values?.pageNumber || '').trim()

  if (!sourceAuthor || !topic || !exerciseNumber || !pageNumber) return ''

  return `${sourceAuthor} | ${topic} | Ex. ${exerciseNumber} | p. ${pageNumber}`
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function buildExerciseImportKey(values) {
  return normalizeKey(buildExerciseTitle(values))
}

function hasRequiredExerciseIdentity(values) {
  return Boolean(
    String(values?.sourceAuthor || '').trim()
      && String(values?.topic || '').trim()
      && String(values?.exerciseNumber || '').trim()
      && toOptionalInt(values?.pageNumber) !== null
  )
}

function toFormState(row, role) {
  if (!row || typeof row !== 'object') return EMPTY_FORM

  return {
    status: (role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS).includes(row.status) ? row.status : 'draft',
    sourceTitle: toInputValue(row.source_work_title),
    sourceType: toInputValue(row.source_type),
    sourceAuthor: toInputValue(row.source_author),
    sourceYear: toInputValue(row.source_year),
    sourceLocation: toInputValue(row.source_location),
    pageNumber: toInputValue(row.page_number),
    exerciseNumber: toInputValue(row.exercise_number),
    statement: normalizeMathHtmlInput(row.statement),
    finalAnswer: normalizeMathHtmlInput(row.final_answer),
    topic: toInputValue(row.topic),
    subtopic: toInputValue(row.subtopic),
    difficulty: toInputValue(row.difficulty),
  }
}

function toOptionalInt(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isInteger(parsed) ? parsed : null
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
    source_title: buildExerciseTitle(form),
    source_work_title: toNullableText(form.sourceTitle),
    source_type: toNullableText(form.sourceType),
    source_author: toNullableText(form.sourceAuthor),
    source_year: toOptionalInt(form.sourceYear),
    source_location: toNullableText(form.sourceLocation),
    page_number: toOptionalInt(form.pageNumber),
    exercise_number: toNullableText(form.exerciseNumber),
    statement: String(form.statement || '').trim(),
    final_answer: String(form.finalAnswer || '').trim() || null,
    topic: toNullableText(form.topic),
    subtopic: toNullableText(form.subtopic),
    difficulty: toNullableText(form.difficulty),
  }
}

function formatDate(dateValue) {
  if (!dateValue) return ''
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

export default function CompetitiveExerciseEditor({ session, onBackToCompetitive, onLogout }) {
  const role = session.role === 'teacher' ? 'teacher' : 'student'
  const allowedStatusOptions = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS
  const [exerciseId, setExerciseId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const importFileRef = useRef(null)
  const [notice, setNotice] = useState('')

  const generatedTitle = useMemo(
    () => buildExerciseTitle(form),
    [form.sourceAuthor, form.topic, form.exerciseNumber, form.pageNumber]
  )

  const canSave = useMemo(() => {
    return Boolean(hasRequiredExerciseIdentity(form) && hasMeaningfulHtmlContent(form.statement))
  }, [form.sourceAuthor, form.topic, form.exerciseNumber, form.pageNumber, form.statement])

  const loadExercises = async () => {
    setLoading(true)
    setError('')

    try {
      const rows = await listOwnCompetitiveExercises(session.userId)
      setRecords(rows)
    } catch (err) {
      setError(err?.message || 'Could not load competitive exercises.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExercises()
  }, [session.userId, role])

  const startNewDraft = () => {
    setExerciseId(null)
    setForm(EMPTY_FORM)
    setError('')
    setNotice('Ready to create a new draft.')
  }

  const loadIntoForm = (row) => {
    const reviewedRow = role === 'student' && ['approved', 'rejected'].includes(String(row?.status || '').toLowerCase())
    setExerciseId(row.id)
    setForm(toFormState(row, role))
    setError('')
    setNotice(reviewedRow ? 'Reviewed exercise loaded as draft. You can edit and propose again.' : 'Exercise loaded for editing.')
  }

  const onFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const exportExercisesJson = async () => {
    setError('')
    setNotice('')

    try {
      if (!exerciseId) {
        throw new Error('Load an exercise with Edit before exporting JSON.')
      }

      const item = {
        sourceTitle: form.sourceTitle || '',
        sourceType: form.sourceType || '',
        sourceAuthor: form.sourceAuthor || '',
        sourceYear: toOptionalInt(form.sourceYear),
        sourceLocation: form.sourceLocation || '',
        pageNumber: toOptionalInt(form.pageNumber),
        exerciseNumber: form.exerciseNumber || '',
        topic: form.topic || '',
        subtopic: form.subtopic || '',
        difficulty: form.difficulty || '',
        status: form.status || 'draft',
        statement: form.statement || '',
        finalAnswer: form.finalAnswer || '',
      }

      const exportKey = buildExerciseImportKey(item)
      if (!hasRequiredExerciseIdentity(item) || !hasMeaningfulHtmlContent(item.statement) || !exportKey) {
        throw new Error('The loaded exercise is not valid for export yet.')
      }

      downloadJsonFile('inticore-competitive-exercises.json', {
        ...buildExercisesTemplateJson(),
        generatedAt: new Date().toISOString(),
        exercises: [item],
      })
      setNotice('Exercise exported to JSON.')
    } catch (err) {
      setError(err?.message || 'Could not export exercises JSON.')
    }
  }
  const downloadExercisesTemplate = () => {
    downloadJsonFile('inticore-exercises-format.json', buildExercisesTemplateJson())
    setNotice('Inticore-compatible exercise JSON format downloaded.')
  }

  const importExercisesJson = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const json = await parseJsonFile(file)
      const importedRecords = Array.isArray(json?.exercises) ? json.exercises : []
      if (!importedRecords.length) throw new Error('No exercises found in JSON file.')

      const allowedStatuses = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS
      const existingRows = await listOwnCompetitiveExercises(session.userId)
      const existingByKey = new Map()
      existingRows.forEach((row) => {
        const key = normalizeKey(row.source_title)
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
          source_title: buildExerciseTitle(item),
          source_work_title: toNullableText(item?.sourceTitle),
          source_type: toNullableText(item?.sourceType),
          source_author: toNullableText(item?.sourceAuthor),
          source_year: toOptionalInt(item?.sourceYear),
          source_location: toNullableText(item?.sourceLocation),
          page_number: toOptionalInt(item?.pageNumber),
          exercise_number: toNullableText(item?.exerciseNumber),
          statement: normalizeCompetitiveRichField(item?.statement),
          final_answer: normalizeCompetitiveRichField(item?.finalAnswer) || null,
          topic: toNullableText(item?.topic),
          subtopic: toNullableText(item?.subtopic),
          difficulty: toNullableText(item?.difficulty),
          reviewed_by: role === 'teacher' && (importedStatus === 'approved' || importedStatus === 'rejected') ? session.userId : null,
          approved_at: role === 'teacher' && importedStatus === 'approved' ? new Date().toISOString() : null,
        }

        const importKey = buildExerciseImportKey(item)
        if (!hasRequiredExerciseIdentity(item) || !payload.source_title || !hasMeaningfulHtmlContent(payload.statement) || !importKey) {
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
          const row = await updateOwnCompetitiveExercise(existing.id, session.userId, payload)
          existingByKey.set(importKey, row)
          updatedCount += 1
        } else {
          const row = await createCompetitiveExercise(payload)
          existingByKey.set(importKey, row)
          createdCount += 1
        }
      }

      if (!createdCount && !updatedCount) {
        throw new Error('No valid exercise entries found to import.')
      }

      await loadExercises()
      setNotice(`Exercise import complete. Created: ${createdCount}, updated: ${updatedCount}, skipped: ${skippedCount}.`)
    } catch (err) {
      setError(err?.message || 'Could not import exercises JSON.')
    } finally {
      setSaving(false)
    }
  }

  const deleteExercise = async (row) => {
    if (!row?.id) return
    if (!window.confirm(`Delete exercise "${row.source_title || 'Untitled source'}"?`)) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      await deleteOwnCompetitiveExercise(row.id, session.userId)
      if (exerciseId === row.id) {
        setExerciseId(null)
        setForm(EMPTY_FORM)
      }
      await loadExercises()
      setNotice('Exercise deleted successfully.')
    } catch (err) {
      setError(err?.message || 'Could not delete exercise.')
    } finally {
      setSaving(false)
    }
  }

  const saveExercise = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const payload = toPayload(form, session.userId, role)

      if (!String(form.sourceAuthor || '').trim()) {
        throw new Error('Source author is required.')
      }

      if (!String(form.topic || '').trim()) {
        throw new Error('Topic is required.')
      }

      if (!String(form.exerciseNumber || '').trim()) {
        throw new Error('Exercise number is required.')
      }

      if (toOptionalInt(form.pageNumber) === null) {
        throw new Error('Page number must be a valid integer.')
      }

      if (!hasMeaningfulHtmlContent(payload.statement)) {
        throw new Error('Statement is required.')
      }

      if (exerciseId) {
        const row = await updateOwnCompetitiveExercise(exerciseId, session.userId, payload)
        setExerciseId(row.id)
        setForm(toFormState(row, role))
      } else {
        const row = await createCompetitiveExercise(payload)
        setExerciseId(row.id)
        setForm(toFormState(row, role))
      }

      setNotice('Exercise saved successfully.')
      await loadExercises()
    } catch (err) {
      setError(err?.message || 'Could not save exercise.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Competitive Exercises</h1>
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
          <div className="saved-title">My Competitive Exercises</div>

          <div className="saved-item-actions">
            <button type="button" className="btn" onClick={startNewDraft}>
              New Draft
            </button>
            <button type="button" className="btn" onClick={exportExercisesJson}>
              Export JSON
            </button>
            <button type="button" className="btn" onClick={() => importFileRef.current?.click()} disabled={saving}>
              Import JSON
            </button>
            <button type="button" className="btn" onClick={downloadExercisesTemplate}>
              Want to create an Inticore-compatible JSON externally? Download the format here
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={importExercisesJson}
            />
          </div>

          <div className="saved-list competitive-list">
            {loading && <div className="saved-empty">Loading exercises...</div>}
            {!loading && records.length === 0 && <div className="saved-empty">No exercises yet.</div>}
            {!loading &&
              records.map((item) => (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">{item.source_title || 'Untitled source'}</div>
                  <div className="saved-item-date">{formatDate(item.updated_at)}</div>
                  <div className="saved-item-tags">Status: {item.status}</div>
                  <div className="saved-item-actions">
                    <button type="button" className="btn" onClick={() => loadIntoForm(item)}>
                      Edit
                    </button>
                    <button type="button" className="btn danger" onClick={() => deleteExercise(item)} disabled={saving}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="panel">
          <div className="saved-title">Exercise Form</div>
          <div className="saved-empty">Entity type: competitive_exercises</div>

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

          <div className="saved-title" style={{ marginTop: 8 }}>Required exercise identity</div>
          <div className="saved-empty">The exercise name is generated automatically from author + topic + exercise number + page.</div>
          <div className="saved-empty">Current generated name: {generatedTitle || 'Complete author, topic, exercise number and page number.'}</div>

          <div className="competitive-grid">
            <label className="field">
              <span>Source author *</span>
              <input value={form.sourceAuthor} onChange={(e) => onFormChange('sourceAuthor', e.target.value)} />
            </label>
            <label className="field">
              <span>Topic *</span>
              <input value={form.topic} onChange={(e) => onFormChange('topic', e.target.value)} />
            </label>
            <label className="field">
              <span>Exercise number *</span>
              <input value={form.exerciseNumber} onChange={(e) => onFormChange('exerciseNumber', e.target.value)} placeholder="12" />
            </label>
            <label className="field">
              <span>Page number *</span>
              <input value={form.pageNumber} onChange={(e) => onFormChange('pageNumber', e.target.value)} placeholder="125" />
            </label>
          </div>

          <div className="saved-title" style={{ marginTop: 8 }}>Optional extra data</div>

          <div className="competitive-grid">
            <label className="field">
              <span>Source title</span>
              <input value={form.sourceTitle} onChange={(e) => onFormChange('sourceTitle', e.target.value)} placeholder="Book or source title" />
            </label>
            <label className="field">
              <span>Subtopic</span>
              <input value={form.subtopic} onChange={(e) => onFormChange('subtopic', e.target.value)} />
            </label>
            <label className="field">
              <span>Source type</span>
              <input value={form.sourceType} onChange={(e) => onFormChange('sourceType', e.target.value)} />
            </label>
            <label className="field">
              <span>Source year</span>
              <input value={form.sourceYear} onChange={(e) => onFormChange('sourceYear', e.target.value)} placeholder="2024" />
            </label>
            <label className="field">
              <span>Source location</span>
              <input value={form.sourceLocation} onChange={(e) => onFormChange('sourceLocation', e.target.value)} placeholder="Chapter/section" />
            </label>
            <label className="field">
              <span>Difficulty</span>
              <input value={form.difficulty} onChange={(e) => onFormChange('difficulty', e.target.value)} placeholder="Beginner / Intermediate / Advanced" />
            </label>
          </div>

          <label className="field">
            <span>Statement *</span>
            <div className="saved-empty">Use "Add Img URL" in the toolbar for graph images.</div>
            <DescriptionEditor
              value={form.statement}
              onChange={(value) => onFormChange('statement', value)}
              baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
              baseFontSize={18}
            />
          </label>

          <label className="field">
            <span>Final answer</span>
            <div className="saved-empty">Supports math and optional image references.</div>
            <DescriptionEditor
              value={form.finalAnswer}
              onChange={(value) => onFormChange('finalAnswer', value)}
              baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
              baseFontSize={18}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}

          <button type="button" className="btn" onClick={saveExercise} disabled={saving || !canSave}>
            {saving ? 'Saving...' : exerciseId ? 'Update Exercise' : 'Save Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}





