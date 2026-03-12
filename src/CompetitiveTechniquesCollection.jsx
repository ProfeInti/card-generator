import { useCallback, useEffect, useMemo, useState } from 'react'
import { listVisibleCompetitiveTechniques } from './data/competitiveTechniquesRepo'
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

export default function CompetitiveTechniquesCollection({ session, onBackToCompetitive, onOpenEditor, onLogout }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const [topicFilter, setTopicFilter] = useState('')
  const [subtopicFilter, setSubtopicFilter] = useState('')
  const [effectTypeFilter, setEffectTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const selected = items.find((row) => row.id === selectedId) || null

  const renderedEffectDescription = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selected?.effect_description)),
    [selected?.effect_description]
  )

  const renderedWorkedExample = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selected?.worked_example)),
    [selected?.worked_example]
  )

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const rows = await listVisibleCompetitiveTechniques(session.userId)
      setItems(rows)

      if (!selectedId && rows.length > 0) {
        setSelectedId(rows[0].id)
      }

      if (selectedId && !rows.some((row) => row.id === selectedId)) {
        setSelectedId(rows[0]?.id ?? null)
      }
    } catch (err) {
      setError(err?.message || 'Could not load techniques collection.')
    } finally {
      setLoading(false)
    }
  }, [selectedId, session.userId])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const topics = useMemo(
    () => [...new Set(items.map((row) => String(row.topic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const subtopics = useMemo(
    () => [...new Set(items.map((row) => String(row.subtopic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items]
  )

  const effectTypes = useMemo(
    () => [...new Set(items.map((row) => String(row.effect_type || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
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
      if (effectTypeFilter && normalize(row.effect_type) !== normalize(effectTypeFilter)) return false
      if (statusFilter && normalize(row.status) !== normalize(statusFilter)) return false
      return true
    })
  }, [items, topicFilter, subtopicFilter, effectTypeFilter, statusFilter])

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Techniques Collection</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
          <button type="button" className="btn session-logout" onClick={onOpenEditor}>
            Open Techniques Editor
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
          <div className="saved-title">Visible Techniques</div>

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
              <span>Effect type</span>
              <select value={effectTypeFilter} onChange={(e) => setEffectTypeFilter(e.target.value)}>
                <option value="">All</option>
                {effectTypes.map((value) => (
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

          <div className="saved-empty">Approved techniques in this collection are ready for future construct generation.</div>

          <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading collection...</div>}
            {!loading && filteredItems.length === 0 && <div className="saved-empty">No techniques for current filters.</div>}
            {!loading && filteredItems.map((item) => (
              <div key={item.id} className="saved-item">
                <div className="saved-item-name">{item.name || 'Untitled technique'}</div>
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
          {!selected && <div className="saved-empty">Select a technique from the collection.</div>}

          {selected && (
            <>
              <div className="saved-title">Technique Detail</div>
              <div className="saved-item-date">Updated: {formatDate(selected.updated_at)}</div>
              <div className="saved-item-tags">Status: {selected.status}</div>
              {selected.status === 'approved' && <div className="saved-item-tags">Approved for construct usage</div>}

              <div className="collection-toolbar" style={{ marginTop: 12 }}>
                <div className="saved-title">Technique</div>
                <div className="saved-empty">Name: {selected.name || 'N/A'}</div>
                <div className="saved-empty">Topic: {selected.topic || 'N/A'} / {selected.subtopic || 'N/A'}</div>
                <div className="saved-empty">Effect type: {selected.effect_type || 'N/A'}</div>
              </div>

              <label className="field">
                <span>Effect description</span>
                <div className="rt-editor" style={{ minHeight: 160 }}>
                  <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedEffectDescription }} />
                </div>
              </label>

              <label className="field">
                <span>Worked example</span>
                <div className="rt-editor" style={{ minHeight: 160 }}>
                  <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedWorkedExample }} />
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


