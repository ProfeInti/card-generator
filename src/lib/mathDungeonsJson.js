import { isLikelyHtml, normalizeMathHtmlInput } from './mathHtml'

const INTICORE_MATH_DUNGEONS_FORMAT = 'inticore-math-dungeons-v1'

function firstFilled(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    return value
  }
  return ''
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function latexInlineToNode(latex) {
  const safe = String(latex || '').trim()
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
  return `<span data-type="math-inline" data-latex="${safe}"></span>`
}

function textWithInlineLatexToHtml(text) {
  const raw = String(text || '')
  const parts = []
  let cursor = 0
  const regex = /\$([^$\n]+)\$/g
  let match

  while ((match = regex.exec(raw))) {
    const [full, latex] = match
    const index = match.index
    if (index > cursor) parts.push(escapeHtml(raw.slice(cursor, index)))
    parts.push(latexInlineToNode(latex))
    cursor = index + full.length
  }

  if (cursor < raw.length) parts.push(escapeHtml(raw.slice(cursor)))

  return `<p>${parts.join('').replace(/\n/g, '<br>')}</p>`
}

export function normalizeMathDungeonRichField(value) {
  if (value === null || value === undefined) return ''
  const raw = String(value)
  if (!raw.trim()) return ''
  if (isLikelyHtml(raw)) return raw
  if (/\$[^$\n]+\$/.test(raw)) return textWithInlineLatexToHtml(raw)
  return normalizeMathHtmlInput(raw)
}

function normalizeRelatedQuestionItem(item) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return {
      prompt: normalizeMathDungeonRichField(firstFilled(item.prompt, item.question, item.pregunta)),
      expectedAnswer: normalizeMathDungeonRichField(firstFilled(item.expectedAnswer, item.answer, item.respuestaEsperada)),
      mitigation: String(firstFilled(item.mitigation, item.reward, item.mitigacion) || '').trim(),
      penalty: String(firstFilled(item.penalty, item.risk, item.penalidad) || '').trim(),
    }
  }

  const prompt = normalizeMathDungeonRichField(item)
  return {
    prompt,
    expectedAnswer: '',
    mitigation: '',
    penalty: '',
  }
}

export function buildMathDungeonChallengesTemplateJson() {
  return {
    format: INTICORE_MATH_DUNGEONS_FORMAT,
    entity: 'math_dungeon_challenges',
    version: 1,
    notes: [
      'Use exactly this structure whenever possible: root object with "format", "entity", "version", and a "challenges" array.',
      'Each challenge must be one object inside the "challenges" array.',
      'Recommended canonical field names are: "id", "title", "type", "mathTopic", "exercisePrompt", "interactionPrompt", "officialAnswer", "mathFacts", "hintSteps", "relatedQuestions", "enemyProfile", "successOutcome", and "failureOutcome".',
      '"type" should be one of: riddle, enemy, elite-enemy, boss.',
      '"exercisePrompt" must contain the exact exercise or challenge statement the student will face.',
      '"interactionPrompt" should define the immersive line the runtime uses when the student first connects with the challenge.',
      '"officialAnswer" stores the official expected result or conclusion, not a worked full solution unless the official material already includes it.',
      '"mathFacts" must contain only facts, equations, conditions, and explicit mathematical elements extracted directly from the challenge. Keep them atomic.',
      '"hintSteps" contains concise progressive hints. The runtime should expose them only when the student presses the hint button.',
      '"relatedQuestions" is mainly for enemy encounters. Each item may include "prompt", "expectedAnswer", "mitigation", and "penalty".',
      '"enemyProfile" is optional but recommended for enemy encounters. It may include "name" and "attackFlavor".',
      'Rich fields accept editor HTML or plain text with inline LaTeX wrapped in $...$.',
      'Inside mathematical notation, use standard English function names and abbreviations. Example: write "$\\sin t$" instead of "$\\sen t$".',
      'Do not store generated hints, speculative steps, or improvised mathematical facts outside these canonical fields.',
    ].join(' '),
    challenges: [
      {
        id: 'challenge-derivative-1',
        title: 'Derivative Sentinel',
        type: 'enemy',
        mathTopic: 'Derivatives',
        exercisePrompt: 'Find the derivative of $f(x)=x^3\\sin(x)$.',
        interactionPrompt: 'Conectas con la esencia matematica del centinela y sientes que exige una derivada precisa. Que deberias hacer?',
        officialAnswer: '$f\\\'(x)=3x^2\\sin(x)+x^3\\cos(x)$',
        mathFacts: [
          'La funcion dada es $f(x)=x^3\\sin(x)$.',
          'Se pide derivar la funcion.',
          'La expresion es un producto entre $x^3$ y $\\sin(x)$.',
        ],
        hintSteps: [
          'Identifica primero que regla conecta dos factores multiplicados.',
          'Diferencia por separado cada factor antes de recomponer.',
          'Combina ambas derivadas con la regla del producto.',
        ],
        relatedQuestions: [
          {
            prompt: 'Si el centinela pregunta por la derivada de $\\sin(x)$, que respondes?',
            expectedAnswer: '$\\cos(x)$',
            mitigation: 'Evitas el dano completo de este turno.',
            penalty: 'Recibes el dano completo del ataque.',
          },
        ],
        enemyProfile: {
          name: 'Sentinel of Falling Tangents',
          attackFlavor: 'Launches a stone blade unless the student answers a derivative reflex question.',
        },
        successOutcome: 'The sentinel cracks and the northern gate opens.',
        failureOutcome: 'The sentinel lands a hit and the player loses health.',
      },
    ],
  }
}

