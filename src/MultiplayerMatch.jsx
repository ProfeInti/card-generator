import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  attackMatchConstruct,
  attackMatchPlayer,
  endMultiplayerTurn,
  getMultiplayerMatch,
  getMultiplayerRoom,
  listMatchCards,
  listMatchConstructs,
  listMatchPlayers,
  listMatchStepsByConstructIds,
  listRoomPlayersByRoomIds,
  listTechniqueCardDetailsByIds,
  playConstructFromHand,
  resolveMatchDeconstructionAttempt,
} from './data/multiplayerLobbyRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { supabase } from './lib/supabase'
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

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function canConstructAttack(construct, isOwnTurn) {
  if (!construct || !isOwnTurn) return false
  if (construct.isUnknownOccupant) return false
  if (deriveConstructState(construct) === 'destroyed') return false
  if (construct.has_attacked_this_turn) return false
  return Number(construct.attack ?? 0) > 0
}

function canConstructAttackThisTurn(construct, matchTurnNumber, isOwnTurn) {
  if (!canConstructAttack(construct, isOwnTurn)) return false
  if (Number(construct?.summoned_turn_number ?? 0) >= Number(matchTurnNumber ?? 1)) return false
  if (Number(construct?.stunned_until_turn ?? 0) >= Number(matchTurnNumber ?? 1)) return false
  return true
}

function canDeconstructConstruct(construct, matchTurnNumber, isOwnTurn) {
  if (!construct || !isOwnTurn) return false
  if (construct.isUnknownOccupant) return false
  if (deriveConstructState(construct) !== 'vulnerable') return false
  if (Number(construct.armor ?? 0) > 0) return false
  if (Number(construct.deconstruction_locked_until_turn ?? 0) >= Number(matchTurnNumber ?? 1)) return false
  return true
}

function formatPathLabel(path) {
  return String(path || 'main').trim().toLowerCase().replace(/[-_]+/g, ' ')
}

function buildDeconstructionTechniqueOptions(steps, techniquesById) {
  return (steps || []).map((step, index) => {
    const technique = techniquesById[step.technique_id] || {}
    return {
      stepId: step.id,
      techniqueId: step.technique_id,
      order: index + 1,
      name: technique.name || `Technique ${index + 1}`,
      topic: technique.topic || '',
      subtopic: technique.subtopic || '',
      effectType: technique.effect_type || '',
      effectDescription: technique.effect_description || '',
      workedExample: technique.worked_example || '',
      progressState: step.progress_state || '',
    }
  })
}

function shuffleArray(items) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const temp = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = temp
  }
  return next
}

function getConstructStatusNote(construct, matchTurnNumber) {
  if (!construct || construct.isUnknownOccupant) return ''
  if (deriveConstructState(construct) === 'destroyed') return 'Destroyed'
  if (Number(construct?.summoned_turn_number ?? 0) >= Number(matchTurnNumber ?? 1)) return 'Summoned this turn'
  if (Number(construct?.stunned_until_turn ?? 0) >= Number(matchTurnNumber ?? 1)) return 'Stunned'
  if (Number(construct?.deconstruction_locked_until_turn ?? 0) >= Number(matchTurnNumber ?? 1)) return 'Deconstruction locked this turn'
  return ''
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
        <div className="mp-player-chip">Fatigue: {playerState?.fatigue_count ?? 0}</div>
        <div className="mp-player-chip">Constructs: {constructCount}</div>
      </div>
    </div>
  )
}

function HtmlBlock({ html }) {
  return <div className="mp-details-body rich-html" dangerouslySetInnerHTML={{ __html: html }} />
}

