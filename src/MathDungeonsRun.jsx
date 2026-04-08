import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getMathDungeonPlayableDetail,
  getMathDungeonRunDetail,
  updateMathDungeonRun,
} from './data/mathDungeonsRepo'
import {
  findDungeonChallenge,
  findDungeonReward,
  findDungeonRoom,
  getDungeonRooms,
  getRoomExitIds,
} from './lib/mathDungeons'
import { requestMathDungeonRuntime } from './lib/mathDungeonsRuntimeApi'

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map((value) => String(value)))]
}

function getRoomChallengeId(room) {
  return String(room?.challengeId || room?.challenge_id || '').trim() || null
}

function getRoomLoot(room) {
  return Array.isArray(room?.loot) ? room.loot.filter(Boolean) : []
}

function createFallbackRoom(currentRoomId) {
  return {
    id: currentRoomId || 'unknown-room',
    name: 'Unknown Room',
    description: 'This run points to a room that is not present in the dungeon context JSON yet.',
    exits: [],
    loot: [],
  }
}

function normalizeRunHistory(history) {
  if (!Array.isArray(history)) return []

  return history
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => ({
      id: String(entry.id || `history-${index}`),
      timestamp: String(entry.timestamp || '').trim() || null,
      actor: String(entry.actor || 'system').trim() || 'system',
      type: String(entry.type || 'event').trim() || 'event',
      title: String(entry.title || 'Run update').trim() || 'Run update',
      body: String(entry.body || '').trim(),
      roomId: String(entry.roomId || '').trim() || null,
      challengeId: String(entry.challengeId || '').trim() || null,
    }))
}

