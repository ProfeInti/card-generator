import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  approveConstruct,
  getConstructDetail,
  listProposedConstructsForReview,
  rejectConstruct,
} from './data/competitiveConstructsRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

export default function CompetitiveConstructReviewPanel({ session, onBackToCompetitive, onLogout }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [creatorNamesById, setCreatorNamesById] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selected = items.find((row) => row.id === selectedId) || null

  const stepRows = useMemo(() => (Array.isArray(detail?.steps) ? detail.steps : []), [detail?.steps])
  const creatorLabel = (id) => creatorNamesById[id] || id || 'Unknown'

  const loadProposals = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const rows = await listProposedConstructsForReview()
      setItems(rows)
      try {
        const names = await listProfileUsernamesByIds(rows.map((row) => row.created_by))
        setCreatorNamesById(names)
      } catch {
        setCreatorNamesById({})
      }

      if (!selectedId && rows.length > 0) {
        setSelectedId(rows[0].id)
      }

      if (selectedId && !rows.some((row) => row.id === selectedId)) {
        setSelectedId(rows[0]?.id ?? null)
        setDetail(null)
      }
    } catch (err) {
      setError(err?.message || 'Could not load proposed constructs.')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  const loadDetail = useCallback(async (constructId) => {
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
  }, [])

  useEffect(() => {
    loadProposals()
  }, [loadProposals])

  useEffect(() => {
    loadDetail(selectedId)
  }, [loadDetail, selectedId])

  const reviewConstruct = async (decision) => {
    if (!selectedId) return

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      if (decision === 'approve') {
        await approveConstruct(selectedId, session.userId)
        setNotice('Construct approved.')
      } else {
        await rejectConstruct(selectedId, session.userId)
        setNotice('Construct rejected.')
      }

      await loadProposals()
      await loadDetail(selectedId)
    } catch (err) {
      setError(err?.message || 'Could not apply review decision.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Teacher Review - Constructs</h1>
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
          <div className="saved-title">Proposed constructs</div>
          <button type="button" className="btn" onClick={loadProposals} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          <div className="saved-list competitive-list">
            {loading && <div className="saved-empty">Loading proposals...</div>}
            {!loading && items.length === 0 && <div className="saved-empty">No proposed constructs.</div>}
            {!loading && items.map((item) => (
              <div key={item.id} className="saved-item">
                <div className="saved-item-name">{item.title || 'Untitled construct'}</div>
                <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                <div className="saved-item-tags">Creator: {creatorLabel(item.created_by)}</div>
                <div className="saved-item-tags">ATK / ARM: {item.attack ?? 0} / {item.armor ?? 0}</div>
                <button type="button" className="btn" onClick={() => setSelectedId(item.id)}>
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          {!selected && <div className="saved-empty">Select a proposed construct to review.</div>}
          {selected && detailLoading && <div className="saved-empty">Loading construct detail...</div>}

          {selected && !detailLoading && detail?.construct && (
            <>
              <div className="saved-title">Construct Detail</div>
              <div className="saved-item-date">Updated: {formatDate(detail.construct.updated_at)}</div>
              <div className="saved-item-tags">Creator: {creatorLabel(detail.construct.created_by)}</div>
              <div className="saved-item-tags">Status: {detail.construct.status}</div>

              <div className="collection-toolbar" style={{ marginTop: 12 }}>
                <div className="saved-title">Metadata</div>
                <div className="saved-empty">Title: {detail.construct.title || 'N/A'}</div>
                <div className="saved-empty">Description: {detail.construct.description || 'N/A'}</div>
                <div className="saved-empty">Attack: {detail.construct.attack ?? 0}</div>
                <div className="saved-empty">Armor: {detail.construct.armor ?? 0}</div>
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
              {stepRows.length === 0 && <div className="saved-empty">No steps defined.</div>}

              {stepRows.map((step) => {
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

              <div className="saved-item-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={actionLoading}
                  onClick={() => reviewConstruct('approve')}
                >
                  {actionLoading ? 'Processing...' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={actionLoading}
                  onClick={() => reviewConstruct('reject')}
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


