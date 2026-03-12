import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  endMultiplayerTurn,
  getMultiplayerMatch,
  getMultiplayerRoom,
  listMatchCards,
  listMatchConstructs,
  listMatchPlayers,
  listRoomPlayersByRoomIds,
  listTechniqueCardDetailsByIds,
  playConstructFromHand,
} from './data/multiplayerLobbyRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function formatCountdown(deadline) {
  if (!deadline) return 'No deadline'
  const remainingMs = new Date(deadline).getTime() - Date.now()
  if (!Number.isFinite(remainingMs)) return 'No deadline'
  if (remainingMs <= 0) return '0s'
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const nextKey = item?.[key]
    if (!nextKey) return acc
    if (!acc[nextKey]) acc[nextKey] = []
    acc[nextKey].push(item)
    return acc
  }, {})
}

function buildBoardSlots(boardCards, constructsById) {
  const bySlot = new Map(
    (boardCards || []).map((card) => [Number(card.position_index), constructsById[card.linked_match_construct_id] || { isUnknownOccupant: true, slot_index: Number(card.position_index) }])
  )
  return [1, 2, 3].map((slot) => bySlot.get(slot) || null)
}

function getOpenSlotsFromBoardCards(boardCards) {
  const occupiedSlots = new Set(
    (boardCards || [])
      .map((card) => Number(card.position_index))
      .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 3)
  )
  return [1, 2, 3].filter((slot) => !occupiedSlots.has(slot))
}

function deriveConstructState(construct) {
  if (!construct) return 'empty'
  if (construct.state) return construct.state
  if (construct.destroyed_at) return 'destroyed'
  if (Number(construct.armor ?? 0) <= 0) return 'vulnerable'
  return 'protected'
}

function renderRichContent(value) {
  return renderMathInHtml(normalizeMathHtmlInput(value || ''))
}

function PlayerHeader({ label, username, isCurrentTurn, playerState, constructCount }) {
  return (
    <div className="mp-player-header">
      <div>
        <div className="mp-player-label">{label}</div>
        <div className="mp-player-name">{username}</div>
      </div>
      <div className="mp-player-metrics">
        <div className="mp-player-chip">{isCurrentTurn ? 'Current turn' : 'Waiting'}</div>
        <div className="mp-player-chip">Life: {playerState?.life_total ?? 30}</div>
        <div className="mp-player-chip">Ingenuity: {playerState?.ingenuity_current ?? 0} / {playerState?.ingenuity_max ?? 0}</div>
        <div className="mp-player-chip">Constructs: {constructCount}</div>
      </div>
    </div>
  )
}

function HtmlBlock({ html }) {
  return <div className="mp-details-body rich-html" dangerouslySetInnerHTML={{ __html: html }} />
}

