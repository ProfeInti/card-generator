import { useCallback, useEffect, useMemo, useState } from 'react'
import { listApprovedConstructs, listConstructExerciseSummariesByIds } from './data/competitiveConstructsRepo'
import { getMultiplayerDeck, replaceMultiplayerDeckConstructs } from './data/multiplayerDeckRepo'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function reindexDeckItems(items) {
  return items.map((item, index) => ({
    ...item,
    position_index: index + 1,
  }))
}

export default function MultiplayerDeckBuilder({ session, onBackToLobby, onLogout }) {
  const [approvedConstructs, setApprovedConstructs] = useState([])
  const [exerciseById, setExerciseById] = useState({})
  const [deck, setDeck] = useState(null)
  const [deckItems, setDeckItems] = useState([])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [search, setSearch] = useState('')
  const [topicFilter, setTopicFilter] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [constructRows, deckResponse] = await Promise.all([
        listApprovedConstructs(session.userId),
        getMultiplayerDeck(session.userId),
      ])

      setApprovedConstructs(constructRows)
      setDeck(deckResponse.deck)
      setDeckItems(deckResponse.items)

      const exerciseIds = [...new Set(constructRows.map((row) => row.exercise_id).filter(Boolean))]
      const exerciseRows = await listConstructExerciseSummariesByIds(exerciseIds)
      const nextExerciseById = exerciseRows.reduce((acc, row) => {
        acc[row.id] = row
        return acc
      }, {})
      setExerciseById(nextExerciseById)
    } catch (err) {
      setError(err?.message || 'Could not load multiplayer deck builder.')
    } finally {
      setLoading(false)
    }
  }, [session.userId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const constructById = useMemo(
    () =>
      approvedConstructs.reduce((acc, row) => {
        acc[row.id] = row
        return acc
      }, {}),
    [approvedConstructs]
  )

  const selectedConstructIds = useMemo(
    () => deckItems.map((item) => item.construct_id).filter(Boolean),
    [deckItems]
  )

  const selectedConstructIdSet = useMemo(() => new Set(selectedConstructIds), [selectedConstructIds])

  const selectedDeckConstructs = useMemo(() => {
    return deckItems
      .map((item) => {
        const construct = constructById[item.construct_id]
        if (!construct) return null

        return {
          ...construct,
          deck_item_id: item.id,
          position_index: item.position_index,
        }
      })
      .filter(Boolean)
  }, [constructById, deckItems])

  const availableConstructs = useMemo(() => {
    const normalizedSearch = normalize(search)

    return approvedConstructs
      .filter((construct) => !selectedConstructIdSet.has(construct.id))
      .filter((construct) => {
        const exercise = exerciseById[construct.exercise_id] || null
        if (topicFilter && normalize(exercise?.topic) !== normalize(topicFilter)) return false

        if (!normalizedSearch) return true

        const haystack = [
          construct.title,
          construct.description,
          construct.effects,
          exercise?.source_title,
          exercise?.topic,
          exercise?.subtopic,
        ]
          .map((value) => normalize(value))
          .join(' ')

        return haystack.includes(normalizedSearch)
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || 0).getTime()
        const bTime = new Date(b.updated_at || 0).getTime()
        return bTime - aTime
      })
  }, [approvedConstructs, exerciseById, search, selectedConstructIdSet, topicFilter])

  const topicOptions = useMemo(() => {
    const values = new Set(
      approvedConstructs
        .map((construct) => exerciseById[construct.exercise_id]?.topic || '')
        .map((value) => String(value).trim())
        .filter(Boolean)
    )

    return [...values].sort((a, b) => a.localeCompare(b))
  }, [approvedConstructs, exerciseById])

  const handleAddConstruct = (constructId) => {
    if (!constructId || selectedConstructIdSet.has(constructId)) return

    setDeckItems((prev) => [
      ...prev,
      {
        id: `local-${constructId}`,
        deck_id: deck?.id || null,
        construct_id: constructId,
        position_index: prev.length + 1,
      },
    ])
    setNotice('')
  }

  const handleRemoveConstruct = (constructId) => {
    setDeckItems((prev) => reindexDeckItems(prev.filter((item) => item.construct_id !== constructId)))
    setNotice('')
  }

  const handleMoveConstruct = (constructId, direction) => {
    setDeckItems((prev) => {
      const index = prev.findIndex((item) => item.construct_id === constructId)
      if (index < 0) return prev

      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= prev.length) return prev

      const nextItems = [...prev]
      ;[nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]]
      return reindexDeckItems(nextItems)
    })
    setNotice('')
  }

  const handleSaveDeck = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      await replaceMultiplayerDeckConstructs(session.userId, selectedConstructIds)
      setNotice(
        selectedConstructIds.length >= 3
          ? 'Multiplayer deck saved and ready for matches.'
          : 'Deck saved. Add at least 3 constructs before marking ready in multiplayer.'
      )
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not save multiplayer deck.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Multiplayer Deck Builder</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
          <button type="button" className="btn session-logout" onClick={onBackToLobby}>
            Back to Lobby
          </button>
          <button type="button" className="btn session-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className="competitive-layout">
        <div className="assets-panel">
          <div className="saved-title">Approved Constructs</div>
          <div className="saved-empty">
            Add the approved constructs that should become your multiplayer draw pile.
          </div>

          <div className="collection-toolbar">
            <label className="field">
              <span>Search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, effect, topic..."
              />
            </label>

            <label className="field">
              <span>Topic</span>
              <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="">All</option>
                {topicOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <button type="button" className="btn" onClick={loadData} disabled={loading || saving}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {loading && <div className="saved-empty">Loading approved constructs...</div>}
            {!loading && approvedConstructs.length === 0 && (
              <div className="saved-empty">You do not have approved constructs available yet.</div>
            )}
            {!loading && approvedConstructs.length > 0 && availableConstructs.length === 0 && (
              <div className="saved-empty">No available constructs match the current filters.</div>
            )}

            {!loading && availableConstructs.map((item) => {
              const exercise = exerciseById[item.exercise_id] || null

              return (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">{item.title || 'Untitled construct'}</div>
                  <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                  <div className="saved-item-tags">ATK / ARM: {item.attack ?? 0} / {item.armor ?? 0}</div>
                  <div className="saved-item-tags">Ingenuity Cost: {item.ingenuity_cost ?? 0}</div>
                  <div className="saved-item-tags">Topic: {exercise?.topic || 'N/A'} / {exercise?.subtopic || 'N/A'}</div>
                  <div className="saved-item-tags">Exercise: {exercise?.source_title || 'N/A'}</div>
                  <button type="button" className="btn" onClick={() => handleAddConstruct(item.id)}>
                    Add to Deck
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel">
          <div className="saved-title">Your Multiplayer Deck</div>
          <div className="saved-empty">
            Deck size: {selectedConstructIds.length} construct{selectedConstructIds.length === 1 ? '' : 's'}.
            {' '}
            {selectedConstructIds.length >= 3 ? 'Ready for multiplayer.' : 'Minimum 3 constructs required.'}
          </div>
          {deck?.updated_at && (
            <div className="saved-item-date">Last saved: {formatDate(deck.updated_at)}</div>
          )}

          <div className="saved-item-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={handleSaveDeck} disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save Deck'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDeckItems([])
                setNotice('')
              }}
              disabled={saving || loading || deckItems.length === 0}
            >
              Clear Deck
            </button>
          </div>

          <div className="saved-list competitive-list" style={{ marginTop: 10 }}>
            {!loading && selectedDeckConstructs.length === 0 && (
              <div className="saved-empty">No constructs selected yet.</div>
            )}

            {!loading && selectedDeckConstructs.map((item, index) => {
              const exercise = exerciseById[item.exercise_id] || null

              return (
                <div key={item.id} className="saved-item">
                  <div className="saved-item-name">
                    #{index + 1} {item.title || 'Untitled construct'}
                  </div>
                  <div className="saved-item-date">Updated: {formatDate(item.updated_at)}</div>
                  <div className="saved-item-tags">ATK / ARM: {item.attack ?? 0} / {item.armor ?? 0}</div>
                  <div className="saved-item-tags">Ingenuity Cost: {item.ingenuity_cost ?? 0}</div>
                  <div className="saved-item-tags">Topic: {exercise?.topic || 'N/A'} / {exercise?.subtopic || 'N/A'}</div>
                  <div className="saved-item-tags">Exercise: {exercise?.source_title || 'N/A'}</div>

                  <div className="saved-item-actions">
                    <button type="button" className="btn" onClick={() => handleMoveConstruct(item.id, -1)} disabled={index === 0}>
                      Move Up
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleMoveConstruct(item.id, 1)}
                      disabled={index === selectedDeckConstructs.length - 1}
                    >
                      Move Down
                    </button>
                    <button type="button" className="btn danger" onClick={() => handleRemoveConstruct(item.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}
        </div>
      </div>
    </div>
  )
}
