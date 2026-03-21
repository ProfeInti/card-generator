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
      'Recommended canonical field names are exactly these: "id", "topic", "title", "sourceBook", "sourceAuthor", "sourcePage", "sourceSection", "sourceReference", "statement", "officialResult", "dataItems", "antiproblem".',
      'Required plain fields: "topic" and "title".',
      'The "title" must include the exercise number explicitly so the record can be identified clearly. Example: "Ejercicio 12 - Ecuacion cuadratica basica".',
      'Optional source metadata fields are plain text or number: "sourceBook", "sourceAuthor", "sourcePage", "sourceSection", "sourceReference".',
      'Rich fields are: "statement", "officialResult", "antiproblem", and each item inside "dataItems".',
      'Every rich field accepts either editor HTML or plain text.',
      'If plain text contains inline math, wrap each expression with $...$ so the importer converts it to the internal math-inline HTML used by the app.',
      'Example for a rich field: "Resuelve $x^2+5x+6=0$."',
      'Use "dataItems" as an array with up to 10 entries.',
      '"dataItems" must contain only elements extracted directly from the exercise statement: conditions, premises, declared facts, numeric values, geometric relations, or any other data that the statement literally gives.',
      '"dataItems" must not contain hints, guidance, suggested methods, reformulations, inferred facts, derived intermediate steps, the resolution, or the final answer.',
      '"antiproblem" must contain only the answer-template statement that responds to the problem, but it must remain intentionally incomplete so the student can fill in the actual answer. Example: "The intersection points are...".',
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
          'Los coeficientes dados por el enunciado son $a=1$, $b=5$ y $c=6$.',
        ],
        antiproblem: 'The explicit solutions are...',
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
    notes: 'Canonical field names are topic, title, sourceBook, sourceAuthor, sourcePage, sourceSection, sourceReference, statement, officialResult, dataItems, and antiproblem. The title must include the exercise number explicitly. In dataItems, store only facts or data extracted directly and literally from the exercise statement. Do not store hints, guidance, suggested methods, inferred facts, reformulations, derived steps, the resolution, or the final answer there. In antiproblem, store only the answer-template statement, keeping it intentionally incomplete so the student can fill in the answer later, for example "The intersection points are...". Rich fields accept editor HTML or plain text with inline math wrapped in $...$.',
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
  const dataItems = Array.isArray(dataItemsRaw)
    ? dataItemsRaw
    : String(dataItemsRaw || '').trim()
      ? [dataItemsRaw]
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
    antiproblem: normalizeWhiteboardRichField(firstFilled(item?.antiproblem, item?.antiproblema, item?.antiProblem)),
  }
}
