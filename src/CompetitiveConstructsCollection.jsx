import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getConstructDetail,
  listApprovedConstructs,
  listConstructExerciseSummariesByIds,
  listOwnConstructs,
} from './data/competitiveConstructsRepo'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function normalize(v) {
  return String(v || '').trim().toLowerCase()
}

export default function CompetitiveConstructsCollection({ session, onBackToCompetitive, onOpenGenerator, onLogout }) {
  const [sourceMode, setSourceMode] = useState('own')
  const [ownConstructs, setOwnConstructs] = useState([])
  const [approvedConstructs, setApprovedConstructs] = useState([])
  const [exerciseById, setExerciseById] = useState({})

  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)

  const [statusFilter, setStatusFilter] = useState('')
  const [exerciseFilter, setExerciseFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')

  const list = sourceMode === 'approved' ? approvedConstructs : ownConstructs

  const loadCollection = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [ownRows, approvedRows] = await Promise.all([
        listOwnConstructs(session.userId),
        listApprovedConstructs(session.userId),
      ])

      setOwnConstructs(ownRows)
      setApprovedConstructs(approvedRows)

      const allRows = [...ownRows, ...approvedRows]
      const exerciseIds = [...new Set(allRows.map((row) => row.exercise_id).filter(Boolean))]
      const summaries = await listConstructExerciseSummariesByIds(exerciseIds)
      const byId = summaries.reduce((acc, row) => {
        acc[row.id] = row
        return acc
      }, {})
      setExerciseById(byId)

      if (!selectedId && allRows.length > 0) {
        setSelectedId(allRows[0].id)
      }

      if (selectedId && !allRows.some((row) => row.id === selectedId)) {
        setSelectedId(allRows[0]?.id ?? null)
        setDetail(null)
      }
    } catch (err) {
      setError(err?.message || 'Could not load constructs collection.')
    } finally {
      setLoading(false)
    }
  }, [selectedId, session.userId])

  const loadDetail = async (constructId) => {
    if (!constructId) {
      setDetail(null)
      return
    }

    setDetailLoading(true)
    setError('')

    try {
      const response = await getConstructDetail(constructId)
      setDetail(response)
    } catch (err) {
      setError(err?.message || 'Could not load construct detail.')
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    loadCollection()
  }, [loadCollection])

  useEffect(() => {
    loadDetail(selectedId)
  }, [selectedId])

  const exerciseOptions = useMemo(() => {
    const options = Object.values(exerciseById).map((row) => ({
      id: row.id,
      label: row.source_title || 'Untitled source',
      topic: row.topic || '',
    }))
    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [exerciseById])

  const topicOptions = useMemo(() => {
    const topics = new Set(
      Object.values(exerciseById)
        .map((row) => String(row.topic || '').trim())
        .filter(Boolean)
    )
    return [...topics].sort((a, b) => a.localeCompare(b))
  }, [exerciseById])

  const statusOptions = useMemo(
    () => [...new Set(list.map((row) => String(row.status || '').trim()).filter(Boolean))],
    [list]
  )

  const filteredList = useMemo(() => {
    return list.filter((row) => {
      const exercise = exerciseById[row.exercise_id] || null

      if (statusFilter && normalize(row.status) !== normalize(statusFilter)) return false
      if (exerciseFilter && row.exercise_id !== exerciseFilter) return false
      if (topicFilter && normalize(exercise?.topic) !== normalize(topicFilter)) return false

      return true
    })
  }, [list, exerciseById, statusFilter, exerciseFilter, topicFilter])

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Constructs Collection</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
          <button type="button" className="btn session-logout" onClick={onOpenGenerator}>
            Open Construct Generator
          </button>
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
          <div className="saved-title">Construct Sources</div>

          <div className="saved-item-actions" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setSourceMode('own')}
              disabled={sourceMode === 'own'}
            >
              Own Constructs
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSourceMode('approved')}
              disabled={sourceMode === 'approved'}
            >
              Approved Constructs
            </button>
          </div>

          <div className="collection-toolbar">
            <label className="field">
              <span>Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                {statusOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Exercise</span>
              <select value={exerciseFilter} onChange={(e) => setExerciseFilter(e.target.value)}>
                <option value="">All</option>
                {exerciseOptions.map((row) => (
                  <option key={row.id} value={row.id}>{row.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Topic</span>
              <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="">All</option>
                {topicOptions.map((row) => (
                  <option key={row} value={row}>{row}</option>
                ))}
              </select>
            </label>

            <button type="button" className="btn" onClick={loadCollection} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="saved-empty">
            Approved constructs in this collection are ready for future training consumption.
          </div>

          <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading constructs...</div>}
            {!loading && filteredList.length === 0 && <div className="saved-empty">No constructs for current filters.</div>}
            {!loading && filteredList.map((item) => {
              const exercise = exerciseById[item.exercise_id] || null
              return (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">{item.title || 'Untitled construct'}</div>
                  <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                  <div className="saved-item-tags">Status: {item.status}</div>
                  <div className="saved-item-tags">ATK / ARM: {item.attack ?? 0} / {item.armor ?? 0}</div>
                  <div className="saved-item-tags">Ingenuity Cost: {item.ingenuity_cost ?? 0}</div>
                  <div className="saved-item-tags">Exercise: {exercise?.source_title || 'N/A'}</div>
                  <button type="button" className="btn" onClick={() => setSelectedId(item.id)}>
                    View
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel">
          {!selectedId && <div className="saved-empty">Select a construct from the collection.</div>}
          {selectedId && detailLoading && <div className="saved-empty">Loading construct detail...</div>}

          {selectedId && !detailLoading && detail?.construct && (
            <>
              <div className="saved-title">Construct Detail</div>
              <div className="saved-item-date">Updated: {formatDate(detail.construct.updated_at)}</div>
              <div className="saved-item-tags">Status: {detail.construct.status}</div>
              {detail.construct.status === 'approved' && (
                <div className="saved-item-tags">Approved for future training consumption</div>
              )}

              <div className="collection-toolbar" style={{ marginTop: 12 }}>
                <div className="saved-title">Metadata</div>
                <div className="saved-empty">Title: {detail.construct.title || 'N/A'}</div>
                <div className="saved-empty">Description: {detail.construct.description || 'N/A'}</div>
                <div className="saved-empty">Attack: {detail.construct.attack ?? 0}</div>
                <div className="saved-empty">Armor: {detail.construct.armor ?? 0}</div>
                <div className="saved-empty">Ingenuity Cost: {detail.construct.ingenuity_cost ?? 0}</div>
                <div className="saved-empty">Effects: {detail.construct.effects || 'N/A'}</div>
              </div>

              <div className="collection-toolbar" style={{ marginTop: 12 }}>
                <div className="saved-title">Referenced Exercise</div>
                <div className="saved-empty">{detail.exercise?.source_title || 'N/A'}</div>
                <div className="saved-empty">
                  Topic: {detail.exercise?.topic || 'N/A'} / {detail.exercise?.subtopic || 'N/A'}
                </div>
                <div className="saved-empty">Difficulty: {detail.exercise?.difficulty || 'N/A'}</div>
              </div>

              <div className="saved-title" style={{ marginTop: 12 }}>Ordered Steps</div>
              {detail.steps.length === 0 && <div className="saved-empty">No steps defined.</div>}

              {detail.steps.map((step) => {
                const technique = detail.techniquesById?.[step.technique_id] || null
                const renderedProgress = renderMathInHtml(normalizeMathHtmlInput(step.progress_state))

                return (
                  <div key={step.id} className="collection-toolbar" style={{ marginTop: 10 }}>
                    <div className="saved-title">Step {step.step_order} ({step.solution_path || 'main'})</div>
                    <div className="saved-empty">Technique: {technique?.name || 'N/A'}</div>
                    <div className="saved-empty">
                      Topic: {technique?.topic || 'N/A'} / {technique?.subtopic || 'N/A'}
                    </div>
                    <div className="saved-empty">Effect type: {technique?.effect_type || 'N/A'}</div>

                    <label className="field" style={{ marginTop: 8 }}>
                      <span>Progress state</span>
                      <div className="rt-editor" style={{ minHeight: 120 }}>
                        <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedProgress }} />
                      </div>
                    </label>

                    <div className="saved-empty">Explanation: {step.explanation || 'N/A'}</div>
                  </div>
                )
              })}
            </>
          )}

          {error && <div className="auth-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}


