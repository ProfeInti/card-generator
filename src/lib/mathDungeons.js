export const PLAYER_STAT_DEFINITIONS = [
  {
    id: 'maxHealth',
    label: 'Max Health',
    defaultValue: 18,
    description: 'How much damage the student can receive before the run ends.',
  },
  {
    id: 'focus',
    label: 'Focus',
    defaultValue: 3,
    description: 'Mental stamina used later for special actions, recovery and advanced abilities.',
  },
  {
    id: 'attack',
    label: 'Attack',
    defaultValue: 2,
    description: 'Base offensive strength for combat encounters and future class abilities.',
  },
  {
    id: 'defense',
    label: 'Defense',
    defaultValue: 1,
    description: 'Flat mitigation against enemy damage and failed combat checks.',
  },
  {
    id: 'insight',
    label: 'Insight',
    defaultValue: 2,
    description: 'Represents reading the structure of a challenge and supports puzzle interactions.',
  },
  {
    id: 'agility',
    label: 'Agility',
    defaultValue: 1,
    description: 'Used for initiative, evasion and movement-style checks inside the dungeon.',
  },
]

export const DUNGEON_VISIBILITY_OPTIONS = [
  { id: 'private', label: 'Private' },
  { id: 'published', label: 'Published' },
]

export const CHARACTER_CLASS_OPTIONS = [
  {
    id: 'scribe',
    label: 'Arcane Scribe',
    statBonus: { insight: 1, focus: 1 },
    description: 'Balanced explorer with stronger clue reading and mental endurance.',
  },
  {
    id: 'guardian',
    label: 'Stone Guardian',
    statBonus: { maxHealth: 4, defense: 1 },
    description: 'Frontline learner with more survivability during failed checks.',
  },
  {
    id: 'duelist',
    label: 'Formula Duelist',
    statBonus: { attack: 1, agility: 1 },
    description: 'Faster combatant suited for enemy encounters and reactive questions.',
  },
]

export const DUNGEON_ENGINE_RULES = [
  'The teacher provides detailed dungeon context, challenge set and reward pool.',
  'The engine owns HP, hints, loot, progression, turn order and room state.',
  'The AI narrates, interprets actions and evaluates only the exact challenge interaction requested.',
  'Each challenge starts with 3 hints. Spending the third hint fails the challenge automatically.',
  'Enemy rooms can trigger skill-check questions tied to the assigned exercise to avoid incoming damage.',
]

export const CHALLENGE_FACT_SLOTS = 8
export const CHALLENGE_HINT_SLOTS = 3
export const CHALLENGE_RELATED_QUESTION_SLOTS = 3

function generateDraftId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function stringifyDungeonJson(value) {
  return JSON.stringify(value, null, 2)
}

export function buildChallengeMathFacts(items) {
  return Array.from({ length: CHALLENGE_FACT_SLOTS }, (_, index) => String(items?.[index] || ''))
}

export function buildChallengeHintSteps(items) {
  return Array.from({ length: CHALLENGE_HINT_SLOTS }, (_, index) => String(items?.[index] || ''))
}

export function buildChallengeRelatedQuestions(items) {
  return Array.from({ length: CHALLENGE_RELATED_QUESTION_SLOTS }, (_, index) => {
    const item = items?.[index]
    return {
      prompt: String(item?.prompt || ''),
      expectedAnswer: String(item?.expectedAnswer || ''),
      mitigation: String(item?.mitigation || ''),
      penalty: String(item?.penalty || ''),
    }
  })
}

