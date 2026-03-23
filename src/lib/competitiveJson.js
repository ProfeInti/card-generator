import { isLikelyHtml, normalizeMathHtmlInput } from './mathHtml'

const INTICORE_FORMAT = 'inticore-competitive-v1'

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

export function normalizeCompetitiveRichField(value) {
  if (value === null || value === undefined) return ''
  const raw = String(value)
  if (!raw.trim()) return ''
  if (isLikelyHtml(raw)) return raw
  if (/\$[^$\n]+\$/.test(raw)) return textWithInlineLatexToHtml(raw)
  return normalizeMathHtmlInput(raw)
}

export function buildTechniquesTemplateJson() {
  return {
    format: INTICORE_FORMAT,
    entity: 'competitive_technique_proposals',
    version: 1,
    notes: [
      'Use exactly this structure whenever possible: root object with "format", "entity", "version", and a "techniques" array.',
      '"version" is required and must always be present in the root object.',
      'Each technique must be one object inside the "techniques" array.',
      'Recommended canonical field names are exactly these: "name", "nameFr", "topic", "subtopic", "effectType", "status", "effectDescription", "effectDescriptionFr", "workedExample", "workedExampleFr".',
      'Spanish "name", Spanish "effectDescription", French "nameFr", and French "effectDescriptionFr" are required.',
      'French fields must preserve the same level of detail, precision, and mathematical clarity as the Spanish fields. Do not provide a shorter, poorer, or oversimplified French version.',
      '"status" must be one of: draft, proposed, approved, rejected.',
      '"topic", "subtopic", and "effectType" are optional but strongly recommended because they make the technique searchable and reusable in the collection.',
      '"effectDescription" must define the mathematical technique itself as a reusable transformation, criterion, strategy, or operation. It must not be only an example, only a result, or only a motivational note.',
      '"effectDescription" should explain what the technique does, when it applies, and what kind of transformation or conclusion it produces.',
      '"effectDescription" must not be a full exercise solution tied to a single statement. The goal is to describe a reusable technique, not to solve one isolated problem.',
      'Write the content with the minimum number of words needed to remain clear. Prefer concise mathematical phrasing and direct formulas over long explanations.',
      'When a condition, transformation, or conclusion is best expressed symbolically, use the formula plus only the shortest necessary clarifying text.',
      '"workedExample", when present, should demonstrate the technique on a concrete mathematical expression or situation and should remain consistent with the technique definition.',
      '"workedExample" should also stay brief: enough to show the transformation clearly, without turning into a long derivation unless that brevity would reduce clarity.',
      'Any field containing equations must be written in a format that renders correctly in the app after import. Use editor HTML or plain text with every mathematical expression wrapped in inline LaTeX between $...$.',
      'Do not leave equations, symbolic transformations, or mathematical equalities as ambiguous plain text when they are meant to render as math.',
      'Use standard LaTeX notation inside $...$. Prefer "$x^2+6x+5=0$" over "x^2+6x+5=0" when the content is mathematical.',
      'Inside mathematical notation, use standard English function names and abbreviations. Example: write "$\\sin t$" instead of "$\\sen t$".',
      'Keep the language of each field internally consistent. Spanish fields should stay in Spanish; French fields should stay in French.',
      'For best compatibility, generate canonical field names exactly as shown here.',
      'Strict math rendering rules: all mathematical expressions must be written exclusively in HTML using <span data-type="math-inline" data-latex="..."></span>.',
      'Under no circumstances may the content use $...$, write mathematical expressions in plain text, or leave mathematical symbols outside a valid math container.',
      'Every mathematical element must be encapsulated correctly, including variables, equalities, vector expressions, membership statements, and relations.',
      'Mandatory encapsulation examples: <span data-type="math-inline" data-latex="x(t_0)=x_0"></span> <span data-type="math-inline" data-latex="\\\\vec{r}(t)=(x(t),y(t),z(t))"></span> <span data-type="math-inline" data-latex="P \\\\in \\\\vec{r}(t)"></span>.',
      'Additional technical rules: use standard LaTeX inside data-latex, escape characters correctly in JSON, do not mix mathematical text outside the span, and place each relevant mathematical expression in its own span.',
      'Critical rule: if a mathematical expression is not inside a span with data-latex, it is invalid and must not be generated.',
    ].join(' '),
    techniques: [
      {
        name: 'Completar el cuadrado',
        nameFr: 'Completer le carre',
        topic: 'Algebra',
        subtopic: 'Ecuaciones cuadraticas',
        effectType: 'transform',
        status: 'proposed',
        effectDescription: '<p>Reescribe una expresion cuadratica para obtener una forma del tipo <span data-type="math-inline" data-latex="(x+a)^2=b"></span>, agregando y compensando el termino necesario cuando sea valido hacerlo.</p>',
        effectDescriptionFr: '<p>Reecrire une expression quadratique sous une forme du type <span data-type="math-inline" data-latex="(x+a)^2=b"></span> en ajoutant puis en compensant le terme necessaire lorsque cela est valide.</p>',
        workedExample: 'Partiendo de $x^2+6x+5=0$, se puede reescribir como $x^2+6x+9=4$ y luego como $(x+3)^2=4$.',
        workedExampleFr: 'En partant de $x^2+6x+5=0$, on peut reecrire comme $x^2+6x+9=4$ puis comme $(x+3)^2=4$.',
      },
    ],
  }
}

export function buildExercisesTemplateJson() {
  return {
    format: INTICORE_FORMAT,
    entity: 'competitive_exercises',
    version: 1,
    notes: 'sourceAuthor, topic, exerciseNumber, pageNumber and statement are required. pageNumber must be a positive integer. sourceYear is optional but, if present, must be an integer between 0 and 9999. status must be one of draft, proposed, approved or rejected. statement and finalAnswer accept editor HTML or plain text with inline latex between $...$. sourceTitle is optional and stores the original book or source title. The app regenerates the exercise name automatically from author + topic + exercise number + page.',
    exercises: [
      {
        sourceTitle: 'Algebra Workbook',
        sourceType: 'book',
        sourceAuthor: 'Author Name',
        sourceYear: 2024,
        sourceLocation: 'Chapter 2',
        pageNumber: 45,
        exerciseNumber: '12',
        topic: 'Algebra',
        subtopic: 'Quadratic equations',
        difficulty: 'Intermediate',
        status: 'proposed',
        statement: 'Solve $x^2+5x+6=0$.',
        finalAnswer: '<p><span data-type="math-inline" data-latex="x=-2"></span>, <span data-type="math-inline" data-latex="x=-3"></span></p>',
      },
    ],
  }
}

export function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function parseJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || '{}')))
      } catch {
        reject(new Error('Invalid JSON file.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsText(file)
  })
}

export function toAllowedStatus(rawStatus, allowedStatuses, fallback = 'proposed') {
  const status = String(rawStatus || '').trim().toLowerCase()
  return allowedStatuses.includes(status) ? status : fallback
}
