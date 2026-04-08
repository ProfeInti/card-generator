import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createMathDungeonCharacter,
  createMathDungeonRun,
  deleteMathDungeon,
  deleteMathDungeonCharacter,
  deleteMathDungeonRun,
  getMathDungeonDetail,
  getMathDungeonPlayableDetail,
  listMathDungeons,
  listOwnMathDungeonCharacters,
  listOwnMathDungeonRuns,
  listPublishedMathDungeons,
  saveMathDungeonGraph,
} from './data/mathDungeonsRepo'
import {
  applyCharacterClassBonus,
  buildChallengeHintSteps,
  buildChallengeJsonFromDraft,
  buildChallengeMathFacts,
  buildChallengeRelatedQuestions,
  CHALLENGE_FACT_SLOTS,
  CHALLENGE_HINT_SLOTS,
  CHALLENGE_RELATED_QUESTION_SLOTS,
  CHARACTER_CLASS_OPTIONS,
  createChallengeDraft,
  createCharacterBaseStats,
  createCharacterDraft,
  createContextTemplate,
  createDefaultPlayerStats,
  createRewardDraft,
  DUNGEON_ENGINE_RULES,
  DUNGEON_JSON_GUIDES,
  DUNGEON_VISIBILITY_OPTIONS,
  hydrateChallengeDraftFromSource,
  PLAYER_STAT_DEFINITIONS,
  stringifyDungeonJson,
} from './lib/mathDungeons'
import { downloadJsonFile, parseJsonFile } from './lib/competitiveJson'
import {
  buildMathDungeonChallengeExportJson,
  buildMathDungeonChallengesTemplateJson,
  extractMathDungeonChallengesFromJson,
  normalizeMathDungeonChallengeImportItem,
} from './lib/mathDungeonsJson'

function TeacherInputPanel({ title, body, children }) {
  return (
    <article className="dungeon-panel">
      <div className="saved-title">Teacher Input</div>
      <h3 className="dungeon-panel-title">{title}</h3>
      <p className="dungeon-copy">{body}</p>
      <div className="dungeon-stack">{children}</div>
    </article>
  )
}

function JsonGuidePanel({ guide }) {
  return (
    <article className="dungeon-panel">
      <div className="saved-title">AI Fill Guide</div>
      <h3 className="dungeon-panel-title">{guide.title}</h3>
      <div className="dungeon-stack">
        {guide.instructions.map((instruction) => (
          <div key={instruction} className="saved-empty">{instruction}</div>
        ))}
      </div>
      <pre className="dungeon-json-preview">{JSON.stringify(guide.template, null, 2)}</pre>
    </article>
  )
}

