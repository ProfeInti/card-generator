import { useCallback, useEffect, useMemo, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import { listApprovedCompetitiveExercises } from './data/competitiveExercisesRepo'
import { listApprovedCompetitiveTechniques } from './data/competitiveTechniquesRepo'
import {
  addConstructStep,
  createConstruct,
  deleteConstructStep,
  deleteOwnConstruct,
  listConstructSteps,
  listOwnConstructs,
  updateConstruct,
  updateConstructStep,
} from './data/competitiveConstructsRepo'
import { DEFAULT_ART_DATA_URL } from './lib/cardWorkspace'
import { getTechniqueTaxonomy, getTechniqueTranslation, TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

const STATUS_OPTIONS = ['draft', 'proposed', 'approved', 'rejected']
const STUDENT_STATUS_OPTIONS = ['draft', 'proposed']
const EFFECT_STRENGTH_OPTIONS = [
  { value: 'none', label: 'No effect', budgetTax: 0 },
  { value: 'light', label: 'Light effect', budgetTax: 1 },
  { value: 'medium', label: 'Medium effect', budgetTax: 2 },
  { value: 'strong', label: 'Strong effect', budgetTax: 3 },
]
const DEFAULT_PATH = 'main'
const MAX_STEPS_PER_PATH = 24
const TEMP_STEP_ORDER_BASE = 1000000
const CONSTRUCT_DRAFT_SNAPSHOT_PREFIX = 'construct-generator-draft'

const EMPTY_FORM = {
  status: 'draft',
  exerciseId: '',
  title: '',
  description: '',
  imageUrl: '',
  attack: '0',
  armor: '0',
  ingenuityCost: '0',
  effectStrength: 'none',
  effects: '',
}

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function toNonNegativeInt(value, fallback = 0) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return fallback
  const parsed = Number(normalized)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

function normalizeImageUrl(value) {
  const normalized = String(value || '').trim()
  return normalized || ''
}

function isAcceptedImageUrl(value) {
  if (!value) return true
  return /^https?:\/\//i.test(value) || value.startsWith('data:image/')
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
  return normalizePathKey(path).replace(/[-_]+/g, ' ')
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
  const byPath = new Map()

  steps.forEach((step) => {
    const path = normalizePathKey(step.solutionPath)
    const existing = byPath.get(path) || []
    existing.push(step)
    byPath.set(path, existing)
  })

  const orderByLocalId = new Map()
  byPath.forEach((rows, path) => {
    const ordered = [...rows].sort((a, b) => Number(a.stepOrder) - Number(b.stepOrder))
    ordered.forEach((row, idx) => {
      orderByLocalId.set(row.localId, { path, stepOrder: idx + 1 })
    })
  })

  return steps.map((step) => {
    const normalized = orderByLocalId.get(step.localId)
    return {
      ...step,
      solutionPath: normalized?.path || normalizePathKey(step.solutionPath),
      stepOrder: normalized?.stepOrder || 1,
    }
  })
}

function buildDraftSnapshotKey(userId, constructId) {
  return `${CONSTRUCT_DRAFT_SNAPSHOT_PREFIX}:${userId}:${constructId}`
}

function loadDraftSnapshot(userId, constructId) {
  if (!constructId || typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(buildDraftSnapshotKey(userId, constructId))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveDraftSnapshot(userId, constructId, snapshot) {
  if (!constructId || typeof window === 'undefined') return
  window.localStorage.setItem(buildDraftSnapshotKey(userId, constructId), JSON.stringify(snapshot))
}

function clearDraftSnapshot(userId, constructId) {
  if (!constructId || typeof window === 'undefined') return
  window.localStorage.removeItem(buildDraftSnapshotKey(userId, constructId))
}

export default function ConstructGenerator({ session, onBackToCompetitive, onLogout }) {
  const role = session.role === 'teacher' ? 'teacher' : 'student'
  const allowedStatuses = role === 'teacher' ? STATUS_OPTIONS : STUDENT_STATUS_OPTIONS

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorStep, setEditorStep] = useState('core')
  const [exerciseDetailsOpen, setExerciseDetailsOpen] = useState(false)
  const [techniqueDetailsOpenByStep, setTechniqueDetailsOpenByStep] = useState({})
  const [techniquePickerOpenByStep, setTechniquePickerOpenByStep] = useState({})
  const [techniqueSearchByStep, setTechniqueSearchByStep] = useState({})
  const [techniquePickerLanguage, setTechniquePickerLanguage] = useState('es')

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
  const [lastPersistedStatus, setLastPersistedStatus] = useState('')

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

  const renderedSelectedExerciseFinalAnswer = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selectedExercise?.final_answer || '')),
    [selectedExercise?.final_answer]
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

  const loadDependencies = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [constructRows, exerciseRows, techniqueRows] = await Promise.all([
        listOwnConstructs(session.userId),
        listApprovedCompetitiveExercises(session.userId),
        listApprovedCompetitiveTechniques(session.userId),
      ])

      setOwnConstructs(constructRows)
      setApprovedExercises(exerciseRows)
      setApprovedTechniques(techniqueRows)
    } catch (err) {
      setError(err?.message || 'Could not load construct generator data.')
    } finally {
      setLoading(false)
    }
  }, [session.userId])

  useEffect(() => {
    loadDependencies()
  }, [loadDependencies])

  useEffect(() => {
    if (!pathOptions.includes(activePath)) {
      setActivePath(pathOptions[0] || DEFAULT_PATH)
    }
  }, [pathOptions, activePath])

  useEffect(() => {
    setRenamePathInput(activePath)
  }, [activePath])

  const resetEditorState = () => {
    setEditorStep('core')
    setExerciseDetailsOpen(false)
    setTechniqueDetailsOpenByStep({})
    setTechniquePickerOpenByStep({})
    setTechniqueSearchByStep({})
    setRemovedStepIds([])
  }

  const startNewConstruct = () => {
    setEditorOpen(true)
    resetEditorState()
    setConstructId(null)
    setForm(EMPTY_FORM)
    setSteps([createStepDraft(1, DEFAULT_PATH)])
    setActivePath(DEFAULT_PATH)
    setNewPathInput('')
    setRenamePathInput(DEFAULT_PATH)
    setLastPersistedStatus('')
    setError('')
    setNotice('Ready to create a new construct draft.')
  }

  const deleteConstruct = async (row) => {
    if (!row?.id) return
    if (!window.confirm(`Delete construct "${row.title || 'Untitled construct'}"?`)) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      await deleteOwnConstruct(row.id, session.userId)
      await loadDependencies()
      setNotice('Construct deleted successfully.')
    } catch (err) {
      setError(err?.message || 'Could not delete construct.')
    } finally {
      setSaving(false)
    }
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
        imageUrl: String(row.image_url || ''),
        attack: String(row.attack ?? 0),
        armor: String(row.armor ?? 0),
        ingenuityCost: String(row.ingenuity_cost ?? 0),
        effectStrength: String(row.effect_strength || 'none'),
        effects: String(row.effects || ''),
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

      const snapshot = loadDraftSnapshot(session.userId, row.id)
      const snapshotForm = snapshot?.form || null
      const snapshotSteps = Array.isArray(snapshot?.steps)
        ? snapshot.steps.map((step, idx) => ({
            ...step,
            localId: step.localId || `snapshot-${idx}-${Date.now()}`,
            id: step.id || null,
            solutionPath: normalizePathKey(step.solutionPath),
            stepOrder: Number(step.stepOrder) || idx + 1,
            techniqueId: String(step.techniqueId || ''),
            progressState: normalizeMathHtmlInput(step.progressState),
            explanation: String(step.explanation || ''),
          }))
        : null

      const nextSteps = snapshotSteps?.length
        ? normalizeAllPaths(snapshotSteps)
        : normalized.length
          ? normalizeAllPaths(normalized)
          : [createStepDraft(1, DEFAULT_PATH)]
      setEditorOpen(true)
      resetEditorState()
      if (snapshotForm) {
        setForm((prev) => ({
          ...prev,
          ...snapshotForm,
          status: allowedStatuses.includes(snapshotForm.status) ? snapshotForm.status : prev.status,
        }))
      }
      setSteps(nextSteps)
      setActivePath(snapshot?.activePath ? normalizePathKey(snapshot.activePath) : nextSteps[0]?.solutionPath || DEFAULT_PATH)
      setEditorStep(snapshot?.editorStep === 'construct' ? 'construct' : 'core')
      setNewPathInput('')
      setRenamePathInput(nextSteps[0]?.solutionPath || DEFAULT_PATH)
      setLastPersistedStatus(String(row.status || ''))

      const reviewedRow = role === 'student' && ['approved', 'rejected'].includes(String(row?.status || '').toLowerCase())
      setNotice(
        reviewedRow
          ? 'Reviewed construct loaded as draft. You can edit and propose again.'
          : snapshot
            ? 'Draft snapshot restored for continued editing.'
            : 'Construct loaded for editing.'
      )
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

  const toggleTechniqueDetails = (localId) => {
    setTechniqueDetailsOpenByStep((prev) => ({
      ...prev,
      [localId]: !prev[localId],
    }))
  }

  const updateTechniqueSearch = (localId, value) => {
    setTechniqueSearchByStep((prev) => ({
      ...prev,
      [localId]: value,
    }))
  }

  const openTechniquePicker = (localId) => {
    setTechniquePickerOpenByStep((prev) => ({
      ...prev,
      [localId]: true,
    }))
  }

  const closeTechniquePicker = (localId) => {
    setTechniquePickerOpenByStep((prev) => ({
      ...prev,
      [localId]: false,
    }))
    setTechniqueSearchByStep((prev) => ({
      ...prev,
      [localId]: '',
    }))
  }

  const selectTechniqueForStep = (localId, techniqueId) => {
    updateStep(localId, 'techniqueId', techniqueId)
    closeTechniquePicker(localId)
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

      return normalizeStepOrderByPath(rest, normalizePathKey(target?.solutionPath || activePath))
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

  const normalizedStatus = allowedStatuses.includes(form.status) ? form.status : 'draft'
  const isDraftStatus = normalizedStatus === 'draft'
  const selectedEffectStrength = EFFECT_STRENGTH_OPTIONS.find((item) => item.value === form.effectStrength) || EFFECT_STRENGTH_OPTIONS[0]
  const totalConstructSteps = steps.length
  const minimumConstructCost = useMemo(() => {
    if (totalConstructSteps <= 2) return 1
    return totalConstructSteps - 1
  }, [totalConstructSteps])
  const numericCost = toNonNegativeInt(form.ingenuityCost, 0) ?? 0
  const appliedConstructCost = Math.max(numericCost, minimumConstructCost)
  const constructBudget = useMemo(
    () => Math.max(1, appliedConstructCost * 2 + 1 - selectedEffectStrength.budgetTax),
    [appliedConstructCost, selectedEffectStrength.budgetTax]
  )
  const numericAttack = toNonNegativeInt(form.attack, 0)
  const numericArmor = toNonNegativeInt(form.armor, 0)
  const totalAssignedStats = (numericAttack ?? 0) + (numericArmor ?? 0)
  const statsWithinBudget = numericAttack !== null && numericArmor !== null && totalAssignedStats <= constructBudget

  const hasValidNumericFields = useMemo(() => (
    toNonNegativeInt(form.attack) !== null &&
    toNonNegativeInt(form.armor) !== null &&
    toNonNegativeInt(form.ingenuityCost) !== null
  ), [form.attack, form.armor, form.ingenuityCost])

  const hasCompleteCore = useMemo(() => {
    if (!form.exerciseId || !steps.length) return false
    return steps.every((step) => step.techniqueId && String(step.progressState || '').trim())
  }, [form.exerciseId, steps])

  const canSave = useMemo(() => {
    if (!form.exerciseId) return false
    if (!isAcceptedImageUrl(normalizeImageUrl(form.imageUrl))) return false
    if (!hasValidNumericFields) return false
    if (numericCost < minimumConstructCost) return false
    if (!statsWithinBudget) return false
    if (isDraftStatus) return true
    if (!String(form.title || '').trim()) return false
    return hasCompleteCore
  }, [form.exerciseId, form.title, form.imageUrl, hasValidNumericFields, numericCost, minimumConstructCost, statsWithinBudget, isDraftStatus, hasCompleteCore])

  const canAdvanceFromCore = useMemo(() => {
    return hasCompleteCore
  }, [hasCompleteCore])

  const saveConstruct = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      if (!form.exerciseId) throw new Error('Drafts still require an approved exercise.')
      if (!isAcceptedImageUrl(normalizeImageUrl(form.imageUrl))) {
        throw new Error('Construct image must be an http/https URL or a data:image value.')
      }
      if (toNonNegativeInt(form.attack) === null) throw new Error('Attack must be a non-negative integer.')
      if (toNonNegativeInt(form.armor) === null) throw new Error('Armor must be a non-negative integer.')
      if (toNonNegativeInt(form.ingenuityCost) === null) throw new Error('Ingenuity Cost must be a non-negative integer.')
      if (numericCost < minimumConstructCost) {
        throw new Error(`Ingenuity Cost must be at least ${minimumConstructCost} for ${totalConstructSteps} total step${totalConstructSteps === 1 ? '' : 's'}.`)
      }
      if (!statsWithinBudget) {
        throw new Error(`Attack + Armor cannot exceed the current budget of ${constructBudget}.`)
      }
      if (!isDraftStatus && !steps.length) throw new Error('At least one step is required.')
      if (!isDraftStatus && !hasCompleteCore) {
        throw new Error('To save as proposed, approved, or rejected, all steps must have a technique and progress state.')
      }

      const nextStatus = normalizedStatus
      const generatedDraftTitle = String(form.title || '').trim() || `Draft ${new Date().toLocaleString()}`
      const constructPayload = {
        created_by: session.userId,
        exercise_id: form.exerciseId,
        title: isDraftStatus ? generatedDraftTitle : String(form.title || '').trim(),
        description: String(form.description || '').trim() || null,
        image_url: normalizeImageUrl(form.imageUrl) || null,
        attack: toNonNegativeInt(form.attack, 0),
        armor: toNonNegativeInt(form.armor, 0),
        ingenuity_cost: toNonNegativeInt(form.ingenuityCost, 0),
        effect_strength: selectedEffectStrength.value,
        effects: String(form.effects || '').trim() || null,
        status: nextStatus,
        reviewed_by: role === 'teacher' && (nextStatus === 'approved' || nextStatus === 'rejected') ? session.userId : null,
        approved_at: role === 'teacher' && nextStatus === 'approved' ? new Date().toISOString() : null,
      }

      const persistedConstruct = constructId
        ? await updateConstruct(constructId, session.userId, constructPayload)
        : await createConstruct(constructPayload)

      setConstructId(persistedConstruct.id)
      if (isDraftStatus && !String(form.title || '').trim()) {
        setForm((prev) => ({ ...prev, title: generatedDraftTitle }))
      }

      for (const stepId of removedStepIds) {
        await deleteConstructStep(stepId)
      }

      const normalizedSteps = normalizeAllPaths(steps)
      const completeSteps = normalizedSteps.filter((step) => step.techniqueId && String(step.progressState || '').trim())
      const existingSteps = completeSteps.filter((step) => Boolean(step.id))
      const newSteps = completeSteps.filter((step) => !step.id)

      for (let idx = 0; idx < existingSteps.length; idx += 1) {
        const step = existingSteps[idx]
        await updateConstructStep(step.id, {
          construct_id: persistedConstruct.id,
          solution_path: normalizePathKey(step.solutionPath),
          step_order: TEMP_STEP_ORDER_BASE + idx + 1,
          technique_id: step.techniqueId,
          progress_state: String(step.progressState || '').trim(),
          explanation: String(step.explanation || '').trim() || null,
        })
      }

      for (const step of existingSteps) {
        await updateConstructStep(step.id, {
          construct_id: persistedConstruct.id,
          solution_path: normalizePathKey(step.solutionPath),
          step_order: step.stepOrder,
          technique_id: step.techniqueId,
          progress_state: String(step.progressState || '').trim(),
          explanation: String(step.explanation || '').trim() || null,
        })
      }

      for (const step of newSteps) {
        const inserted = await addConstructStep({
          construct_id: persistedConstruct.id,
          solution_path: normalizePathKey(step.solutionPath),
          step_order: step.stepOrder,
          technique_id: step.techniqueId,
          progress_state: String(step.progressState || '').trim(),
          explanation: String(step.explanation || '').trim() || null,
        })
        step.id = inserted.id
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
      const mergedSteps = normalizedSteps.map((draftStep) => {
        if (draftStep.id || !draftStep.techniqueId || !String(draftStep.progressState || '').trim()) {
          return draftStep
        }

        const matchingPersistedStep = finalSteps.find((persistedStep) =>
          persistedStep.solutionPath === normalizePathKey(draftStep.solutionPath) &&
          persistedStep.stepOrder === draftStep.stepOrder &&
          persistedStep.techniqueId === draftStep.techniqueId &&
          persistedStep.progressState === normalizeMathHtmlInput(draftStep.progressState)
        )

        return matchingPersistedStep
          ? { ...draftStep, id: matchingPersistedStep.id, localId: matchingPersistedStep.localId }
          : draftStep
      })

      const nextEditorSteps = isDraftStatus ? normalizeAllPaths(mergedSteps) : finalSteps
      setSteps(nextEditorSteps)
      setActivePath(nextEditorSteps[0]?.solutionPath || DEFAULT_PATH)
      setRemovedStepIds([])
      const skippedIncompleteSteps = normalizedSteps.length - completeSteps.length
      setLastPersistedStatus(nextStatus)

      if (isDraftStatus) {
        saveDraftSnapshot(session.userId, persistedConstruct.id, {
          savedAt: new Date().toISOString(),
          form: {
            ...form,
            title: isDraftStatus ? generatedDraftTitle : form.title,
            status: nextStatus,
          },
          steps: normalizeAllPaths(mergedSteps),
          activePath,
          editorStep,
        })
      } else {
        clearDraftSnapshot(session.userId, persistedConstruct.id)
      }

      setNotice(
        skippedIncompleteSteps > 0 && isDraftStatus
          ? `Saved as ${nextStatus}. ${skippedIncompleteSteps} incomplete step${skippedIncompleteSteps === 1 ? '' : 's'} remain in the draft snapshot for later editing.`
          : `Saved as ${nextStatus}.`
      )
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
          {editorOpen ? (
            <button type="button" className="btn session-logout" onClick={() => setEditorOpen(false)}>
              Back to My Constructs
            </button>
          ) : (
            <button type="button" className="btn session-logout" onClick={onBackToCompetitive}>
              Competitive Menu
            </button>
          )}
          <button type="button" className="btn session-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      {!editorOpen && (
        <div className="construct-browser-shell">
          <div className="assets-panel construct-browser-panel">
            <div className="saved-title">My Constructs</div>
            <div className="saved-empty">Select an existing construct or start a new one to open the dedicated editor.</div>

            <div className="saved-item-actions">
              <button type="button" className="btn" onClick={startNewConstruct}>
                New Construct
              </button>
              <button type="button" className="btn" onClick={loadDependencies} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              {error && (
                <button type="button" className="btn" onClick={() => setError('')}>
                  Clear Error
                </button>
              )}
            </div>

            {error && <div className="auth-error">{error}</div>}
            {!error && notice && <div className="saved-empty">{notice}</div>}

            <div className="saved-list competitive-list">
              {loading && <div className="saved-empty">Loading constructs...</div>}
              {!loading && ownConstructs.length === 0 && <div className="saved-empty">No constructs yet.</div>}
              {!loading && ownConstructs.map((item) => (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">{item.title || 'Untitled construct'}</div>
                  <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                  <div className="saved-item-tags">Status: {item.status}</div>
                  <div className="saved-item-tags">ATK / ARM: {item.attack ?? 0} / {item.armor ?? 0}</div>
                  <div className="saved-item-tags">Ingenuity Cost: {item.ingenuity_cost ?? 0}</div>
                  <div className="saved-item-actions">
                    <button type="button" className="btn" onClick={() => loadConstruct(item)}>
                      Edit
                    </button>
                    <button type="button" className="btn danger" onClick={() => deleteConstruct(item)} disabled={saving}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <div className="construct-editor-screen">
          <div className="panel construct-workspace-panel">
            <div className="saved-title">Construct Editor</div>
            <div className="saved-empty">Move through the phases to define the construct core and then its final card data.</div>

            <div className="construct-progressbar">
              <button type="button" className="construct-progress-step is-home" onClick={() => setEditorOpen(false)}>
                <span className="construct-progress-index">1</span>
                <span className="construct-progress-label">My Constructs</span>
              </button>
              <button
                type="button"
                className={`construct-progress-step ${editorStep === 'core' ? 'is-active' : 'is-complete'}`}
                onClick={() => setEditorStep('core')}
              >
                <span className="construct-progress-index">2</span>
                <span className="construct-progress-label">Core</span>
              </button>
              <button
                type="button"
                className={`construct-progress-step ${editorStep === 'construct' ? 'is-active' : ''}`}
                onClick={() => setEditorStep('construct')}
              >
                <span className="construct-progress-index">3</span>
                <span className="construct-progress-label">Construct</span>
              </button>
            </div>

            <div className="collection-toolbar construct-editor-toolbar">
              <label className="field construct-toolbar-field">
                <span>Status</span>
                <select value={form.status} onChange={(e) => updateFormField('status', e.target.value)}>
                  {allowedStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>

              <div className="construct-toolbar-actions">
                <div className="saved-empty">
                  {isDraftStatus
                    ? 'Drafts can be saved with the minimum required field: an approved exercise. A temporary title will be created if needed.'
                    : 'Non-draft statuses require complete core steps before saving.'}
                </div>
                {lastPersistedStatus && (
                  <div className={`construct-status-indicator is-${lastPersistedStatus}`}>
                    Saved as {lastPersistedStatus}
                  </div>
                )}
                <button type="button" className="btn construct-save-btn" onClick={saveConstruct} disabled={saving || !canSave}>
                  {saving ? 'Saving...' : constructId ? 'Update Construct' : isDraftStatus ? 'Save Draft' : 'Save Construct'}
                </button>
              </div>
            </div>

            {editorStep === 'core' && (
              <div className="construct-core-layout">
                <div className="construct-core-column">
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
                    <div className="collection-toolbar">
                      <div className="saved-item-tags">
                        Exercise selected: {selectedExercise.source_title || 'Untitled source'} ({selectedExercise.topic || 'N/A'} / {selectedExercise.subtopic || 'N/A'})
                      </div>

                      <label className="field" style={{ marginTop: 8 }}>
                        <span>Statement</span>
                        <div className="rt-editor" style={{ minHeight: 120 }}>
                          <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedSelectedExerciseStatement }} />
                        </div>
                      </label>

                      <label className="field" style={{ marginTop: 8 }}>
                        <span>Final answer</span>
                        <div className="rt-editor" style={{ minHeight: 120 }}>
                          <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedSelectedExerciseFinalAnswer }} />
                        </div>
                      </label>

                      <div className="saved-item-actions">
                        <button type="button" className="btn" onClick={() => setExerciseDetailsOpen((prev) => !prev)}>
                          {exerciseDetailsOpen ? 'Hide More Details' : 'More Details'}
                        </button>
                      </div>

                      {exerciseDetailsOpen && (
                        <>
                          <label className="field" style={{ marginTop: 8 }}>
                            <span>Statement copy helper</span>
                            <DescriptionEditor
                              value={normalizeMathHtmlInput(selectedExercise.statement || '')}
                              readOnly
                              baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
                              baseFontSize={18}
                            />
                          </label>

                          <label className="field" style={{ marginTop: 8 }}>
                            <span>Final answer copy helper</span>
                            <DescriptionEditor
                              value={normalizeMathHtmlInput(selectedExercise.final_answer || '')}
                              readOnly
                              baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
                              baseFontSize={18}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="construct-core-column">
                  <div className="saved-title">Solution Paths</div>
                  <div className="saved-empty">Define how the exercise is solved before configuring the final card.</div>

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
                    const techniqueTranslation = getTechniqueTranslation(technique, techniquePickerLanguage)
                    const renderedProgress = renderMathInHtml(normalizeMathHtmlInput(step.progressState))
                    const renderedTechniqueDescription = renderMathInHtml(normalizeMathHtmlInput(techniqueTranslation.effectDescription || ''))
                    const techniqueTaxonomy = getTechniqueTaxonomy(technique, techniquePickerLanguage)
                    const showTechniqueDetails = Boolean(techniqueDetailsOpenByStep[step.localId])
                    const isTechniquePickerOpen = Boolean(techniquePickerOpenByStep[step.localId])
                    const techniqueSearch = String(techniqueSearchByStep[step.localId] || '').trim().toLowerCase()
                    const filteredTechniques = approvedTechniques.filter((item) => {
                      if (!techniqueSearch) return true
                      return String(getTechniqueTranslation(item, techniquePickerLanguage).name || '').toLowerCase().includes(techniqueSearch)
                    })
                    const selectableTechniques = technique?.id && !filteredTechniques.some((item) => item.id === technique.id)
                      ? [technique, ...filteredTechniques]
                      : filteredTechniques
                    const selectedTechniqueLabel = technique
                      ? `${getTechniqueTranslation(technique, techniquePickerLanguage).name || 'Untitled technique'} | ${techniqueTaxonomy.topic || 'No topic'}`
                      : 'Select approved technique'

                    return (
                      <div key={step.localId} className="collection-toolbar construct-step-editor" style={{ marginTop: 10 }}>
                        <div className="saved-title">Step {idx + 1} ({formatPathLabel(activePath)})</div>

                        <label className="field">
                          <span>Approved technique *</span>
                          <div className="auth-tabs" style={{ marginBottom: 8 }}>
                            {TECHNIQUE_LANGUAGE_OPTIONS.map((language) => (
                              <button
                                key={language.id}
                                type="button"
                                className={`auth-tab ${techniquePickerLanguage === language.id ? 'active' : ''}`}
                                onClick={() => setTechniquePickerLanguage(language.id)}
                              >
                                {language.label}
                              </button>
                            ))}
                          </div>
                          <div
                            className={`construct-technique-picker ${isTechniquePickerOpen ? 'is-open' : ''}`}
                            onBlur={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget)) {
                                closeTechniquePicker(step.localId)
                              }
                            }}
                          >
                            {isTechniquePickerOpen ? (
                              <>
                                <input
                                  autoFocus
                                  className="construct-technique-input"
                                  value={techniqueSearchByStep[step.localId] || ''}
                                  onChange={(e) => updateTechniqueSearch(step.localId, e.target.value)}
                                  placeholder={techniquePickerLanguage === 'fr' ? 'Search technique by French name' : 'Search technique by Spanish name'}
                                />
                                <div className="construct-technique-options" role="listbox">
                                  {selectableTechniques.length > 0 ? (
                                    selectableTechniques.map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        className={`construct-technique-option ${item.id === step.techniqueId ? 'is-selected' : ''}`}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => selectTechniqueForStep(step.localId, item.id)}
                                      >
                                        {(() => {
                                          const itemTaxonomy = getTechniqueTaxonomy(item, techniquePickerLanguage)
                                          return (getTechniqueTranslation(item, techniquePickerLanguage).name || 'Untitled technique') + ' | ' + (itemTaxonomy.topic || 'No topic')
                                        })()}
                                      </button>
                                    ))
                                  ) : (
                                    <div className="construct-technique-empty">No techniques match that name.</div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={`construct-technique-trigger ${step.techniqueId ? 'has-value' : ''}`}
                                onClick={() => openTechniquePicker(step.localId)}
                              >
                                {selectedTechniqueLabel}
                              </button>
                            )}
                          </div>
                        </label>

                        {technique && (
                          <>
                            <div className="saved-item-tags">Technique selected: {techniqueTranslation.name || 'Untitled'} ({techniqueTaxonomy.effectType || 'N/A'})</div>
                            <div className="saved-item-actions">
                              <button type="button" className="btn" onClick={() => toggleTechniqueDetails(step.localId)}>
                                {showTechniqueDetails ? 'Hide More Details' : 'More Details'}
                              </button>
                            </div>

                            {showTechniqueDetails && (
                              <>
                                <label className="field" style={{ marginTop: 10 }}>
                                  <span>Technique description preview</span>
                                  <div className="rt-editor" style={{ minHeight: 120 }}>
                                    <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedTechniqueDescription }} />
                                  </div>
                                </label>

                                <label className="field" style={{ marginTop: 10 }}>
                                  <span>Technique description copy helper</span>
                                  <DescriptionEditor
                                    value={normalizeMathHtmlInput(techniqueTranslation.effectDescription || '')}
                                    readOnly
                                    baseFontFamily={'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'}
                                    baseFontSize={18}
                                  />
                                </label>
                              </>
                            )}
                          </>
                        )}

                        <label className="field">
                          <span>Progress state *</span>
                          <DescriptionEditor
                            key={step.localId + '-' + String(step.stepOrder)}
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

                        <div className="saved-item-actions">
                          <button type="button" className="btn" onClick={() => moveStep(step.localId, 'up')} disabled={idx === 0}>Move Up</button>
                          <button type="button" className="btn" onClick={() => moveStep(step.localId, 'down')} disabled={idx === visibleSteps.length - 1}>Move Down</button>
                          <button type="button" className="btn danger" onClick={() => removeStep(step.localId)} disabled={visibleSteps.length === 1}>Remove</button>
                        </div>
                      </div>
                    )
                  })}

                  <div className="saved-item-actions" style={{ marginTop: 10 }}>
                    <button type="button" className="btn" onClick={addStep}>Add Step to Active Path</button>
                  </div>
                </div>
              </div>
            )}

            {editorStep === 'construct' && (
              <div className="construct-phase-layout">
                <div className="construct-phase-main">
                  <label className="field">
                    <span>Construct title *</span>
                    <input value={form.title} onChange={(e) => updateFormField('title', e.target.value)} />
                  </label>

                  <label className="field">
                    <span>Description</span>
                    <textarea value={form.description} onChange={(e) => updateFormField('description', e.target.value)} rows={3} />
                  </label>

                  <div className="construct-media-layout">
                    <div className="construct-media-fields">
                      <label className="field">
                        <span>Construct image URL</span>
                        <input
                          value={form.imageUrl}
                          onChange={(e) => updateFormField('imageUrl', e.target.value)}
                          placeholder="https://image-url"
                        />
                      </label>

                      <label className="field">
                        <span>Upload construct image</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onloadend = () => {
                              updateFormField('imageUrl', String(reader.result || ''))
                            }
                            reader.readAsDataURL(file)
                            event.target.value = ''
                          }}
                        />
                      </label>

                      <div className="saved-empty">
                        Recommended: use an external image URL to avoid storing large data URLs in the database.
                      </div>
                    </div>

                    <div className="construct-image-preview-card">
                      <div className="saved-title">Construct image preview</div>
                      <img
                        className="construct-image-preview"
                        src={normalizeImageUrl(form.imageUrl) || DEFAULT_ART_DATA_URL}
                        alt="Construct preview"
                        onError={(event) => {
                          event.currentTarget.onerror = null
                          event.currentTarget.src = DEFAULT_ART_DATA_URL
                        }}
                      />
                    </div>
                  </div>

                  <div className="competitive-grid">
                    <label className="field">
                      <span>Attack</span>
                      <input value={form.attack} onChange={(e) => updateFormField('attack', e.target.value)} placeholder="0" />
                    </label>
                    <label className="field">
                      <span>Armor</span>
                      <input value={form.armor} onChange={(e) => updateFormField('armor', e.target.value)} placeholder="0" />
                    </label>
                    <label className="field">
                      <span>Ingenuity Cost</span>
                      <input
                        value={form.ingenuityCost}
                        onChange={(e) => updateFormField('ingenuityCost', e.target.value)}
                        placeholder="0"
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Effect strength</span>
                    <select value={form.effectStrength} onChange={(e) => updateFormField('effectStrength', e.target.value)}>
                      {EFFECT_STRENGTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <div className="collection-toolbar construct-budget-panel">
                    <div className="saved-title">Construct Budget</div>
                    <div className="saved-empty">
                      Minimum cost comes from total steps. Budget follows `2 x cost + 1`, and stronger effects consume part of that budget.
                    </div>
                    <div className="saved-item-tags">Total steps detected: {totalConstructSteps}</div>
                    <div className="saved-item-tags">Minimum cost from steps: {minimumConstructCost}</div>
                    <div className="saved-item-tags">Selected effect tier: {selectedEffectStrength.label}</div>
                    <div className="saved-item-tags">Current stat budget: {constructBudget}</div>
                    <div className={`saved-item-tags ${statsWithinBudget ? 'construct-budget-ok' : 'construct-budget-over'}`}>
                      Assigned stats: {totalAssignedStats} / {constructBudget}
                    </div>
                    <div className={`saved-item-tags ${numericCost >= minimumConstructCost ? 'construct-budget-ok' : 'construct-budget-over'}`}>
                      Cost check: {numericCost} / minimum {minimumConstructCost}
                    </div>
                  </div>

                  <label className="field">
                    <span>Effects</span>
                    <textarea
                      value={form.effects}
                      onChange={(e) => updateFormField('effects', e.target.value)}
                      rows={3}
                      placeholder="Optional combat or utility effects"
                    />
                  </label>
                </div>

                <div className="construct-phase-side">
                  <div className="collection-toolbar">
                    <div className="saved-title">Ready to Save</div>
                    <div className="saved-empty">Configure the final card data and save or update the construct.</div>
                    <div className="saved-item-tags">Exercise selected: {form.exerciseId ? 'Yes' : 'No'}</div>
                    <div className="saved-item-tags">Paths: {pathOptions.length}</div>
                    <div className="saved-item-tags">Steps: {steps.length}</div>
                    <div className="saved-item-tags">Core complete: {canAdvanceFromCore ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </div>
            )}

            {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
            {!error && notice && <div className="saved-empty" style={{ marginTop: 12 }}>{notice}</div>}

            <div className="construct-phase-actions">
              <button type="button" className="btn" onClick={() => setEditorOpen(false)}>
                Back to My Constructs
              </button>
              {editorStep === 'construct' && (
                <button type="button" className="btn" onClick={() => setEditorStep('core')}>
                  Back to Core
                </button>
              )}
              {editorStep === 'core' && (
                <button type="button" className="btn" onClick={() => setEditorStep('construct')}>
                  Continue to Construct
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