export function buildMathDungeonChallengeExportJson(challenges) {
  return {
    format: INTICORE_MATH_DUNGEONS_FORMAT,
    entity: 'math_dungeon_challenges',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: 'Canonical fields are id, title, type, mathTopic, exercisePrompt, interactionPrompt, officialAnswer, mathFacts, hintSteps, relatedQuestions, enemyProfile, successOutcome, and failureOutcome. Rich fields accept editor HTML or plain text with inline math wrapped in $...$. mathFacts should contain only explicit mathematical facts or conditions from the challenge. hintSteps should be concise and progressive. relatedQuestions are intended for combat turns and can include prompt, expectedAnswer, mitigation, and penalty.',
    challenges,
  }
}

export function extractMathDungeonChallengesFromJson(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const collection =
    payload.challenges
    || payload.items
    || payload.records
    || payload.mathDungeonChallenges
    || payload.math_dungeon_challenges

  if (Array.isArray(collection)) return collection

  const single =
    payload.challenge
    || payload.item
    || payload.record
    || payload.mathDungeonChallenge
    || payload.math_dungeon_challenge

  if (single && typeof single === 'object') return [single]
  return []
}

export function normalizeMathDungeonChallengeImportItem(item) {
  const enemyProfile = item?.enemyProfile && typeof item.enemyProfile === 'object'
    ? item.enemyProfile
    : item?.enemy && typeof item.enemy === 'object'
      ? item.enemy
      : {}

  const factsRaw = firstFilled(item?.mathFacts, item?.facts, item?.dataItems, item?.datos)
  const hintsRaw = firstFilled(item?.hintSteps, item?.hints, item?.pistas)
  const relatedRaw = firstFilled(item?.relatedQuestions, item?.combatQuestions, item?.preguntasRelacionadas)

  const mathFacts = Array.isArray(factsRaw)
    ? factsRaw.map((entry) => normalizeMathDungeonRichField(entry)).filter(Boolean)
    : String(factsRaw || '').trim()
      ? [normalizeMathDungeonRichField(factsRaw)]
      : []

  const hintSteps = Array.isArray(hintsRaw)
    ? hintsRaw.map((entry) => normalizeMathDungeonRichField(entry)).filter(Boolean)
    : String(hintsRaw || '').trim()
      ? [normalizeMathDungeonRichField(hintsRaw)]
      : []

  const relatedQuestions = Array.isArray(relatedRaw)
    ? relatedRaw.map(normalizeRelatedQuestionItem).filter((entry) => entry.prompt)
    : String(relatedRaw || '').trim()
      ? [normalizeRelatedQuestionItem(relatedRaw)]
      : []

  return {
    id: String(firstFilled(item?.id, item?.challengeId, item?.challenge_id) || '').trim(),
    title: String(firstFilled(item?.title, item?.name, item?.titulo) || '').trim(),
    roomType: String(firstFilled(item?.type, item?.roomType, item?.room_type, item?.mode) || 'riddle').trim(),
    mathTopic: String(firstFilled(item?.mathTopic, item?.topic, item?.tema) || '').trim(),
    exercisePrompt: normalizeMathDungeonRichField(firstFilled(item?.exercisePrompt, item?.exercise, item?.statement, item?.enunciado)),
    interactionPrompt: normalizeMathDungeonRichField(firstFilled(item?.interactionPrompt, item?.introPrompt, item?.narrativePrompt, item?.promptNarrativo)),
    officialAnswer: normalizeMathDungeonRichField(firstFilled(item?.officialAnswer, item?.officialResult, item?.respuestaOficial, item?.finalAnswer)),
    mathFacts,
    hintSteps,
    relatedQuestions,
    enemyProfile: {
      name: String(firstFilled(enemyProfile?.name, enemyProfile?.nombre) || '').trim(),
      attackFlavor: String(firstFilled(enemyProfile?.attackFlavor, enemyProfile?.attack, enemyProfile?.ataque) || '').trim(),
    },
    successOutcome: String(firstFilled(item?.successOutcome, item?.onSuccess, item?.resultadoExito) || '').trim(),
    failureOutcome: String(firstFilled(item?.failureOutcome, item?.onFailure, item?.resultadoFallo) || '').trim(),
  }
}