export const DUNGEON_JSON_GUIDES = {
  context: {
    title: 'Dungeon Context JSON',
    instructions: [
      'Describe the dungeon setting, room layout and exploration logic.',
      'Include where each challenge appears and whether it is a riddle or an enemy encounter.',
      'Include loot placement and the conditions required to reveal or claim each reward.',
      'Write stable facts only. The AI should narrate from this source, not invent map truth.',
    ],
    template: {
      dungeonId: 'vault-of-broken-signs',
      title: 'Vault of Broken Signs',
      setting: 'Ancient underground calculus temple beneath the academy.',
      tone: 'Mysterious, tense and scholarly.',
      startingRoomId: 'entrance',
      rooms: [
        {
          id: 'entrance',
          name: 'Atrium of Echoing Symbols',
          description: 'A cold chamber with glowing inscriptions and three stone passages.',
          exits: ['hall-of-threads', 'guardian-gate'],
          challengeId: null,
          loot: [
            {
              rewardId: 'rusted-key',
              visibility: 'hidden',
              condition: 'inspect-statue-base',
            },
          ],
        },
        {
          id: 'guardian-gate',
          name: 'Gate of the Derivative Sentinel',
          description: 'A sealed chamber guarded by a stone enemy bound to a derivative challenge.',
          exits: ['boss-antechamber'],
          challengeId: 'challenge-derivative-1',
          challengeMode: 'enemy',
          loot: [],
        },
      ],
    },
  },
  challenge: {
    title: 'Challenge JSON',
    instructions: [
      'One JSON object per challenge.',
      'Mark clearly whether the challenge is a riddle or an enemy encounter.',
      'The exercise must be complete enough for the challenge runner to execute it without improvising.',
      'Include explicit math facts, the official answer, concise hint steps, and related combat questions when the challenge is an enemy.',
      'Hints must be progressive and should not reveal the whole solution at once.',
    ],
    template: {
      id: 'challenge-derivative-1',
      title: 'Derivative Sentinel',
      type: 'enemy',
      mathTopic: 'Derivatives',
      exercisePrompt: 'Find the derivative of f(x) = x^3 sin(x).',
      interactionPrompt: 'Conectas con la esencia matematica del centinela y sientes el desafio. Que deberias hacer?',
      officialAnswer: 'f\'(x)=3x^2 sin(x)+x^3 cos(x)',
      mathFacts: [
        'La funcion dada es f(x)=x^3 sin(x).',
        'Se pide derivar la funcion.',
        'La expresion es un producto.',
      ],
      enemyProfile: {
        name: 'Sentinel of Falling Tangents',
        attackFlavor: 'Launches a stone blade unless the student passes a skill-check question.',
      },
      hintSteps: [
        'Identify the outer product first.',
        'State which derivative rule applies.',
        'Differentiate each factor separately before combining them.',
      ],
      relatedQuestions: [
        {
          prompt: 'What is the derivative of sin(x)?',
          expectedAnswer: 'cos(x)',
          mitigation: 'Avoid the full damage of the attack.',
          penalty: 'Receive the full damage of the attack.',
        },
      ],
      successOutcome: 'The sentinel cracks, opening the northern gate.',
      failureOutcome: 'The sentinel lands a hit and the player loses health.',
    },
  },
  reward: {
    title: 'Reward JSON',
    instructions: [
      'One JSON object per reward or loot item.',
      'Describe what the reward does for Phase 1 even if the effect is simple.',
      'Use conditions in the dungeon context to decide where and when the item appears.',
      'Prefer concrete utility: healing, keys, shields or one-time combat support.',
    ],
    template: {
      id: 'rusted-key',
      name: 'Rusted Observatory Key',
      rewardType: 'key-item',
      rarity: 'rare',
      effect: 'Unlocks the observatory door in the final wing.',
      description: 'A heavy iron key engraved with faded trigonometric markings.',
    },
  },
}

export function createContextTemplate() {
  return structuredClone(DUNGEON_JSON_GUIDES.context.template)
}

export function createChallengeTemplate(index = 1) {
  const next = structuredClone(DUNGEON_JSON_GUIDES.challenge.template)
  next.id = `challenge-${index}`
  next.title = `Challenge ${index}`
  return next
}

export function createRewardTemplate(index = 1) {
  const next = structuredClone(DUNGEON_JSON_GUIDES.reward.template)
  next.id = `reward-${index}`
  next.name = `Reward ${index}`
  return next
}