function createRunHistoryEntry({
  actor = 'system',
  type = 'event',
  title,
  body = '',
  roomId = null,
  challengeId = null,
}) {
  const timestamp = new Date().toISOString()

  return {
    id: `${type}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    actor,
    type,
    title: String(title || 'Run update').trim() || 'Run update',
    body: String(body || '').trim(),
    roomId: roomId ? String(roomId).trim() : null,
    challengeId: challengeId ? String(challengeId).trim() : null,
  }
}

function appendRunHistory(history, entries) {
  const nextEntries = Array.isArray(entries) ? entries.filter(Boolean) : []
  if (nextEntries.length === 0) return normalizeRunHistory(history)
  return [...normalizeRunHistory(history), ...nextEntries].slice(-40)
}

function buildRuntimeMathPreview(runtime) {
  return Array.isArray(runtime?.mathInterpretation?.renderedSteps)
    ? runtime.mathInterpretation.renderedSteps.filter(Boolean)
    : []
}

function compactDungeonForRuntime(dungeon, currentRoomId) {
  return {
    id: dungeon?.id || null,
    title: dungeon?.title || '',
    theme: dungeon?.theme || '',
    currentRoomId: currentRoomId || null,
    setting: dungeon?.context_json?.setting || '',
    tone: dungeon?.context_json?.tone || '',
  }
}

function compactRoomForRuntime(room, exits, lootCards) {
  return {
    id: room?.id || null,
    name: room?.name || '',
    description: room?.description || '',
    exits: exits.map((exit) => ({
      id: exit.id,
      name: exit.room?.name || exit.id,
    })),
    visibleLoot: lootCards
      .filter((item) => item.isRevealed && !item.isCollected)
      .map((item) => ({
        rewardId: item.rewardId,
        name: item.reward?.name || item.rewardId,
        description: item.reward?.description || item.reward?.reward_json?.description || '',
      })),
  }
}

function compactChallengeForRuntime(challenge) {
  if (!challenge) return null

  return {
    id: challenge.id,
    title: challenge.title || '',
    roomType: challenge.room_type || '',
    mathTopic: challenge.math_topic || '',
    exercisePrompt: challenge.exercise_prompt || challenge.challenge_json?.exercisePrompt || '',
    interactionPrompt: challenge.challenge_json?.interactionPrompt || '',
    officialAnswer: challenge.challenge_json?.officialAnswer || challenge.challenge_json?.officialResult || '',
    mathFacts: Array.isArray(challenge.challenge_json?.mathFacts) ? challenge.challenge_json.mathFacts.filter(Boolean) : [],
    hintSteps: Array.isArray(challenge.challenge_json?.hintSteps) ? challenge.challenge_json.hintSteps.filter(Boolean) : [],
    relatedQuestions: Array.isArray(challenge.challenge_json?.relatedQuestions)
      ? challenge.challenge_json.relatedQuestions
        .filter((item) => item?.prompt)
        .map((item) => ({
          prompt: item.prompt,
          expectedAnswer: item.expectedAnswer || '',
          mitigation: item.mitigation || '',
          penalty: item.penalty || '',
        }))
      : [],
    enemyProfile: challenge.challenge_json?.enemyProfile || null,
  }
}

function compactCharacterForRuntime(characterSnapshot) {
  return {
    id: characterSnapshot?.id || null,
    name: characterSnapshot?.name || '',
    classId: characterSnapshot?.classId || '',
    level: characterSnapshot?.level || 1,
    stats: characterSnapshot?.stats || {},
    inventoryCount: Array.isArray(characterSnapshot?.inventory) ? characterSnapshot.inventory.length : 0,
  }
}

function compactRunStateForRuntime(runState, history) {
  const recentHistory = [...(Array.isArray(history) ? history : [])]
    .slice(-4)
    .map((entry) => ({
      actor: entry.actor,
      title: entry.title,
      body: entry.body,
    }))

  return {
    currentHealth: runState.currentHealth,
    currentFocus: runState.currentFocus,
    currentRoomId: runState.currentRoomId,
    activeChallengeId: runState.activeChallengeId,
    resolvedChallenges: runState.resolvedChallenges,
    revealedRewardIds: runState.revealedRewardIds,
    collectedRewards: runState.collectedRewards,
    hintsRemainingByChallenge: runState.hintsRemainingByChallenge,
    recentHistory,
  }
}

function normalizeRunState(run, dungeon) {
  const stateJson = run?.state_json && typeof run.state_json === 'object' ? run.state_json : {}
  const characterStats = run?.character_snapshot?.stats && typeof run.character_snapshot.stats === 'object'
    ? run.character_snapshot.stats
    : {}
  const fallbackRoomId = String(
    stateJson.currentRoomId ||
    run?.current_room_id ||
    dungeon?.context_json?.startingRoomId ||
    dungeon?.context_json?.starting_room_id ||
    getDungeonRooms(dungeon?.context_json)?.[0]?.id ||
    'entrance'
  )

  return {
    currentHealth: Number(stateJson.currentHealth ?? characterStats.maxHealth ?? characterStats.health ?? 18),
    currentFocus: Number(stateJson.currentFocus ?? characterStats.focus ?? 3),
    currentRoomId: fallbackRoomId,
    resolvedChallenges: uniqueStrings(stateJson.resolvedChallenges),
    collectedRewards: uniqueStrings(stateJson.collectedRewards),
    revealedRewardIds: uniqueStrings(stateJson.revealedRewardIds),
    roomVisitLog: uniqueStrings(stateJson.roomVisitLog?.length ? stateJson.roomVisitLog : [fallbackRoomId]),
    hintsRemainingByChallenge:
      stateJson.hintsRemainingByChallenge && typeof stateJson.hintsRemainingByChallenge === 'object'
        ? stateJson.hintsRemainingByChallenge
        : {},
    activeChallengeId: String(stateJson.activeChallengeId || '').trim() || null,
    history: normalizeRunHistory(stateJson.history),
  }
}

export default function MathDungeonsRun({ session, runId, onBackToHub, onLogout }) {
  const [runRecord, setRunRecord] = useState(null)
  const [dungeonDetail, setDungeonDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [requestingAi, setRequestingAi] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [playerAction, setPlayerAction] = useState('')
  const [aiRuntime, setAiRuntime] = useState(null)

  const loadRun = useCallback(async () => {
    if (!session?.userId || !runId) return

    try {
      setLoading(true)
      setError('')
      const nextRun = await getMathDungeonRunDetail(runId, session.userId)
      if (!nextRun) throw new Error('Could not find that saved run.')

      const nextDetail = await getMathDungeonPlayableDetail(nextRun.dungeon_id)
      if (!nextDetail?.dungeon) throw new Error('Could not load the dungeon attached to this run.')

      setRunRecord(nextRun)
      setDungeonDetail(nextDetail)
    } catch (nextError) {
      setRunRecord(null)
      setDungeonDetail(null)
      setError(nextError?.message || 'Could not load the active dungeon run.')
    } finally {
      setLoading(false)
    }
  }, [runId, session?.userId])

  useEffect(() => {
    loadRun()
  }, [loadRun])

  const normalizedState = useMemo(
    () => normalizeRunState(runRecord, dungeonDetail?.dungeon),
    [dungeonDetail?.dungeon, runRecord]
  )

  const currentRoom = useMemo(() => {
    const room = findDungeonRoom(dungeonDetail?.dungeon?.context_json, normalizedState.currentRoomId)
    return room || createFallbackRoom(normalizedState.currentRoomId)
  }, [dungeonDetail?.dungeon?.context_json, normalizedState.currentRoomId])

  const roomExitIds = useMemo(() => getRoomExitIds(currentRoom), [currentRoom])

  const currentRoomChallengeId = useMemo(() => getRoomChallengeId(currentRoom), [currentRoom])

  const activeChallengeId = useMemo(() => {
    if (normalizedState.activeChallengeId) return normalizedState.activeChallengeId
    if (
      currentRoomChallengeId &&
      !normalizedState.resolvedChallenges.includes(currentRoomChallengeId)
    ) {
      return currentRoomChallengeId
    }
    return null
  }, [currentRoomChallengeId, normalizedState.activeChallengeId, normalizedState.resolvedChallenges])

  const activeChallenge = useMemo(
    () => findDungeonChallenge(dungeonDetail?.challenges, activeChallengeId),
    [activeChallengeId, dungeonDetail?.challenges]
  )

  const runtimeMode = useMemo(() => {
    if (!activeChallenge) return 'exploration'
    return activeChallenge.room_type === 'riddle' ? 'puzzle' : 'combat'
  }, [activeChallenge])

  const roomLootCards = useMemo(() => {
    return getRoomLoot(currentRoom).map((entry, index) => {
      const rewardId = String(entry?.rewardId || entry?.reward_id || '').trim()
      const reward = findDungeonReward(dungeonDetail?.rewards, rewardId)
      return {
        index,
        entry,
        rewardId,
        reward,
        isCollected: normalizedState.collectedRewards.includes(rewardId),
        isRevealed:
          normalizedState.revealedRewardIds.includes(rewardId) ||
          String(entry?.visibility || 'visible').trim() !== 'hidden',
      }
    })
  }, [currentRoom, dungeonDetail?.rewards, normalizedState.collectedRewards, normalizedState.revealedRewardIds])

  const roomExitCards = useMemo(() => {
    return roomExitIds.map((exitId) => ({
      id: exitId,
      room: findDungeonRoom(dungeonDetail?.dungeon?.context_json, exitId),
    }))
  }, [dungeonDetail?.dungeon?.context_json, roomExitIds])

  const currentHintCount = useMemo(() => {
    if (!activeChallenge?.id) return 0
    const hintList = Array.isArray(activeChallenge.challenge_json?.hintSteps)
      ? activeChallenge.challenge_json.hintSteps
      : Array.isArray(activeChallenge.challenge_json?.hints)
        ? activeChallenge.challenge_json.hints
        : []
    const stored = normalizedState.hintsRemainingByChallenge?.[activeChallenge.id]
    if (Number.isFinite(stored)) return Math.max(0, Number(stored))
    return hintList.length > 0 ? Math.min(3, hintList.length) : 3
  }, [activeChallenge, normalizedState.hintsRemainingByChallenge])

  const trialPrompt = useMemo(() => {
    if (!activeChallenge) return ''
    return activeChallenge.challenge_json?.interactionPrompt
      || (runtimeMode === 'combat'
        ? 'You feel the enemy forcing a precise mathematical response. What exact step do you want to execute?'
        : 'You connect with the mathematical essence of the challenge. What exact step do you want to execute?')
  }, [activeChallenge, runtimeMode])

  const runtimeButtonLabel = runtimeMode === 'exploration'
    ? 'Ask Dungeon Master'
    : 'Execute My Step'

  const actionPlaceholder = runtimeMode === 'exploration'
    ? 'Inspect the statue, test the northern door, ask about the room...'
    : 'State one exact mathematical step, substitution, transformation, or answer.'

  const buildRuntimePayload = useCallback((actionText, { hintRequested = false } = {}) => ({
    mode: runtimeMode,
    dungeon: compactDungeonForRuntime(dungeonDetail?.dungeon, normalizedState.currentRoomId),
    currentRoom: compactRoomForRuntime(currentRoom, roomExitCards, roomLootCards),
    activeChallenge: compactChallengeForRuntime(activeChallenge),
    character: compactCharacterForRuntime(runRecord?.character_snapshot || {}),
    runState: compactRunStateForRuntime(normalizedState, normalizedState.history),
    playerAction: String(actionText || '').trim(),
    interactionContext: {
      challengePhase: runtimeMode,
      commandPolicy: runtimeMode === 'exploration' ? 'narrate-world' : 'execute-student-command-only',
      hintRequested,
      allowFullSolution: false,
      maxHints: 3,
      remainingHints: currentHintCount,
      uiIntentLabel: runtimeMode === 'exploration' ? 'free exploration' : 'strict mathematical execution',
    },
  }), [
    activeChallenge,
    currentHintCount,
    currentRoom,
    dungeonDetail?.dungeon,
    normalizedState,
    runRecord?.character_snapshot,
    roomExitCards,
    roomLootCards,
    runtimeMode,
  ])

  const persistRun = useCallback(async ({
    nextState,
    nextStatus = runRecord?.status || 'active',
    nextCurrentRoomId = nextState?.currentRoomId || normalizedState.currentRoomId,
    nextCharacterSnapshot = runRecord?.character_snapshot || {},
    historyEntries = [],
    successNotice = '',
  }) => {
    if (!session?.userId || !runRecord?.id) return

    try {
      setSaving(true)
      setError('')
      setNotice('')

      const finalState = {
        ...nextState,
        history: appendRunHistory(nextState?.history, historyEntries),
      }

      const updatedRun = await updateMathDungeonRun(runRecord.id, session.userId, {
        status: nextStatus,
        current_room_id: nextCurrentRoomId,
        character_snapshot: nextCharacterSnapshot,
        state_json: finalState,
      })

      setRunRecord(updatedRun)
      if (successNotice) setNotice(successNotice)
    } catch (nextError) {
      setError(nextError?.message || 'Could not save the dungeon run.')
    } finally {
      setSaving(false)
    }
  }, [normalizedState.currentRoomId, runRecord, session?.userId])

  const handleInspectRoom = async () => {
    const roomRewardIds = roomLootCards
      .map((item) => item.rewardId)
      .filter(Boolean)

    await persistRun({
      nextState: {
        ...normalizedState,
        activeChallengeId: activeChallengeId || null,
        revealedRewardIds: uniqueStrings([...normalizedState.revealedRewardIds, ...roomRewardIds]),
        roomVisitLog: uniqueStrings([...normalizedState.roomVisitLog, normalizedState.currentRoomId]),
      },
      historyEntries: [
        createRunHistoryEntry({
          actor: 'player',
          type: 'inspect',
          title: 'Room inspected',
          body: roomRewardIds.length
            ? `The party searched ${currentRoom.name || normalizedState.currentRoomId} and revealed ${roomRewardIds.length} reward item(s).`
            : `The party searched ${currentRoom.name || normalizedState.currentRoomId} but found no new loot.`,
          roomId: normalizedState.currentRoomId,
          challengeId: activeChallengeId,
        }),
      ],
      successNotice: roomRewardIds.length
        ? 'You inspected the room and revealed its available loot.'
        : 'You inspected the room. No loot was revealed here.',
    })
  }

  const handleMoveToRoom = async (targetRoomId) => {
    if (!targetRoomId) return
    if (activeChallengeId && !normalizedState.resolvedChallenges.includes(activeChallengeId)) {
      setError('Resolve the current room challenge before moving deeper into the dungeon.')
      return
    }

    const targetRoom = findDungeonRoom(dungeonDetail?.dungeon?.context_json, targetRoomId)
    const nextChallengeId = getRoomChallengeId(targetRoom)
    const shouldActivateChallenge =
      nextChallengeId && !normalizedState.resolvedChallenges.includes(nextChallengeId)

    await persistRun({
      nextCurrentRoomId: targetRoomId,
      nextState: {
        ...normalizedState,
        currentRoomId: targetRoomId,
        roomVisitLog: uniqueStrings([...normalizedState.roomVisitLog, targetRoomId]),
        activeChallengeId: shouldActivateChallenge ? nextChallengeId : null,
      },
      historyEntries: [
        createRunHistoryEntry({
          actor: 'player',
          type: 'move',
          title: 'Moved to a new room',
          body: `The party advanced into ${targetRoom?.name || targetRoomId}.`,
          roomId: targetRoomId,
          challengeId: shouldActivateChallenge ? nextChallengeId : null,
        }),
      ],
      successNotice: `You moved into ${targetRoom?.name || targetRoomId}.`,
    })
  }

  const handleEngageChallenge = async () => {
    if (!activeChallengeId) return
    await persistRun({
      nextState: {
        ...normalizedState,
        activeChallengeId,
      },
      historyEntries: [
        createRunHistoryEntry({
          actor: 'player',
          type: 'engage-challenge',
          title: 'Challenge engaged',
          body: activeChallenge?.title
            ? `The party committed to ${activeChallenge.title}.`
            : 'The party committed to the room challenge.',
          roomId: normalizedState.currentRoomId,
          challengeId: activeChallengeId,
        }),
      ],
      successNotice: 'Challenge engaged. You can now request hints or resolve the encounter.',
    })
  }

  const handleRequestHint = async () => {
    if (!activeChallenge?.id) return

    const hintList = Array.isArray(activeChallenge.challenge_json?.hintSteps)
      ? activeChallenge.challenge_json.hintSteps
      : Array.isArray(activeChallenge.challenge_json?.hints)
        ? activeChallenge.challenge_json.hints
        : []
    const remaining = currentHintCount
    if (remaining <= 0) {
      setError('No hints remain for this challenge.')
      return
    }

    const nextRemaining = remaining - 1
    const hintIndex = Math.max(0, hintList.length - remaining)
    const nextHealth = nextRemaining === 0 ? Math.max(0, normalizedState.currentHealth - 2) : normalizedState.currentHealth
    const nextResolvedChallenges = nextRemaining === 0
      ? uniqueStrings([...normalizedState.resolvedChallenges, activeChallenge.id])
      : normalizedState.resolvedChallenges
    const nextStatus = nextRemaining === 0 && nextHealth <= 0 ? 'failed' : (runRecord?.status || 'active')
    let hintNotice = nextRemaining === 0
      ? `${activeChallenge.failure_outcome || 'The challenge fails after the final hint is consumed.'} You lose 2 HP.`
      : `Hint ${hintIndex + 1}: ${hintList[hintIndex] || 'No hint text was provided for this step.'}`

    try {
      setRequestingAi(true)
      const response = await requestMathDungeonRuntime(buildRuntimePayload(
        'The student presses "Conectar con tu ingenio e inventiva" and requests one concise next-step hint.',
        { hintRequested: true }
      ))
      const runtime = response?.runtime || null
      if (runtime) {
        setAiRuntime(runtime)
        hintNotice = runtime?.narration || runtime?.clarificationPrompt || hintNotice
      }
    } catch {
      // Fall back to the local hint text if the runtime is unavailable.
    } finally {
      setRequestingAi(false)
    }

    await persistRun({
      nextStatus,
      nextState: {
        ...normalizedState,
        currentHealth: nextHealth,
        hintsRemainingByChallenge: {
          ...normalizedState.hintsRemainingByChallenge,
          [activeChallenge.id]: nextRemaining,
        },
        resolvedChallenges: nextResolvedChallenges,
        activeChallengeId: nextRemaining === 0 ? null : activeChallenge.id,
      },
      historyEntries: [
        createRunHistoryEntry({
          actor: 'system',
          type: nextRemaining === 0 ? 'challenge-failed' : 'hint',
          title: nextRemaining === 0 ? 'Challenge failed after hints' : 'Hint consumed',
          body: hintNotice,
          roomId: normalizedState.currentRoomId,
          challengeId: activeChallenge.id,
        }),
      ],
      successNotice: hintNotice,
    })
  }

  const handleResolveChallenge = async (result) => {
    if (!activeChallenge?.id) return

    const roomRewardIds = result === 'success'
      ? roomLootCards.map((item) => item.rewardId).filter(Boolean)
      : []
    const nextHealth = result === 'failure'
      ? Math.max(0, normalizedState.currentHealth - 3)
      : normalizedState.currentHealth
    const nextStatus = result === 'failure' && nextHealth <= 0 ? 'failed' : (runRecord?.status || 'active')
    const resolutionNotice = result === 'success'
      ? activeChallenge.success_outcome || 'Challenge cleared successfully.'
      : `${activeChallenge.failure_outcome || 'The challenge was failed.'} You lose 3 HP.`

    await persistRun({
      nextStatus,
      nextState: {
        ...normalizedState,
        currentHealth: nextHealth,
        resolvedChallenges: uniqueStrings([...normalizedState.resolvedChallenges, activeChallenge.id]),
        revealedRewardIds: uniqueStrings([...normalizedState.revealedRewardIds, ...roomRewardIds]),
        activeChallengeId: null,
      },
      historyEntries: [
        createRunHistoryEntry({
          actor: 'system',
          type: result === 'success' ? 'challenge-success' : 'challenge-failure',
          title: result === 'success' ? 'Challenge resolved successfully' : 'Challenge resolution failed',
          body: resolutionNotice,
          roomId: normalizedState.currentRoomId,
          challengeId: activeChallenge.id,
        }),
      ],
      successNotice: resolutionNotice,
    })
  }

  const handleCollectReward = async (rewardId) => {
    if (!rewardId || normalizedState.collectedRewards.includes(rewardId)) return

    const reward = findDungeonReward(dungeonDetail?.rewards, rewardId)
    const nextInventory = uniqueStrings([
      ...(Array.isArray(runRecord?.character_snapshot?.inventory) ? runRecord.character_snapshot.inventory : []),
      rewardId,
    ])

    await persistRun({
      nextCharacterSnapshot: {
        ...(runRecord?.character_snapshot || {}),
        inventory: nextInventory,
      },
      nextState: {
        ...normalizedState,
        collectedRewards: uniqueStrings([...normalizedState.collectedRewards, rewardId]),
      },
      historyEntries: [
        createRunHistoryEntry({
          actor: 'player',
          type: 'collect-reward',
          title: 'Reward collected',
          body: `${reward?.name || rewardId} was added to the run inventory.`,
          roomId: normalizedState.currentRoomId,
        }),
      ],
      successNotice: `${reward?.name || rewardId} was added to your run inventory.`,
    })
  }

  const handleAskDungeonMaster = async () => {
    if (!playerAction.trim()) {
      setError(runtimeMode === 'exploration'
        ? 'Write a player action before consulting the dungeon master.'
        : 'Describe one exact mathematical step before sending it to the runtime.')
      return
    }

    try {
      setRequestingAi(true)
      setError('')
      setNotice('')

      const response = await requestMathDungeonRuntime(buildRuntimePayload(playerAction.trim()))

      const runtime = response?.runtime || null
      setAiRuntime(runtime)

      const shouldRevealLoot = Boolean(runtime?.rulesSuggestion?.shouldRevealLoot)
      const rewardIds = uniqueStrings(runtime?.rulesSuggestion?.rewardIds)
      const shouldActivateChallenge = Boolean(runtime?.rulesSuggestion?.shouldActivateChallenge)
      const suggestedChallengeId = String(runtime?.rulesSuggestion?.challengeId || '').trim() || null
      const historyEntries = [
        createRunHistoryEntry({
          actor: 'player',
          type: 'player-action',
          title: 'Player asked the Dungeon Master',
          body: playerAction.trim(),
          roomId: normalizedState.currentRoomId,
          challengeId: activeChallenge?.id,
        }),
        createRunHistoryEntry({
          actor: 'dm',
          type: 'dm-response',
          title: runtime?.playerIntent
            ? `Dungeon Master interpreted: ${runtime.playerIntent}`
            : 'Dungeon Master responded',
          body: [runtime?.narration, runtime?.clarificationPrompt].filter(Boolean).join(' ') || 'No narration returned.',
          roomId: normalizedState.currentRoomId,
          challengeId: suggestedChallengeId || activeChallenge?.id,
        }),
      ]

      await persistRun({
        nextState: {
          ...normalizedState,
          revealedRewardIds: shouldRevealLoot
            ? uniqueStrings([...normalizedState.revealedRewardIds, ...rewardIds])
            : normalizedState.revealedRewardIds,
          activeChallengeId: shouldActivateChallenge ? suggestedChallengeId : normalizedState.activeChallengeId,
        },
        historyEntries,
        successNotice: runtime?.clarificationNeeded
          ? runtime?.clarificationPrompt || runtime?.narration || 'The runtime asks for more specificity.'
          : runtime?.narration || 'Dungeon master response received.',
      })
    } catch (nextError) {
      setError(nextError?.message || 'Could not reach the dungeon master runtime.')
    } finally {
      setRequestingAi(false)
    }
  }

  if (!runId) {
    return (
      <div className="menu-shell dungeon-shell">
        <div className="menu-card dungeon-card">
          <div className="auth-error">No dungeon run is currently selected.</div>
          <div className="menu-actions competitive-menu-footer">
            <button type="button" className="btn menu-btn" onClick={onBackToHub}>Back to Math Dungeons</button>
            <button type="button" className="btn menu-btn" onClick={onLogout}>Log out</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="menu-shell dungeon-shell">
      <div className="menu-card dungeon-card">
        <div className="menu-top">
          <div>
            <p className="welcome-overline">PHASE 4 ACTIVE RUNTIME</p>
            <h1 className="menu-title">{dungeonDetail?.dungeon?.title || 'Math Dungeons Run'}</h1>
            <p className="menu-subtitle">
              Open the saved run, inspect the current room, resolve its challenge and persist every step.
            </p>
          </div>
          <span className="session-user">User: {session.username} ({session.role})</span>
        </div>

        <div className="menu-actions" style={{ marginBottom: 16 }}>
          <button type="button" className="btn menu-btn" onClick={loadRun} disabled={loading || saving}>
            {loading ? 'Refreshing...' : 'Refresh Run'}
          </button>
          <button type="button" className="btn menu-btn" onClick={onBackToHub} disabled={saving}>
            Back to Math Dungeons
          </button>
          <button type="button" className="btn menu-btn" onClick={onLogout} disabled={saving}>
            Log out
          </button>
        </div>

        {(error || notice) && (
          <div className="dungeon-stack" style={{ marginBottom: 16 }}>
            {error && <div className="auth-error">{error}</div>}
            {!error && notice && <div className="saved-empty">{notice}</div>}
          </div>
        )}

        {loading || !runRecord || !dungeonDetail?.dungeon ? (
          <div className="saved-empty">Loading active dungeon runtime...</div>
        ) : (
          <>
            <section className="dungeon-hero-panel">
              <article className="dungeon-panel">
                <div className="saved-title">Run Status</div>
                <h2 className="dungeon-section-title">{runRecord.character_snapshot?.name || 'Adventurer'} in {currentRoom.name || currentRoom.id}</h2>
                <p className="dungeon-copy">{currentRoom.description || 'No room description provided yet.'}</p>
                <div className="dungeon-tag-row">
                  <span className="saved-item-tags">Status: {runRecord.status}</span>
                  <span className="saved-item-tags">HP: {normalizedState.currentHealth}</span>
                  <span className="saved-item-tags">Focus: {normalizedState.currentFocus}</span>
                  <span className="saved-item-tags">Visited Rooms: {normalizedState.roomVisitLog.length}</span>
                </div>
              </article>

              <article className="dungeon-loop-card">
                <div className="saved-title">Current Objective</div>
                <ol className="dungeon-loop-list">
                  <li>Inspect the room to reveal loot and confirm facts.</li>
                  <li>Resolve the room challenge before advancing.</li>
                  <li>Collect revealed rewards into the run inventory.</li>
                  <li>Move through exits and keep the run state synced.</li>
                </ol>
              </article>
            </section>

            <section className="dungeon-runtime-grid">
              <article className="dungeon-panel">
                <div className="saved-title">Character Snapshot</div>
                <div className="dungeon-runtime-list">
                  <div className="saved-empty">Class: {runRecord.character_snapshot?.classId || 'Unknown'}</div>
                  <div className="saved-empty">Level: {runRecord.character_snapshot?.level || 1}</div>
                  <div className="saved-empty">Run HP: {normalizedState.currentHealth}</div>
                  <div className="saved-empty">Run Focus: {normalizedState.currentFocus}</div>
                </div>
                <div className="dungeon-tag-row">
                  {Object.entries(runRecord.character_snapshot?.stats || {}).map(([key, value]) => (
                    <span key={key} className="saved-item-tags">{key}: {value}</span>
                  ))}
                </div>
              </article>

              <article className="dungeon-panel">
                <div className="saved-title">Room Controls</div>
                <div className="menu-actions dungeon-runtime-actions">
                  <button type="button" className="btn menu-btn" onClick={handleInspectRoom} disabled={saving || runRecord.status !== 'active'}>
                    Inspect Room
                  </button>
                  <button
                    type="button"
                    className="btn menu-btn"
                    onClick={handleEngageChallenge}
                    disabled={saving || !activeChallengeId || normalizedState.resolvedChallenges.includes(activeChallengeId) || runRecord.status !== 'active'}
                  >
                    Engage Challenge
                  </button>
                </div>
                <div className="saved-empty">
                  Theme: {dungeonDetail.dungeon.theme || 'No theme provided.'}
                </div>
                <div className="saved-empty">
                  Current room id: {normalizedState.currentRoomId}
                </div>
              </article>
            </section>

            <section className="dungeon-runtime-grid">
              <article className="dungeon-panel">
                <div className="saved-title">{runtimeMode === 'exploration' ? 'Dungeon Master' : 'Trial Interface'}</div>
                {activeChallenge && (
                  <div className="saved-empty">{trialPrompt}</div>
                )}
                <label className="field">
                  <span>{runtimeMode === 'exploration' ? 'Player action' : 'Student command'}</span>
                  <textarea
                    rows={4}
                    value={playerAction}
                    onChange={(event) => setPlayerAction(event.target.value)}
                    placeholder={actionPlaceholder}
                  />
                </label>
                <div className="menu-actions dungeon-runtime-actions">
                  <button
                    type="button"
                    className="btn menu-btn"
                    onClick={handleAskDungeonMaster}
                    disabled={requestingAi || saving || runRecord.status !== 'active'}
                  >
                    {requestingAi ? 'Consulting...' : runtimeButtonLabel}
                  </button>
                </div>
                <div className="saved-empty">
                  {runtimeMode === 'exploration'
                    ? 'The model narrates and suggests facts. The engine still decides what state gets persisted.'
                    : 'The model should execute only the exact mathematical instruction given, or ask for clarification if the order is vague.'}
                </div>
              </article>

              <article className="dungeon-panel">
                <div className="saved-title">Latest AI Response</div>
                {!aiRuntime ? (
                  <div className="saved-empty">No AI narration requested yet in this session.</div>
                ) : (
                  <div className="dungeon-runtime-list">
                    <div className="saved-item-meta">Mode: {aiRuntime.mode || 'unknown'}</div>
                    <div className="saved-item-meta">Intent: {aiRuntime.playerIntent || 'unknown'}</div>
                    <div className="saved-empty">{aiRuntime.narration || 'No narration returned.'}</div>
                    {aiRuntime.clarificationNeeded && (
                      <div className="auth-error">{aiRuntime.clarificationPrompt || 'The runtime needs a more specific command.'}</div>
                    )}
                    {aiRuntime.mathInterpretation?.actionSummary && (
                      <div className="saved-empty">Action summary: {aiRuntime.mathInterpretation.actionSummary}</div>
                    )}
                    {buildRuntimeMathPreview(aiRuntime).length > 0 && (
                      <div className="dungeon-stack">
                        <div className="saved-title">Rendered Math Steps</div>
                        {buildRuntimeMathPreview(aiRuntime).map((step, stepIndex) => (
                          <div key={`math-step-${stepIndex}`} className="saved-empty">{step}</div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(aiRuntime.mathInterpretation?.referencedFacts) && aiRuntime.mathInterpretation.referencedFacts.length > 0 && (
                      <div className="dungeon-stack">
                        <div className="saved-title">Referenced Facts</div>
                        {aiRuntime.mathInterpretation.referencedFacts.map((fact, factIndex) => (
                          <div key={`referenced-fact-${factIndex}`} className="saved-empty">{fact}</div>
                        ))}
                      </div>
                    )}
                    <div className="saved-item-tags">
                      Reveal loot: {aiRuntime.rulesSuggestion?.shouldRevealLoot ? 'yes' : 'no'} | Activate challenge:{' '}
                      {aiRuntime.rulesSuggestion?.shouldActivateChallenge ? 'yes' : 'no'}
                    </div>
                    {aiRuntime.mathInterpretation?.nextExpectedInput && (
                      <div className="saved-empty">Next expected input: {aiRuntime.mathInterpretation.nextExpectedInput}</div>
                    )}
                    {aiRuntime.evaluation?.feedback && (
                      <div className="saved-empty">Evaluation: {aiRuntime.evaluation.feedback}</div>
                    )}
                    {aiRuntime.evaluation?.relatedQuestionPrompt && (
                      <div className="saved-empty">Related question: {aiRuntime.evaluation.relatedQuestionPrompt}</div>
                    )}
                  </div>
                )}
              </article>
            </section>

            <section className="dungeon-runtime-grid">
              <article className="dungeon-panel">
                <div className="saved-title">Active Challenge</div>
                {!activeChallenge ? (
                  <div className="saved-empty">This room has no active challenge or it has already been resolved.</div>
                ) : (
                  <div className="dungeon-runtime-list">
                    <div className="saved-item-title">{activeChallenge.title || 'Unnamed challenge'}</div>
                    <div className="saved-item-meta">{activeChallenge.math_topic || 'No math topic'} | {activeChallenge.room_type || 'room'}</div>
                    <div className="saved-empty">{activeChallenge.exercise_prompt || 'No exercise prompt provided.'}</div>
                    {activeChallenge.challenge_json?.interactionPrompt && (
                      <div className="saved-empty">{activeChallenge.challenge_json.interactionPrompt}</div>
                    )}
                    <div className="saved-empty">Hints remaining: {currentHintCount}</div>
                    {Array.isArray(activeChallenge.challenge_json?.mathFacts) && activeChallenge.challenge_json.mathFacts.length > 0 && (
                      <div className="dungeon-stack">
                        <div className="saved-title">Math Facts In Context</div>
                        {activeChallenge.challenge_json.mathFacts.map((fact, factIndex) => (
                          <div key={`active-fact-${factIndex}`} className="saved-empty">{fact}</div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(activeChallenge.challenge_json?.relatedQuestions) && activeChallenge.challenge_json.relatedQuestions.length > 0 && (
                      <div className="dungeon-stack">
                        <div className="saved-title">Enemy Related Questions</div>
                        {activeChallenge.challenge_json.relatedQuestions.map((question, questionIndex) => (
                          <div key={`active-related-question-${questionIndex}`} className="saved-empty">
                            {question?.prompt || `Question ${questionIndex + 1}`}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="menu-actions dungeon-runtime-actions">
                      <button type="button" className="btn menu-btn" onClick={handleRequestHint} disabled={saving || runRecord.status !== 'active'}>
                        Conectar con tu ingenio e inventiva
                      </button>
                      <button type="button" className="btn menu-btn" onClick={() => handleResolveChallenge('success')} disabled={saving || runRecord.status !== 'active'}>
                        Mark Success
                      </button>
                      <button type="button" className="btn danger" onClick={() => handleResolveChallenge('failure')} disabled={saving || runRecord.status !== 'active'}>
                        Mark Failure
                      </button>
                    </div>
                  </div>
                )}
              </article>

              <article className="dungeon-panel">
                <div className="saved-title">Exits</div>
                {roomExitCards.length === 0 ? (
                  <div className="saved-empty">This room has no declared exits yet.</div>
                ) : (
                  <div className="dungeon-stack">
                    {roomExitCards.map((exit) => (
                      <div key={exit.id} className="dungeon-runtime-card">
                        <div>
                          <div className="saved-item-title">{exit.room?.name || exit.id}</div>
                          <div className="saved-item-meta">{exit.room?.description || 'No target room description available.'}</div>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleMoveToRoom(exit.id)}
                          disabled={saving || runRecord.status !== 'active'}
                        >
                          Move
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>

            <section className="dungeon-runtime-grid">
              <article className="dungeon-panel">
                <div className="saved-title">Room Loot</div>
                {roomLootCards.length === 0 ? (
                  <div className="saved-empty">No loot is attached to this room.</div>
                ) : (
                  <div className="dungeon-stack">
                    {roomLootCards.map((item) => (
                      <div key={`${item.rewardId || 'room-loot'}-${item.index}`} className="dungeon-runtime-card">
                        <div>
                          <div className="saved-item-title">{item.reward?.name || item.rewardId || 'Unknown reward'}</div>
                          <div className="saved-item-meta">
                            {item.reward?.description || item.reward?.reward_json?.description || 'No reward description provided.'}
                          </div>
                          <div className="saved-item-tags">
                            {item.isCollected ? 'Collected' : item.isRevealed ? 'Revealed' : 'Hidden'}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleCollectReward(item.rewardId)}
                          disabled={saving || !item.isRevealed || item.isCollected || runRecord.status !== 'active'}
                        >
                          Collect
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="dungeon-panel">
                <div className="saved-title">Run Inventory</div>
                {normalizedState.collectedRewards.length === 0 ? (
                  <div className="saved-empty">No rewards collected yet in this run.</div>
                ) : (
                  <div className="dungeon-tag-row">
                    {normalizedState.collectedRewards.map((rewardId) => {
                      const reward = findDungeonReward(dungeonDetail.rewards, rewardId)
                      return (
                        <span key={rewardId} className="saved-item-tags">{reward?.name || rewardId}</span>
                      )
                    })}
                  </div>
                )}
                <div className="saved-empty" style={{ marginTop: 12 }}>
                  Snapshot inventory entries: {(runRecord.character_snapshot?.inventory || []).length}
                </div>
              </article>
            </section>

            <section className="dungeon-runtime-grid">
              <article className="dungeon-panel">
                <div className="saved-title">Run History</div>
                {normalizedState.history.length === 0 ? (
                  <div className="saved-empty">No events have been recorded for this run yet.</div>
                ) : (
                  <div className="dungeon-stack">
                    {[...normalizedState.history].reverse().map((entry) => (
                      <div key={entry.id} className="dungeon-runtime-card">
                        <div className="saved-item-title">{entry.title}</div>
                        <div className="saved-item-meta">
                          {entry.actor} | {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Unknown time'}
                        </div>
                        {entry.body ? <div className="saved-empty">{entry.body}</div> : null}
                        <div className="saved-item-tags">
                          {entry.type}
                          {entry.roomId ? ` | room: ${entry.roomId}` : ''}
                          {entry.challengeId ? ` | challenge: ${entry.challengeId}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="dungeon-panel">
                <div className="saved-title">Run Snapshot</div>
                <div className="dungeon-runtime-list">
                  <div className="saved-empty">Resolved challenges: {normalizedState.resolvedChallenges.length}</div>
                  <div className="saved-empty">Revealed rewards: {normalizedState.revealedRewardIds.length}</div>
                  <div className="saved-empty">Collected rewards: {normalizedState.collectedRewards.length}</div>
                  <div className="saved-empty">History entries kept: {normalizedState.history.length}/40</div>
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
