import { useEffect, useMemo, useRef, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import {
  createCompetitiveExercise,
  listOwnCompetitiveExercises,
  updateOwnCompetitiveExercise,
} from './data/competitiveExercisesRepo'
import { extractTextFromHtml, normalizeMathHtmlInput } from './lib/mathHtml'
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

function toFormState(row, role) {
  if (!row || typeof row !== 'object') return EMPTY_FORM

  return {
    status: (role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS).includes(row.status) ? row.status : 'draft',
    sourceTitle: toInputValue(row.source_title),
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
    source_title: String(form.sourceTitle || '').trim(),
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

  const canSave = useMemo(() => {
    const statementText = extractTextFromHtml(form.statement)
    return Boolean(String(form.sourceTitle || '').trim() && statementText)
  }, [form.sourceTitle, form.statement])

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
      const rows = await listOwnCompetitiveExercises(session.userId)
      downloadJsonFile('inticore-competitive-exercises.json', {
        ...buildExercisesTemplateJson(),
        generatedAt: new Date().toISOString(),
        exercises: rows.map((row) => ({
          sourceTitle: row.source_title || '',
          sourceType: row.source_type || '',
          sourceAuthor: row.source_author || '',
          sourceYear: row.source_year ?? null,
          sourceLocation: row.source_location || '',
          pageNumber: row.page_number ?? null,
          exerciseNumber: row.exercise_number || '',
          topic: row.topic || '',
          subtopic: row.subtopic || '',
          difficulty: row.difficulty || '',
          status: row.status || 'draft',
          statement: row.statement || '',
          finalAnswer: row.final_answer || '',
        })),
      })
      setNotice('Exercises exported to JSON.')
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
      const records = Array.isArray(json?.exercises) ? json.exercises : []
      if (!records.length) throw new Error('No exercises found in JSON file.')

      const allowedStatuses = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS
      let importedCount = 0

      for (const item of records) {
        const payload = {
          created_by: session.userId,
          status: toAllowedStatus(item?.status, allowedStatuses, 'proposed'),
          source_title: String(item?.sourceTitle || '').trim(),
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
          reviewed_by: null,
          approved_at: null,
        }

        if (!payload.source_title) continue
        if (!extractTextFromHtml(payload.statement)) continue

        await createCompetitiveExercise(payload)
        importedCount += 1
      }

      if (!importedCount) throw new Error('No valid exercise entries found to import.')
      await loadExercises()
      setNotice('Imported ' + importedCount + ' exercises from JSON.')
    } catch (err) {
      setError(err?.message || 'Could not import exercises JSON.')
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

      if (!payload.source_title) {
        throw new Error('Source title is required.')
      }

      if (!extractTextFromHtml(payload.statement)) {
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
                  <button type="button" className="btn" onClick={() => loadIntoForm(item)}>
                    Edit
                  </button>
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

          <label className="field">
            <span>Source title *</span>
            <input value={form.sourceTitle} onChange={(e) => onFormChange('sourceTitle', e.target.value)} />
          </label>

          <div className="competitive-grid">
            <label className="field">
              <span>Source type</span>
              <input value={form.sourceType} onChange={(e) => onFormChange('sourceType', e.target.value)} />
            </label>
            <label className="field">
              <span>Source author</span>
              <input value={form.sourceAuthor} onChange={(e) => onFormChange('sourceAuthor', e.target.value)} />
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
              <span>Page number</span>
              <input value={form.pageNumber} onChange={(e) => onFormChange('pageNumber', e.target.value)} placeholder="125" />
            </label>
            <label className="field">
              <span>Exercise number</span>
              <input value={form.exerciseNumber} onChange={(e) => onFormChange('exerciseNumber', e.target.value)} placeholder="12" />
            </label>
            <label className="field">
              <span>Topic</span>
              <input value={form.topic} onChange={(e) => onFormChange('topic', e.target.value)} />
            </label>
            <label className="field">
              <span>Subtopic</span>
              <input value={form.subtopic} onChange={(e) => onFormChange('subtopic', e.target.value)} />
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