function DeconstructionModal({
  targetConstruct,
  steps,
  shuffledOptions,
  selectedSequence,
  currentStepIndex,
  currentProgressState,
  feedback,
  onPickTechnique,
  onClose,
  saving,
}) {
  if (!targetConstruct) return null

  const currentStep = steps[currentStepIndex] || null
  const renderedExercise = renderRichContent(targetConstruct.exercise_statement || '')
  const renderedProgress = renderRichContent(currentProgressState)

  return (
    <div className="mp-details-backdrop" onClick={onClose}>
      <div className="mp-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="mp-details-header">
          <div>
            <div className="mp-details-kicker">Deconstruction</div>
            <div className="mp-details-title">{targetConstruct.title || 'Construct'}</div>
          </div>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Close</button>
        </div>

        <div className="training-workspace">
          <div className="training-card training-exercise-card">
            <div className="saved-title">Exercise Card</div>
            <div className="saved-item-tags">Path: {formatPathLabel(targetConstruct.selected_solution_path)}</div>
            <div className="saved-item-tags">Armor: {targetConstruct.armor ?? 0} | Steps: {targetConstruct.stability_remaining} / {targetConstruct.stability_total}</div>
            <div className="rt-editor training-math-box">
              <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedExercise }} />
            </div>
          </div>

          <div className="training-step-layout">
            <div className="training-card training-progress-card">
              <div className="saved-title">Current Progress State</div>
              <div className="saved-item-tags">
                Step {steps.length === 0 ? 0 : Math.min(currentStepIndex + 1, steps.length)} of {steps.length}
              </div>
              <div className="rt-editor training-math-box">
                <div className="card-description" dangerouslySetInnerHTML={{ __html: renderedProgress }} />
              </div>
              <div className="saved-empty" style={{ marginTop: 8 }}>
                Sequence chosen: {selectedSequence.length ? selectedSequence.length : 0} / {steps.length}
              </div>
            </div>

            <div className="training-card">
              <div className="saved-title">Select the next Technique Card</div>
              <div className="saved-empty">
                Only the techniques attached to this construct are shown. A wrong step immediately fails the deconstruction.
              </div>

              <div className="training-tech-grid">
                {shuffledOptions.map((option) => {
                  const renderedEffect = renderRichContent(option.effectDescription)

                  return (
                    <button
                      key={`${option.stepId}-${option.order}`}
                      type="button"
                      className="training-tech-card"
                      onClick={() => onPickTechnique(option.techniqueId)}
                      disabled={saving || !currentStep}
                    >
                      <div className="training-tech-name">{option.name}</div>
                      <div className="training-tech-meta">Step template: {option.order}</div>
                      <div className="training-tech-meta">{option.topic || 'N/A'} / {option.subtopic || 'N/A'}</div>
                      <div className="training-tech-meta">Effect: {option.effectType || 'N/A'}</div>
                      <div className="training-tech-effect" dangerouslySetInnerHTML={{ __html: renderedEffect }} />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {feedback && (
            <div className={feedback.type === 'error' ? 'auth-error' : 'saved-empty'}>
              {feedback.message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
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

function ConstructCard({
  construct,
  ownerName,
  onShowDetails,
  actionButton,
  statusNote,
}) {
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
      <div className="mp-slot-combat-stats">ATK {construct.attack ?? 0} | ARM {construct.armor ?? 0}</div>
      <div className="mp-slot-stats">Cost {construct.ingenuity_cost ?? 0} | Steps {construct.stability_remaining} / {construct.stability_total}</div>
      {statusNote && <div className="mp-slot-stats">{statusNote}</div>}
      <div className="mp-slot-actions">
        <button type="button" className="btn" onClick={() => onShowDetails(construct, ownerName)}>
          More Details
        </button>
        {actionButton}
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

function HandCard({ card, construct, canPlay, openSlots, onPlay, onShowDetails }) {
  if (card.source_type === 'technique') {
    return null
  }

  const slotOptions = [1, 2, 3]

  return (
    <div className="mp-hand-card is-construct">
      <div>
        <div className="mp-hand-card-type">Construct</div>
        <div className="mp-hand-card-title">{construct?.title || 'Construct'}</div>
        <div className="mp-hand-combat-stats">ATK {construct?.attack ?? 0} | ARM {construct?.armor ?? 0}</div>
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
  const [matchSteps, setMatchSteps] = useState([])
  const [techniqueDetailsById, setTechniqueDetailsById] = useState({})
  const [usernameById, setUsernameById] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [countdownLabel, setCountdownLabel] = useState('')
  const [detailCard, setDetailCard] = useState(null)
  const [selectedAttackerId, setSelectedAttackerId] = useState(null)
  const [activeDeconstructionTargetId, setActiveDeconstructionTargetId] = useState(null)
  const [deconstructionCurrentStepIndex, setDeconstructionCurrentStepIndex] = useState(0)
  const [deconstructionCurrentProgressState, setDeconstructionCurrentProgressState] = useState('')
  const [deconstructionFeedback, setDeconstructionFeedback] = useState(null)
  const [deconstructionSequence, setDeconstructionSequence] = useState([])
  const [deconstructionShuffledOptions, setDeconstructionShuffledOptions] = useState([])
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
      const constructIds = constructRows.map((row) => row.id).filter(Boolean)
      const stepRows = await listMatchStepsByConstructIds(constructIds)

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
      const techniqueIds = [
        ...cardRows.map((row) => row.source_technique_id).filter(Boolean),
        ...stepRows.map((row) => row.technique_id).filter(Boolean),
      ]
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
      setMatchSteps(stepRows)
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

  useEffect(() => {
    if (!matchId) return undefined

    const refreshFromRealtime = () => {
      loadMatch({ silent: true })
    }

    const channel = supabase
      .channel(`mp-match-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mp_matches', filter: `id=eq.${matchId}` },
        refreshFromRealtime
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mp_match_players', filter: `match_id=eq.${matchId}` },
        refreshFromRealtime
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mp_match_cards', filter: `match_id=eq.${matchId}` },
        refreshFromRealtime
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mp_match_constructs', filter: `match_id=eq.${matchId}` },
        refreshFromRealtime
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadMatch, matchId])

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
  const stepsByConstructId = useMemo(
    () => groupBy(matchSteps, 'match_construct_id'),
    [matchSteps]
  )
  const cardsByOwner = useMemo(() => groupBy(matchCards, 'owner_user_id'), [matchCards])

  const ownCards = cardsByOwner[ownPlayerId] || []
  const enemyCards = cardsByOwner[enemyPlayerId] || []
  const ownBoardCards = ownCards.filter((card) => card.zone === 'board' && card.source_type === 'construct')
  const enemyBoardCards = enemyCards.filter((card) => card.zone === 'board' && card.source_type === 'construct')
  const ownHandCards = ownCards
    .filter((card) => card.zone === 'hand' && card.source_type === 'construct')
    .sort((a, b) => (a.position_index ?? 999) - (b.position_index ?? 999))
  const hiddenLegacyTechniqueCards = ownCards.filter((card) => card.zone === 'hand' && card.source_type === 'technique').length

  const ownBoard = useMemo(() => buildBoardSlots(ownBoardCards, constructsById), [ownBoardCards, constructsById])
  const enemyBoard = useMemo(() => buildBoardSlots(enemyBoardCards, constructsById), [enemyBoardCards, constructsById])
  const openOwnSlots = useMemo(() => getOpenSlotsFromBoardCards(ownBoardCards), [ownBoardCards])
  const isOwnTurn = match?.current_turn_user_id === ownPlayerId
  const isMatchActive = match?.status === 'active'
  const currentTurnKey = `${match?.id || 'no-match'}:${match?.turn_number || 0}:${match?.current_turn_user_id || 'no-player'}:${match?.turn_deadline_at || 'no-deadline'}`
  const selectedAttacker = selectedAttackerId ? constructsById[selectedAttackerId] || null : null
  const activeDeconstructionTarget = activeDeconstructionTargetId ? constructsById[activeDeconstructionTargetId] || null : null
  const activeDeconstructionSteps = useMemo(
    () => (activeDeconstructionTargetId ? [...(stepsByConstructId[activeDeconstructionTargetId] || [])].sort((a, b) => Number(a.step_order) - Number(b.step_order)) : []),
    [activeDeconstructionTargetId, stepsByConstructId]
  )
  const winnerName = useMemo(() => {
    if (!match?.winner_user_id) return ''
    if (match.winner_user_id === ownPlayerId) return session.username
    return usernameById[match.winner_user_id] || match.winner_user_id
  }, [match?.winner_user_id, ownPlayerId, session.username, usernameById])
  const ownPlayerState = playerStateByUserId[ownPlayerId] || null
  const enemyPlayerState = playerStateByUserId[enemyPlayerId] || null
  const resultSummary = useMemo(() => {
    if (!match || match.status !== 'finished') return ''
    if (match.winner_user_id === ownPlayerId) return 'Victory'
    if (match.winner_user_id) return 'Defeat'
    return 'Match Finished'
  }, [match, ownPlayerId])

  useEffect(() => {
    if (!selectedAttackerId) return
    const nextSelected = constructsById[selectedAttackerId]
    if (!canConstructAttackThisTurn(nextSelected, match?.turn_number, isOwnTurn)) {
      setSelectedAttackerId(null)
    }
  }, [constructsById, isOwnTurn, match?.turn_number, selectedAttackerId])

  useEffect(() => {
    if (!activeDeconstructionTarget) return
    if (!canDeconstructConstruct(activeDeconstructionTarget, match?.turn_number, isOwnTurn)) {
      setActiveDeconstructionTargetId(null)
      setDeconstructionCurrentStepIndex(0)
      setDeconstructionCurrentProgressState('')
      setDeconstructionFeedback(null)
      setDeconstructionSequence([])
      setDeconstructionShuffledOptions([])
    }
  }, [activeDeconstructionTarget, isOwnTurn, match?.turn_number])

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
      setSelectedAttackerId(null)
      setActiveDeconstructionTargetId(null)
      setDeconstructionShuffledOptions([])
      await loadMatch()
    } catch (err) {
      setError(err?.message || 'Could not play construct from hand.')
    } finally {
      setSaving(false)
    }
  }

  const handleEndTurn = useCallback(async ({ automatic = false } = {}) => {
    setSaving(true)
    setSelectedAttackerId(null)
    setActiveDeconstructionTargetId(null)
    setDeconstructionShuffledOptions([])
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

  const openDeconstructionModal = (targetConstruct) => {
    if (!targetConstruct) return
    const targetSteps = [...(stepsByConstructId[targetConstruct.id] || [])].sort((a, b) => Number(a.step_order) - Number(b.step_order))
    const shuffledOptions = shuffleArray(buildDeconstructionTechniqueOptions(targetSteps, techniqueDetailsById))
    setActiveDeconstructionTargetId(targetConstruct.id)
    setDeconstructionCurrentStepIndex(0)
    setDeconstructionCurrentProgressState(normalizeMathHtmlInput(targetConstruct.exercise_statement || ''))
    setDeconstructionSequence([])
    setDeconstructionShuffledOptions(shuffledOptions)
    setDeconstructionFeedback(
      targetSteps.length
        ? { type: 'info', message: 'Select the techniques in the exact sequence attached to this construct.' }
        : { type: 'error', message: 'This construct has no available deconstruction steps.' }
    )
  }

  const closeDeconstructionModal = () => {
    if (saving) return
    setActiveDeconstructionTargetId(null)
    setDeconstructionCurrentStepIndex(0)
    setDeconstructionCurrentProgressState('')
    setDeconstructionFeedback(null)
    setDeconstructionSequence([])
    setDeconstructionShuffledOptions([])
  }

  const handleDeconstructionPick = async (techniqueId) => {
    const currentStep = activeDeconstructionSteps[deconstructionCurrentStepIndex]
    if (!activeDeconstructionTarget || !currentStep || !techniqueId) return

    const nextSequence = [...deconstructionSequence, techniqueId]
    const isCorrectPick = normalize(techniqueId) === normalize(currentStep.technique_id)

    if (!isCorrectPick) {
      setSaving(true)
      setError('')
      setNotice('')

      try {
        const result = await resolveMatchDeconstructionAttempt(matchId, activeDeconstructionTarget.id, nextSequence)
        setActiveDeconstructionTargetId(null)
        setDeconstructionCurrentStepIndex(0)
        setDeconstructionCurrentProgressState('')
        setDeconstructionFeedback(null)
        setDeconstructionSequence([])
        setDeconstructionShuffledOptions([])
        setNotice(result?.message || 'Deconstruction failed.')
        await loadMatch()
      } catch (err) {
        setError(err?.message || 'Could not resolve deconstruction failure.')
      } finally {
        setSaving(false)
      }
      return
    }

    setDeconstructionSequence(nextSequence)
    setDeconstructionCurrentProgressState(normalizeMathHtmlInput(currentStep.progress_state || ''))

    const isLastStep = deconstructionCurrentStepIndex >= activeDeconstructionSteps.length - 1
    if (!isLastStep) {
      setDeconstructionCurrentStepIndex((prev) => prev + 1)
      setDeconstructionFeedback({ type: 'success', message: 'Correct technique. Continue with the next step.' })
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const result = await resolveMatchDeconstructionAttempt(matchId, activeDeconstructionTarget.id, nextSequence)
      setActiveDeconstructionTargetId(null)
      setDeconstructionCurrentStepIndex(0)
      setDeconstructionCurrentProgressState('')
      setDeconstructionFeedback(null)
      setDeconstructionSequence([])
      setDeconstructionShuffledOptions([])
      setNotice(result?.message || 'Deconstruction resolved.')
      await loadMatch()
    } catch (err) {
      setError(err?.message || 'Could not resolve deconstruction attempt.')
    } finally {
      setSaving(false)
    }
  }

  const handleAttackConstruct = async (targetConstructId) => {
    if (!selectedAttackerId || !targetConstructId) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const result = await attackMatchConstruct(matchId, selectedAttackerId, targetConstructId)
      setNotice(result?.message || 'Attack resolved.')
      setSelectedAttackerId(null)
      await loadMatch()
    } catch (err) {
      setError(err?.message || 'Could not attack the target construct.')
    } finally {
      setSaving(false)
    }
  }

  const handleAttackPlayer = async () => {
    if (!selectedAttackerId) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const result = await attackMatchPlayer(matchId, selectedAttackerId)
      setNotice(result?.message || 'Direct attack resolved.')
      setSelectedAttackerId(null)
      await loadMatch()
    } catch (err) {
      setError(err?.message || 'Could not attack the opposing player.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!match?.turn_deadline_at || match?.status !== 'active' || !isOwnTurn || saving || loading) return undefined

    const deadlineMs = new Date(match.turn_deadline_at).getTime()
    if (!Number.isFinite(deadlineMs)) return undefined

    const triggerAutoEnd = () => {
      if (autoEndedTurnKeyRef.current === currentTurnKey) return
      autoEndedTurnKeyRef.current = currentTurnKey
      handleEndTurn({ automatic: true })
    }

    if (deadlineMs <= Date.now()) {
      triggerAutoEnd()
      return undefined
    }

    const timeoutId = window.setTimeout(triggerAutoEnd, Math.max(deadlineMs - Date.now(), 0) + 50)
    return () => window.clearTimeout(timeoutId)
  }, [currentTurnKey, handleEndTurn, isOwnTurn, loading, match?.status, match?.turn_deadline_at, saving])

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

      {match?.status === 'finished' && (
        <div className="panel mp-result-panel" style={{ marginBottom: 16 }}>
          <div className="saved-title">{resultSummary}</div>
          <div className="saved-empty">Winner: {winnerName || 'Unknown'}</div>
          <div className="saved-empty">
            Final life totals: You {ownPlayerState?.life_total ?? 0} | Opponent {enemyPlayerState?.life_total ?? 0}
          </div>
          <div className="saved-empty">
            Fatigue totals: You {ownPlayerState?.fatigue_count ?? 0} | Opponent {enemyPlayerState?.fatigue_count ?? 0}
          </div>
          {match?.finished_at && <div className="saved-empty">Finished: {formatDate(match.finished_at)}</div>}
        </div>
      )}

      <div className="mp-battlefield-shell">
        <aside className="mp-side-column">
          <div className="panel">
            <div className="saved-title">Enemy Zones</div>
            <SideZone title="Enemy Deck" count={enemyPlayerState?.cards_in_deck ?? 0} hint="Cards remaining in the enemy deck." />
            <SideZone title="Enemy Discard" count={enemyPlayerState?.cards_in_discard ?? 0} hint="Used and destroyed enemy cards." />
            <SideZone title="Enemy Fatigue" count={enemyPlayerState?.fatigue_count ?? 0} hint="Damage that increases when the enemy tries to draw from an empty deck." />
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
                  actionButton={
                    construct && !construct.isUnknownOccupant && deriveConstructState(construct) !== 'destroyed' ? (
                      <>
                        {selectedAttacker && (
                          <button
                            type="button"
                            className="btn"
                            disabled={saving || loading || !isOwnTurn || !isMatchActive}
                            onClick={() => handleAttackConstruct(construct.id)}
                          >
                            Attack
                          </button>
                        )}
                        {canDeconstructConstruct(construct, match?.turn_number, isOwnTurn) && (
                          <button
                            type="button"
                            className="btn"
                            disabled={saving || loading || !isMatchActive}
                            onClick={() => openDeconstructionModal(construct)}
                          >
                            Deconstruct
                          </button>
                        )}
                      </>
                    ) : null
                  }
                  statusNote={getConstructStatusNote(construct, match?.turn_number)}
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
              <div className="mp-match-chip">Countdown: {isMatchActive ? countdownLabel : 'Match finished'}</div>
              <div className="mp-match-chip">Turn Length: {match?.turn_seconds ?? 75}s</div>
              <div className="mp-match-chip">Players in room: {roomPlayers.length}</div>
              {match?.winner_user_id && <div className="mp-match-chip">Winner: {winnerName || 'Unknown'}</div>}
            </div>
            <div className="mp-center-note">
              {isMatchActive
                ? 'Break armor first, then deconstruct vulnerable constructs before they recover.'
                : 'The match is complete. You can review the final battlefield state or return to the lobby.'}
            </div>
            <div className="mp-center-actions">
              <button
                type="button"
                className="btn"
                onClick={handleAttackPlayer}
                disabled={!selectedAttacker || saving || loading || !isOwnTurn || !isMatchActive}
              >
                {selectedAttacker ? `Attack Opponent with ${selectedAttacker.title || 'Construct'}` : 'Select an attacker first'}
              </button>
              {selectedAttacker && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSelectedAttackerId(null)}
                  disabled={saving}
                >
                  Cancel Attack
                </button>
              )}
              <button type="button" className="btn" onClick={() => handleEndTurn()} disabled={!isOwnTurn || saving || loading || !isMatchActive}>
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
                  actionButton={
                    construct && !construct.isUnknownOccupant ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={!canConstructAttackThisTurn(construct, match?.turn_number, isOwnTurn) || saving || loading || !isMatchActive}
                        onClick={() => setSelectedAttackerId((current) => (current === construct.id ? null : construct.id))}
                      >
                        {selectedAttackerId === construct.id ? 'Attacker Selected' : 'Select Attacker'}
                      </button>
                    ) : null
                  }
                  statusNote={getConstructStatusNote(construct, match?.turn_number)}
                />
              ))}
            </div>
            <div className="mp-hand-zone">
              <div className="saved-title">Your Hand</div>
              <div className="saved-empty">Construct hand count: {ownHandCards.length}</div>
              {hiddenLegacyTechniqueCards > 0 && <div className="saved-empty">Legacy cards hidden: {hiddenLegacyTechniqueCards}</div>}
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
                      isMatchActive &&
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
            <SideZone title="Your Deck" count={ownPlayerState?.cards_in_deck ?? 0} hint="Cards remaining in your draw pile." />
            <SideZone title="Your Discard" count={ownPlayerState?.cards_in_discard ?? 0} hint="Used and destroyed friendly cards." />
            <SideZone title="Your Fatigue" count={ownPlayerState?.fatigue_count ?? 0} hint="Damage that increases each time you try to draw from an empty deck." />
          </div>
        </aside>
      </div>

      <DetailsModal detailCard={detailCard} onClose={() => setDetailCard(null)} />
      <DeconstructionModal
        targetConstruct={activeDeconstructionTarget}
        steps={activeDeconstructionSteps}
        shuffledOptions={deconstructionShuffledOptions}
        selectedSequence={deconstructionSequence}
        currentStepIndex={deconstructionCurrentStepIndex}
        currentProgressState={deconstructionCurrentProgressState}
        feedback={deconstructionFeedback}
        onPickTechnique={handleDeconstructionPick}
        onClose={closeDeconstructionModal}
        saving={saving}
      />
    </div>
  )
}
