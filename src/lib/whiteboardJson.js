import { isLikelyHtml, normalizeMathHtmlInput } from './mathHtml'

const INTICORE_WHITEBOARD_FORMAT = 'inticore-whiteboard-v1'

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

export function normalizeWhiteboardRichField(value) {
  if (value === null || value === undefined) return ''
  const raw = String(value)
  if (!raw.trim()) return ''
  if (isLikelyHtml(raw)) return raw
  if (/\$[^$\n]+\$/.test(raw)) return textWithInlineLatexToHtml(raw)
  return normalizeMathHtmlInput(raw)
}

export function buildWhiteboardExercisesTemplateJson() {
  return {
    format: INTICORE_WHITEBOARD_FORMAT,
    entity: 'whiteboard_exercises',
    version: 1,
    notes: [
      'Use exactly this structure whenever possible: root object with "format", "entity", "version", and an "exercises" array.',
      'Each exercise must be one object inside the "exercises" array.',
      'Recommended canonical field names are exactly these: "id", "topic", "title", "sourceBook", "sourceAuthor", "sourcePage", "sourceSection", "sourceReference", "statement", "officialResult", "dataItems", "conditionItems", "clarificationItems", "taskItems", and "antiproblem".',
      'Required plain fields: "topic" and "title".',
      'The "title" must include the exercise number explicitly so the record can be identified clearly. Example: "Ejercicio 12 - Ecuacion cuadratica basica".',
      'Optional source metadata fields are plain text or number: "sourceBook", "sourceAuthor", "sourcePage", "sourceSection", "sourceReference".',
      'Rich fields are: "statement", "officialResult", "antiproblem", and each item inside "dataItems", "conditionItems", "clarificationItems", and "taskItems".',
      'Every rich field accepts either editor HTML or plain text.',
      'If plain text contains inline math, wrap each expression with $...$ so the importer converts it to the internal math-inline HTML used by the app and the equations render correctly in the whiteboard.',
      'Use standard LaTeX notation inside $...$. Example for a rich field: "Resuelve $x^2+5x+6=0$."',
      'Inside mathematical notation, use standard English function names and abbreviations. Example: write "$\\sin t$" instead of "$\\sen t$".',
      'Write every field with the minimum number of words needed to remain clear. Prefer concise mathematical statements over long prose.',
      'When a formula, relation, condition, or result can communicate the idea clearly, prefer the formula plus a short label instead of a long verbal explanation.',
      'Do not leave mathematical expressions in ambiguous plain text when they should render as math. Prefer "$x^2+5x+6=0$" over "x^2+5x+6=0".',
      '"statement" must reproduce the exercise itself, not hints or commentary about how to solve it.',
      '"officialResult" must contain only the official answer, final result, or conclusion expected from the exercise. It must not contain a full worked solution unless the source explicitly presents it as part of the official answer.',
      'Use "dataItems" for direct data only: values, equations, objects, declared relations, named elements, and literal givens.',
      'Use "conditionItems" for explicit hypotheses or constraints such as "x>0", "ABC is isosceles", "f is continuous on [a,b]", or "suppose that...".',
      'Use "clarificationItems" for side remarks, conventions, reminders, domain notes, or teacher/source clarifications that are part of the statement context but are not givens or tasks.',
      'Use "taskItems" for explicit consignas, goals, inciso prompts, and requested actions such as "calcula", "demuestra", "justifica", "(a)", "(b)", "(c)".',
      'Each entry in these arrays should be one atomic mathematical object, brief and directly reusable in the notebook.',
      'Do not invent, derive, expand, split, or anticipate notebook seeds beyond the literal statement. If the statement does not say it explicitly, do not create a seed for it.',
      'Never create seeds from intermediate deductions, hidden coefficients, obvious next steps, reformulations, or teacher-style hints unless the source itself states them explicitly.',
      'Seeds must stay at the same semantic level as the statement. They are not allowed to advance the resolution, add interpretation, or encode what a student is expected to infer later.',
      'If there is no explicit condition in the statement, "conditionItems" must be an empty array.',
      'If there is no explicit clarification, convention, or remark in the statement, "clarificationItems" must be an empty array.',
      'For backward compatibility, the importer still accepts legacy "dataItems" alone and will classify them heuristically when the newer arrays are absent.',
      '"antiproblem" must contain only the answer-template statement that responds to the problem, but it must remain intentionally incomplete so the student can fill in the actual answer. Example: "Los puntos de interseccion son...".',
      'Keep the language of all fields consistent with the source or the intended classroom language. Avoid mixing Spanish, English, and French in the same whiteboard exercise unless the exercise is explicitly multilingual.',
      'Empty strings inside "dataItems" are allowed but will be ignored by the importer.',
      'The importer matches an existing whiteboard exercise first by "id" when present; otherwise it matches by the pair "topic" + "title".',
      'For best compatibility, generate canonical field names exactly as shown here even though the importer also tolerates some aliases such as "tema", "titulo", "enunciado", "respuestaOficial", "datos", and "antiproblema".',
    ].join(' '),
    exercises: [
      {
        id: 'optional-existing-id',
        topic: 'Algebra',
        title: 'Ejercicio 12 - Ecuacion cuadratica basica',
        sourceBook: 'Algebra elemental',
        sourceAuthor: 'Autor Ejemplo',
        sourcePage: 45,
        sourceSection: 'Capitulo 2',
        sourceReference: 'Ejercicio 12',
        statement: 'Resuelve $x^2+5x+6=0$.',
        officialResult: '<p><span data-type="math-inline" data-latex="x=-2"></span> y <span data-type="math-inline" data-latex="x=-3"></span></p>',
        dataItems: [
          'La ecuacion dada es $x^2+5x+6=0$.',
        ],
        conditionItems: [],
        clarificationItems: [],
        taskItems: [
          'Se pide resolver la ecuacion.',
        ],
        antiproblem: 'Las soluciones explicitas son...',
      },
    ],
  }
}

