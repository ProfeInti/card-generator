import { useEffect, useMemo, useState } from 'react'
import { listVisibleCompetitiveExercises } from './data/competitiveExercisesRepo'
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

export default function CompetitiveExercisesCollection({ session, onBackToCompetitive, onOpenEditor, onLogout }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const [topicFilter, setTopicFilter] = useState('')
  const [subtopicFilter, setSubtopicFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const selected = items.find((row) => row.id === selectedId) || null

  const renderedStatement = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selected?.statement)),
    [selected?.statement]
  )
  const renderedFinalAnswer = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selected?.final_answer)),
    [selected?.final_answer]
  )

  const loadItems = async () => {
    setLoading(true)
    setError('')

    try {
      const rows = await listVisibleCompetitiveExercises(session.userId)
      setItems(rows)

      if (!selectedId && rows.length > 0) {
        setSelectedId(rows[0].id)
      }

      if (selectedId && !rows.some((row) => row.id === selectedId)) {
        setSelectedId(rows[0]?.id ?? null)
      }
    } catch (err) {
      setError(err?.message || 'Could not load exercises collection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadItems()
  }, [session.userId])

  const topics = useMemo(
    () => [...new Set(items.map((row) => String(row.topic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const subtopics = useMemo(
    () => [...new Set(items.map((row) => String(row.subtopic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const difficulties = useMemo(
    () => [...new Set(items.map((row) => String(row.difficulty || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const statuses = useMemo(
    () => [...new Set(items.map((row) => String(row.status || '').trim()).filter(Boolean))],
    [items]
  )

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
      if (topicFilter && normalize(row.topic) !== normalize(topicFilter)) return false
      if (subtopicFilter && normalize(row.subtopic) !== normalize(subtopicFilter)) return false
      if (difficultyFilter && normalize(row.difficulty) !== normalize(difficultyFilter)) return false
      if (statusFilter && normalize(row.status) !== normalize(statusFilter)) return false
      return true
    })
  }, [items, topicFilter, subtopicFilter, difficultyFilter, statusFilter])

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Exercises Collection</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
          <button type="button" className="btn session-logout" onClick={onOpenEditor}>
            Open Exercises Editor
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
          <div className="saved-title">Visible Exercises</div>

          <div className="collection-toolbar">
            <label className="field">
              <span>Topic</span>
              <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="">All</option>
                {topics.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Subtopic</span>
              <select value={subtopicFilter} onChange={(e) => setSubtopicFilter(e.target.value)}>
                <option value="">All</option>
                {subtopics.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Difficulty</span>
              <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
                <option value="">All</option>
                {difficulties.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <button type="button" className="btn" onClick={loadItems} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="saved-empty">Approved items in this collection are ready for future construct generation.</div>

          <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading collection...</div>}
            {!loading && filteredItems.length === 0 && <div className="saved-empty">No exercises for current filters.</div>}
            {!loading && filteredItems.map((item) => (
              <div key={item.id} className="saved-item">
                <div className="saved-item-name">{item.source_title || 'Untitled source'}</div>
                <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                <div className="saved-item-tags">Status: {item.status}</div>
                <div className="saved-item-tags">Topic: {item.topic || 'N/A'} / {item.subtopic || 'N/A'}</div>
                <button type="button" className="btn" onClick={() => setSelectedId(item.id)}>
                  View
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          {!selected && <div className="saved-empty">Select an exercise from the collection.</div>}

          {selected && (
            <>
              <div className="saved-title">Exercise Detail</div>
              <div className="saved-item-date">Updated: {formatDate(selected.updated_at)}</div>
              <div className="saved-item-tags">Status: {selected.status}</div>
              {selected.status === 'approved' && <div className="saved-item-tags">Approved for construct usage</div>}

              <div className="collection-toolbar" style={{ marginTop: 12 }}>
                <div className="saved-title">Source</div>
                <div className="saved-empty">{selected.source_title || 'N/A'}</div>
                <div className="saved-empty">Source title: {selected.source_work_title || 'N/A'}</div>
                <div className="saved-empty">Location: {selected.source_location || 'N/A'}</div>
                <div className="saved-empty">Page: {selected.page_number || 'N/A'}</div>
                <div className="saved-empty">Exercise #: {selected.exercise_number || 'N/A'}</div>
                <div className="saved-empty">Topic: {selected.topic || 'N/A'} / {selected.subtopic || 'N/A'}</div>
                <div className="saved-empty">Difficulty: {selected.difficulty || 'N/A'}</div>
              </div>

              <label className="field">
                <span>Statement</span>
                <div className="rt-editor" style={{ minHeight: 160 }}>
                  <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedStatement }} />
                </div>
              </label>

              <label className="field">
                <span>Final answer</span>
                <div className="rt-editor" style={{ minHeight: 120 }}>
                  <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedFinalAnswer }} />
                </div>
              </label>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}

