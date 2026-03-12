import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listProposedCompetitiveExercises,
  reviewProposedCompetitiveExercise,
} from './data/competitiveExercisesRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

export default function CompetitiveReviewPanel({ session, onBackToCompetitive, onLogout }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [creatorNamesById, setCreatorNamesById] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selected = items.find((row) => row.id === selectedId) || null
  const renderedStatement = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selected?.statement)),
    [selected?.statement]
  )
  const renderedFinalAnswer = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selected?.final_answer)),
    [selected?.final_answer]
  )

  const creatorLabel = (id) => creatorNamesById[id] || id || 'Unknown'

  const loadProposals = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const normalized = await listProposedCompetitiveExercises()
      setItems(normalized)
      try {
        const names = await listProfileUsernamesByIds(normalized.map((row) => row.created_by))
        setCreatorNamesById(names)
      } catch {
        setCreatorNamesById({})
      }

      if (!selectedId && normalized.length > 0) {
        setSelectedId(normalized[0].id)
      }

      if (selectedId && !normalized.some((row) => row.id === selectedId)) {
        setSelectedId(normalized[0]?.id ?? null)
      }
    } catch (err) {
      setError(err?.message || 'Could not load proposed exercises.')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    loadProposals()
  }, [loadProposals])

  const reviewExercise = async (decision) => {
    if (!selected) return

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      await reviewProposedCompetitiveExercise(selected.id, session.userId, decision)
      setNotice(decision === 'approve' ? 'Exercise approved.' : 'Exercise rejected.')
      await loadProposals()
    } catch (err) {
      setError(err?.message || 'Could not apply review decision.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Teacher Review - Competitive Exercises</h1>
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
          <div className="saved-title">Proposed exercises</div>
          <button type="button" className="btn" onClick={loadProposals} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          <div className="saved-list competitive-list">
            {loading && <div className="saved-empty">Loading proposals...</div>}
            {!loading && items.length === 0 && <div className="saved-empty">No proposed exercises.</div>}
            {!loading &&
              items.map((item) => (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">{item.source_title || 'Untitled source'}</div>
                  <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                  <div className="saved-item-tags">Creator: {creatorLabel(item.created_by)}</div>
                  <button type="button" className="btn" onClick={() => setSelectedId(item.id)}>
                    Open
                  </button>
                </div>
              ))}
          </div>
        </div>

        <div className="panel">
          {!selected && <div className="saved-empty">Select a proposed exercise to review.</div>}

          {selected && (
            <>
              <div className="saved-title">Review detail</div>
              <div className="saved-item-date">Updated: {formatDate(selected.updated_at)}</div>
              <div className="saved-item-tags">Creator: {creatorLabel(selected.created_by)}</div>

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

              <div className="saved-item-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={actionLoading}
                  onClick={() => reviewExercise('approve')}
                >
                  {actionLoading ? 'Processing...' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={actionLoading}
                  onClick={() => reviewExercise('reject')}
                >
                  {actionLoading ? 'Processing...' : 'Reject'}
                </button>
              </div>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}
        </div>
      </div>
    </div>
  )
}