function DetailsModal({ detailCard, onClose }) {
  if (!detailCard) return null

  if (detailCard.kind === 'technique') {
    return (
      <div className="mp-details-backdrop" onClick={onClose}>
        <div className="mp-details-modal" onClick={(event) => event.stopPropagation()}>
          <div className="mp-details-header">
            <div>
              <div className="mp-details-kicker">Technique</div>
              <div className="mp-details-title">{detailCard.title}</div>
            </div>
            <button type="button" className="btn" onClick={onClose}>Close</button>
          </div>
          <div className="mp-details-grid">
            <div className="mp-details-item"><strong>Topic:</strong> {detailCard.topic || 'N/A'}</div>
            <div className="mp-details-item"><strong>Subtopic:</strong> {detailCard.subtopic || 'N/A'}</div>
            <div className="mp-details-item"><strong>Effect Type:</strong> {detailCard.effectType || 'N/A'}</div>
          </div>
          <div className="mp-details-section">
            <div className="mp-details-section-title">Effect</div>
            <HtmlBlock html={detailCard.effectHtml} />
          </div>
          {detailCard.workedExampleHtml && (
            <div className="mp-details-section">
              <div className="mp-details-section-title">Worked Example</div>
              <HtmlBlock html={detailCard.workedExampleHtml} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mp-details-backdrop" onClick={onClose}>
      <div className="mp-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="mp-details-header">
          <div>
            <div className="mp-details-kicker">Construct</div>
            <div className="mp-details-title">{detailCard.title}</div>
          </div>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="mp-details-grid">
          <div className="mp-details-item"><strong>Attack:</strong> {detailCard.attack}</div>
          <div className="mp-details-item"><strong>Armor:</strong> {detailCard.armor}</div>
          <div className="mp-details-item"><strong>Ingenuity Cost:</strong> {detailCard.ingenuityCost}</div>
          <div className="mp-details-item"><strong>Steps:</strong> {detailCard.steps}</div>
          <div className="mp-details-item"><strong>State:</strong> {detailCard.state}</div>
          <div className="mp-details-item"><strong>Owner:</strong> {detailCard.ownerName}</div>
        </div>
        {detailCard.descriptionHtml && (
          <div className="mp-details-section">
            <div className="mp-details-section-title">Construct Description</div>
            <HtmlBlock html={detailCard.descriptionHtml} />
          </div>
        )}
        {detailCard.exerciseStatementHtml && (
          <div className="mp-details-section">
            <div className="mp-details-section-title">Exercise Statement</div>
            <HtmlBlock html={detailCard.exerciseStatementHtml} />
          </div>
        )}
        {detailCard.exerciseAnswerHtml && (
          <div className="mp-details-section">
            <div className="mp-details-section-title">Exercise Answer</div>
            <HtmlBlock html={detailCard.exerciseAnswerHtml} />
          </div>
        )}
        {detailCard.effectsHtml && (
          <div className="mp-details-section">
            <div className="mp-details-section-title">Effects</div>
            <HtmlBlock html={detailCard.effectsHtml} />
          </div>
        )}
      </div>
    </div>
  )
}

function ConstructCard({ construct, ownerName, onShowDetails }) {
  if (!construct) {
    return (
      <div className="mp-slot-card is-empty">
        <div className="mp-slot-empty">Empty slot</div>
      </div>
    )
  }

  if (construct.isUnknownOccupant) {
    return (
      <div className="mp-slot-card is-vulnerable">
        <div className="mp-slot-topline">
          <span className="mp-slot-index">Slot {construct.slot_index}</span>
          <span className="mp-state-pill is-vulnerable">Occupied</span>
        </div>
        <div className="mp-slot-title">Battlefield card</div>
        <div className="mp-slot-stats">The slot is occupied by a card that needs a state refresh.</div>
      </div>
    )
  }

  const state = deriveConstructState(construct)
  const stateLabel = state.charAt(0).toUpperCase() + state.slice(1)

  return (
    <div className={`mp-slot-card is-${state}`}>
      <div className="mp-slot-topline">
        <span className="mp-slot-index">Slot {construct.slot_index}</span>
        <span className={`mp-state-pill is-${state}`}>{stateLabel}</span>
      </div>
      <div className="mp-slot-title">{construct.title}</div>
      <div className="mp-slot-stats">ATK {construct.attack ?? 0} | ARM {construct.armor ?? 0}</div>
      <div className="mp-slot-stats">Cost {construct.ingenuity_cost ?? 0} | Steps {construct.stability_remaining} / {construct.stability_total}</div>
      <div className="mp-slot-actions">
        <button type="button" className="btn" onClick={() => onShowDetails(construct, ownerName)}>
          More Details
        </button>
      </div>
    </div>
  )
}

function SideZone({ title, count, hint }) {
  return (
    <div className="mp-side-zone">
      <div className="mp-side-zone-title">{title}</div>
      <div className="mp-side-zone-count">{count}</div>
      <div className="mp-side-zone-hint">{hint}</div>
    </div>
  )
}

function HandCard({ card, construct, technique, canPlay, openSlots, onPlay, onShowDetails }) {
  if (card.source_type === 'technique') {
    return (
      <div className="mp-hand-card is-technique">
        <div>
          <div className="mp-hand-card-type">Technique</div>
          <div className="mp-hand-card-title">{technique?.name || 'Technique'}</div>
          <div className="mp-hand-card-copy">{technique?.topic || 'No topic'}</div>
          <div className="mp-hand-card-copy">{technique?.effect_type || 'No effect type'}</div>
        </div>
        <div className="mp-hand-card-actions">
          <button type="button" className="btn" onClick={() => onShowDetails(card, technique)}>
            More Details
          </button>
        </div>
      </div>
    )
  }

  const slotOptions = [1, 2, 3]

  return (
    <div className="mp-hand-card is-construct">
      <div>
        <div className="mp-hand-card-type">Construct</div>
        <div className="mp-hand-card-title">{construct?.title || 'Construct'}</div>
        <div className="mp-hand-card-copy">ATK {construct?.attack ?? 0} | ARM {construct?.armor ?? 0}</div>
        <div className="mp-hand-card-copy">Cost {construct?.ingenuity_cost ?? 0}</div>
      </div>
      <div className="mp-hand-card-actions">
        <button type="button" className="btn" onClick={() => onShowDetails(card, construct)}>
          More Details
        </button>
      </div>
      <div className="mp-hand-slot-actions">
        {slotOptions.map((slot) => {
          const isOpen = openSlots.includes(slot)
          return (
            <button
              key={slot}
              type="button"
              className="btn"
              disabled={!canPlay || !isOpen}
              onClick={() => onPlay(card.id, slot)}
              title={isOpen ? 'Play this construct into slot ' + slot : 'Slot ' + slot + ' is occupied'}
            >
              Slot {slot}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function MultiplayerMatch({ session, matchId, onBackToLobby, onLogout }) {
  const [match, setMatch] = useState(null)
  const [room, setRoom] = useState(null)
  const [playersByRoomId, setPlayersByRoomId] = useState({})
  const [matchPlayers, setMatchPlayers] = useState([])
  const [matchCards, setMatchCards] = useState([])
  const [constructs, setConstructs] = useState([])
  const [techniqueDetailsById, setTechniqueDetailsById] = useState({})
  const [usernameById, setUsernameById] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [countdownLabel, setCountdownLabel] = useState('')
  const [detailCard, setDetailCard] = useState(null)
  const autoEndedTurnKeyRef = useRef('')

  const loadMatch = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
    }
    setError('')

    try {
      if (!matchId) throw new Error('Match not found.')
      const matchRow = await getMultiplayerMatch(matchId)
      const roomRow = await getMultiplayerRoom(matchRow.room_id)
      const [roomPlayerRows, matchPlayerRows, cardRows, constructRows] = await Promise.all([
        listRoomPlayersByRoomIds([matchRow.room_id]),
        listMatchPlayers(matchId),
        listMatchCards(matchId),
        listMatchConstructs(matchId),
      ])

      const users = [...new Set([
        roomRow.created_by,
        matchRow.player1_id,
        matchRow.player2_id,
        matchRow.current_turn_user_id,
        ...roomPlayerRows.map((row) => row.user_id),
        ...matchPlayerRows.map((row) => row.user_id),
        ...constructRows.map((row) => row.owner_user_id),
        ...cardRows.map((row) => row.owner_user_id),
      ].filter(Boolean))]
      const techniqueIds = cardRows.map((row) => row.source_technique_id).filter(Boolean)
      const [usernames, techniquesById] = await Promise.all([
        listProfileUsernamesByIds(users),
        listTechniqueCardDetailsByIds(techniqueIds),
      ])

      setMatch(matchRow)
      setRoom(roomRow)
      setPlayersByRoomId(groupBy(roomPlayerRows, 'room_id'))
      setMatchPlayers(matchPlayerRows)
      setMatchCards(cardRows)
      setConstructs(constructRows)
      setTechniqueDetailsById(techniquesById)
      setUsernameById(usernames)
      if (!silent) {
        setNotice('Battlefield state loaded.')
      }
    } catch (err) {
      setError(err?.message || 'Could not load multiplayer match.')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [matchId])

  useEffect(() => {
    loadMatch()
  }, [loadMatch])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadMatch({ silent: true })
    }, 3000)

    return () => window.clearInterval(intervalId)
  }, [loadMatch])

  useEffect(() => {
    setCountdownLabel(formatCountdown(match?.turn_deadline_at))
    if (!match?.turn_deadline_at) return undefined

    const intervalId = window.setInterval(() => {
      setCountdownLabel(formatCountdown(match.turn_deadline_at))
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [match?.turn_deadline_at])

  const orderedPlayers = useMemo(() => {
    if (!match) return []
    return [match.player1_id, match.player2_id].filter(Boolean)
  }, [match])

  const ownPlayerId = session.userId
  const enemyPlayerId = useMemo(
    () => orderedPlayers.find((playerId) => playerId !== ownPlayerId) || null,
    [orderedPlayers, ownPlayerId]
  )

  const roomPlayers = playersByRoomId[room?.id] || []
  const constructsById = useMemo(
    () => constructs.reduce((acc, item) => {
      acc[item.id] = item
      return acc
    }, {}),
    [constructs]
  )
  const playerStateByUserId = useMemo(
    () => matchPlayers.reduce((acc, item) => {
      acc[item.user_id] = item
      return acc
    }, {}),
    [matchPlayers]
  )
  const cardsByOwner = useMemo(() => groupBy(matchCards, 'owner_user_id'), [matchCards])

  const ownCards = cardsByOwner[ownPlayerId] || []
  const enemyCards = cardsByOwner[enemyPlayerId] || []
  const ownBoardCards = ownCards.filter((card) => card.zone === 'board' && card.source_type === 'construct')
  const enemyBoardCards = enemyCards.filter((card) => card.zone === 'board' && card.source_type === 'construct')
  const ownHandCards = ownCards
    .filter((card) => card.zone === 'hand')
    .sort((a, b) => (a.position_index ?? 999) - (b.position_index ?? 999))

  const ownBoard = useMemo(() => buildBoardSlots(ownBoardCards, constructsById), [ownBoardCards, constructsById])
  const enemyBoard = useMemo(() => buildBoardSlots(enemyBoardCards, constructsById), [enemyBoardCards, constructsById])
  const openOwnSlots = useMemo(() => getOpenSlotsFromBoardCards(ownBoardCards), [ownBoardCards])
  const ownTechniqueCount = ownCards.filter((card) => card.source_type === 'technique').length
  const enemyTechniqueCount = enemyCards.filter((card) => card.source_type === 'technique').length
  const isOwnTurn = match?.current_turn_user_id === ownPlayerId
  const currentTurnKey = `${match?.id || 'no-match'}:${match?.turn_number || 0}:${match?.current_turn_user_id || 'no-player'}:${match?.turn_deadline_at || 'no-deadline'}`

  const openConstructDetails = (construct, ownerName) => {
    if (!construct) return
    setDetailCard({
      kind: 'construct',
      title: construct.title || 'Construct',
      attack: construct.attack ?? 0,
      armor: construct.armor ?? 0,
      ingenuityCost: construct.ingenuity_cost ?? 0,
      steps: `${construct.stability_remaining ?? 0} / ${construct.stability_total ?? 0}`,
      state: deriveConstructState(construct),
      ownerName: ownerName || 'Unknown',
      descriptionHtml: renderRichContent(construct.description),
      exerciseStatementHtml: construct.exercise_statement ? renderRichContent(construct.exercise_statement) : '',
      exerciseAnswerHtml: construct.exercise_final_answer ? renderRichContent(construct.exercise_final_answer) : '',
      effectsHtml: construct.effects ? renderRichContent(construct.effects) : '',
    })
  }

  const openHandDetails = (card, payload) => {
    if (card.source_type === 'technique') {
      setDetailCard({
        kind: 'technique',
        title: payload?.name || 'Technique',
        topic: payload?.topic || 'N/A',
        subtopic: payload?.subtopic || 'N/A',
        effectType: payload?.effect_type || 'N/A',
        effectHtml: renderRichContent(payload?.effect_description || '<p>No effect description.</p>'),
        workedExampleHtml: payload?.worked_example ? renderRichContent(payload.worked_example) : '',
      })
      return
    }

    openConstructDetails(payload, session.username)
  }

  const handlePlayConstruct = async (cardId, slotIndex) => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const result = await playConstructFromHand(matchId, cardId, slotIndex)
      setNotice(result?.message || 'Construct played successfully.')
      await loadMatch()
    } catch (err) {
      setError(err?.message || 'Could not play construct from hand.')
    } finally {
      setSaving(false)
    }
  }

  const handleEndTurn = useCallback(async ({ automatic = false } = {}) => {
    setSaving(true)
    if (!automatic) {
      setError('')
      setNotice('')
    }

    try {
      const result = await endMultiplayerTurn(matchId)
      setNotice(result?.message || (automatic ? 'Turn ended automatically.' : 'Turn ended successfully.'))
      await loadMatch({ silent: automatic })
    } catch (err) {
      const message = err?.message || 'Could not end turn.'
      if (automatic && (message.includes('It is not your turn.') || message.includes('Match is not active.'))) {
        await loadMatch({ silent: true })
      } else {
        setError(message)
      }
    } finally {
      setSaving(false)
    }
  }, [loadMatch, matchId])

  useEffect(() => {
    if (!match?.turn_deadline_at || saving || loading) return
    const deadlineMs = new Date(match.turn_deadline_at).getTime()
    if (!Number.isFinite(deadlineMs) || deadlineMs > Date.now()) return
    if (autoEndedTurnKeyRef.current === currentTurnKey) return
    autoEndedTurnKeyRef.current = currentTurnKey
    handleEndTurn({ automatic: true })
  }, [currentTurnKey, handleEndTurn, loading, match?.turn_deadline_at, saving])

  return (
    <div className="page">
      <div className="session-row">
        <h1 className="page-title">Multiplayer Match</h1>
        <div className="session-user-row">
          <span className="session-user">User: {session.username} ({session.role})</span>
          <button type="button" className="btn session-logout" onClick={() => loadMatch()} disabled={loading || saving}>
            {loading ? 'Refreshing...' : 'Refresh Match'}
          </button>
          <button type="button" className="btn session-logout" onClick={onBackToLobby} disabled={saving}>
            Back to Lobby
          </button>
          <button type="button" className="btn session-logout" onClick={onLogout} disabled={saving}>
            Log out
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className="panel" style={{ marginBottom: 16 }}>
          {error && <div className="auth-error">{error}</div>}
          {!error && notice && <div className="saved-empty">{notice}</div>}
        </div>
      )}

      <div className="mp-battlefield-shell">
        <aside className="mp-side-column">
          <div className="panel">
            <div className="saved-title">Enemy Zones</div>
            <SideZone title="Enemy Deck" count={playerStateByUserId[enemyPlayerId]?.cards_in_deck ?? 0} hint="Cards remaining in the enemy deck." />
            <SideZone title="Enemy Discard" count={playerStateByUserId[enemyPlayerId]?.cards_in_discard ?? 0} hint="Used and destroyed enemy cards." />
            <SideZone title="Enemy Techniques" count={enemyTechniqueCount} hint="Technique cards available to solve your constructs." />
          </div>
        </aside>

        <main className="mp-board-main">
          <section className="mp-board-panel is-enemy">
            <PlayerHeader
              label="Opponent"
              username={usernameById[enemyPlayerId] || enemyPlayerId || 'Waiting for opponent'}
              isCurrentTurn={match?.current_turn_user_id === enemyPlayerId}
              playerState={playerStateByUserId[enemyPlayerId]}
              constructCount={enemyBoardCards.length}
            />
            <div className="mp-slot-row">
              {enemyBoard.map((construct, index) => (
                <ConstructCard
                  key={construct?.id || `enemy-slot-${index + 1}`}
                  construct={construct}
                  ownerName={usernameById[enemyPlayerId] || 'Opponent'}
                  onShowDetails={openConstructDetails}
                />
              ))}
            </div>
          </section>

          <section className="mp-center-strip">
            <div className="mp-match-hud">
              <div className="mp-match-chip">Room: {room?.name || 'Unknown room'}</div>
              <div className="mp-match-chip">Status: {match?.status || 'Loading'}</div>
              <div className="mp-match-chip">Turn: {usernameById[match?.current_turn_user_id] || match?.current_turn_user_id || 'N/A'}</div>
              <div className="mp-match-chip">Turn No: {match?.turn_number ?? 1}</div>
              <div className="mp-match-chip">Countdown: {countdownLabel}</div>
              <div className="mp-match-chip">Turn Length: {match?.turn_seconds ?? 75}s</div>
              <div className="mp-match-chip">Players in room: {roomPlayers.length}</div>
            </div>
            <div className="mp-center-note">
              The opening hand should be 4 cards, each turn draws 1 card, and expired timers now end the turn automatically.
            </div>
            <div className="mp-center-actions">
              <button type="button" className="btn" onClick={() => handleEndTurn()} disabled={!isOwnTurn || saving || loading}>
                {saving && isOwnTurn ? 'Processing...' : 'End Turn'}
              </button>
            </div>
            {match?.created_at && <div className="saved-empty">Created: {formatDate(match.created_at)}</div>}
            {match?.turn_deadline_at && <div className="saved-empty">Deadline: {formatDate(match.turn_deadline_at)}</div>}
          </section>

          <section className="mp-board-panel is-self">
            <PlayerHeader
              label="You"
              username={session.username}
              isCurrentTurn={isOwnTurn}
              playerState={playerStateByUserId[ownPlayerId]}
              constructCount={ownBoardCards.length}
            />
            <div className="mp-slot-row">
              {ownBoard.map((construct, index) => (
                <ConstructCard
                  key={construct?.id || `self-slot-${index + 1}`}
                  construct={construct}
                  ownerName={session.username}
                  onShowDetails={openConstructDetails}
                />
              ))}
            </div>
            <div className="mp-hand-zone">
              <div className="saved-title">Your Hand</div>
              <div className="saved-empty">Hand count: {playerStateByUserId[ownPlayerId]?.cards_in_hand ?? ownHandCards.length}</div>
              <div className="mp-hand-row">
                {ownHandCards.length === 0 && <div className="mp-hand-card is-placeholder">No cards in hand.</div>}
                {ownHandCards.map((card) => (
                  <HandCard
                    key={card.id}
                    card={card}
                    construct={constructsById[card.linked_match_construct_id] || null}
                    technique={techniqueDetailsById[card.source_technique_id] || {
                      id: card.source_technique_id,
                      name: card.technique_name,
                      topic: card.technique_topic,
                      subtopic: card.technique_subtopic,
                      effect_type: card.technique_effect_type,
                      effect_description: card.technique_effect_description,
                      worked_example: card.technique_worked_example,
                    }}
                    canPlay={
                      !saving &&
                      isOwnTurn &&
                      card.source_type === 'construct' &&
                      openOwnSlots.length > 0 &&
                      (playerStateByUserId[ownPlayerId]?.ingenuity_current ?? 0) >=
                        (constructsById[card.linked_match_construct_id]?.ingenuity_cost ?? 0)
                    }
                    openSlots={card.source_type === 'construct' ? openOwnSlots : []}
                    onPlay={handlePlayConstruct}
                    onShowDetails={openHandDetails}
                  />
                ))}
              </div>
            </div>
          </section>
        </main>

        <aside className="mp-side-column">
          <div className="panel">
            <div className="saved-title">Your Zones</div>
            <SideZone title="Your Deck" count={playerStateByUserId[ownPlayerId]?.cards_in_deck ?? 0} hint="Cards remaining in your draw pile." />
            <SideZone title="Your Discard" count={playerStateByUserId[ownPlayerId]?.cards_in_discard ?? 0} hint="Used and destroyed friendly cards." />
            <SideZone title="Your Techniques" count={ownTechniqueCount} hint="Opponent-granted techniques with rendered effect details." />
          </div>
        </aside>
      </div>

      <DetailsModal detailCard={detailCard} onClose={() => setDetailCard(null)} />
    </div>
  )
}