export function createDefaultPlayerStats() {
  return PLAYER_STAT_DEFINITIONS.reduce((acc, stat) => {
    acc[stat.id] = stat.defaultValue
    return acc
  }, {})
}

export function createCharacterBaseStats() {
  return createDefaultPlayerStats()
}

export function applyCharacterClassBonus(baseStats, classId) {
  const selectedClass = CHARACTER_CLASS_OPTIONS.find((item) => item.id === classId)
  const next = { ...(baseStats || createCharacterBaseStats()) }
  if (!selectedClass?.statBonus) return next

  Object.entries(selectedClass.statBonus).forEach(([key, value]) => {
    next[key] = Number(next[key] || 0) + Number(value || 0)
  })

  return next
}

export function createCharacterDraft(index = 1) {
  const classId = CHARACTER_CLASS_OPTIONS[0].id
  return {
    id: null,
    name: `Adventurer ${index}`,
    classId,
    level: 1,
    experience: 0,
    stats: applyCharacterClassBonus(createCharacterBaseStats(), classId),
    inventory: [],
  }
}

export function createChallengeDraft(index = 1) {
  const template = createChallengeTemplate(index)
  const draft = {
    id: null,
    localId: generateDraftId('challenge'),
    title: `Challenge ${index}`,
    roomType: index % 2 === 0 ? 'enemy' : 'riddle',
    mathTopic: '',
    exercisePrompt: '',
    interactionPrompt: template.interactionPrompt || '',
    officialAnswer: template.officialAnswer || '',
    mathFacts: buildChallengeMathFacts(template.mathFacts),
    hintSteps: buildChallengeHintSteps(template.hintSteps || template.hints),
    relatedQuestions: buildChallengeRelatedQuestions(template.relatedQuestions),
    enemyName: String(template.enemyProfile?.name || ''),
    enemyAttackFlavor: String(template.enemyProfile?.attackFlavor || ''),
    successOutcome: '',
    failureOutcome: '',
  }
  return {
    ...draft,
    jsonDraft: stringifyDungeonJson(buildChallengeJsonFromDraft(draft)),
  }
}

export function createRewardDraft(index = 1) {
  const template = createRewardTemplate(index)
  return {
    id: null,
    localId: generateDraftId('reward'),
    name: `Reward ${index}`,
    rewardType: index % 2 === 0 ? 'consumable' : 'loot',
    rarity: 'common',
    description: '',
    jsonDraft: stringifyDungeonJson(template),
  }
}

export function getDungeonRooms(contextJson) {
  return Array.isArray(contextJson?.rooms) ? contextJson.rooms.filter(Boolean) : []
}

export function findDungeonRoom(contextJson, roomId) {
  return getDungeonRooms(contextJson).find((room) => room?.id === roomId) || null
}

export function getRoomExitIds(room) {
  const exits = room?.exits
  if (!Array.isArray(exits)) return []
  return exits
    .map((exit) => {
      if (typeof exit === 'string') return exit
      if (exit && typeof exit === 'object') return exit.id || exit.targetRoomId || exit.roomId || ''
      return ''
    })
    .filter(Boolean)
}

export function findDungeonChallenge(challenges, challengeId) {
  return (Array.isArray(challenges) ? challenges : []).find((challenge) => challenge?.id === challengeId) || null
}

export function findDungeonReward(rewards, rewardId) {
  return (Array.isArray(rewards) ? rewards : []).find((reward) => reward?.id === rewardId) || null
}

