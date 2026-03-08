import { useEffect, useMemo, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import { listApprovedCompetitiveExercises } from './data/competitiveExercisesRepo'
import { listApprovedCompetitiveTechniques } from './data/competitiveTechniquesRepo'
import {
  addConstructStep,
  createConstruct,
  deleteConstructStep,
  listConstructSteps,
  listOwnConstructs,
  updateConstruct,
  updateConstructStep,
} from './data/competitiveConstructsRepo'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

const STATUS_OPTIONS = ['draft', 'proposed', 'approved', 'rejected']
const STUDENT_STATUS_OPTIONS = ['draft', 'proposed']
const DEFAULT_PATH = 'main'
const MAX_STEPS_PER_PATH = 24

const EMPTY_FORM = {
  status: 'draft',
  exerciseId: '',
  title: '',
  description: '',
}

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function normalizePathKey(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || DEFAULT_PATH
}

function formatPathLabel(path) {
  const normalized = normalizePathKey(path)
  return normalized.replace(/[-_]+/g, ' ')
}

function createStepDraft(index = 1, solutionPath = DEFAULT_PATH) {
  return {
    localId: `local-${solutionPath}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    id: null,
    solutionPath,
    stepOrder: index,
    techniqueId: '',
    progressState: '',
    explanation: '',
  }
}

function normalizeStepOrderByPath(steps, targetPath) {
  let counter = 1
  return steps.map((step) => {
    if (step.solutionPath !== targetPath) return step
    const next = { ...step, stepOrder: counter }
    counter += 1
    return next
  })
}

function normalizeAllPaths(steps) {
  const pathMap = {}
  return steps.map((step) => {
    const path = normalizePathKey(step.solutionPath)
    const nextOrder = (pathMap[path] || 0) + 1
    pathMap[path] = nextOrder
    return {
      ...step,
      solutionPath: path,
      stepOrder: nextOrder,
    }
  })
}

export default function ConstructGenerator({ session, onBackToCompetitive, onLogout }) {
  const role = session.role === 'teacher' ? 'teacher' : 'student'
  const allowedStatuses = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS

  const [constructId, setConstructId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [steps, setSteps] = useState([createStepDraft(1, DEFAULT_PATH)])
  const [removedStepIds, setRemovedStepIds] = useState([])

  const [activePath, setActivePath] = useState(DEFAULT_PATH)
  const [newPathInput, setNewPathInput] = useState('')
  const [renamePathInput, setRenamePathInput] = useState(DEFAULT_PATH)

  const [ownConstructs, setOwnConstructs] = useState([])
  const [approvedExercises, setApprovedExercises] = useState([])
  const [approvedTechniques, setApprovedTechniques] = useState([])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const techniquesById = useMemo(() => {
    const map = new Map()
    approvedTechniques.forEach((item) => map.set(item.id, item))
    return map
  }, [approvedTechniques])

  const selectedExercise = useMemo(
    () => approvedExercises.find((item) => item.id === form.exerciseId) || null,
    [approvedExercises, form.exerciseId]
  )

  const renderedSelectedExerciseStatement = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selectedExercise?.statement || '')),
    [selectedExercise?.statement]
  )

  const pathOptions = useMemo(() => {
    const unique = new Set(steps.map((step) => normalizePathKey(step.solutionPath)).filter(Boolean))
    if (!unique.size) unique.add(DEFAULT_PATH)
    return [...unique].sort((a, b) => a.localeCompare(b))
  }, [steps])

  const visibleSteps = useMemo(
    () => steps.filter((step) => normalizePathKey(step.solutionPath) === activePath).sort((a, b) => a.stepOrder - b.stepOrder),
    [steps, activePath]
  )

  const loadDependencies = async () => {
    setLoading(true)
    setError('')

    try {
      const [constructRows, exerciseRows, techniqueRows] = await Promise.all([
        listOwnConstructs(session.userId),
        listApprovedCompetitiveExercises(),
        listApprovedCompetitiveTechniques(),
      ])

      setOwnConstructs(constructRows)
      setApprovedExercises(exerciseRows)
      setApprovedTechniques(techniqueRows)
    } catch (err) {
      setError(err?.message || 'Could not load construct generator data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDependencies()
  }, [session.userId])

  useEffect(() => {
    if (!pathOptions.includes(activePath)) {
      setActivePath(pathOptions[0] || DEFAULT_PATH)
    }
  }, [pathOptions, activePath])

  useEffect(() => {
    setRenamePathInput(activePath)
  }, [activePath])

  const startNewConstruct = () => {
    setConstructId(null)
    setForm(EMPTY_FORM)
    setSteps([createStepDraft(1, DEFAULT_PATH)])
    setRemovedStepIds([])
    setActivePath(DEFAULT_PATH)
    setNewPathInput('')
    setRenamePathInput(nextPath)
    setError('')
    setNotice('Ready to create a new construct draft.')
  }

  const loadConstruct = async (row) => {
    setLoading(true)
    setError('')
    setNotice('')

    try {
      const stepRows = await listConstructSteps(row.id)
      setConstructId(row.id)
      setForm({
        status: allowedStatuses.includes(row.status) ? row.status : 'draft',
        exerciseId: String(row.exercise_id || ''),
        title: String(row.title || ''),
        description: String(row.description || ''),
      })

      const normalized = stepRows.map((step) => ({
        localId: `db-${step.id}`,
        id: step.id,
        solutionPath: normalizePathKey(step.solution_path),
        stepOrder: step.step_order,
        techniqueId: String(step.technique_id || ''),
        progressState: normalizeMathHtmlInput(step.progress_state),
        explanation: String(step.explanation || ''),
      }))

      const nextSteps = normalized.length ? normalizeAllPaths(normalized) : [createStepDraft(1, DEFAULT_PATH)]
      setSteps(nextSteps)
      setRemovedStepIds([])
      setActivePath(nextSteps[0]?.solutionPath || DEFAULT_PATH)
      setNewPathInput('')
      setRenamePathInput(nextSteps[0]?.solutionPath || DEFAULT_PATH)
      setNotice('Construct loaded for editing.')
    } catch (err) {
      setError(err?.message || 'Could not load construct.')
    } finally {
      setLoading(false)
    }
  }

  const updateFormField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const updateStep = (localId, key, value) => {
    setSteps((prev) => prev.map((step) => (step.localId === localId ? { ...step, [key]: value } : step)))
  }

  const addPath = () => {
    const nextPath = normalizePathKey(newPathInput)
    if (pathOptions.includes(nextPath)) {
      setActivePath(nextPath)
      setNewPathInput('')
    setRenamePathInput(nextPath)
      return
    }

    const nextSteps = [...steps, createStepDraft(1, nextPath)]
    setSteps(normalizeAllPaths(nextSteps))
    setActivePath(nextPath)
    setNewPathInput('')
    setRenamePathInput(nextPath)
  }

  const renameActivePath = () => {
    const nextPath = normalizePathKey(renamePathInput)
    const prevPath = activePath

    if (nextPath === prevPath) return

    setSteps((prev) => {
      const replaced = prev.map((step) => {
        if (normalizePathKey(step.solutionPath) !== prevPath) return step
        return { ...step, solutionPath: nextPath }
      })

      return normalizeAllPaths(replaced)
    })

    setActivePath(nextPath)
    setRenamePathInput(nextPath)
    setNotice(`Path renamed: ${prevPath} to ${nextPath}`)
  }

  const addStep = () => {
    const pathStepCount = visibleSteps.length
    if (pathStepCount >= MAX_STEPS_PER_PATH) {
      setError(`Path "${activePath}" reached max steps (${MAX_STEPS_PER_PATH}).`)
      return
    }

    const next = [...steps, createStepDraft(pathStepCount + 1, activePath)]
    setSteps(normalizeStepOrderByPath(next, activePath))
  }

  const removeStep = (localId) => {
    setSteps((prev) => {
      const target = prev.find((step) => step.localId === localId)
      if (target?.id) {
        setRemovedStepIds((existing) => [...existing, target.id])
      }

      const rest = prev.filter((step) => step.localId !== localId)
      if (!rest.length) {
        setActivePath(DEFAULT_PATH)
        return [createStepDraft(1, DEFAULT_PATH)]
      }

      const normalized = normalizeStepOrderByPath(rest, normalizePathKey(target?.solutionPath || activePath))
      return normalized
    })
  }

  const moveStep = (localId, direction) => {
    setSteps((prev) => {
      const target = prev.find((step) => step.localId === localId)
      if (!target) return prev
      const path = normalizePathKey(target.solutionPath)
      const pathSteps = prev.filter((step) => normalizePathKey(step.solutionPath) === path)
      const ordered = [...pathSteps].sort((a, b) => a.stepOrder - b.stepOrder)
      const index = ordered.findIndex((step) => step.localId === localId)
      if (index < 0) return prev

      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= ordered.length) return prev

      const reorderedPath = [...ordered]
      const [item] = reorderedPath.splice(index, 1)
      reorderedPath.splice(nextIndex, 0, item)

      const pathById = new Map(reorderedPath.map((step, idx) => [step.localId, { ...step, stepOrder: idx + 1 }]))

      return prev.map((step) => {
        if (normalizePathKey(step.solutionPath) !== path) return step
        return pathById.get(step.localId) || step
      })
    })
  }

  const canSave = useMemo(() => {
    if (!form.exerciseId || !String(form.title || '').trim()) return false
    if (!steps.length) return false
    return steps.every((step) => step.techniqueId && String(step.progressState || '').trim())
  }, [form.exerciseId, form.title, steps])

  const saveConstruct = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      if (!form.exerciseId) throw new Error('You must select an approved exercise.')
      if (!String(form.title || '').trim()) throw new Error('Construct title is required.')
      if (!steps.length) throw new Error('At least one step is required.')

      const nextStatus = allowedStatuses.includes(form.status) ? form.status : 'draft'
      const constructPayload = {
        created_by: session.userId,
        exercise_id: form.exerciseId,
        title: String(form.title || '').trim(),
        description: String(form.description || '').trim() || null,
        status: nextStatus,
        reviewed_by: role === 'teacher' && (nextStatus === 'approved' || nextStatus === 'rejected') ? session.userId : null,
        approved_at: role === 'teacher' && nextStatus === 'approved' ? new Date().toISOString() : null,
      }

      const persistedConstruct = constructId
        ? await updateConstruct(constructId, session.userId, constructPayload)
        : await createConstruct(constructPayload)

      setConstructId(persistedConstruct.id)

      for (const stepId of removedStepIds) {
        await deleteConstructStep(stepId)
      }

      const normalizedSteps = normalizeAllPaths(steps)
      for (const step of normalizedSteps) {
        const stepPayload = {
          construct_id: persistedConstruct.id,
          solution_path: normalizePathKey(step.solutionPath),
          step_order: step.stepOrder,
          technique_id: step.techniqueId,
          progress_state: String(step.progressState || '').trim(),
          explanation: String(step.explanation || '').trim() || null,
        }

        if (step.id) {
          await updateConstructStep(step.id, stepPayload)
        } else {
          const inserted = await addConstructStep(stepPayload)
          step.id = inserted.id
        }
      }

      const refreshedOwn = await listOwnConstructs(session.userId)
      setOwnConstructs(refreshedOwn)

      const refreshedSteps = await listConstructSteps(persistedConstruct.id)
      const mappedSteps = refreshedSteps.map((step) => ({
        localId: `db-${step.id}`,
        id: step.id,
        solutionPath: normalizePathKey(step.solution_path),
        stepOrder: step.step_order,
        techniqueId: String(step.technique_id || ''),
        progressState: normalizeMathHtmlInput(step.progress_state),
        explanation: String(step.explanation || ''),
      }))

      const finalSteps = normalizeAllPaths(mappedSteps)
      setSteps(finalSteps)
      setActivePath(finalSteps[0]?.solutionPath || DEFAULT_PATH)
      setRemovedStepIds([])
      setNotice('Construct saved successfully.')
    } catch (err) {
      setError(err?.message || 'Could not save construct.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Construct Generator</h1>
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
          <div className="saved-title">My Constructs</div>

          <div className="saved-item-actions">
            <button type="button" className="btn" onClick={startNewConstruct}>
              New Construct
            </button>
            <button type="button" className="btn" onClick={loadDependencies} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="saved-list competitive-list">
            {loading && <div className="saved-empty">Loading constructs...</div>}
            {!loading && ownConstructs.length === 0 && <div className="saved-empty">No constructs yet.</div>}
            {!loading && ownConstructs.map((item) => (
              <div key={item.id} className="saved-item">
                <div className="saved-item-name">{item.title || 'Untitled construct'}</div>
                <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                <div className="saved-item-tags">Status: {item.status}</div>
                <button type="button" className="btn" onClick={() => loadConstruct(item)}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="saved-title">Construct Form</div>
          <div className="saved-empty">Build one construct with multiple solution paths from approved entities.</div>

          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={(e) => updateFormField('status', e.target.value)}>
              {allowedStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Approved exercise *</span>
            <select value={form.exerciseId} onChange={(e) => updateFormField('exerciseId', e.target.value)}>
              <option value="">Select approved exercise</option>
              {approvedExercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {(exercise.source_title || 'Untitled source') + ' | ' + (exercise.topic || 'No topic')}
                </option>
              ))}
            </select>
          </label>

          {selectedExercise && (
            <>
              <div className="saved-item-tags">
                Exercise selected: {selectedExercise.source_title || 'Untitled source'} ({selectedExercise.topic || 'N/A'} / {selectedExercise.subtopic || 'N/A'})
              </div>
              <label className="field" style={{ marginTop: 8 }}>
                <span>Selected exercise statement</span>
                <div className="rt-editor" style={{ minHeight: 120 }}>
                  <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedSelectedExerciseStatement }} />
                </div>
              </label>
            </>
          )}

          <label className="field">
            <span>Construct title *</span>
            <input value={form.title} onChange={(e) => updateFormField('title', e.target.value)} />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea value={form.description} onChange={(e) => updateFormField('description', e.target.value)} rows={3} />
          </label>

          <div className="saved-title" style={{ marginTop: 8 }}>Solution Paths</div>
          <div className="saved-empty">A construct can define multiple valid solving paths for the same exercise.</div>

          <div className="construct-path-row">
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Active path</span>
              <select value={activePath} onChange={(e) => setActivePath(normalizePathKey(e.target.value))}>
                {pathOptions.map((path) => (
                  <option key={path} value={path}>{formatPathLabel(path)}</option>
                ))}
              </select>
            </label>

            <label className="field" style={{ marginBottom: 0 }}>
              <span>Rename active path</span>
              <input
                value={renamePathInput}
                onChange={(e) => setRenamePathInput(e.target.value)}
                placeholder="main-path"
              />
            </label>

            <div className="saved-item-actions" style={{ alignItems: 'end' }}>
              <button type="button" className="btn" onClick={renameActivePath}>Rename Path</button>
            </div>

            <label className="field" style={{ marginBottom: 0 }}>
              <span>New path</span>
              <input
                value={newPathInput}
                onChange={(e) => setNewPathInput(e.target.value)}
                placeholder="alternate-1"
              />
            </label>

            <div className="saved-item-actions" style={{ alignItems: 'end' }}>
              <button type="button" className="btn" onClick={addPath}>Add / Open Path</button>
            </div>
          </div>

          <div className="saved-title" style={{ marginTop: 8 }}>Ordered Steps - Path: {formatPathLabel(activePath)}</div>
          <div className="saved-empty">Max steps per path: {MAX_STEPS_PER_PATH}</div>

          {visibleSteps.map((step, idx) => {
            const technique = techniquesById.get(step.techniqueId)
            const renderedProgress = renderMathInHtml(normalizeMathHtmlInput(step.progressState))

            return (
              <div key={step.localId} className="collection-toolbar" style={{ marginTop: 10 }}>
                <div className="saved-title">Step {idx + 1} ({formatPathLabel(activePath)})</div>

                <div className="construct-step-layout">
                  <div className="construct-step-left">
                    <label className="field">
                      <span>Progress state *</span>
                      <DescriptionEditor
                        value={step.progressState}
                        onChange={(value) => updateStep(step.localId, 'progressState', value)}
                        baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
                        baseFontSize={18}
                      />
                    </label>

                    <div className="field">
                      <span>Progress preview</span>
                      <div className="rt-editor" style={{ minHeight: 100 }}>
                        <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedProgress }} />
                      </div>
                    </div>
                  </div>

                  <div className="construct-step-right">
                    <label className="field">
                      <span>Approved technique *</span>
                      <select value={step.techniqueId} onChange={(e) => updateStep(step.localId, 'techniqueId', e.target.value)}>
                        <option value="">Select approved technique</option>
                        {approvedTechniques.map((item) => (
                          <option key={item.id} value={item.id}>
                            {(item.name || 'Untitled technique') + ' | ' + (item.topic || 'No topic')}
                          </option>
                        ))}
                      </select>
                    </label>

                    {technique && (
                      <div className="saved-item-tags">Technique selected: {technique.name || 'Untitled'} ({technique.effect_type || 'N/A'})</div>
                    )}

                    <label className="field" style={{ marginTop: 10 }}>
                      <span>Explanation (optional)</span>
                      <textarea
                        value={step.explanation}
                        onChange={(e) => updateStep(step.localId, 'explanation', e.target.value)}
                        rows={3}
                      />
                    </label>

                    <div className="saved-item-actions">
                      <button type="button" className="btn" onClick={() => moveStep(step.localId, 'up')} disabled={idx === 0}>Move Up</button>
                      <button type="button" className="btn" onClick={() => moveStep(step.localId, 'down')} disabled={idx === visibleSteps.length - 1}>Move Down</button>
                      <button type="button" className="btn danger" onClick={() => removeStep(step.localId)} disabled={visibleSteps.length === 1}>Remove</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="saved-item-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={addStep}>Add Step to Active Path</button>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}

          <button type="button" className="btn" onClick={saveConstruct} disabled={saving || !canSave}>
            {saving ? 'Saving...' : constructId ? 'Update Construct' : 'Save Construct Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}















