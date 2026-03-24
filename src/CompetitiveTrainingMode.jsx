import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getApprovedConstructDetailForTraining,
  listApprovedConstructs,
  listConstructExerciseSummariesByIds,
} from './data/competitiveConstructsRepo'
import { listApprovedCompetitiveTechniques } from './data/competitiveTechniquesRepo'
import { getTechniqueDisplayName, getTechniqueTaxonomy } from './lib/competitiveTechniqueLocale'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

const DISTRACTOR_COUNT = 11
const DEFAULT_PATH = 'main'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function normalizePathKey(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || DEFAULT_PATH
}

function formatPathLabel(path) {
  return normalizePathKey(path).replace(/[-_]+/g, ' ')
}

function topicScore(candidate, correct) {
  if (!candidate || !correct) return 0
  const candidateTaxonomy = getTechniqueTaxonomy(candidate)
  const correctTaxonomy = getTechniqueTaxonomy(correct)
  const sameSubtopic = normalize(candidateTaxonomy.subtopic) && normalize(candidateTaxonomy.subtopic) === normalize(correctTaxonomy.subtopic)
  if (sameSubtopic) return 2

  const sameTopic = normalize(candidateTaxonomy.topic) && normalize(candidateTaxonomy.topic) === normalize(correctTaxonomy.topic)
  if (sameTopic) return 1

  return 0
}

function shuffleArray(items) {
  const next = [...items]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }

  return next
}

function buildTechniqueOptions(currentStep, allApprovedTechniques, techniquesById) {
  if (!currentStep?.technique_id) return []

  const correct = techniquesById[currentStep.technique_id] || null
  if (!correct) return []

  const distractorPool = allApprovedTechniques
    .filter((item) => item.id !== correct.id)
    .sort((a, b) => {
      const scoreDiff = topicScore(b, correct) - topicScore(a, correct)
      if (scoreDiff !== 0) return scoreDiff
      return String(a.name || '').localeCompare(String(b.name || ''))
    })

  const distractors = distractorPool.slice(0, DISTRACTOR_COUNT)
  const options = [correct, ...distractors]

  return shuffleArray(options)
}

