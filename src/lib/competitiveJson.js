import { isLikelyHtml, normalizeMathHtmlInput } from './mathHtml'
import { getTechniqueTaxonomyNotes, getTechniqueTaxonomyReference } from './competitiveTechniqueTaxonomy'

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
  const taxonomyNotes = getTechniqueTaxonomyNotes()
  const taxonomyReference = getTechniqueTaxonomyReference()

  return {
    format: INTICORE_FORMAT,
    entity: 'competitive_technique_proposals',
    version: 1,
    officialTaxonomy: taxonomyReference,
    notes: [
      'Use exactly this structure whenever possible: root object with "format", "entity", "version", and a "techniques" array.',
      '"version" is required and must always be present in the root object.',
      'Each technique must be one object inside the "techniques" array.',
      'Save the JSON as valid UTF-8 text. Do not ship mojibake or broken encodings.',
      'The root field "officialTaxonomy" contains the complete current official taxonomy with every allowed topicKey, subtopicKey, and effectTypeKey.',
      'Always select topicKey, subtopicKey, and effectTypeKey directly from "officialTaxonomy".',
      'Recommended canonical field names are exactly these: "name", "nameFr", "topicKey", "topic", "topicFr", "subtopicKey", "subtopic", "subtopicFr", "effectTypeKey", "effectType", "effectTypeFr", "status", "effectDescription", "effectDescriptionFr", "workedExample", "workedExampleFr", "applicationStructure", "applicationStructureFr".',
      'Spanish "name", Spanish "effectDescription", French "nameFr", French "effectDescriptionFr", and the taxonomy pair "topic/topicFr", "subtopic/subtopicFr", "effectType/effectTypeFr" are required.',
      'French fields must preserve the same level of detail, precision, and mathematical clarity as the Spanish fields. Do not provide a shorter, poorer, or oversimplified French version.',
      '"status" must be one of: draft, proposed, approved, rejected.',
      '"topicKey", "subtopicKey", and "effectTypeKey" must use the predefined taxonomy keys from the app.',
      '"topic", "topicFr", "subtopic", "subtopicFr", "effectType", and "effectTypeFr" define the bilingual taxonomy and are required for catalog organization, searching, and compendium grouping.',
      'The taxonomy is restrictive, not suggestive: do not invent new topics, subtopics, effect types, or keys.',
      'If a technique does not fit an existing topicKey/subtopicKey/effectTypeKey exactly, the JSON must be corrected to match the official taxonomy before import.',
      `Official topics taxonomy: ${taxonomyNotes.topics}.`,
      `Official effect types taxonomy: ${taxonomyNotes.effectTypes}.`,
      '"effectDescription" must define the mathematical technique itself as a reusable transformation, criterion, strategy, or operation. It must not be only an example, only a result, or only a motivational note.',
      '"effectDescription" should explain what the technique does, when it applies, and what kind of transformation or conclusion it produces.',
      '"effectDescription" must not be a full exercise solution tied to a single statement. The goal is to describe a reusable technique, not to solve one isolated problem.',
      'Each technique must read like a complete but minimal flashcard: self-contained, mathematically sufficient, and immediately usable without long pedagogical detours.',
      '"workedExample", when present, should demonstrate the technique on a concrete mathematical expression or situation and should remain consistent with the technique definition.',
      '"applicationStructure" and "applicationStructureFr" are sentence stems for the notebook. They should be ready to insert into the solution and may include placeholders such as "(referencia)" or "(reference)".',
      'The notebook no longer executes code for techniques. Applying a technique inserts its bilingual application structure into the sheet.',
      'A good application structure names the local action and leaves a natural continuation point, for example: "Reemplazando (referencia) en (referencia), por consiguiente ..." or "En remplacant (reference) dans (reference), par consequent ...".',
      'Avoid turning the application structure into a full exercise solution. It should remain reusable across many exercises.',
      'Any field containing equations must be written in a format that renders correctly in the app after import. Use editor HTML or plain text with every mathematical expression wrapped in inline LaTeX between $...$.',
      'Do not leave equations, symbolic transformations, or mathematical equalities as ambiguous plain text when they are meant to render as math.',
      'Use standard LaTeX notation inside $...$. Prefer "$x^2+6x+5=0$" over "x^2+6x+5=0" when the content is mathematical.',
      'Keep the language of each field internally consistent. Spanish fields should stay in Spanish; French fields should stay in French.',
      'For best compatibility, generate canonical field names exactly as shown here.',
      'For best rendering compatibility, prefer HTML with <span data-type="math-inline" data-latex="..."></span> for rich mathematical content. Plain text with inline LaTeX between $...$ is accepted as a fallback.',
      'Every relevant mathematical element should be encapsulated correctly, including variables, equalities, vector expressions, membership statements, and relations.',
    ].join(' '),
    techniques: [
      {
        name: 'Axioma de sustitucion',
        nameFr: 'Axiome de substitution',
        topicKey: 'algebra',
        topic: 'Algebra',
        topicFr: 'Algebre',
        subtopicKey: 'algebra_equations',
        subtopic: 'Ecuaciones',
        subtopicFr: 'Equations',
        effectTypeKey: 'transformation',
        effectType: 'Transformacion',
        effectTypeFr: 'Transformation',
        status: 'proposed',
        effectDescription: '<p>Permite sustituir una expresion o igualdad valida dentro de otra expresion, igualdad o razonamiento cuando ambas comparten el elemento pertinente.</p>',
        effectDescriptionFr: '<p>Permet de remplacer une expression ou une egalite valide dans une autre expression, egalite ou chaine de raisonnement lorsqu elles partagent l element pertinent.</p>',
        workedExample: '<p>Si <span data-type="math-inline" data-latex="a=b"></span> y <span data-type="math-inline" data-latex="f(a)=a^2+1"></span>, entonces al sustituir se obtiene <span data-type="math-inline" data-latex="f(b)=b^2+1"></span>.</p>',
        workedExampleFr: '<p>Si <span data-type="math-inline" data-latex="a=b"></span> et <span data-type="math-inline" data-latex="f(a)=a^2+1"></span>, alors en substituant on obtient <span data-type="math-inline" data-latex="f(b)=b^2+1"></span>.</p>',
        applicationStructure: '<p>Reemplazando <strong>(referencia)</strong> en <strong>(referencia)</strong>, por consiguiente <span data-type="math-inline" data-latex="\\ldots"></span>.</p>',
        applicationStructureFr: '<p>En remplacant <strong>(reference)</strong> dans <strong>(reference)</strong>, par consequent <span data-type="math-inline" data-latex="\\ldots"></span>.</p>',
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