function ChallengeEditor({
  challenge,
  index,
  onChange,
  onMathFactChange,
  onHintStepChange,
  onRelatedQuestionChange,
  onExport,
  onImport,
  onRemove,
}) {
  return (
    <div className="dungeon-collection-card">
      <div className="dungeon-inline-header">
        <div>
          <div className="saved-title">Challenge {index + 1}</div>
          <div className="saved-empty">One challenge can drive a riddle, enemy, elite enemy, boss, or scripted interaction.</div>
        </div>
        <div className="menu-actions wb-inline-actions">
          <button type="button" className="btn" onClick={onExport}>Export JSON</button>
          <button type="button" className="btn" onClick={onImport}>Import JSON</button>
          <button type="button" className="btn danger" onClick={onRemove}>Remove</button>
        </div>
      </div>

      <div className="dungeon-form-grid">
        <label className="field">
          <span>Challenge title</span>
          <input value={challenge.title} onChange={(e) => onChange('title', e.target.value)} />
        </label>

        <label className="field">
          <span>Room type</span>
          <select value={challenge.roomType} onChange={(e) => onChange('roomType', e.target.value)}>
            <option value="riddle">Riddle</option>
            <option value="enemy">Enemy</option>
            <option value="elite-enemy">Elite Enemy</option>
            <option value="boss">Boss</option>
          </select>
        </label>
      </div>

      <div className="dungeon-form-grid">
        <label className="field">
          <span>Math topic</span>
          <input
            value={challenge.mathTopic}
            onChange={(e) => onChange('mathTopic', e.target.value)}
            placeholder="Integrals, factoring, equations..."
          />
        </label>

        <label className="field">
          <span>Exercise or challenge prompt</span>
          <textarea
            rows={4}
            value={challenge.exercisePrompt}
            onChange={(e) => onChange('exercisePrompt', e.target.value)}
            placeholder="Describe the mathematical challenge the room should execute."
          />
        </label>
      </div>

      <label className="field">
        <span>Immersive interaction prompt</span>
        <textarea
          rows={3}
          value={challenge.interactionPrompt}
          onChange={(e) => onChange('interactionPrompt', e.target.value)}
          placeholder="Conectas con la esencia matematica del desafio... Que deberias hacer?"
        />
      </label>

      <label className="field">
        <span>Official answer</span>
        <textarea
          rows={3}
          value={challenge.officialAnswer}
          onChange={(e) => onChange('officialAnswer', e.target.value)}
          placeholder="Store the official expected answer or conclusion."
        />
      </label>

      <div className="dungeon-foundation-grid">
        <article className="dungeon-panel">
          <div className="saved-title">Math Facts</div>
          <div className="saved-empty">Atomic facts, equations, conditions, and explicit mathematical elements taken directly from the challenge.</div>
          <div className="dungeon-stack">
            {Array.from({ length: CHALLENGE_FACT_SLOTS }, (_, slotIndex) => (
              <label key={`fact-${slotIndex}`} className="field">
                <span>Fact {slotIndex + 1}</span>
                <textarea
                  rows={2}
                  value={challenge.mathFacts?.[slotIndex] || ''}
                  onChange={(e) => onMathFactChange(slotIndex, e.target.value)}
                  placeholder="One atomic relation, value, or condition."
                />
              </label>
            ))}
          </div>
        </article>

        <article className="dungeon-panel">
          <div className="saved-title">Hint Steps</div>
          <div className="saved-empty">These are only revealed when the student clicks `Conectar con tu ingenio e inventiva`.</div>
          <div className="dungeon-stack">
            {Array.from({ length: CHALLENGE_HINT_SLOTS }, (_, slotIndex) => (
              <label key={`hint-${slotIndex}`} className="field">
                <span>Hint {slotIndex + 1}</span>
                <textarea
                  rows={2}
                  value={challenge.hintSteps?.[slotIndex] || ''}
                  onChange={(e) => onHintStepChange(slotIndex, e.target.value)}
                  placeholder="Concise next-step guidance, never the full solution."
                />
              </label>
            ))}
          </div>
        </article>
      </div>

      {(challenge.roomType === 'enemy' || challenge.roomType === 'elite-enemy' || challenge.roomType === 'boss') && (
        <>
          <div className="dungeon-form-grid">
            <label className="field">
              <span>Enemy name</span>
              <input
                value={challenge.enemyName}
                onChange={(e) => onChange('enemyName', e.target.value)}
                placeholder="Sentinel of Falling Tangents"
              />
            </label>

            <label className="field">
              <span>Enemy attack flavor</span>
              <input
                value={challenge.enemyAttackFlavor}
                onChange={(e) => onChange('enemyAttackFlavor', e.target.value)}
                placeholder="Describe how the enemy pressures the student each turn."
              />
            </label>
          </div>

          <article className="dungeon-panel">
            <div className="saved-title">Related Combat Questions</div>
            <div className="saved-empty">These are the short turn-based questions the enemy can use to test the student and mitigate damage.</div>
            <div className="dungeon-stack">
              {Array.from({ length: CHALLENGE_RELATED_QUESTION_SLOTS }, (_, slotIndex) => (
                <div key={`related-question-${slotIndex}`} className="dungeon-runtime-card">
                  <label className="field">
                    <span>Question {slotIndex + 1}</span>
                    <textarea
                      rows={2}
                      value={challenge.relatedQuestions?.[slotIndex]?.prompt || ''}
                      onChange={(e) => onRelatedQuestionChange(slotIndex, 'prompt', e.target.value)}
                      placeholder="What quick question does the enemy ask?"
                    />
                  </label>
                  <label className="field">
                    <span>Expected answer</span>
                    <textarea
                      rows={2}
                      value={challenge.relatedQuestions?.[slotIndex]?.expectedAnswer || ''}
                      onChange={(e) => onRelatedQuestionChange(slotIndex, 'expectedAnswer', e.target.value)}
                      placeholder="Canonical expected answer."
                    />
                  </label>
                  <div className="dungeon-form-grid">
                    <label className="field">
                      <span>Mitigation</span>
                      <input
                        value={challenge.relatedQuestions?.[slotIndex]?.mitigation || ''}
                        onChange={(e) => onRelatedQuestionChange(slotIndex, 'mitigation', e.target.value)}
                        placeholder="Avoid full damage"
                      />
                    </label>
                    <label className="field">
                      <span>Penalty</span>
                      <input
                        value={challenge.relatedQuestions?.[slotIndex]?.penalty || ''}
                        onChange={(e) => onRelatedQuestionChange(slotIndex, 'penalty', e.target.value)}
                        placeholder="Take 2 damage"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </>
      )}

      <div className="dungeon-form-grid">
        <label className="field">
          <span>Success outcome</span>
          <textarea
            rows={3}
            value={challenge.successOutcome}
            onChange={(e) => onChange('successOutcome', e.target.value)}
            placeholder="Loot unlock, door opens, enemy staggered..."
          />
        </label>

        <label className="field">
          <span>Failure outcome</span>
          <textarea
            rows={3}
            value={challenge.failureOutcome}
            onChange={(e) => onChange('failureOutcome', e.target.value)}
            placeholder="Damage, lost key, alarm triggered..."
          />
        </label>
      </div>

      <label className="field">
        <span>Generated Challenge JSON</span>
        <textarea
          rows={18}
          value={challenge.jsonDraft}
          readOnly
          placeholder="The canonical challenge JSON preview appears here."
        />
      </label>
    </div>
  )
}

function RewardEditor({ reward, index, onChange, onRemove }) {
  return (
    <div className="dungeon-collection-card">
      <div className="dungeon-inline-header">
        <div>
          <div className="saved-title">Reward {index + 1}</div>
          <div className="saved-empty">Rewards are available for room outcomes and loot tables.</div>
        </div>
        <button type="button" className="btn danger" onClick={onRemove}>Remove</button>
      </div>

      <div className="dungeon-form-grid">
        <label className="field">
          <span>Reward name</span>
          <input value={reward.name} onChange={(e) => onChange('name', e.target.value)} />
        </label>

        <label className="field">
          <span>Reward type</span>
          <select value={reward.rewardType} onChange={(e) => onChange('rewardType', e.target.value)}>
            <option value="loot">Loot</option>
            <option value="consumable">Consumable</option>
            <option value="key-item">Key Item</option>
            <option value="artifact">Artifact</option>
          </select>
        </label>

        <label className="field">
          <span>Rarity</span>
          <select value={reward.rarity} onChange={(e) => onChange('rarity', e.target.value)}>
            <option value="common">Common</option>
            <option value="rare">Rare</option>
            <option value="epic">Epic</option>
            <option value="legendary">Legendary</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>Description</span>
        <textarea
          rows={3}
          value={reward.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="What it does in the dungeon or how it helps the run."
        />
      </label>

      <label className="field">
        <span>Reward JSON</span>
        <textarea
          rows={12}
          value={reward.jsonDraft}
          onChange={(e) => onChange('jsonDraft', e.target.value)}
          placeholder="Paste or edit the reward JSON here."
        />
      </label>
    </div>
  )
}

function buildInitialTeacherState() {
  return {
    activeDungeonId: null,
    dungeonVisibility: 'private',
    dungeonTitle: 'Vault of Broken Signs',
    dungeonTheme: 'Ancient calculus temple with reactive stone guardians',
    dungeonContext:
      'A hidden vault beneath the academy where each chamber responds to mathematical intent. The dungeon master should narrate discovery, danger and mystery while preserving player agency.',
    contextJsonDraft: stringifyDungeonJson(createContextTemplate()),
    challenges: [createChallengeDraft(1), createChallengeDraft(2)],
    rewards: [createRewardDraft(1), createRewardDraft(2)],
    playerStats: createDefaultPlayerStats(),
  }
}

function parseJsonDraft(label, value) {
  try {
    return JSON.parse(String(value || '').trim() || '{}')
  } catch {
    throw new Error(`${label} contains invalid JSON.`)
  }
}

export default function MathDungeonsHub({ session, onBackToMenu, onOpenRun, onLogout }) {
  const isTeacher = session.role === 'teacher'
  const [teacherState, setTeacherState] = useState(() => buildInitialTeacherState())
  const [savedDungeons, setSavedDungeons] = useState([])
  const [publishedDungeons, setPublishedDungeons] = useState([])
  const [characters, setCharacters] = useState([])
  const [runs, setRuns] = useState([])
  const [loadingTeacherData, setLoadingTeacherData] = useState(false)
  const [loadingPlayerData, setLoadingPlayerData] = useState(false)
  const [savingDungeon, setSavingDungeon] = useState(false)
  const [savingCharacter, setSavingCharacter] = useState(false)
  const [startingRun, setStartingRun] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [characterDraft, setCharacterDraft] = useState(() => createCharacterDraft(1))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const challengeImportRefs = useRef({})

  const loadTeacherData = useCallback(async () => {
    if (!session?.userId || !isTeacher) return

    try {
      setLoadingTeacherData(true)
      setError('')
      const rows = await listMathDungeons(session.userId)
      setSavedDungeons(Array.isArray(rows) ? rows : [])
    } catch (nextError) {
      setSavedDungeons([])
      setError(nextError?.message || 'Could not load saved math dungeons.')
    } finally {
      setLoadingTeacherData(false)
    }
  }, [session?.userId, isTeacher])

  const loadPlayerData = useCallback(async () => {
    if (!session?.userId) return

    try {
      setLoadingPlayerData(true)
      setError('')
      const [characterRows, publishedRows, runRows] = await Promise.all([
        listOwnMathDungeonCharacters(session.userId),
        listPublishedMathDungeons(),
        listOwnMathDungeonRuns(session.userId),
      ])
      setCharacters(Array.isArray(characterRows) ? characterRows : [])
      setPublishedDungeons(Array.isArray(publishedRows) ? publishedRows : [])
      setRuns(Array.isArray(runRows) ? runRows : [])
      if (!selectedCharacterId && characterRows?.[0]?.id) {
        setSelectedCharacterId(characterRows[0].id)
      }
    } catch (nextError) {
      setCharacters([])
      setPublishedDungeons([])
      setRuns([])
      setError(nextError?.message || 'Could not load Math Dungeons player data.')
    } finally {
      setLoadingPlayerData(false)
    }
  }, [session?.userId, selectedCharacterId])

  useEffect(() => {
    if (isTeacher) {
      loadTeacherData()
      return
    }
    loadPlayerData()
  }, [isTeacher, loadPlayerData, loadTeacherData])

  const teacherPayload = useMemo(() => ({
    dungeon: {
      title: teacherState.dungeonTitle.trim(),
      theme: teacherState.dungeonTheme.trim(),
      context: teacherState.dungeonContext.trim(),
      visibility: teacherState.dungeonVisibility,
    },
    challenges: teacherState.challenges.map((challenge, index) => ({
      id: challenge.id || `challenge-${index + 1}`,
      title: challenge.title,
      roomType: challenge.roomType,
      mathTopic: challenge.mathTopic,
      exercisePrompt: challenge.exercisePrompt,
      successOutcome: challenge.successOutcome,
      failureOutcome: challenge.failureOutcome,
    })),
    rewards: teacherState.rewards.map((reward, index) => ({
      id: reward.id || `reward-${index + 1}`,
      name: reward.name,
      rewardType: reward.rewardType,
      rarity: reward.rarity,
      description: reward.description,
    })),
  }), [teacherState])

  const dungeonBlueprint = useMemo(() => {
    const sanitizedChallenges = teacherPayload.challenges.filter(
      (challenge) => challenge.title.trim() || challenge.exercisePrompt.trim()
    )
    const sanitizedRewards = teacherPayload.rewards.filter(
      (reward) => reward.name.trim() || reward.description.trim()
    )

    return {
      phase: 'phase-3',
      teacherPayload,
      playerDefaults: {
        stats: teacherState.playerStats,
        hintsPerChallenge: 3,
        startingInventory: [],
      },
      generatedDungeonPlan: {
        entranceRoom: 'entrance-01',
        exitCondition: sanitizedChallenges.length ? 'clear-last-room' : 'pending-challenges',
        roomCount: Math.max(2, sanitizedChallenges.length + 2),
        rooms: sanitizedChallenges.map((challenge, index) => ({
          id: `room-${index + 1}`,
          roomType: challenge.roomType,
          challengeId: challenge.id,
          rewardPool: sanitizedRewards.map((reward) => reward.id),
        })),
      },
    }
  }, [teacherPayload, teacherState.playerStats])

  const selectedClass = useMemo(
    () => CHARACTER_CLASS_OPTIONS.find((item) => item.id === characterDraft.classId) || CHARACTER_CLASS_OPTIONS[0],
    [characterDraft.classId]
  )

  const resetTeacherEditor = () => {
    setTeacherState(buildInitialTeacherState())
    setError('')
    setNotice('Ready to author a new dungeon.')
  }

  const syncChallengeWithJson = useCallback((challenge) => ({
    ...challenge,
    jsonDraft: stringifyDungeonJson(buildChallengeJsonFromDraft(challenge)),
  }), [])

  const updateTeacherField = (key, value) => {
    setTeacherState((prev) => ({ ...prev, [key]: value }))
  }

  const updateChallenge = (index, key, value) => {
    setTeacherState((prev) => ({
      ...prev,
      challenges: prev.challenges.map((item, itemIndex) => (
        itemIndex === index ? syncChallengeWithJson({ ...item, [key]: value }) : item
      )),
    }))
  }

  const updateChallengeMathFact = (index, factIndex, value) => {
    setTeacherState((prev) => ({
      ...prev,
      challenges: prev.challenges.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const mathFacts = buildChallengeMathFacts(item.mathFacts)
        mathFacts[factIndex] = value
        return syncChallengeWithJson({ ...item, mathFacts })
      }),
    }))
  }

  const updateChallengeHintStep = (index, hintIndex, value) => {
    setTeacherState((prev) => ({
      ...prev,
      challenges: prev.challenges.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const hintSteps = buildChallengeHintSteps(item.hintSteps)
        hintSteps[hintIndex] = value
        return syncChallengeWithJson({ ...item, hintSteps })
      }),
    }))
  }

  const updateChallengeRelatedQuestion = (index, questionIndex, field, value) => {
    setTeacherState((prev) => ({
      ...prev,
      challenges: prev.challenges.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const relatedQuestions = buildChallengeRelatedQuestions(item.relatedQuestions)
        relatedQuestions[questionIndex] = {
          ...relatedQuestions[questionIndex],
          [field]: value,
        }
        return syncChallengeWithJson({ ...item, relatedQuestions })
      }),
    }))
  }

  const updateReward = (index, key, value) => {
    setTeacherState((prev) => ({
      ...prev,
      rewards: prev.rewards.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [key]: value } : item
      )),
    }))
  }

  const addChallenge = () => {
    setTeacherState((prev) => ({
      ...prev,
      challenges: [...prev.challenges, syncChallengeWithJson(createChallengeDraft(prev.challenges.length + 1))],
    }))
  }

  const addReward = () => {
    setTeacherState((prev) => ({
      ...prev,
      rewards: [...prev.rewards, createRewardDraft(prev.rewards.length + 1)],
    }))
  }

  const removeChallenge = (index) => {
    setTeacherState((prev) => ({
      ...prev,
      challenges: prev.challenges.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const exportChallenge = (index) => {
    const challenge = teacherState.challenges[index]
    if (!challenge) return

    try {
      setError('')
      setNotice('')
      downloadJsonFile(
        `inticore-math-dungeon-challenge-${index + 1}.json`,
        buildMathDungeonChallengeExportJson([buildChallengeJsonFromDraft(challenge)])
      )
      setNotice(`Challenge ${index + 1} exported to JSON.`)
    } catch (nextError) {
      setError(nextError?.message || 'Could not export the challenge JSON.')
    }
  }

  const downloadChallengeTemplate = () => {
    downloadJsonFile('inticore-math-dungeon-challenges-template.json', buildMathDungeonChallengesTemplateJson())
    setError('')
    setNotice('Math Dungeons challenge JSON template downloaded.')
  }

  const importChallengeJson = async (index, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setSavingDungeon(true)
      setError('')
      setNotice('')
      const json = await parseJsonFile(file)
      const importedRecords = extractMathDungeonChallengesFromJson(json)
      if (!importedRecords.length) {
        throw new Error('No importable challenges were found in the JSON file.')
      }

      const normalized = normalizeMathDungeonChallengeImportItem(importedRecords[0])
      setTeacherState((prev) => ({
        ...prev,
        challenges: prev.challenges.map((item, itemIndex) => (
          itemIndex === index
            ? syncChallengeWithJson({
                ...item,
                ...hydrateChallengeDraftFromSource({
                  ...normalized,
                  id: item.id || normalized.id || null,
                  localId: item.localId,
                }, index + 1),
                id: item.id || normalized.id || null,
                localId: item.localId,
              })
            : item
        )),
      }))
      setNotice(`Challenge ${index + 1} imported from JSON.`)
    } catch (nextError) {
      setError(nextError?.message || 'Could not import the challenge JSON.')
    } finally {
      setSavingDungeon(false)
    }
  }

  const removeReward = (index) => {
    setTeacherState((prev) => ({
      ...prev,
      rewards: prev.rewards.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const updateDungeonStat = (statId, value) => {
    const parsed = Number(value)
    setTeacherState((prev) => ({
      ...prev,
      playerStats: {
        ...prev.playerStats,
        [statId]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
      },
    }))
  }

  const handleSaveDungeon = async () => {
    if (!session?.userId) return

    try {
      setSavingDungeon(true)
      setError('')
      setNotice('')

      const contextJson = parseJsonDraft('Dungeon context JSON', teacherState.contextJsonDraft)
      const normalizedChallenges = teacherState.challenges.map((challenge) => {
        const challengeJson = buildChallengeJsonFromDraft(challenge)
        return {
          id: challenge.id,
          title: String(challenge.title || '').trim(),
          room_type: String(challenge.roomType || 'riddle').trim(),
          math_topic: String(challenge.mathTopic || '').trim(),
          exercise_prompt: String(challenge.exercisePrompt || '').trim(),
          success_outcome: String(challenge.successOutcome || '').trim(),
          failure_outcome: String(challenge.failureOutcome || '').trim(),
          challenge_json: challengeJson,
        }
      })

      const normalizedRewards = teacherState.rewards.map((reward) => ({
        id: reward.id,
        name: String(reward.name || '').trim(),
        reward_type: String(reward.rewardType || 'loot').trim(),
        rarity: String(reward.rarity || 'common').trim(),
        description: String(reward.description || '').trim(),
        reward_json: parseJsonDraft(
          `Reward JSON for "${reward.name || reward.localId || 'reward'}"`,
          reward.jsonDraft
        ),
      }))

      const detail = await saveMathDungeonGraph({
        dungeonId: teacherState.activeDungeonId,
        ownerUserId: session.userId,
        dungeon: {
          visibility: teacherState.dungeonVisibility,
          title: teacherState.dungeonTitle,
          theme: teacherState.dungeonTheme,
          context_text: teacherState.dungeonContext,
          context_json: contextJson,
          player_defaults: {
            stats: teacherState.playerStats,
            hintsPerChallenge: 3,
            startingInventory: [],
          },
        },
        challenges: normalizedChallenges,
        rewards: normalizedRewards,
      })

      if (!detail?.dungeon) throw new Error('Could not save the math dungeon.')

      await loadTeacherData()
      await handleLoadDungeon(detail.dungeon.id, 'Dungeon saved successfully.')
    } catch (nextError) {
      setError(nextError?.message || 'Could not save the math dungeon.')
    } finally {
      setSavingDungeon(false)
    }
  }

  const handleLoadDungeon = async (dungeonId, successNotice = '') => {
    if (!session?.userId || !dungeonId) return

    try {
      setError('')
      setNotice('')
      const detail = await getMathDungeonDetail(dungeonId, session.userId)
      if (!detail?.dungeon) throw new Error('Could not load that dungeon.')

      setTeacherState({
        activeDungeonId: detail.dungeon.id,
        dungeonVisibility: detail.dungeon.visibility || 'private',
        dungeonTitle: detail.dungeon.title || '',
        dungeonTheme: detail.dungeon.theme || '',
        dungeonContext: detail.dungeon.context_text || '',
        contextJsonDraft: stringifyDungeonJson(detail.dungeon.context_json || createContextTemplate()),
        challenges: (detail.challenges || []).map((challenge, index) => (
          hydrateChallengeDraftFromSource({
            ...challenge,
            localId: challenge.id || `challenge-loaded-${index + 1}`,
          }, index + 1)
        )),
        rewards: (detail.rewards || []).map((reward, index) => ({
          id: reward.id,
          localId: reward.id || `reward-loaded-${index + 1}`,
          name: reward.name || '',
          rewardType: reward.reward_type || 'loot',
          rarity: reward.rarity || 'common',
          description: reward.description || '',
          jsonDraft: stringifyDungeonJson(reward.reward_json || {}),
        })),
        playerStats: detail.dungeon.player_defaults?.stats || createDefaultPlayerStats(),
      })
      setNotice(successNotice || 'Dungeon loaded for editing.')
    } catch (nextError) {
      setError(nextError?.message || 'Could not load the math dungeon.')
    }
  }

  const handleDeleteDungeon = async (dungeonId) => {
    if (!session?.userId || !dungeonId) return
    if (!window.confirm('Delete this dungeon and all its challenges and rewards?')) return

    try {
      setError('')
      setNotice('')
      await deleteMathDungeon(dungeonId, session.userId)
      await loadTeacherData()
      if (teacherState.activeDungeonId === dungeonId) {
        resetTeacherEditor()
      } else {
        setNotice('Dungeon deleted successfully.')
      }
    } catch (nextError) {
      setError(nextError?.message || 'Could not delete the math dungeon.')
    }
  }

  const handleCharacterClassChange = (classId) => {
    setCharacterDraft((prev) => ({
      ...prev,
      classId,
      stats: applyCharacterClassBonus(createCharacterBaseStats(), classId),
    }))
  }

  const handleCreateCharacter = async () => {
    if (!session?.userId) return

    try {
      setSavingCharacter(true)
      setError('')
      setNotice('')

      const saved = await createMathDungeonCharacter({
        owner_user_id: session.userId,
        name: String(characterDraft.name || '').trim(),
        class_id: characterDraft.classId,
        level: 1,
        experience: 0,
        base_stats: characterDraft.stats,
        current_stats: characterDraft.stats,
        inventory: [],
      })

      await loadPlayerData()
      setSelectedCharacterId(saved?.id || '')
      setCharacterDraft(createCharacterDraft((characters?.length || 0) + 2))
      setNotice('Character created successfully.')
    } catch (nextError) {
      setError(nextError?.message || 'Could not create the character.')
    } finally {
      setSavingCharacter(false)
    }
  }

  const handleDeleteCharacter = async (characterId) => {
    if (!session?.userId || !characterId) return
    if (!window.confirm('Delete this character and any runs attached to it?')) return

    try {
      setError('')
      setNotice('')
      await deleteMathDungeonCharacter(characterId, session.userId)
      await loadPlayerData()
      if (selectedCharacterId === characterId) {
        setSelectedCharacterId('')
      }
      setNotice('Character deleted successfully.')
    } catch (nextError) {
      setError(nextError?.message || 'Could not delete the character.')
    }
  }

  const handleDeleteRun = async (runId) => {
    if (!session?.userId || !runId) return
    if (!window.confirm('Delete this saved run?')) return

    try {
      setError('')
      setNotice('')
      await deleteMathDungeonRun(runId, session.userId)
      await loadPlayerData()
      setNotice('Run deleted successfully.')
    } catch (nextError) {
      setError(nextError?.message || 'Could not delete the run.')
    }
  }

  const handleStartRun = async (dungeonId) => {
    if (!session?.userId || !dungeonId) return
    if (!selectedCharacterId) {
      setError('Create or select a character before starting a dungeon run.')
      return
    }

    try {
      setStartingRun(true)
      setError('')
      setNotice('')

      const selectedCharacter = characters.find((item) => item.id === selectedCharacterId)
      if (!selectedCharacter) throw new Error('Selected character could not be found.')

      const detail = await getMathDungeonPlayableDetail(dungeonId)
      if (!detail?.dungeon) throw new Error('Could not load the selected published dungeon.')

      const startingRoomId = String(
        detail.dungeon.context_json?.startingRoomId ||
        detail.dungeon.context_json?.starting_room_id ||
        detail.challenges?.[0]?.challenge_json?.roomId ||
        'entrance-01'
      )

      const snapshotStats = selectedCharacter.current_stats || selectedCharacter.base_stats || {}
      const currentHealth = Number(snapshotStats.maxHealth || snapshotStats.health || 18)
      const currentFocus = Number(snapshotStats.focus || 3)

      const createdRun = await createMathDungeonRun({
        player_user_id: session.userId,
        character_id: selectedCharacter.id,
        dungeon_id: dungeonId,
        status: 'active',
        current_room_id: startingRoomId,
        character_snapshot: {
          id: selectedCharacter.id,
          name: selectedCharacter.name,
          classId: selectedCharacter.class_id,
          level: selectedCharacter.level,
          stats: snapshotStats,
          inventory: selectedCharacter.inventory || [],
        },
        state_json: {
          currentHealth,
          currentFocus,
          currentRoomId: startingRoomId,
          resolvedChallenges: [],
          collectedRewards: [],
          roomVisitLog: [startingRoomId],
          hintsRemainingByChallenge: {},
          activeChallengeId: null,
          history: [
            {
              id: `run-start-${Date.now()}`,
              timestamp: new Date().toISOString(),
              actor: 'system',
              type: 'run-start',
              title: 'Run started',
              body: `${selectedCharacter.name || 'Adventurer'} entered ${detail.dungeon.title || 'the dungeon'} in ${startingRoomId}.`,
              roomId: startingRoomId,
            },
          ],
        },
      })

      await loadPlayerData()
      setNotice('Dungeon run created. Opening the active runtime...')
      if (typeof onOpenRun === 'function' && createdRun?.id) {
        onOpenRun(createdRun.id)
      }
    } catch (nextError) {
      setError(nextError?.message || 'Could not start the dungeon run.')
    } finally {
      setStartingRun(false)
    }
  }

  if (isTeacher) {
    return (
      <div className="menu-shell dungeon-shell">
        <div className="menu-card dungeon-card">
          <div className="menu-top">
            <div>
              <p className="welcome-overline">PHASE 3 RUNTIME PREP</p>
              <h1 className="menu-title">Math Dungeons</h1>
              <p className="menu-subtitle">
                Teacher-only dungeon authoring with visibility control. Published dungeons can now be
                discovered by players and used to seed persistent runs.
              </p>
            </div>
            <span className="session-user">User: {session.username} ({session.role})</span>
          </div>

          <section className="dungeon-hero-panel">
            <div className="dungeon-panel">
              <div className="saved-title">Phase 3 Scope</div>
              <h2 className="dungeon-section-title">Published adventures now feed player characters and runs</h2>
              <p className="dungeon-copy">
                Teachers still author the dungeon world, but now each dungeon can be marked private or
                published so player accounts can discover it and start a persistent run with a saved
                character.
              </p>
              <div className="dungeon-tag-row">
                <span className="saved-item-tags">Visibility</span>
                <span className="saved-item-tags">Published Dungeons</span>
                <span className="saved-item-tags">Characters</span>
                <span className="saved-item-tags">Runs</span>
              </div>
            </div>

            <div className="dungeon-loop-card">
              <div className="saved-title">Engine Rules</div>
              <ol className="dungeon-loop-list">
                {DUNGEON_ENGINE_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ol>
            </div>
          </section>

          <section className="dungeon-foundation">
            <div className="saved-title">Saved Dungeons</div>
            {loadingTeacherData ? (
              <div className="saved-empty">Loading saved dungeons...</div>
            ) : savedDungeons.length === 0 ? (
              <div className="saved-empty">There are no saved dungeons yet for this teacher account.</div>
            ) : (
              <div className="saved-list">
                {savedDungeons.map((dungeon) => (
                  <div key={dungeon.id} className="saved-item wb-record-card">
                    <button type="button" className="wb-record-open" onClick={() => handleLoadDungeon(dungeon.id)}>
                      <div className="saved-item-title">{dungeon.title || 'Untitled dungeon'}</div>
                      <div className="saved-item-meta">{dungeon.theme || 'No theme'}</div>
                      <div className="saved-item-tags">
                        {dungeon.visibility === 'published' ? 'Published' : 'Private'} | Updated:{' '}
                        {dungeon.updated_at ? new Date(dungeon.updated_at).toLocaleString() : 'Unknown'}
                      </div>
                    </button>
                    <div className="menu-actions wb-inline-actions">
                      <button type="button" className="btn" onClick={() => handleLoadDungeon(dungeon.id)}>Open</button>
                      <button type="button" className="btn danger" onClick={() => handleDeleteDungeon(dungeon.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="dungeon-grid">
            <TeacherInputPanel
              title="Dungeon Context"
              body="This is the narrative bible the dungeon master will use to describe rooms, atmosphere, stakes, placements and explorable possibilities."
            >
              <div className="dungeon-form-grid">
                <label className="field">
                  <span>Dungeon title</span>
                  <input value={teacherState.dungeonTitle} onChange={(e) => updateTeacherField('dungeonTitle', e.target.value)} />
                </label>
                <label className="field">
                  <span>Visibility</span>
                  <select value={teacherState.dungeonVisibility} onChange={(e) => updateTeacherField('dungeonVisibility', e.target.value)}>
                    {DUNGEON_VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Theme or fantasy frame</span>
                <input value={teacherState.dungeonTheme} onChange={(e) => updateTeacherField('dungeonTheme', e.target.value)} />
              </label>
              <label className="field">
                <span>Detailed dungeon context</span>
                <textarea
                  rows={7}
                  value={teacherState.dungeonContext}
                  onChange={(e) => updateTeacherField('dungeonContext', e.target.value)}
                  placeholder="Describe the dungeon in enough detail for the AI to narrate with consistency."
                />
              </label>
              <label className="field">
                <span>Dungeon context JSON</span>
                <textarea
                  rows={18}
                  value={teacherState.contextJsonDraft}
                  onChange={(e) => updateTeacherField('contextJsonDraft', e.target.value)}
                  placeholder="Paste or edit the dungeon context JSON here."
                />
              </label>
            </TeacherInputPanel>

            <article className="dungeon-panel">
              <div className="saved-title">RPG Baseline</div>
              <h3 className="dungeon-panel-title">Default Character Stats</h3>
              <p className="dungeon-copy">
                These values are stored with the dungeon as player defaults so runtime sessions can start
                from a stable RPG baseline.
              </p>
              <div className="dungeon-stat-grid">
                {PLAYER_STAT_DEFINITIONS.map((stat) => (
                  <label key={stat.id} className="field">
                    <span>{stat.label}</span>
                    <input
                      type="number"
                      min="0"
                      value={teacherState.playerStats[stat.id]}
                      onChange={(e) => updateDungeonStat(stat.id, e.target.value)}
                    />
                    <small className="dungeon-field-note">{stat.description}</small>
                  </label>
                ))}
              </div>
              <div className="dungeon-tag-row">
                <span className="saved-item-tags">Starting hints per challenge: 3</span>
                <span className="saved-item-tags">Starting inventory: empty</span>
                <span className="saved-item-tags">Run ends at 0 HP</span>
              </div>
            </article>
          </section>

          <section className="dungeon-foundation">
            <div className="saved-title">Teacher JSON Templates</div>
            <div className="saved-empty">
              These templates define how the teacher should structure context, challenges and loot so the
              future AI runtime can read stable facts instead of improvising world state.
            </div>
            <div className="dungeon-foundation-grid">
              <JsonGuidePanel guide={DUNGEON_JSON_GUIDES.context} />
              <JsonGuidePanel guide={DUNGEON_JSON_GUIDES.challenge} />
              <JsonGuidePanel guide={DUNGEON_JSON_GUIDES.reward} />
            </div>
          </section>

          <section className="dungeon-foundation">
            <div className="saved-title">Teacher Challenge Set</div>
            <div className="saved-empty">
              Each entry can generate one room encounter with either riddle logic or enemy combat logic.
              Define the exercise, the official answer, the explicit mathematical facts, the hint steps,
              and the related combat questions here. The room placement itself should be declared in the dungeon context JSON.
            </div>
            <div className="saved-empty">
              Import and export use a canonical JSON format similar to the Math Whiteboard workflow, but focused on runtime challenge execution instead of whiteboard seeding.
            </div>
            <div className="dungeon-stack">
              {teacherState.challenges.map((challenge, index) => (
                <div key={challenge.localId}>
                  <ChallengeEditor
                    challenge={challenge}
                    index={index}
                    onChange={(key, value) => updateChallenge(index, key, value)}
                    onMathFactChange={(factIndex, value) => updateChallengeMathFact(index, factIndex, value)}
                    onHintStepChange={(hintIndex, value) => updateChallengeHintStep(index, hintIndex, value)}
                    onRelatedQuestionChange={(questionIndex, field, value) => updateChallengeRelatedQuestion(index, questionIndex, field, value)}
                    onExport={() => exportChallenge(index)}
                    onImport={() => challengeImportRefs.current[challenge.localId]?.click()}
                    onRemove={() => removeChallenge(index)}
                  />
                  <input
                    ref={(node) => {
                      if (node) {
                        challengeImportRefs.current[challenge.localId] = node
                      } else {
                        delete challengeImportRefs.current[challenge.localId]
                      }
                    }}
                    type="file"
                    accept=".json,.txt,application/json,text/plain"
                    style={{ display: 'none' }}
                    onChange={(event) => importChallengeJson(index, event)}
                  />
                </div>
              ))}
            </div>
            <div className="menu-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn menu-btn" onClick={addChallenge}>Add Challenge</button>
              <button type="button" className="btn menu-btn" onClick={downloadChallengeTemplate}>Download Challenge JSON Template</button>
            </div>
          </section>

          <section className="dungeon-foundation">
            <div className="saved-title">Teacher Reward Pool</div>
            <div className="saved-empty">
              Rewards can be attached to room clears, secret interactions and post-combat drops. Exact
              placement and claim conditions should be described in the dungeon context JSON.
            </div>
            <div className="dungeon-stack">
              {teacherState.rewards.map((reward, index) => (
                <RewardEditor
                  key={reward.localId}
                  reward={reward}
                  index={index}
                  onChange={(key, value) => updateReward(index, key, value)}
                  onRemove={() => removeReward(index)}
                />
              ))}
            </div>
            <div className="menu-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn menu-btn" onClick={addReward}>Add Reward</button>
            </div>
          </section>

          <section className="dungeon-foundation">
            <div className="saved-title">Generated Blueprint Preview</div>
            <div className="dungeon-foundation-grid">
              <article className="dungeon-panel">
                <h3 className="dungeon-panel-title">What is being saved</h3>
                <div className="dungeon-copy">
                  The parent dungeon record stores text context, visibility, context JSON and default player
                  stats. The child collections store ordered challenge and reward entries with their own JSON payloads.
                </div>
                <div className="dungeon-tag-row">
                  <span className="saved-item-tags">Visibility: {teacherState.dungeonVisibility}</span>
                  <span className="saved-item-tags">Challenges: {teacherPayload.challenges.length}</span>
                  <span className="saved-item-tags">Rewards: {teacherPayload.rewards.length}</span>
                </div>
              </article>

              <article className="dungeon-panel">
                <h3 className="dungeon-panel-title">Engine Output Shape</h3>
                <pre className="dungeon-json-preview">{JSON.stringify(dungeonBlueprint, null, 2)}</pre>
              </article>
            </div>
          </section>

          {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
          {!error && notice && <div className="saved-empty" style={{ marginTop: 12 }}>{notice}</div>}

          <div className="menu-actions competitive-menu-footer">
            <button type="button" className="btn menu-btn" onClick={resetTeacherEditor}>New Dungeon</button>
            <button type="button" className="btn menu-btn" onClick={handleSaveDungeon} disabled={savingDungeon}>
              {savingDungeon ? 'Saving...' : teacherState.activeDungeonId ? 'Update Dungeon' : 'Save Dungeon'}
            </button>
            <button type="button" className="btn menu-btn" onClick={onBackToMenu}>Back to Modes</button>
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
            <p className="welcome-overline">PHASE 3 PLAYER RUNTIME</p>
            <h1 className="menu-title">Math Dungeons</h1>
            <p className="menu-subtitle">
              Build characters, browse published dungeons and start persistent runs tied to your account.
            </p>
          </div>
          <span className="session-user">User: {session.username} ({session.role})</span>
        </div>

        <section className="dungeon-hero-panel">
          <article className="dungeon-panel">
            <div className="saved-title">Player Progress</div>
            <h2 className="dungeon-section-title">Characters and runs now persist per account</h2>
            <p className="dungeon-copy">
              Each player can own multiple characters, keep their stats and inventory snapshot, and open
              multiple runs that remember current room, health and collected rewards.
            </p>
            <div className="dungeon-tag-row">
              <span className="saved-item-tags">Characters: {characters.length}</span>
              <span className="saved-item-tags">Published Dungeons: {publishedDungeons.length}</span>
              <span className="saved-item-tags">Runs: {runs.length}</span>
            </div>
          </article>

          <article className="dungeon-loop-card">
            <div className="saved-title">Next Runtime Hook</div>
            <ol className="dungeon-loop-list">
              <li>Select a character.</li>
              <li>Start a run from a published dungeon.</li>
              <li>Persist the active room, stats and progression.</li>
              <li>Open the live dungeon master runtime in the next phase.</li>
            </ol>
          </article>
        </section>

        <section className="dungeon-foundation">
          <div className="saved-title">Create Character</div>
          <div className="dungeon-foundation-grid">
            <article className="dungeon-panel">
              <label className="field">
                <span>Character name</span>
                <input
                  value={characterDraft.name}
                  onChange={(e) => setCharacterDraft((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>Class</span>
                <select value={characterDraft.classId} onChange={(e) => handleCharacterClassChange(e.target.value)}>
                  {CHARACTER_CLASS_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="saved-empty">{selectedClass.description}</div>
              <div className="menu-actions" style={{ marginTop: 12 }}>
                <button type="button" className="btn menu-btn" onClick={handleCreateCharacter} disabled={savingCharacter}>
                  {savingCharacter ? 'Creating...' : 'Create Character'}
                </button>
              </div>
            </article>

            <article className="dungeon-panel">
              <div className="saved-title">Starting Stats</div>
              <div className="dungeon-stat-grid">
                {PLAYER_STAT_DEFINITIONS.map((stat) => (
                  <label key={stat.id} className="field">
                    <span>{stat.label}</span>
                    <input type="number" readOnly value={characterDraft.stats?.[stat.id] || 0} />
                  </label>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="dungeon-foundation">
          <div className="saved-title">My Characters</div>
          {loadingPlayerData ? (
            <div className="saved-empty">Loading player data...</div>
          ) : characters.length === 0 ? (
            <div className="saved-empty">Create your first character to begin exploring dungeons.</div>
          ) : (
            <div className="saved-list">
              {characters.map((character) => (
                <div key={character.id} className="saved-item wb-record-card">
                  <button type="button" className="wb-record-open" onClick={() => setSelectedCharacterId(character.id)}>
                    <div className="saved-item-title">{character.name || 'Unnamed character'}</div>
                    <div className="saved-item-meta">{character.class_id} | Level {character.level}</div>
                    <div className="saved-item-tags">
                      HP {character.current_stats?.maxHealth || 0} | Focus {character.current_stats?.focus || 0}
                      {selectedCharacterId === character.id ? ' | Selected' : ''}
                    </div>
                  </button>
                  <div className="menu-actions wb-inline-actions">
                    <button type="button" className="btn" onClick={() => setSelectedCharacterId(character.id)}>Select</button>
                    <button type="button" className="btn danger" onClick={() => handleDeleteCharacter(character.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dungeon-foundation">
          <div className="saved-title">Published Dungeons</div>
          {loadingPlayerData ? (
            <div className="saved-empty">Loading published dungeons...</div>
          ) : publishedDungeons.length === 0 ? (
            <div className="saved-empty">There are no published dungeons available yet.</div>
          ) : (
            <div className="saved-list">
              {publishedDungeons.map((dungeon) => (
                <div key={dungeon.id} className="saved-item wb-record-card">
                  <button type="button" className="wb-record-open">
                    <div className="saved-item-title">{dungeon.title || 'Untitled dungeon'}</div>
                    <div className="saved-item-meta">{dungeon.theme || 'No theme'}</div>
                    <div className="saved-item-tags">
                      Published | Updated {dungeon.updated_at ? new Date(dungeon.updated_at).toLocaleString() : 'Unknown'}
                    </div>
                  </button>
                  <div className="menu-actions wb-inline-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleStartRun(dungeon.id)}
                      disabled={startingRun || !selectedCharacterId}
                    >
                      {startingRun ? 'Starting...' : 'Start Run'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dungeon-foundation">
          <div className="saved-title">My Runs</div>
          {loadingPlayerData ? (
            <div className="saved-empty">Loading runs...</div>
          ) : runs.length === 0 ? (
            <div className="saved-empty">No runs started yet. Choose a published dungeon and begin one.</div>
          ) : (
            <div className="saved-list">
              {runs.map((run) => (
                <div key={run.id} className="saved-item wb-record-card">
                  <button type="button" className="wb-record-open">
                    <div className="saved-item-title">{run.character_snapshot?.name || 'Character'} in Dungeon Run</div>
                    <div className="saved-item-meta">Status: {run.status} | Room: {run.current_room_id || 'Unknown'}</div>
                    <div className="saved-item-tags">
                      HP {run.state_json?.currentHealth || 0} | Focus {run.state_json?.currentFocus || 0}
                    </div>
                  </button>
                  <div className="menu-actions wb-inline-actions">
                    <button type="button" className="btn" onClick={() => onOpenRun?.(run.id)}>Open Run</button>
                    <button type="button" className="btn danger" onClick={() => handleDeleteRun(run.id)}>Delete Run</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && <div className="auth-error" style={{ marginTop: 12 }}>{error}</div>}
        {!error && notice && <div className="saved-empty" style={{ marginTop: 12 }}>{notice}</div>}

        <div className="menu-actions competitive-menu-footer">
          <button type="button" className="btn menu-btn" onClick={onBackToMenu}>Back to Modes</button>
          <button type="button" className="btn menu-btn" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </div>
  )
}