export function buildChallengeJsonFromDraft(challenge) {
  return {
    id: String(challenge?.id || '').trim() || null,
    title: String(challenge?.title || '').trim(),
    type: String(challenge?.roomType || 'riddle').trim() || 'riddle',
    mathTopic: String(challenge?.mathTopic || '').trim(),
    exercisePrompt: String(challenge?.exercisePrompt || ''),
    interactionPrompt: String(challenge?.interactionPrompt || ''),
    officialAnswer: String(challenge?.officialAnswer || ''),
    mathFacts: buildChallengeMathFacts(challenge?.mathFacts).filter(Boolean),
    hintSteps: buildChallengeHintSteps(challenge?.hintSteps).filter(Boolean),
    relatedQuestions: buildChallengeRelatedQuestions(challenge?.relatedQuestions)
      .filter((item) => item.prompt || item.expectedAnswer || item.mitigation || item.penalty),
    enemyProfile: {
      name: String(challenge?.enemyName || '').trim(),
      attackFlavor: String(challenge?.enemyAttackFlavor || '').trim(),
    },
    successOutcome: String(challenge?.successOutcome || '').trim(),
    failureOutcome: String(challenge?.failureOutcome || '').trim(),
  }
}

export function hydrateChallengeDraftFromSource(source = {}, index = 1) {
  const challengeJson = source?.challenge_json && typeof source.challenge_json === 'object'
    ? source.challenge_json
    : source

  const roomType = String(source?.room_type || challengeJson?.type || source?.roomType || 'riddle').trim() || 'riddle'

  return {
    id: source?.id || challengeJson?.id || null,
    localId: source?.localId || generateDraftId('challenge'),
    title: String(source?.title || challengeJson?.title || `Challenge ${index}`),
    roomType,
    mathTopic: String(source?.math_topic || source?.mathTopic || challengeJson?.mathTopic || ''),
    exercisePrompt: String(source?.exercise_prompt || source?.exercisePrompt || challengeJson?.exercisePrompt || ''),
    interactionPrompt: String(challengeJson?.interactionPrompt || ''),
    officialAnswer: String(challengeJson?.officialAnswer || challengeJson?.officialResult || ''),
    mathFacts: buildChallengeMathFacts(challengeJson?.mathFacts || challengeJson?.facts || challengeJson?.dataItems),
    hintSteps: buildChallengeHintSteps(challengeJson?.hintSteps || challengeJson?.hints),
    relatedQuestions: buildChallengeRelatedQuestions(challengeJson?.relatedQuestions || challengeJson?.combatQuestions),
    enemyName: String(challengeJson?.enemyProfile?.name || ''),
    enemyAttackFlavor: String(challengeJson?.enemyProfile?.attackFlavor || ''),
    successOutcome: String(source?.success_outcome || source?.successOutcome || challengeJson?.successOutcome || ''),
    failureOutcome: String(source?.failure_outcome || source?.failureOutcome || challengeJson?.failureOutcome || ''),
    jsonDraft: stringifyDungeonJson(buildChallengeJsonFromDraft({
      id: source?.id || challengeJson?.id || null,
      title: String(source?.title || challengeJson?.title || `Challenge ${index}`),
      roomType,
      mathTopic: String(source?.math_topic || source?.mathTopic || challengeJson?.mathTopic || ''),
      exercisePrompt: String(source?.exercise_prompt || source?.exercisePrompt || challengeJson?.exercisePrompt || ''),
      interactionPrompt: String(challengeJson?.interactionPrompt || ''),
      officialAnswer: String(challengeJson?.officialAnswer || challengeJson?.officialResult || ''),
      mathFacts: buildChallengeMathFacts(challengeJson?.mathFacts || challengeJson?.facts || challengeJson?.dataItems),
      hintSteps: buildChallengeHintSteps(challengeJson?.hintSteps || challengeJson?.hints),
      relatedQuestions: buildChallengeRelatedQuestions(challengeJson?.relatedQuestions || challengeJson?.combatQuestions),
      enemyName: String(challengeJson?.enemyProfile?.name || ''),
      enemyAttackFlavor: String(challengeJson?.enemyProfile?.attackFlavor || ''),
      successOutcome: String(source?.success_outcome || source?.successOutcome || challengeJson?.successOutcome || ''),
      failureOutcome: String(source?.failure_outcome || source?.failureOutcome || challengeJson?.failureOutcome || ''),
    })),
  }
}
