import { useMemo, useRef, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import { downloadJsonFile, parseJsonFile } from './lib/competitiveJson'
import {
  extractWhiteboardExercisesFromJson,
  buildWhiteboardExerciseExportJson,
  buildWhiteboardExerciseImportKey,
  buildWhiteboardExercisesTemplateJson,
  normalizeWhiteboardExerciseImportItem,
  normalizeWhiteboardRichField,
  whiteboardTitleHasExerciseNumber,
} from './lib/whiteboardJson'
import {
  deleteWhiteboardWorkspaceByExercise,
} from './data/whiteboardWorkspaceRepo'
import {
  buildEmptyWhiteboardExercise,
  deleteWhiteboardExercise,
  listWhiteboardExercises,
  saveWhiteboardExercise,
  setActiveWhiteboardExerciseId,
} from './lib/whiteboardPrototype'

const WHITEBOARD_DATA_SLOTS = 10
const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'

function buildDataItems(items) {
  return Array.from({ length: WHITEBOARD_DATA_SLOTS }, (_, index) => items?.[index] || '')
}

function toEditorForm(record) {
  return {
    ...buildEmptyWhiteboardExercise(),
    ...record,
    dataItems: buildDataItems(record?.dataItems),
  }
}

export default function WhiteboardExerciseEditor({ onBackToWhiteboard, session }) {
  const [records, setRecords] = useState(() => listWhiteboardExercises())
  const [form, setForm] = useState(() => toEditorForm(buildEmptyWhiteboardExercise()))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeDataIndex, setActiveDataIndex] = useState(0)
  const importFileRef = useRef(null)

  const canSave = useMemo(() => {
    return Boolean(String(form.topic || '').trim() && String(form.title || '').trim())
  }, [form])

  const populatedDataCount = useMemo(
    () => buildDataItems(form.dataItems).filter(Boolean).length,
    [form.dataItems]
  )

  const applyRecord = (record) => {
    setForm(toEditorForm(record))
    setActiveDataIndex(0)
    setError('')
    setNotice('Exercise loaded into the editor.')
  }

  const updateDataItem = (index, value) => {
    setForm((prev) => {
      const nextItems = buildDataItems(prev.dataItems)
      nextItems[index] = value
      return { ...prev, dataItems: nextItems }
    })
  }

  const handleSave = () => {
    setError('')
    const saved = saveWhiteboardExercise({
      ...form,
      dataItems: buildDataItems(form.dataItems),
    })

    setRecords(listWhiteboardExercises())
    setActiveWhiteboardExerciseId(saved.id)
    applyRecord(saved)
    setNotice('Exercise saved and ready to seed the whiteboard.')
  }

  const handleDeleteRecord = async (recordId) => {
    if (!recordId) return

    setError('')
    setNotice('')
    try {
      deleteWhiteboardExercise(recordId)
      if (session?.userId) {
        await deleteWhiteboardWorkspaceByExercise(session.userId, recordId)
      }

      const nextRecords = listWhiteboardExercises()
      setRecords(nextRecords)

      if (form.id === recordId) {
        setForm(toEditorForm(buildEmptyWhiteboardExercise()))
        setActiveDataIndex(0)
      }

      setNotice('Exercise deleted.')
    } catch (nextError) {
      setError(nextError?.message || 'Could not delete the exercise.')
    }
  }

  const exportCurrentExercise = () => {
    setError('')
    setNotice('')

    try {
      if (!String(form.topic || '').trim() || !String(form.title || '').trim()) {
        throw new Error('Complete at least topic and title before exporting.')
      }
      if (!whiteboardTitleHasExerciseNumber(form.title)) {
        throw new Error('The title must include the exercise number before exporting.')
      }

      const payload = {
        id: form.id || undefined,
        topic: String(form.topic || '').trim(),
        title: String(form.title || '').trim(),
        sourceBook: String(form.sourceBook || '').trim(),
        sourceAuthor: String(form.sourceAuthor || '').trim(),
        sourcePage: String(form.sourcePage || '').trim(),
        sourceSection: String(form.sourceSection || '').trim(),
        sourceReference: String(form.sourceReference || '').trim(),
        statement: form.statement || '',
        officialResult: form.officialResult || '',
        dataItems: buildDataItems(form.dataItems).filter(Boolean),
        antiproblem: form.antiproblem || '',
      }

      downloadJsonFile(
        'inticore-whiteboard-exercise.json',
        buildWhiteboardExerciseExportJson([payload])
      )
      setNotice('Whiteboard exercise exported to JSON.')
    } catch (nextError) {
      setError(nextError?.message || 'Could not export the whiteboard exercise.')
    }
  }

  const downloadTemplate = () => {
    downloadJsonFile('inticore-whiteboard-format.json', buildWhiteboardExercisesTemplateJson())
    setError('')
    setNotice('Whiteboard JSON template downloaded.')
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
      const importedRecords = extractWhiteboardExercisesFromJson(json)
      if (!importedRecords.length) {
        throw new Error('No importable exercises were found. Use the template with an "exercises" array or an equivalent object recognized by the importer.')
      }

      const existingRows = listWhiteboardExercises()
      const existingById = new Map()
      const existingByKey = new Map()

      existingRows.forEach((row) => {
        if (row.id) existingById.set(row.id, row)
        const key = buildWhiteboardExerciseImportKey(row)
        if (key && !existingByKey.has(key)) existingByKey.set(key, row)
      })

      let createdCount = 0
      let updatedCount = 0
      let skippedCount = 0
      let lastSaved = null

      for (const item of importedRecords) {
        const normalizedItem = normalizeWhiteboardExerciseImportItem(item)
        const topic = String(normalizedItem.topic || '').trim()
        const title = String(normalizedItem.title || '').trim()
        if (!topic || !title || !whiteboardTitleHasExerciseNumber(title)) {
          skippedCount += 1
          continue
        }

        const existing =
          (normalizedItem.id && existingById.get(String(normalizedItem.id).trim()))
          || existingByKey.get(buildWhiteboardExerciseImportKey(normalizedItem))
          || null

        const saved = saveWhiteboardExercise({
          ...buildEmptyWhiteboardExercise(),
          ...(existing || {}),
          id: existing?.id || normalizedItem.id || null,
          topic,
          title,
          sourceBook: normalizedItem.sourceBook,
          sourceAuthor: normalizedItem.sourceAuthor,
          sourcePage: normalizedItem.sourcePage,
          sourceSection: normalizedItem.sourceSection,
          sourceReference: normalizedItem.sourceReference,
          statement: normalizeWhiteboardRichField(normalizedItem.statement),
          officialResult: normalizeWhiteboardRichField(normalizedItem.officialResult),
          dataItems: normalizedItem.dataItems,
          antiproblem: normalizeWhiteboardRichField(normalizedItem.antiproblem),
        })

        lastSaved = saved

        if (existing) {
          updatedCount += 1
        } else {
          createdCount += 1
        }
      }

      if (!createdCount && !updatedCount) {
        throw new Error('No valid exercises were found to import.')
      }

      const nextRecords = listWhiteboardExercises()
      setRecords(nextRecords)

      if (lastSaved) {
        setActiveWhiteboardExerciseId(lastSaved.id)
        applyRecord(lastSaved)
      }

      setNotice(`Import completed. Created: ${createdCount}, updated: ${updatedCount}, skipped: ${skippedCount}.`)
    } catch (nextError) {
      setError(nextError?.message || 'Could not import the JSON file.')
    } finally {
      setSaving(false)
    }
  }

  const activeDataValue = buildDataItems(form.dataItems)[activeDataIndex]

  return (
    <div className="page wb-page">
      <div className="wb-screen-header">
        <div>
          <h1 className="page-title">Whiteboard Exercise Editor</h1>
          <div className="saved-empty">Topic and title as the minimum identity, structured source metadata, and rich math content to seed the whiteboard.</div>
          <div className="saved-empty">Keep every field concise: use the fewest words possible while preserving mathematical clarity.</div>
          <div className="saved-empty">When importing or drafting content outside the editor, wrap inline math with $...$ so equations render correctly after conversion.</div>
        </div>
        <div className="wb-header-actions">
          <button type="button" className="btn" onClick={() => applyRecord(buildEmptyWhiteboardExercise())}>New Draft</button>
          <button type="button" className="btn" onClick={onBackToWhiteboard}>Back to Module</button>
        </div>
      </div>

      <div className="wb-two-column">
        <div className="panel wb-panel">
          <div className="saved-title">Base Form</div>

          <div className="competitive-grid">
            <label className="field">
              <span>Exercise Topic</span>
              <input value={form.topic || ''} onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))} />
            </label>

          <label className="field">
            <span>Exercise Title</span>
            <input value={form.title || ''} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
          </label>
          </div>

          <div className="saved-empty">The title must explicitly include the exercise number. Example: "Exercise 12 - Linear Systems".</div>

          <div className="saved-title" style={{ marginTop: 8 }}>Optional Source Metadata</div>

          <div className="competitive-grid">
            <label className="field">
              <span>Book</span>
              <input value={form.sourceBook || ''} onChange={(e) => setForm((prev) => ({ ...prev, sourceBook: e.target.value }))} />
            </label>
            <label className="field">
              <span>Author</span>
              <input value={form.sourceAuthor || ''} onChange={(e) => setForm((prev) => ({ ...prev, sourceAuthor: e.target.value }))} />
            </label>
            <label className="field">
              <span>Page</span>
              <input value={form.sourcePage || ''} onChange={(e) => setForm((prev) => ({ ...prev, sourcePage: e.target.value }))} />
            </label>
            <label className="field">
              <span>Section</span>
              <input value={form.sourceSection || ''} onChange={(e) => setForm((prev) => ({ ...prev, sourceSection: e.target.value }))} />
            </label>
            <label className="field">
              <span>Extra Reference</span>
              <input value={form.sourceReference || ''} onChange={(e) => setForm((prev) => ({ ...prev, sourceReference: e.target.value }))} />
            </label>
          </div>

          <label className="field">
            <span>Problem Statement</span>
            <div className="saved-empty">Write the exercise statement itself here, not hints, commentary, or partial solution steps.</div>
            <div className="saved-empty">Be brief and direct. Prefer compact mathematical notation when it communicates the task clearly.</div>
            <DescriptionEditor
              value={form.statement || ''}
              onChange={(value) => setForm((prev) => ({ ...prev, statement: value }))}
              baseFontFamily={EDITOR_FONT_FAMILY}
              baseFontSize={18}
            />
          </label>

          <label className="field">
            <span>Official Answer</span>
            <div className="saved-empty">Store only the official answer or final conclusion expected from the exercise, unless the source explicitly includes a full official solution.</div>
            <div className="saved-empty">Use the shortest clear mathematical form available.</div>
            <DescriptionEditor
              value={form.officialResult || ''}
              onChange={(value) => setForm((prev) => ({ ...prev, officialResult: value }))}
              baseFontFamily={EDITOR_FONT_FAMILY}
              baseFontSize={18}
            />
          </label>

          <div className="saved-title" style={{ marginTop: 8 }}>Exercise Data</div>
          <div className="saved-empty">Only place facts or data extracted directly from the exercise here: conditions, declared relations, and numeric values literally given.</div>
          <div className="saved-empty">Do not include hints, help, reformulations, inferences, or solution steps.</div>
          <div className="saved-empty">Each item should be one short atomic fact, value, or relation.</div>
          <div className="saved-empty">Edit one data item at a time and move across the ten available slots.</div>

          <div className="wb-data-navigator">
            <button
              type="button"
              className="btn"
              onClick={() => setActiveDataIndex((prev) => Math.max(0, prev - 1))}
              disabled={activeDataIndex === 0}
            >
              Previous Data
            </button>
            <div className="saved-item-tags">Data item {activeDataIndex + 1} of {WHITEBOARD_DATA_SLOTS} | Filled: {populatedDataCount}</div>
            <button
              type="button"
              className="btn"
              onClick={() => setActiveDataIndex((prev) => Math.min(WHITEBOARD_DATA_SLOTS - 1, prev + 1))}
              disabled={activeDataIndex === WHITEBOARD_DATA_SLOTS - 1}
            >
              Next Data
            </button>
          </div>

          <label className="field">
            <span>{`Data Item ${activeDataIndex + 1}`}</span>
            <DescriptionEditor
              value={activeDataValue}
              onChange={(value) => updateDataItem(activeDataIndex, value)}
              baseFontFamily={EDITOR_FONT_FAMILY}
              baseFontSize={18}
            />
          </label>

          <label className="field">
            <span>Antiproblem</span>
            <div className="saved-empty">Write only the answer-template statement that responds to the problem, but keep it incomplete so the student can fill in the missing answer.</div>
            <div className="saved-empty">Example: "Los puntos de interseccion son..."</div>
            <DescriptionEditor
              value={form.antiproblem || ''}
              onChange={(value) => setForm((prev) => ({ ...prev, antiproblem: value }))}
              baseFontFamily={EDITOR_FONT_FAMILY}
              baseFontSize={18}
            />
          </label>

          {notice && <div className="saved-empty">{notice}</div>}

          <div className="menu-actions wb-inline-actions">
            <button type="button" className="btn" onClick={handleSave} disabled={!canSave}>Save Exercise</button>
          </div>
        </div>

        <div className="panel wb-panel">
          <div className="saved-title">Saved Exercises</div>
          <div className="saved-empty">The canonical template uses the `exercises` array and the fields `topic`, `title`, `statement`, `officialResult`, `dataItems`, and `antiproblem`.</div>
          <div className="saved-empty">The importer also tolerates reasonable aliases such as `tema`, `titulo`, `enunciado`, `respuestaOficial`, `datos`, and `antiproblema`, as long as the content is equivalent.</div>
          <div className="saved-empty">For plain-text JSON imports, use inline LaTeX between $...$ instead of leaving mathematical expressions as ambiguous text.</div>
          <div className="saved-item-actions">
            <button type="button" className="btn" onClick={exportCurrentExercise}>
              Export JSON
            </button>
            <button type="button" className="btn" onClick={() => importFileRef.current?.click()} disabled={saving}>
              Import JSON
            </button>
            <button type="button" className="btn" onClick={downloadTemplate}>
              Download JSON Template
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".json,.txt,application/json,text/plain"
              style={{ display: 'none' }}
              onChange={importExercisesJson}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}

          {records.length === 0 ? (
            <div className="saved-empty">There are no whiteboard exercises yet.</div>
          ) : (
            <div className="saved-list">
              {records.map((record) => (
                <div key={record.id} className="saved-item wb-record-card">
                  <button type="button" className="wb-record-open" onClick={() => applyRecord(record)}>
                    <div className="saved-item-title">{record.title || 'Untitled exercise'}</div>
                    <div className="saved-item-meta">{record.topic || 'No topic'}</div>
                    <div className="saved-item-tags">
                      Data items: {record.dataItems?.length || 0} | {record.statement ? 'With statement' : 'No statement'} | {record.officialResult ? 'With answer' : 'No answer'}
                    </div>
                  </button>
                  <div className="menu-actions wb-inline-actions">
                    <button type="button" className="btn danger" onClick={() => handleDeleteRecord(record.id)}>
                      Delete Exercise
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