export default function CompetitiveTrainingMode({ session, onBackToCompetitive, onLogout }) {
  const [approvedConstructs, setApprovedConstructs] = useState([])
  const [exerciseById, setExerciseById] = useState({})
  const [approvedTechniques, setApprovedTechniques] = useState([])

  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')

  const [selectedConstructId, setSelectedConstructId] = useState(null)
  const [detail, setDetail] = useState(null)

  const [selectedPath, setSelectedPath] = useState(DEFAULT_PATH)

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [progressHistory, setProgressHistory] = useState([])
  const [selectedTechniqueId, setSelectedTechniqueId] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [completed, setCompleted] = useState(false)

  const [techniqueSearch, setTechniqueSearch] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [subtopicFilter, setSubtopicFilter] = useState('')
  const [effectTypeFilter, setEffectTypeFilter] = useState('')

  const allSteps = useMemo(() => {
    const rows = Array.isArray(detail?.steps) ? detail.steps : []
    return rows.map((step) => ({
      ...step,
      solution_path: normalizePathKey(step.solution_path),
    }))
  }, [detail?.steps])

  const pathOptions = useMemo(() => {
    const unique = new Set(allSteps.map((step) => step.solution_path).filter(Boolean))
    if (!unique.size) unique.add(DEFAULT_PATH)
    return [...unique].sort((a, b) => a.localeCompare(b))
  }, [allSteps])

  const steps = useMemo(() => {
    return allSteps
      .filter((step) => step.solution_path === selectedPath)
      .sort((a, b) => Number(a.step_order) - Number(b.step_order))
  }, [allSteps, selectedPath])

  const techniquesById = useMemo(() => {
    const map = {}

    approvedTechniques.forEach((item) => {
      map[item.id] = item
    })

    Object.entries(detail?.techniquesById || {}).forEach(([id, value]) => {
      if (!map[id]) map[id] = value
    })

    return map
  }, [approvedTechniques, detail?.techniquesById])

  const selectedConstruct = useMemo(
    () => approvedConstructs.find((item) => item.id === selectedConstructId) || null,
    [approvedConstructs, selectedConstructId]
  )

  const selectedExercise = useMemo(() => {
    const exerciseId = detail?.construct?.exercise_id || selectedConstruct?.exercise_id
    return exerciseById[exerciseId] || detail?.exercise || null
  }, [detail?.construct?.exercise_id, detail?.exercise, selectedConstruct?.exercise_id, exerciseById])

  const currentStep = steps[currentStepIndex] || null

  const techniqueOptions = useMemo(
    () => buildTechniqueOptions(currentStep, approvedTechniques, techniquesById),
    [currentStep, approvedTechniques, techniquesById]
  )

  const topicOptions = useMemo(
    () => [...new Set(techniqueOptions.map((item) => String(getTechniqueTaxonomy(item).topic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [techniqueOptions]
  )

  const subtopicOptions = useMemo(
    () => [...new Set(techniqueOptions.map((item) => String(getTechniqueTaxonomy(item).subtopic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [techniqueOptions]
  )

  const effectTypeOptions = useMemo(
    () => [...new Set(techniqueOptions.map((item) => String(getTechniqueTaxonomy(item).effectType || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [techniqueOptions]
  )

  const filteredTechniqueOptions = useMemo(() => {
    const search = normalize(techniqueSearch)
    const matches = techniqueOptions.filter((technique) => {
      const taxonomy = getTechniqueTaxonomy(technique)
      if (topicFilter && normalize(taxonomy.topic) !== normalize(topicFilter)) return false
      if (subtopicFilter && normalize(taxonomy.subtopic) !== normalize(subtopicFilter)) return false
      if (effectTypeFilter && normalize(taxonomy.effectType) !== normalize(effectTypeFilter)) return false

      if (!search) return true

      const haystack = [
        getTechniqueDisplayName(technique),
        taxonomy.topic,
        taxonomy.subtopic,
        taxonomy.effectType,
        normalizeMathHtmlInput(technique.effect_description || ''),
      ]
        .map((value) => normalize(value))
        .join(' ')

      return haystack.includes(search)
    })

    if (!currentStep?.technique_id) return matches

    const hasCorrect = matches.some((item) => item.id === currentStep.technique_id)
    if (hasCorrect) return matches

    const correct = techniqueOptions.find((item) => item.id === currentStep.technique_id)
    return correct ? [correct, ...matches] : matches
  }, [techniqueOptions, techniqueSearch, topicFilter, subtopicFilter, effectTypeFilter, currentStep?.technique_id])

  const renderedExercise = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selectedExercise?.statement || '')),
    [selectedExercise?.statement]
  )

  const renderedProgress = useMemo(
    () =>
      progressHistory.map((item) => ({
        ...item,
        renderedHtml: renderMathInHtml(normalizeMathHtmlInput(item.html || '')),
      })),
    [progressHistory]
  )

  const resetTrainingState = useCallback(() => {
    setCurrentStepIndex(0)
    setProgressHistory([])
    setSelectedTechniqueId('')
    setCompleted(false)
    setTechniqueSearch('')
    setTopicFilter('')
    setSubtopicFilter('')
    setEffectTypeFilter('')
  }, [])

  const loadBaseData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [constructRows, techniqueRows] = await Promise.all([
        listApprovedConstructs(session.userId),
        listApprovedCompetitiveTechniques(session.userId),
      ])

      setApprovedConstructs(constructRows)
      setApprovedTechniques(techniqueRows)

      const exerciseIds = [...new Set(constructRows.map((row) => row.exercise_id).filter(Boolean))]
      const exerciseRows = await listConstructExerciseSummariesByIds(exerciseIds)
      const byId = exerciseRows.reduce((acc, row) => {
        acc[row.id] = row
        return acc
      }, {})
      setExerciseById(byId)

      if (!selectedConstructId && constructRows.length > 0) {
        setSelectedConstructId(constructRows[0].id)
      }
    } catch (err) {
      setError(err?.message || 'Could not load training data.')
    } finally {
      setLoading(false)
    }
  }, [selectedConstructId, session.userId])

  const startTraining = useCallback(async (constructId) => {
    if (!constructId) return

    setDetailLoading(true)
    setError('')
    setFeedback(null)

    try {
      const response = await getApprovedConstructDetailForTraining(constructId)
      const rows = Array.isArray(response?.steps) ? response.steps : []
      const availablePaths = [...new Set(rows.map((step) => normalizePathKey(step.solution_path)).filter(Boolean))]
      const nextPath = availablePaths[0] || DEFAULT_PATH

      setDetail(response)
      setSelectedPath(nextPath)
      resetTrainingState()

      const initialState = normalizeMathHtmlInput(response?.exercise?.statement || '')
      setProgressHistory([
        {
          id: 'exercise-statement',
          label: 'Exercise statement',
          html: initialState,
        },
      ])

      const pathStepCount = rows.filter((step) => normalizePathKey(step.solution_path) === nextPath).length
      if (pathStepCount === 0) {
        setFeedback({ type: 'info', message: 'This path has no steps yet.' })
      } else {
        setFeedback({ type: 'info', message: 'Select the next technique card to continue.' })
      }
    } catch (err) {
      setError(err?.message || 'Could not load construct training detail.')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [resetTrainingState])

  useEffect(() => {
    loadBaseData()
  }, [loadBaseData])

  useEffect(() => {
    if (!selectedConstructId) {
      setDetail(null)
      return
    }

    startTraining(selectedConstructId)
  }, [selectedConstructId, startTraining])

  useEffect(() => {
    if (!pathOptions.includes(selectedPath)) {
      setSelectedPath(pathOptions[0] || DEFAULT_PATH)
    }
  }, [pathOptions, selectedPath])

  useEffect(() => {
    if (!detail?.exercise) return

    resetTrainingState()
    setProgressHistory([
      {
        id: 'exercise-statement',
        label: 'Exercise statement',
        html: normalizeMathHtmlInput(detail.exercise.statement || ''),
      },
    ])

    if (!steps.length) {
      setFeedback({ type: 'info', message: 'This path has no steps yet.' })
    } else {
      setFeedback({ type: 'info', message: 'Select the next technique card to continue.' })
    }
  }, [detail?.exercise, detail?.exercise?.statement, resetTrainingState, selectedPath, steps.length])

  const handleTechniquePick = (techniqueId) => {
    if (!currentStep || completed) return

    setSelectedTechniqueId(techniqueId)

    if (techniqueId !== currentStep.technique_id) {
      setFeedback({
        type: 'error',
        message: 'Incorrect technique. Try another technique card for this step.',
      })
      return
    }

    const nextProgress = normalizeMathHtmlInput(currentStep.progress_state)
    setProgressHistory((prev) => [
      ...prev,
      {
        id: `step-${currentStep.id || currentStepIndex + 1}`,
        label: `Step ${currentStep.step_order || currentStepIndex + 1}`,
        html: nextProgress,
      },
    ])

    const isLastStep = currentStepIndex >= steps.length - 1
    if (isLastStep) {
      setCompleted(true)
      setFeedback({
        type: 'success',
        message: 'Training completed. You reconstructed the full construct path.',
      })
      return
    }

    setCurrentStepIndex((prev) => prev + 1)
    setSelectedTechniqueId('')
    setFeedback({ type: 'success', message: 'Correct technique. Continue with the next step.' })
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Training Mode</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
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
          <div className="saved-title">Approved Constructs</div>
          <button type="button" className="btn" onClick={loadBaseData} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading approved constructs...</div>}
            {!loading && approvedConstructs.length === 0 && (
              <div className="saved-empty">No approved constructs available for training yet.</div>
            )}
            {!loading && approvedConstructs.map((item) => {
              const exercise = exerciseById[item.exercise_id] || null
              const isSelected = item.id === selectedConstructId

              return (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">{item.title || 'Untitled construct'}</div>
                  <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                  <div className="saved-item-tags">Exercise: {exercise?.source_title || 'N/A'}</div>
                  <div className="saved-item-tags">Topic: {exercise?.topic || 'N/A'} / {exercise?.subtopic || 'N/A'}</div>
                  <div className="saved-item-tags">Ingenuity Cost: {item.ingenuity_cost ?? 0}</div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSelectedConstructId(item.id)}
                    disabled={isSelected}
                  >
                    {isSelected ? 'Selected' : 'Start'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel">
          {!selectedConstructId && <div className="saved-empty">Select an approved construct to start training.</div>}
          {selectedConstructId && detailLoading && <div className="saved-empty">Loading training workspace...</div>}

          {selectedConstructId && !detailLoading && detail?.construct && (
            <div className="training-workspace">
              <div className="training-card training-exercise-card">
                <div className="saved-title">Exercise Card</div>
                <div className="saved-item-name">{selectedConstruct?.title || detail.construct.title || 'Construct'}</div>
                <div className="saved-item-tags">
                  {selectedExercise?.source_title || 'N/A'} | {selectedExercise?.topic || 'N/A'} / {selectedExercise?.subtopic || 'N/A'}
                </div>
                <div className="saved-item-tags">Ingenuity Cost: {detail.construct.ingenuity_cost ?? 0}</div>
                <div className="saved-item-tags">
                  Source location: {selectedExercise?.source_location || 'N/A'} | Page: {selectedExercise?.page_number || 'N/A'} | Exercise: {selectedExercise?.exercise_number || 'N/A'}
                </div>
                <div className="rt-editor training-math-box">
                  <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedExercise }} />
                </div>
              </div>

              <label className="field" style={{ marginBottom: 0 }}>
                <span>Solution path</span>
                <select value={selectedPath} onChange={(e) => setSelectedPath(normalizePathKey(e.target.value))}>
                  {pathOptions.map((path) => (
                    <option key={path} value={path}>{formatPathLabel(path)}</option>
                  ))}
                </select>
              </label>

              <div className="training-step-layout">
                <div className="training-card training-progress-card">
                  <div className="saved-title">Current Progress State</div>
                  <div className="saved-item-tags">
                    Path: {formatPathLabel(selectedPath)} | Step {steps.length === 0 ? 0 : Math.min(currentStepIndex + 1, steps.length)} of {steps.length}
                  </div>
                  {renderedProgress.map((item) => (
                    <div key={item.id} className="collection-toolbar" style={{ marginTop: 10 }}>
                      <div className="saved-item-tags">{item.label}</div>
                      <div className="rt-editor training-math-box">
                        <div className="card-description" dangerouslySetInnerHTML={{ __html: item.renderedHtml }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="training-card">
                  {!completed && (
                    <>
                      <div className="saved-title">Select the next Technique Card</div>

                      <div className="training-filters-grid">
                        <label className="field" style={{ marginBottom: 0 }}>
                          <span>Search</span>
                          <input
                            value={techniqueSearch}
                            onChange={(e) => setTechniqueSearch(e.target.value)}
                            placeholder="Name, topic, effect..."
                          />
                        </label>

                        <label className="field" style={{ marginBottom: 0 }}>
                          <span>Topic</span>
                          <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                            <option value="">All</option>
                            {topicOptions.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </label>

                        <label className="field" style={{ marginBottom: 0 }}>
                          <span>Subtopic</span>
                          <select value={subtopicFilter} onChange={(e) => setSubtopicFilter(e.target.value)}>
                            <option value="">All</option>
                            {subtopicOptions.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </label>

                        <label className="field" style={{ marginBottom: 0 }}>
                          <span>Effect type</span>
                          <select value={effectTypeFilter} onChange={(e) => setEffectTypeFilter(e.target.value)}>
                            <option value="">All</option>
                            {effectTypeOptions.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="saved-item-actions" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setTechniqueSearch('')
                            setTopicFilter('')
                            setSubtopicFilter('')
                            setEffectTypeFilter('')
                          }}
                        >
                          Clear Filters
                        </button>
                      </div>

                      <div className="saved-empty" style={{ marginTop: 8 }}>
                        Showing {filteredTechniqueOptions.length} of {techniqueOptions.length} technique cards.
                      </div>

                      <div className="training-tech-grid">
                        {filteredTechniqueOptions.map((technique) => {
                          const isSelected = selectedTechniqueId === technique.id
                          const isCorrectSelection = isSelected && currentStep?.technique_id === technique.id
                          const isWrongSelection = isSelected && currentStep?.technique_id !== technique.id

                          const renderedEffect = renderMathInHtml(normalizeMathHtmlInput(technique.effect_description || ''))
                          const taxonomy = getTechniqueTaxonomy(technique)

                          return (
                            <button
                              key={technique.id}
                              type="button"
                              className={`training-tech-card ${isSelected ? 'is-selected' : ''} ${isCorrectSelection ? 'is-correct' : ''} ${isWrongSelection ? 'is-wrong' : ''}`}
                              onClick={() => handleTechniquePick(technique.id)}
                            >
                              <div className="training-tech-name">{getTechniqueDisplayName(technique)}</div>
                              <div className="training-tech-meta">{taxonomy.topic || 'N/A'} / {taxonomy.subtopic || 'N/A'}</div>
                              <div className="training-tech-meta">Effect: {taxonomy.effectType || 'N/A'}</div>
                              <div className="training-tech-effect" dangerouslySetInnerHTML={{ __html: renderedEffect }} />
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {completed && (
                    <>
                      <div className="saved-title">Training Complete</div>
                      <div className="saved-empty">You completed the construct using the full approved sequence.</div>
                      {steps.map((step) => {
                        const technique = techniquesById[step.technique_id] || null
                        const renderedStepProgress = renderMathInHtml(normalizeMathHtmlInput(step.progress_state || ''))

                        return (
                          <div key={step.id} className="collection-toolbar" style={{ marginTop: 10 }}>
                            <div className="saved-title">Step {step.step_order} ({formatPathLabel(step.solution_path)})</div>
                            <div className="saved-empty">Technique: {technique ? getTechniqueDisplayName(technique) : 'N/A'}</div>
                            <div className="rt-editor training-math-box">
                              <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedStepProgress }} />
                            </div>
                            <div className="saved-empty">Explanation: {step.explanation || 'N/A'}</div>
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              </div>

              {feedback && (
                <div className={feedback.type === 'error' ? 'auth-error' : 'saved-empty'}>
                  {feedback.message}
                </div>
              )}
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}




