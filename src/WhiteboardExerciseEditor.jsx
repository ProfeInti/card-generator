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
const STRUCTURED_ITEM_COLUMNS = [
  {
    id: 'dataItems',
    label: 'Datos',
    helper: 'Hechos directos, valores, ecuaciones dadas y relaciones literales del enunciado.',
  },
  {
    id: 'conditionItems',
    label: 'Condiciones',
    helper: 'Hipótesis, restricciones, dominios y suposiciones explícitas.',
  },
  {
    id: 'clarificationItems',
    label: 'Aclaraciones',
    helper: 'Notas de contexto, convenciones, recordatorios o aclaraciones del docente/fuente.',
  },
  {
    id: 'taskItems',
    label: 'Consignas',
    helper: 'Acciones pedidas, incisos, metas y preguntas a resolver.',
  },
]

function buildDataItems(items) {
  return Array.from({ length: WHITEBOARD_DATA_SLOTS }, (_, index) => items?.[index] || '')
}

function buildStructuredItems(items) {
  return Array.isArray(items) ? items.filter(Boolean) : []
}

function toEditorForm(record) {
  return {
    ...buildEmptyWhiteboardExercise(),
    ...record,
    dataItems: buildDataItems(record?.dataItems),
    conditionItems: buildStructuredItems(record?.conditionItems),
    clarificationItems: buildStructuredItems(record?.clarificationItems),
    taskItems: buildStructuredItems(record?.taskItems),
  }
}

const DEFAULT_INTRO_LINES = [
  'Topic and title as the minimum identity, structured source metadata, and rich math content to seed the whiteboard.',
  'Keep every field concise: use the fewest words possible while preserving mathematical clarity.',
  'When importing or drafting content outside the editor, wrap inline math with $...$ so equations render correctly after conversion.',
  'Inside equations, use English math notation for functions and abbreviations: write `sin t` instead of `sen t`.',
]

