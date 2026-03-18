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
  playMatchSpellCard,
  playConstructFromHand,
  resolveMatchDeconstructionAttempt,
  submitMatchMulligan,
  surrenderMultiplayerMatch,
} from './data/multiplayerLobbyRepo'
import { listProfileUsernamesByIds } from './data/profilesRepo'
import { DEFAULT_ART_DATA_URL } from './lib/cardWorkspace'
import { supabase } from './lib/supabase'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'

const BOARD_SLOT_COUNT = 5

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
  return Array.from({ length: BOARD_SLOT_COUNT }, (_, index) => index + 1).map((slot) => bySlot.get(slot) || null)
}

function getOpenSlotsFromBoardCards(boardCards) {
  const occupiedSlots = new Set(
    (boardCards || [])
      .map((card) => Number(card.position_index))
      .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= BOARD_SLOT_COUNT)
  )
  return Array.from({ length: BOARD_SLOT_COUNT }, (_, index) => index + 1).filter((slot) => !occupiedSlots.has(slot))
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

function getConstructImageUrl(construct) {
  return String(construct?.image_url || '').trim() || DEFAULT_ART_DATA_URL
}

function getCardImageUrl(card, construct) {
  if (card?.source_type === 'spell') return String(card?.art_url || '').trim() || DEFAULT_ART_DATA_URL
  return getConstructImageUrl(construct)
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

function getConstructStatusLabel(construct, matchTurnNumber) {
  if (!construct || construct.isUnknownOccupant) return ''
  if (deriveConstructState(construct) === 'destroyed') return 'Destroyed'
  if (Number(construct?.stunned_until_turn ?? 0) >= Number(matchTurnNumber ?? 1)) return 'Stunned'
  if (Number(construct?.summoned_turn_number ?? 0) >= Number(matchTurnNumber ?? 1)) return 'Summoning'
  if (Number(construct?.deconstruction_locked_until_turn ?? 0) >= Number(matchTurnNumber ?? 1)) return 'Shielded'
  if (deriveConstructState(construct) === 'vulnerable') return 'Vulnerable'
  return 'Protected'
}

function formatPathLabel(path) {
  return String(path || 'main').trim().toLowerCase().replace(/[-_]+/g, ' ')
}

function buildDeconstructionTechniqueOptions(steps, techniquesById) {
  const optionsByTechniqueId = new Map()

  ;(steps || []).forEach((step, index) => {
    const technique = techniquesById[step.technique_id] || {}
    const techniqueId = step.technique_id
    if (!techniqueId) return

    const existingOption = optionsByTechniqueId.get(techniqueId)
    if (existingOption) {
      existingOption.orders.push(index + 1)
      return
    }

    optionsByTechniqueId.set(techniqueId, {
      stepId: step.id,
      techniqueId,
      orders: [index + 1],
      name: technique.name || `Technique ${index + 1}`,
      topic: technique.topic || '',
      subtopic: technique.subtopic || '',
      effectType: technique.effect_type || '',
      effectDescription: technique.effect_description || '',
      workedExample: technique.worked_example || '',
      progressState: step.progress_state || '',
    })
  })

  return [...optionsByTechniqueId.values()]
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
      <div className="mp-details-modal is-wide" onClick={(event) => event.stopPropagation()}>
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
                      <div className="training-tech-meta">Used in step{option.orders.length === 1 ? '' : 's'}: {option.orders.join(', ')}</div>
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

function SharedResolutionModal({ resolution, onClose }) {
  if (!resolution) return null

  return (
    <div className="mp-details-backdrop" onClick={onClose}>
      <div className="mp-details-modal is-wide" onClick={(event) => event.stopPropagation()}>
        <div className="mp-details-header">
          <div>
            <div className="mp-details-kicker">Battle Update</div>
            <div className="mp-details-title">{resolution.title}</div>
          </div>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="mp-details-grid">
          <div className="mp-details-item"><strong>Actor:</strong> {resolution.actorName}</div>
          <div className="mp-details-item"><strong>Resolved:</strong> {formatDate(resolution.createdAt)}</div>
          <div className="mp-details-item"><strong>Step:</strong> {resolution.stepLabel || 'N/A'}</div>
        </div>
        {resolution.summary && (
          <div className="mp-details-section">
            <div className="mp-details-section-title">Summary</div>
            <div className="mp-details-body">{resolution.summary}</div>
          </div>
        )}
        {resolution.effect && (
          <div className="mp-details-section">
            <div className="mp-details-section-title">Effects</div>
            <div className="mp-details-body">{resolution.effect}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailsModal({ detailCard, onClose }) {
  if (!detailCard) return null

  if (detailCard.kind === 'technique' || detailCard.kind === 'spell') {
    return (
      <div className="mp-details-backdrop" onClick={onClose}>
        <div className="mp-details-modal" onClick={(event) => event.stopPropagation()}>
          <div className="mp-details-header">
            <div>
              <div className="mp-details-kicker">{detailCard.kind === 'spell' ? 'Spell' : 'Technique'}</div>
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
        <div className="mp-details-section">
          <div className="mp-details-section-title">Construct Image</div>
          <div className="mp-construct-art-frame is-detail">
            <img
              className="mp-construct-art"
              src={detailCard.imageUrl || DEFAULT_ART_DATA_URL}
              alt={detailCard.title}
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = DEFAULT_ART_DATA_URL
              }}
            />
          </div>
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

function ActionMenu({ isOpen, onToggle, onClose, items, align = 'right' }) {
  const closeTimeoutRef = useRef(null)

  useEffect(() => () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  const cancelScheduledClose = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  const scheduleClose = () => {
    cancelScheduledClose()
    closeTimeoutRef.current = window.setTimeout(() => {
      onClose?.()
      closeTimeoutRef.current = null
    }, 1800)
  }

  return (
    <div
      className="mp-action-menu"
      onMouseEnter={cancelScheduledClose}
      onMouseLeave={() => isOpen && scheduleClose()}
    >
      <button type="button" className="mp-action-trigger" onClick={onToggle} aria-expanded={isOpen} aria-label="Open actions menu">
        ...
      </button>
      {isOpen && (
        <div className={`mp-action-popover is-${align}`}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="mp-action-item"
              onClick={item.onClick}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ConstructCard({
  construct,
  matchTurnNumber,
  menuOpen,
  onToggleMenu,
  menuItems,
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

  return (
      <div className={`mp-slot-card is-${deriveConstructState(construct)}`}>
      <div className="mp-slot-topline">
        <span className="mp-slot-index">Slot {construct.slot_index}</span>
        <ActionMenu isOpen={menuOpen} onToggle={onToggleMenu} onClose={onToggleMenu} items={menuItems} />
      </div>
      <div className="mp-construct-art-frame is-compact">
        <img
          className="mp-construct-art"
          src={getConstructImageUrl(construct)}
          alt={construct.title || 'Construct'}
          onError={(event) => {
            event.currentTarget.onerror = null
            event.currentTarget.src = DEFAULT_ART_DATA_URL
          }}
        />
      </div>
      <div className={`mp-state-pill is-${deriveConstructState(construct)}`}>{getConstructStatusLabel(construct, matchTurnNumber)}</div>
      <div className="mp-slot-combat-stats">ATK {construct.attack ?? 0} | ARM {construct.armor ?? 0}</div>
      <div className="mp-slot-cost">Cost {construct.ingenuity_cost ?? 0}</div>
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

function HandCard({ card, construct, canPlay, openSlots, onPlay, onShowDetails, menuOpen, onToggleMenu }) {
  const slotOptions = Array.from({ length: BOARD_SLOT_COUNT }, (_, index) => index + 1)
  const isSpell = card.source_type === 'spell'
  const menuItems = isSpell
    ? [
      {
        label: 'View Details',
        onClick: () => {
          onShowDetails(card, construct)
          onToggleMenu()
        },
        disabled: false,
      },
      {
        label: 'Use Chispa',
        onClick: () => {
          onPlay(card.id, null)
          onToggleMenu()
        },
        disabled: !canPlay,
      },
    ]
    : [
      {
        label: 'View Details',
        onClick: () => {
          onShowDetails(card, construct)
          onToggleMenu()
        },
        disabled: false,
      },
      ...slotOptions.map((slot) => ({
        label: openSlots.includes(slot) ? `Summon to Slot ${slot}` : `Slot ${slot} Occupied`,
        onClick: () => {
          onPlay(card.id, slot)
          onToggleMenu()
        },
        disabled: !canPlay || !openSlots.includes(slot),
      })),
    ]

  return (
    <div className={`mp-hand-card ${isSpell ? 'is-technique' : 'is-construct'}`}>
      <div className="mp-hand-card-topline">
        <div className="mp-hand-card-type">{isSpell ? 'Spell' : 'Construct'}</div>
        <ActionMenu isOpen={menuOpen} onToggle={onToggleMenu} onClose={onToggleMenu} items={menuItems} />
      </div>
      <div>
        <div className="mp-construct-art-frame is-hand is-compact">
          <img
            className="mp-construct-art"
            src={getCardImageUrl(card, construct)}
            alt={construct?.title || card?.technique_name || 'Card'}
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = DEFAULT_ART_DATA_URL
            }}
          />
        </div>
        {isSpell ? (
          <>
            <div className="mp-hand-combat-stats">{card?.technique_name || 'Chispa de Ingenio'}</div>
            <div className="mp-slot-cost">+1 Ingenuity this turn</div>
          </>
        ) : (
          <>
            <div className="mp-hand-combat-stats">ATK {construct?.attack ?? 0} | ARM {construct?.armor ?? 0}</div>
            <div className="mp-slot-cost">Cost {construct?.ingenuity_cost ?? 0}</div>
          </>
        )}
      </div>
    </div>
  )
}

function MulliganPanel({
  ownHandCards,
  constructsById,
  selectedCardIds,
  onToggleCard,
  onSubmit,
  saving,
  ownCompleted,
  enemyCompleted,
  enemyName,
  expectedOpeningCount,
}) {
  const constructCards = ownHandCards.filter((card) => card?.source_type === 'construct')

  return (
    <div className="panel mp-mulligan-panel">
      <div className="saved-title">Opening Mulligan</div>
      <div className="saved-empty">
        Choose any opening constructs to replace. When both players finish mulligan, turn 1 begins.
      </div>
      <div className="saved-empty">
        Your mulligan hand: {expectedOpeningCount} construct{expectedOpeningCount === 1 ? '' : 's'}.
      </div>
      <div className="saved-empty">
        You: {ownCompleted ? 'Ready' : 'Choosing'} | {enemyName || 'Opponent'}: {enemyCompleted ? 'Ready' : 'Choosing'}
      </div>
      <div className="mp-mulligan-row">
        {constructCards.map((card) => {
          const construct = constructsById[card.linked_match_construct_id] || null
          const isSelected = selectedCardIds.includes(card.id)

          return (
            <button
              key={card.id}
              type="button"
              className={`mp-hand-card is-construct mp-mulligan-card${isSelected ? ' is-selected' : ''}`}
              onClick={() => onToggleCard(card.id)}
              disabled={saving || ownCompleted}
            >
              <div className="mp-hand-card-type">{isSelected ? 'Replace' : 'Keep'}</div>
              <div className="mp-construct-art-frame is-hand is-compact">
                <img
                  className="mp-construct-art"
                  src={getConstructImageUrl(construct)}
                  alt={construct?.title || 'Construct'}
                  onError={(event) => {
                    event.currentTarget.onerror = null
                    event.currentTarget.src = DEFAULT_ART_DATA_URL
                  }}
                />
              </div>
              <div className="mp-hand-combat-stats">ATK {construct?.attack ?? 0} | ARM {construct?.armor ?? 0}</div>
              <div className="mp-slot-cost">Cost {construct?.ingenuity_cost ?? 0}</div>
            </button>
          )
        })}
      </div>
      <div className="mp-mulligan-actions">
        <button type="button" className="btn" onClick={() => onSubmit([])} disabled={saving || ownCompleted}>
          Keep Hand
        </button>
        <button type="button" className="btn" onClick={() => onSubmit(selectedCardIds)} disabled={saving || ownCompleted}>
          {saving ? 'Submitting...' : `Replace Selected (${selectedCardIds.length})`}
        </button>
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
  const [openMenuKey, setOpenMenuKey] = useState(null)
  const [mulliganSelectedCardIds, setMulliganSelectedCardIds] = useState([])
  const [selectedAttackerId, setSelectedAttackerId] = useState(null)
  const [activeDeconstructionTargetId, setActiveDeconstructionTargetId] = useState(null)
  const [deconstructionCurrentStepIndex, setDeconstructionCurrentStepIndex] = useState(0)
  const [deconstructionCurrentProgressState, setDeconstructionCurrentProgressState] = useState('')
  const [deconstructionFeedback, setDeconstructionFeedback] = useState(null)
  const [deconstructionSequence, setDeconstructionSequence] = useState([])
  const [deconstructionShuffledOptions, setDeconstructionShuffledOptions] = useState([])
  const [sharedResolution, setSharedResolution] = useState(null)
  const lastSeenResolutionKeyRef = useRef('')
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
    .filter((card) => card.zone === 'hand' && (card.source_type === 'construct' || card.source_type === 'spell'))
    .sort((a, b) => (a.position_index ?? 999) - (b.position_index ?? 999))
  const ownMulliganCards = ownHandCards.filter((card) => card.source_type === 'construct')
  const hiddenLegacyTechniqueCards = ownCards.filter((card) => card.zone === 'hand' && card.source_type === 'technique').length

  const ownBoard = useMemo(() => buildBoardSlots(ownBoardCards, constructsById), [ownBoardCards, constructsById])
  const enemyBoard = useMemo(() => buildBoardSlots(enemyBoardCards, constructsById), [enemyBoardCards, constructsById])
  const openOwnSlots = useMemo(() => getOpenSlotsFromBoardCards(ownBoardCards), [ownBoardCards])
  const isOwnTurn = match?.current_turn_user_id === ownPlayerId
  const isMatchActive = match?.status === 'active'
  const isInMulligan = match?.setup_phase === 'mulligan'
  const isBattlePhase = isMatchActive && !isInMulligan
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
  const ownMulliganCompleted = Boolean(ownPlayerState?.has_completed_mulligan)
  const enemyMulliganCompleted = Boolean(enemyPlayerState?.has_completed_mulligan)
  const isStartingPlayer = Boolean(ownPlayerId && match?.current_turn_user_id === ownPlayerId)
  const expectedOpeningCount = isStartingPlayer ? 3 : 4
  const resultSummary = useMemo(() => {
    if (!match || match.status !== 'finished') return ''
    if (match.winner_user_id === ownPlayerId) return 'Victory'
    if (match.winner_user_id) return 'Defeat'
    return 'Match Finished'
  }, [match, ownPlayerId])
  const resolutionKey = `${match?.last_resolution_created_at || ''}:${match?.last_resolution_kind || ''}:${match?.last_resolution_actor_id || ''}`

  useEffect(() => {
    if (!selectedAttackerId) return
    const nextSelected = constructsById[selectedAttackerId]
    if (!canConstructAttackThisTurn(nextSelected, match?.turn_number, isOwnTurn)) {
      setSelectedAttackerId(null)
    }
  }, [constructsById, isOwnTurn, match?.turn_number, selectedAttackerId])

  useEffect(() => {
    if (!isInMulligan) {
      setMulliganSelectedCardIds([])
    }
  }, [isInMulligan])

  useEffect(() => {
    if (!match?.last_resolution_created_at) return
    if (lastSeenResolutionKeyRef.current === resolutionKey) return
    lastSeenResolutionKeyRef.current = resolutionKey
    setSharedResolution({
      title: match.last_resolution_title || 'Resolution',
      summary: match.last_resolution_summary || '',
      stepLabel: match.last_resolution_step_label || '',
      effect: match.last_resolution_effect || '',
      actorName: usernameById[match.last_resolution_actor_id] || match.last_resolution_actor_id || 'Unknown',
      createdAt: match.last_resolution_created_at,
    })
  }, [match?.last_resolution_actor_id, match?.last_resolution_created_at, match?.last_resolution_effect, match?.last_resolution_step_label, match?.last_resolution_summary, match?.last_resolution_title, resolutionKey, usernameById])

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
      imageUrl: getConstructImageUrl(construct),
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
    if (card.source_type === 'technique' || card.source_type === 'spell') {
      setDetailCard({
        kind: card.source_type === 'spell' ? 'spell' : 'technique',
        title: payload?.name || card?.technique_name || 'Technique',
        topic: payload?.topic || card?.technique_topic || 'N/A',
        subtopic: payload?.subtopic || card?.technique_subtopic || 'N/A',
        effectType: payload?.effect_type || card?.technique_effect_type || 'N/A',
        effectHtml: renderRichContent(payload?.effect_description || card?.technique_effect_description || '<p>No effect description.</p>'),
        workedExampleHtml: payload?.worked_example ? renderRichContent(payload.worked_example) : '',
      })
      return
    }

    openConstructDetails(payload, session.username)
  }

  const toggleMulliganCard = (cardId) => {
    setMulliganSelectedCardIds((current) => (
      current.includes(cardId)
        ? current.filter((item) => item !== cardId)
        : [...current, cardId]
    ))
  }

  const handleSubmitMulligan = useCallback(async (cardIds) => {
    if (!matchId || !isInMulligan || saving || ownMulliganCompleted) return

    setSaving(true)
    setError('')
    setNotice('')
    setOpenMenuKey(null)

    try {
      const result = await submitMatchMulligan(matchId, cardIds)
      setMulliganSelectedCardIds([])
      setNotice(result?.message || 'Mulligan submitted.')
      await loadMatch()
    } catch (err) {
      setError(err?.message || 'Could not submit mulligan.')
    } finally {
      setSaving(false)
    }
  }, [isInMulligan, loadMatch, matchId, ownMulliganCompleted, saving])

  useEffect(() => {
    if (!isInMulligan || ownMulliganCompleted || saving) return
    const deadlineMs = match?.turn_deadline_at ? new Date(match.turn_deadline_at).getTime() : NaN
    if (!Number.isFinite(deadlineMs)) return

    const autoKeep = () => {
      if (ownMulliganCompleted) return
      handleSubmitMulligan([])
    }

    if (deadlineMs <= Date.now()) {
      autoKeep()
      return
    }

    const timeoutId = window.setTimeout(autoKeep, Math.max(deadlineMs - Date.now(), 0) + 50)
    return () => window.clearTimeout(timeoutId)
  }, [handleSubmitMulligan, isInMulligan, match?.turn_deadline_at, ownMulliganCompleted, saving])

  const handlePlayConstruct = async (cardId, slotIndex) => {
    setSaving(true)
    setError('')
    setNotice('')
    setOpenMenuKey(null)

    try {
      const card = ownHandCards.find((item) => item.id === cardId) || null
      const result = card?.source_type === 'spell'
        ? await playMatchSpellCard(matchId, cardId)
        : await playConstructFromHand(matchId, cardId, slotIndex)
      setNotice(result?.message || (card?.source_type === 'spell' ? 'Spell used successfully.' : 'Construct played successfully.'))
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
    setOpenMenuKey(null)
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
    if (!selectedAttackerId || !targetConstructId || !isBattlePhase) return

    setSaving(true)
    setError('')
    setNotice('')
    setOpenMenuKey(null)

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

  const handleAttackPlayer = async (attackerConstructId = selectedAttackerId) => {
    if (!attackerConstructId || !isBattlePhase) return

    setSaving(true)
    setError('')
    setNotice('')
    setOpenMenuKey(null)

    try {
      const result = await attackMatchPlayer(matchId, attackerConstructId)
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
    if (!match?.turn_deadline_at || !isBattlePhase || !isOwnTurn || saving || loading) return undefined

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
  }, [currentTurnKey, handleEndTurn, isBattlePhase, isOwnTurn, loading, match?.turn_deadline_at, saving])

  const handleSurrender = async () => {
    if (!matchId || !isMatchActive || saving) return
    if (!window.confirm('Surrender this match? Your opponent will be declared the winner.')) return

    setSaving(true)
    setError('')
    setNotice('')
    setOpenMenuKey(null)

    try {
      const result = await surrenderMultiplayerMatch(matchId)
      setNotice(result?.message || 'Match surrendered.')
      setSelectedAttackerId(null)
      await loadMatch()
    } catch (err) {
      setError(err?.message || 'Could not surrender the match.')
    } finally {
      setSaving(false)
    }
  }

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

      {isInMulligan && (
        <MulliganPanel
          ownHandCards={ownMulliganCards}
          constructsById={constructsById}
          selectedCardIds={mulliganSelectedCardIds}
          onToggleCard={toggleMulliganCard}
          onSubmit={handleSubmitMulligan}
          saving={saving}
          ownCompleted={ownMulliganCompleted}
          enemyCompleted={enemyMulliganCompleted}
          enemyName={usernameById[enemyPlayerId] || 'Opponent'}
          expectedOpeningCount={expectedOpeningCount}
        />
      )}

      <div className="mp-battlefield-shell">
        <aside className="mp-side-column">
          <div className="panel">
            <div className="saved-title">Enemy Zones</div>
            <SideZone title="Enemy Deck" count={enemyPlayerState?.cards_in_deck ?? 0} hint="Cards remaining in the enemy deck." />
            <SideZone title="Enemy Discard" count={enemyPlayerState?.cards_in_discard ?? 0} hint="Used and destroyed enemy cards." />
            <SideZone title="Enemy Fatigue" count={enemyPlayerState?.fatigue_count ?? 0} hint="Damage that increases when the enemy tries to draw from an empty deck." />
          </div>
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
              {isInMulligan
                ? 'Choose the opening constructs you want to replace. The duel begins after both players finish mulligan.'
                : isMatchActive
                ? 'Break armor first, then deconstruct vulnerable constructs before they recover.'
                : 'The match is complete. You can review the final battlefield state or return to the lobby.'}
            </div>
            {match?.created_at && <div className="saved-empty">Created: {formatDate(match.created_at)}</div>}
            {match?.turn_deadline_at && <div className="saved-empty">Deadline: {formatDate(match.turn_deadline_at)}</div>}
          </section>
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
                  matchTurnNumber={match?.turn_number}
                  menuOpen={openMenuKey === `enemy-${construct?.id || index}`}
                  onToggleMenu={() => setOpenMenuKey((current) => (current === `enemy-${construct?.id || index}` ? null : `enemy-${construct?.id || index}`))}
                  menuItems={[
                    {
                      label: 'View Details',
                      onClick: () => {
                        openConstructDetails(construct, usernameById[enemyPlayerId] || 'Opponent')
                        setOpenMenuKey(null)
                      },
                      disabled: !construct || construct.isUnknownOccupant,
                    },
                    {
                      label: 'Attack',
                      onClick: () => handleAttackConstruct(construct.id),
                      disabled: !construct || construct.isUnknownOccupant || !selectedAttacker || saving || loading || !isOwnTurn || !isBattlePhase || deriveConstructState(construct) === 'destroyed',
                    },
                    {
                      label: 'Deconstruct',
                      onClick: () => {
                        openDeconstructionModal(construct)
                        setOpenMenuKey(null)
                      },
                      disabled: !construct || construct.isUnknownOccupant || !canDeconstructConstruct(construct, match?.turn_number, isOwnTurn) || saving || loading || !isBattlePhase,
                    },
                  ]}
                />
              ))}
            </div>
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
                  matchTurnNumber={match?.turn_number}
                  menuOpen={openMenuKey === `self-${construct?.id || index}`}
                  onToggleMenu={() => setOpenMenuKey((current) => (current === `self-${construct?.id || index}` ? null : `self-${construct?.id || index}`))}
                  menuItems={[
                    {
                      label: 'View Details',
                      onClick: () => {
                        openConstructDetails(construct, session.username)
                        setOpenMenuKey(null)
                      },
                      disabled: !construct || construct.isUnknownOccupant,
                    },
                    {
                      label: selectedAttackerId === construct?.id ? 'Cancel Targeting' : 'Choose Attack Target',
                      onClick: () => {
                        setSelectedAttackerId((current) => (current === construct.id ? null : construct.id))
                        setOpenMenuKey(null)
                      },
                      disabled: !construct || construct.isUnknownOccupant || !canConstructAttackThisTurn(construct, match?.turn_number, isOwnTurn) || saving || loading || !isBattlePhase,
                    },
                    {
                      label: 'Attack Opponent',
                      onClick: () => {
                        setOpenMenuKey(null)
                        handleAttackPlayer(construct.id)
                      },
                      disabled: !construct || construct.isUnknownOccupant || !canConstructAttackThisTurn(construct, match?.turn_number, isOwnTurn) || saving || loading || !isBattlePhase,
                    },
                  ]}
                />
              ))}
            </div>
            <div className="mp-hand-zone">
              <div className="saved-title">Your Hand</div>
              <div className="saved-empty">Cards in hand: {ownHandCards.length}</div>
              {hiddenLegacyTechniqueCards > 0 && <div className="saved-empty">Legacy cards hidden: {hiddenLegacyTechniqueCards}</div>}
              <div className="mp-hand-row">
                {ownHandCards.length === 0 && <div className="mp-hand-card is-placeholder">No cards in hand.</div>}
                {ownHandCards.map((card) => (
                  <HandCard
                    key={card.id}
                    card={card}
                    construct={constructsById[card.linked_match_construct_id] || null}
                    canPlay={
                      !saving &&
                      isOwnTurn &&
                      isBattlePhase &&
                      (
                        card.source_type === 'spell' ||
                        (
                          card.source_type === 'construct' &&
                          openOwnSlots.length > 0 &&
                          (playerStateByUserId[ownPlayerId]?.ingenuity_current ?? 0) >=
                            (constructsById[card.linked_match_construct_id]?.ingenuity_cost ?? 0)
                        )
                      )
                    }
                    openSlots={card.source_type === 'construct' ? openOwnSlots : []}
                    onPlay={handlePlayConstruct}
                    onShowDetails={openHandDetails}
                    menuOpen={openMenuKey === `hand-${card.id}`}
                    onToggleMenu={() => setOpenMenuKey((current) => (current === `hand-${card.id}` ? null : `hand-${card.id}`))}
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
          <div className="panel mp-side-actions-panel">
            <div className="saved-title">Match Controls</div>
            {selectedAttacker && isBattlePhase && (
              <div className="saved-empty">Attacker selected: {selectedAttacker.title || 'Construct'}</div>
            )}
            <div className="mp-side-actions">
              {selectedAttacker && isBattlePhase && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSelectedAttackerId(null)}
                  disabled={saving}
                >
                  Cancel Attack
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => handleEndTurn()}
                disabled={!isOwnTurn || saving || loading || !isBattlePhase}
              >
                {saving && isOwnTurn ? 'Processing...' : 'End Turn'}
              </button>
              <button type="button" className="btn danger" onClick={handleSurrender} disabled={saving || loading || !isMatchActive}>
                Surrender
              </button>
            </div>
          </div>
        </aside>
      </div>

      <DetailsModal detailCard={detailCard} onClose={() => setDetailCard(null)} />
      <SharedResolutionModal resolution={sharedResolution} onClose={() => setSharedResolution(null)} />
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