export function buildWhiteboardExerciseExportJson(exercises) {
  return {
    format: INTICORE_WHITEBOARD_FORMAT,
    entity: 'whiteboard_exercises',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: 'Canonical field names are topic, title, sourceBook, sourceAuthor, sourcePage, sourceSection, sourceReference, statement, officialResult, dataItems, conditionItems, clarificationItems, taskItems, and antiproblem. Use dataItems for direct givens, conditionItems for explicit hypotheses or constraints, clarificationItems for explicit contextual notes or reminders, and taskItems for explicit consignas. Do not invent or derive seeds beyond the literal statement. If the statement does not contain explicit conditions or clarifications, leave conditionItems and clarificationItems as empty arrays. The title must include the exercise number explicitly. Rich fields accept editor HTML or plain text with inline math wrapped in $...$. In officialResult, store only the official answer or expected conclusion. In antiproblem, store only the answer-template statement.',
    exercises,
  }
}

export function buildWhiteboardExerciseImportKey(item) {
  return `${String(item?.topic || '').trim().toLowerCase()}::${String(item?.title || '').trim().toLowerCase()}`
}

export function whiteboardTitleHasExerciseNumber(value) {
  return /\d/.test(String(value || ''))
}

export function extractWhiteboardExercisesFromJson(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const collection =
    payload.exercises
    || payload.items
    || payload.records
    || payload.whiteboardExercises
    || payload.whiteboard_exercises

  if (Array.isArray(collection)) return collection

  const single =
    payload.exercise
    || payload.record
    || payload.whiteboardExercise
    || payload.whiteboard_exercise

  if (single && typeof single === 'object') return [single]
  return []
}

export function normalizeWhiteboardExerciseImportItem(item) {
  const source = item?.source && typeof item.source === 'object' ? item.source : {}

  const dataItemsRaw = firstFilled(item?.dataItems, item?.datos, item?.data, item?.facts)
  const conditionItemsRaw = firstFilled(item?.conditionItems, item?.condiciones, item?.conditions, item?.hypotheses)
  const clarificationItemsRaw = firstFilled(item?.clarificationItems, item?.aclaraciones, item?.clarifications, item?.notes)
  const taskItemsRaw = firstFilled(item?.taskItems, item?.consignas, item?.tasks, item?.prompts)
  const dataItems = Array.isArray(dataItemsRaw)
    ? dataItemsRaw
    : String(dataItemsRaw || '').trim()
      ? [dataItemsRaw]
      : []
  const conditionItems = Array.isArray(conditionItemsRaw)
    ? conditionItemsRaw
    : String(conditionItemsRaw || '').trim()
      ? [conditionItemsRaw]
      : []
  const clarificationItems = Array.isArray(clarificationItemsRaw)
    ? clarificationItemsRaw
    : String(clarificationItemsRaw || '').trim()
      ? [clarificationItemsRaw]
      : []
  const taskItems = Array.isArray(taskItemsRaw)
    ? taskItemsRaw
    : String(taskItemsRaw || '').trim()
      ? [taskItemsRaw]
      : []

  return {
    id: String(firstFilled(item?.id, item?.exerciseId, item?.exercise_id) || '').trim(),
    topic: String(firstFilled(item?.topic, item?.tema, item?.subject) || '').trim(),
    title: String(firstFilled(item?.title, item?.titulo, item?.name) || '').trim(),
    sourceBook: String(firstFilled(item?.sourceBook, item?.libro, source.book, source.title) || '').trim(),
    sourceAuthor: String(firstFilled(item?.sourceAuthor, item?.autor, source.author) || '').trim(),
    sourcePage: String(firstFilled(item?.sourcePage, item?.pagina, source.page) || '').trim(),
    sourceSection: String(firstFilled(item?.sourceSection, item?.seccion, source.section) || '').trim(),
    sourceReference: String(firstFilled(item?.sourceReference, item?.referencia, source.reference, source.extra) || '').trim(),
    statement: normalizeWhiteboardRichField(firstFilled(item?.statement, item?.enunciado, item?.problemStatement)),
    officialResult: normalizeWhiteboardRichField(firstFilled(item?.officialResult, item?.respuestaOficial, item?.officialAnswer, item?.finalAnswer)),
    dataItems: dataItems.map((entry) => normalizeWhiteboardRichField(entry)).filter(Boolean),
    conditionItems: conditionItems.map((entry) => normalizeWhiteboardRichField(entry)).filter(Boolean),
    clarificationItems: clarificationItems.map((entry) => normalizeWhiteboardRichField(entry)).filter(Boolean),
    taskItems: taskItems.map((entry) => normalizeWhiteboardRichField(entry)).filter(Boolean),
    antiproblem: normalizeWhiteboardRichField(firstFilled(item?.antiproblem, item?.antiproblema, item?.antiProblem)),
  }
}
