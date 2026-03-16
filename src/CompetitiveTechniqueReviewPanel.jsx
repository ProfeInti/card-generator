import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listProposedCompetitiveTechniques,
  reviewProposedCompetitiveTechnique,
} from './data/competitiveTechniquesRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { getTechniqueTranslation, TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

export default function CompetitiveTechniqueReviewPanel({ session, onBackToCompetitive, onLogout }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [creatorNamesById, setCreatorNamesById] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeLanguage, setActiveLanguage] = useState('es')

  const selected = items.find((row) => row.id === selectedId) || null
  const selectedTranslation = useMemo(() => getTechniqueTranslation(selected, activeLanguage), [activeLanguage, selected])
  const renderedEffectDescription = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selectedTranslation.effectDescription)),
    [selectedTranslation.effectDescription]
  )
  const renderedWorkedExample = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(selectedTranslation.workedExample)),
    [selectedTranslation.workedExample]
  )

  const creatorLabel = (id) => creatorNamesById[id] || id || 'Unknown'

  const loadProposals = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const normalized = await listProposedCompetitiveTechniques()
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
      setError(err?.message || 'Could not load proposed techniques.')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    loadProposals()
  }, [loadProposals])

  const reviewTechnique = async (decision) => {
    if (!selected) return

    setActionLoading(true)
    setError('')
    setNotice('')

    try {
      await reviewProposedCompetitiveTechnique(selected.id, session.userId, decision)
      setNotice(decision === 'approve' ? 'Technique approved and published to the catalog.' : 'Technique rejected.')
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
        <h1 className="page-title">Teacher Review - Competitive Techniques</h1>
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
          <div className="saved-title">Proposed techniques</div>
          <button type="button" className="btn" onClick={loadProposals} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          <div className="saved-list competitive-list">
            {loading && <div className="saved-empty">Loading proposals...</div>}
            {!loading && items.length === 0 && <div className="saved-empty">No proposed techniques.</div>}
            {!loading &&
              items.map((item) => (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">{item.name || 'Untitled technique'}</div>
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
          {!selected && <div className="saved-empty">Select a proposed technique to review.</div>}

          {selected && (
            <>
              <div className="saved-title">Review detail</div>
              <div className="saved-item-date">Updated: {formatDate(selected.updated_at)}</div>
              <div className="saved-item-tags">Creator: {creatorLabel(selected.created_by)}</div>

              <div className="auth-tabs" style={{ marginTop: 12 }}>
                {TECHNIQUE_LANGUAGE_OPTIONS.map((language) => (
                  <button
                    key={language.id}
                    type="button"
                    className={`auth-tab ${activeLanguage === language.id ? 'active' : ''}`}
                    onClick={() => setActiveLanguage(language.id)}
                  >
                    {language.label}
                  </button>
                ))}
              </div>

              <div className="collection-toolbar" style={{ marginTop: 12 }}>
                <div className="saved-title">Technique</div>
                <div className="saved-empty">{selectedTranslation.name || 'N/A'}</div>
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

              <div className="saved-item-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={actionLoading}
                  onClick={() => reviewTechnique('approve')}
                >
                  {actionLoading ? 'Processing...' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={actionLoading}
                  onClick={() => reviewTechnique('reject')}
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


