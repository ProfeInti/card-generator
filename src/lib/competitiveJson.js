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
    notes: 'Imported into competitive_technique_proposals. Spanish name and effectDescription are required. status must be one of draft, proposed, approved or rejected. Topic, subtopic, effectType, workedExample, and all French translation fields are optional. Fields with equations accept editor HTML or plain text with inline latex between $...$.',
    techniques: [
      {
        name: 'Completing the square',
        nameFr: 'Completer le carre',
        topic: 'Algebra',
        subtopic: 'Quadratic equations',
        effectType: 'transform',
        status: 'proposed',
        effectDescription: '<p>Rewrite as <span data-type="math-inline" data-latex="(x+a)^2=b"></span>.</p>',
        effectDescriptionFr: '<p>Reecrire comme <span data-type="math-inline" data-latex="(x+a)^2=b"></span>.</p>',
        workedExample: 'Start with $x^2+6x+5=0$ and complete square.',
        workedExampleFr: 'Partir de $x^2+6x+5=0$ et completer le carre.',
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