export default function WhiteboardExerciseEditor({
  onBackToWhiteboard,
  session,
  screenTitle = 'Whiteboard Exercise Editor',
  introLines = DEFAULT_INTRO_LINES,
  backLabel = 'Back to Module',
}) {
  const [records, setRecords] = useState(() => listWhiteboardExercises())
  const [form, setForm] = useState(() => toEditorForm(buildEmptyWhiteboardExercise()))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeStructuredItem, setActiveStructuredItem] = useState({ columnId: 'dataItems', index: 0 })
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
    setActiveStructuredItem({ columnId: 'dataItems', index: 0 })
    setError('')
    setNotice('Exercise loaded into the editor.')
  }

  const updateStructuredItem = (columnId, index, value) => {
    setForm((prev) => {
      const builder = columnId === 'dataItems' ? buildDataItems : buildStructuredItems
      const nextItems = builder(prev[columnId])
      nextItems[index] = value
      return { ...prev, [columnId]: nextItems }
    })
  }

  const addStructuredItem = (columnId) => {
    setForm((prev) => {
      const builder = columnId === 'dataItems' ? buildDataItems : buildStructuredItems
      const currentItems = builder(prev[columnId])
      if (columnId === 'dataItems' && currentItems.every(Boolean)) {
        setError('Los datos usan un máximo de 10 slots por compatibilidad con el flujo actual.')
        return prev
      }

      const targetIndex = columnId === 'dataItems'
        ? currentItems.findIndex((item) => !item)
        : currentItems.length
      const nextIndex = targetIndex >= 0 ? targetIndex : currentItems.length
      const nextItems = [...currentItems]
      nextItems[nextIndex] = ''

      setActiveStructuredItem({ columnId, index: nextIndex })
      setError('')
      setNotice(`${STRUCTURED_ITEM_COLUMNS.find((column) => column.id === columnId)?.label || 'Item'} listo para editar.`)
      return { ...prev, [columnId]: nextItems }
    })
  }

  const removeStructuredItem = (columnId, index) => {
    setForm((prev) => {
      const builder = columnId === 'dataItems' ? buildDataItems : buildStructuredItems
      const currentItems = builder(prev[columnId])
      if (index < 0 || index >= currentItems.length) return prev

      let nextItems
      if (columnId === 'dataItems') {
        nextItems = buildDataItems(currentItems.filter((_, itemIndex) => itemIndex !== index))
      } else {
        nextItems = currentItems.filter((_, itemIndex) => itemIndex !== index)
      }

      const nextIndex = Math.max(0, Math.min(index, nextItems.length - 1))
      setActiveStructuredItem({ columnId, index: nextIndex })
      return { ...prev, [columnId]: nextItems }
    })
  }

  const moveStructuredItemBetweenColumns = (fromColumnId, index, direction) => {
    const currentColumnIndex = STRUCTURED_ITEM_COLUMNS.findIndex((column) => column.id === fromColumnId)
    const targetColumn = STRUCTURED_ITEM_COLUMNS[currentColumnIndex + direction]
    if (!targetColumn) return

    setForm((prev) => {
      const sourceBuilder = fromColumnId === 'dataItems' ? buildDataItems : buildStructuredItems
      const targetBuilder = targetColumn.id === 'dataItems' ? buildDataItems : buildStructuredItems
      const sourceItems = sourceBuilder(prev[fromColumnId])
      const targetItems = targetBuilder(prev[targetColumn.id])
      const itemToMove = sourceItems[index]
      if (!itemToMove) return prev
      if (targetColumn.id === 'dataItems' && targetItems.every(Boolean)) {
        setError('La columna Datos ya está llena. Libera un slot o mueve otro dato primero.')
        return prev
      }

      const nextSourceItems = fromColumnId === 'dataItems'
        ? buildDataItems(sourceItems.filter((_, itemIndex) => itemIndex !== index))
        : sourceItems.filter((_, itemIndex) => itemIndex !== index)
      const nextTargetItems = [...targetItems]
      const targetIndex = targetColumn.id === 'dataItems'
        ? nextTargetItems.findIndex((entry) => !entry)
        : nextTargetItems.length
      const resolvedTargetIndex = targetIndex >= 0 ? targetIndex : nextTargetItems.length
      nextTargetItems[resolvedTargetIndex] = itemToMove

      setActiveStructuredItem({ columnId: targetColumn.id, index: resolvedTargetIndex })
      setError('')
      setNotice(`Item movido a ${targetColumn.label}.`)
      return {
        ...prev,
        [fromColumnId]: nextSourceItems,
        [targetColumn.id]: targetColumn.id === 'dataItems' ? buildDataItems(nextTargetItems) : nextTargetItems,
      }
    })
  }

  const reorderStructuredItem = (columnId, index, direction) => {
    setForm((prev) => {
      const builder = columnId === 'dataItems' ? buildDataItems : buildStructuredItems
      const currentItems = builder(prev[columnId])
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= currentItems.length) return prev

      const nextItems = [...currentItems]
      const [item] = nextItems.splice(index, 1)
      nextItems.splice(targetIndex, 0, item)

      setActiveStructuredItem({ columnId, index: targetIndex })
      return {
        ...prev,
        [columnId]: columnId === 'dataItems' ? buildDataItems(nextItems) : nextItems,
      }
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
        setActiveStructuredItem({ columnId: 'dataItems', index: 0 })
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
        conditionItems: Array.isArray(form.conditionItems) ? form.conditionItems.filter(Boolean) : [],
        clarificationItems: Array.isArray(form.clarificationItems) ? form.clarificationItems.filter(Boolean) : [],
        taskItems: Array.isArray(form.taskItems) ? form.taskItems.filter(Boolean) : [],
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
          conditionItems: normalizedItem.conditionItems,
          clarificationItems: normalizedItem.clarificationItems,
          taskItems: normalizedItem.taskItems,
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

  const activeColumn = STRUCTURED_ITEM_COLUMNS.find((column) => column.id === activeStructuredItem.columnId) || STRUCTURED_ITEM_COLUMNS[0]
  const activeColumnItems = activeColumn.id === 'dataItems'
    ? buildDataItems(form[activeColumn.id])
    : buildStructuredItems(form[activeColumn.id])
  const activeStructuredValue = activeColumnItems[activeStructuredItem.index] || ''

  return (
    <div className="page wb-page">
      <div className="wb-screen-header">
        <div>
          <h1 className="page-title">{screenTitle}</h1>
          {introLines.map((line) => (
            <div key={line} className="saved-empty">{line}</div>
          ))}
        </div>
        <div className="wb-header-actions">
          <button type="button" className="btn" onClick={() => applyRecord(buildEmptyWhiteboardExercise())}>New Draft</button>
          <button type="button" className="btn" onClick={onBackToWhiteboard}>{backLabel}</button>
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

          <div className="saved-title" style={{ marginTop: 8 }}>Objetos del Ejercicio</div>
          <div className="saved-empty">Ahora puedes editar por separado Datos, Condiciones, Aclaraciones y Consignas.</div>
          <div className="saved-empty">Cada objeto se puede reordenar, mover de columna y eliminar sin salir del editor.</div>
          <div className="saved-empty">`Datos` mantiene 10 slots para conservar compatibilidad con el flujo actual del whiteboard.</div>

          <div className="competitive-grid">
            {STRUCTURED_ITEM_COLUMNS.map((column, columnIndex) => {
              const items = column.id === 'dataItems' ? buildDataItems(form[column.id]) : buildStructuredItems(form[column.id])
              const visibleItems = column.id === 'dataItems'
                ? items.map((item, index) => ({ value: item, index })).filter((item) => item.value)
                : items.map((item, index) => ({ value: item, index }))

              return (
                <div key={column.id} className="field">
                  <div className="saved-title">{column.label}</div>
                  <div className="saved-empty">{column.helper}</div>
                  <div className="saved-item-tags">
                    {column.id === 'dataItems'
                      ? `Llenos: ${populatedDataCount} de ${WHITEBOARD_DATA_SLOTS}`
                      : `Items: ${visibleItems.length}`}
                  </div>
                  <div className="menu-actions wb-inline-actions">
                    <button type="button" className="btn" onClick={() => addStructuredItem(column.id)}>
                      Add {column.label.slice(0, -1) || 'Item'}
                    </button>
                  </div>

                  {visibleItems.length === 0 ? (
                    <div className="saved-empty">No hay elementos en esta columna todavía.</div>
                  ) : (
                    <div className="saved-list">
                      {visibleItems.map((item, visibleIndex) => {
                        const isActive = activeStructuredItem.columnId === column.id && activeStructuredItem.index === item.index
                        return (
                          <div key={`${column.id}-${item.index}`} className="saved-item">
                            <button
                              type="button"
                              className="wb-record-open"
                              onClick={() => setActiveStructuredItem({ columnId: column.id, index: item.index })}
                            >
                              <div className="saved-item-title">{`${column.label.slice(0, -1) || 'Item'} ${visibleIndex + 1}`}</div>
                              <div className="saved-item-tags">{isActive ? 'Editing now' : 'Click to edit'}</div>
                            </button>
                            <div className="menu-actions wb-inline-actions">
                              <button
                                type="button"
                                className="btn"
                                onClick={() => reorderStructuredItem(column.id, item.index, -1)}
                                disabled={item.index === 0}
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => reorderStructuredItem(column.id, item.index, 1)}
                                disabled={item.index >= items.length - 1}
                              >
                                Down
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => moveStructuredItemBetweenColumns(column.id, item.index, -1)}
                                disabled={columnIndex === 0}
                              >
                                Left
                              </button>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => moveStructuredItemBetweenColumns(column.id, item.index, 1)}
                                disabled={columnIndex === STRUCTURED_ITEM_COLUMNS.length - 1}
                              >
                                Right
                              </button>
                              <button
                                type="button"
                                className="btn danger"
                                onClick={() => removeStructuredItem(column.id, item.index)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <label className="field">
            <span>{`${activeColumn.label} | Item ${activeStructuredItem.index + 1}`}</span>
            <div className="saved-empty">Editor del elemento seleccionado.</div>
            <DescriptionEditor
              value={activeStructuredValue}
              onChange={(value) => updateStructuredItem(activeColumn.id, activeStructuredItem.index, value)}
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
          <div className="saved-empty">The canonical template now uses `dataItems`, `conditionItems`, `clarificationItems`, and `taskItems` as separate arrays, plus `statement`, `officialResult`, and `antiproblem`.</div>
          <div className="saved-empty">The importer still tolerates aliases such as `tema`, `titulo`, `enunciado`, `datos`, `condiciones`, `aclaraciones`, `consignas`, and `antiproblema`.</div>
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
                      Datos: {record.dataItems?.length || 0} | Condiciones: {record.conditionItems?.length || 0} | Aclaraciones: {record.clarificationItems?.length || 0} | Consignas: {record.taskItems?.length || 0}
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
