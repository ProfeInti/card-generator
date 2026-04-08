import { extractTextFromHtml, hasMeaningfulHtmlContent } from './mathHtml'
import { normalizeWhiteboardRichField } from './whiteboardJson'

const NOTEBOOK_PREFIX = 'inticore-whiteboard-notebook:'
const INTICORE_WHITEBOARD_NOTEBOOK_FORMAT = 'inticore-whiteboard-notebook-v1'
const NOTEBOOK_OBJECT_META = {
  data: {
    label: 'Dato',
    prefix: 'D',
  },
  condition: {
    label: 'Condicion',
    prefix: 'C',
  },
  clarification: {
    label: 'Aclaracion',
    prefix: 'A',
  },
  task: {
    label: 'Consigna',
    prefix: 'Q',
  },
  derived: {
    label: 'Objeto derivado',
    prefix: 'E',
  },
}

const NOTEBOOK_LOCALE_TEXT = {
  es: {
    statement: 'Enunciado',
    data: 'Datos',
    tasks: 'Consignas',
    derived: 'Referencias derivadas',
    solution: 'Solucion',
  },
  fr: {
    statement: 'Enonce',
    data: 'Donnees',
    tasks: 'Consignes',
    derived: 'References derivees',
    solution: 'Resolution',
  },
}

const NOTEBOOK_PAGE_KIND_LABELS = {
  es: {
    sheet: 'Hoja libre',
    exercise: 'Ejercicio vinculado',
    practice: 'Hoja de practica',
    worked_example: 'Ejemplo resuelto',
  },
  fr: {
    sheet: 'Feuille libre',
    exercise: 'Exercice lie',
    practice: 'Feuille pratique',
    worked_example: 'Exemple resolu',
  },
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function firstFilled(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    return value
  }
  return ''
}

function getNotebookObjectMeta(type) {
  return NOTEBOOK_OBJECT_META[String(type || 'data').trim() || 'data'] || NOTEBOOK_OBJECT_META.data
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildNotebookStorageKey(exerciseId) {
  return `${NOTEBOOK_PREFIX}${exerciseId}`
}

function normalizeHtml(value) {
  if (!value) return ''
  const normalized = normalizeWhiteboardRichField(value)
  return hasMeaningfulHtmlContent(normalized) ? normalized : ''
}

function normalizeTechniqueOptions(value) {
  const safe = value && typeof value === 'object' ? value : {}
  return {
    targetText: String(safe.targetText || '').trim(),
    replacementText: String(safe.replacementText || '').trim(),
    replacementReferenceId: String(safe.replacementReferenceId || '').trim(),
  }
}

function normalizeTechniqueInputValue(value) {
  const safe = value && typeof value === 'object' ? value : {}
  return {
    text: String(safe.text || '').trim(),
    referenceId: String(safe.referenceId || '').trim(),
  }
}

function normalizeTechniqueInputValues(value) {
  const safe = value && typeof value === 'object' ? value : {}
  return Object.entries(safe).reduce((acc, [key, entry]) => {
    const safeKey = String(key || '').trim()
    if (!safeKey) return acc
    acc[safeKey] = normalizeTechniqueInputValue(entry)
    return acc
  }, {})
}

function normalizeLocale(locale) {
  return String(locale || 'es').trim().toLowerCase() === 'fr' ? 'fr' : 'es'
}

function getNotebookLocaleText(locale = 'es') {
  return NOTEBOOK_LOCALE_TEXT[normalizeLocale(locale)] || NOTEBOOK_LOCALE_TEXT.es
}

function normalizeSpacing(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function extractNotebookExerciseReferenceLabel(exercise) {
  const candidates = [
    String(exercise?.sourceReference || '').trim(),
    String(exercise?.title || '').trim(),
    String(exercise?.sourceSection || '').trim(),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const explicitMatch = candidate.match(/\b(?:ej(?:ercicio)?|ex(?:ercise)?|prob(?:lem)?|pregunta|question)\.?\s*#?\s*([A-Za-z0-9-]+)/i)
    if (explicitMatch?.[1]) {
      return `Ejercicio ${explicitMatch[1]}`
    }
  }

  const sourceReference = String(exercise?.sourceReference || '').trim()
  if (/\d/.test(sourceReference)) return normalizeSpacing(sourceReference)
  return ''
}

export function getNotebookPageKindLabel(kind = 'sheet', locale = 'es') {
  const safeLocale = normalizeLocale(locale)
  const safeKind = String(kind || 'sheet').trim().toLowerCase() || 'sheet'
  const labels = NOTEBOOK_PAGE_KIND_LABELS[safeLocale] || NOTEBOOK_PAGE_KIND_LABELS.es
  return labels[safeKind] || labels.sheet
}

export function buildNotebookPageTitleFromExercise(exercise, options = {}) {
  const safeLocale = normalizeLocale(options.locale || 'es')
  const kindLabel = getNotebookPageKindLabel(options.kind || 'sheet', safeLocale)
  const safeIndex = Number.isInteger(options.pageIndex) && options.pageIndex >= 0 ? options.pageIndex : null
  const fallbackBase = safeIndex !== null
    ? (safeLocale === 'fr' ? `Feuille ${safeIndex + 1}` : `Hoja ${safeIndex + 1}`)
    : (safeLocale === 'fr' ? 'Feuille' : 'Hoja')
  const explicitTitle = normalizeSpacing(exercise?.title)
  const exerciseReference = extractNotebookExerciseReferenceLabel(exercise)
  const baseTitle = explicitTitle || exerciseReference || fallbackBase

  if (baseTitle.toLowerCase().includes(kindLabel.toLowerCase())) {
    return baseTitle
  }

  return `${baseTitle} - ${kindLabel}`
}

function getLocalizedNotebookText(primary, alternate, locale = 'es') {
  const safeLocale = normalizeLocale(locale)
  const primaryText = String(primary || '').trim()
  const alternateText = String(alternate || '').trim()

  if (safeLocale === 'fr') return alternateText || primaryText
  return primaryText || alternateText
}

function getLocalizedNotebookHtml(primary, alternate, locale = 'es') {
  const safeLocale = normalizeLocale(locale)
  const primaryHtml = normalizeHtml(primary)
  const alternateHtml = normalizeHtml(alternate)

  if (safeLocale === 'fr') return alternateHtml || primaryHtml
  return primaryHtml || alternateHtml
}

export function getWhiteboardNotebookLocalizedSolutionHtml(notebookLike, locale = 'es') {
  const safeLocale = normalizeLocale(locale)
  const safe = notebookLike && typeof notebookLike === 'object' ? notebookLike : {}
  const primaryHtml = normalizeHtml(
    safeLocale === 'fr'
      ? firstFilled(safe.solutionHtmlFr, safe.solutionHtml_fr, safe.solutionFr, safe.solution_fr)
      : firstFilled(safe.solutionHtml, safe.solution, safe.resolution, safe.resolucion)
  )
  const alternateHtml = normalizeHtml(
    safeLocale === 'fr'
      ? firstFilled(safe.solutionHtml, safe.solution, safe.resolution, safe.resolucion)
      : firstFilled(safe.solutionHtmlFr, safe.solutionHtml_fr, safe.solutionFr, safe.solution_fr)
  )
  return primaryHtml || alternateHtml || ''
}

function buildNotebookObject({ type, index, title, titleFr, content, contentFr }) {
  const safeType = String(type || 'data').trim() || 'data'
  const safeIndex = Number(index || 1)
  const meta = getNotebookObjectMeta(safeType)

  return {
    id: createId(`wb-note-${safeType}`),
    type: safeType,
    index: safeIndex,
    referenceCode: `${meta.prefix}${safeIndex}`,
    title: String(title || `${meta.label} ${safeIndex}`).trim(),
    titleFr: String(titleFr || '').trim(),
    content: normalizeHtml(content),
    contentFr: normalizeHtml(contentFr),
  }
}

function normalizeNotebookObject(object, fallbackType = 'data', fallbackIndex = 1) {
  const safe = object && typeof object === 'object' ? object : {}
  const safeType = String(safe.type || fallbackType).trim() || fallbackType
  const safeIndex = Number(safe.index || fallbackIndex)
  const meta = getNotebookObjectMeta(safeType)
  return {
    id: String(safe.id || createId(`wb-note-${fallbackType}`)).trim(),
    type: safeType,
    index: safeIndex,
    referenceCode: String(safe.referenceCode || '').trim() || `${meta.prefix}${safeIndex}`,
    title: String(safe.title || `${meta.label} ${safeIndex}`).trim(),
    titleFr: String(safe.titleFr || safe.title_fr || '').trim(),
    content: normalizeHtml(safe.content),
    contentFr: normalizeHtml(safe.contentFr || safe.content_fr),
  }
}

function classifyExerciseItem(html) {
  const text = extractTextFromHtml(html).toLowerCase()
  if (!text) return 'data'

  if (/\b(aclara|aclaracion|nota|observacion|remark|remarque|rappel|recordatorio|se recuerda|on rappelle)\b/.test(text)) {
    return 'clarification'
  }

  if (/\b(si|suppose|suponiendo|sabiendo que|where|dado que|avec|under the condition|condicion|hypothese|hypothesis)\b/.test(text)) {
    return 'condition'
  }

  if (/\([a-z]\)|\b(calcula|calcule|resolver|resuelve|determine|determina|encuentra|trouve|trouver|demuestra|prouve|montre|justifica|justifier|verifica|concluye|conclure|hallar|halle)\b/.test(text)) {
    return 'task'
  }

  return 'data'
}

function splitExerciseItems(exercise) {
  const explicitData = Array.isArray(exercise?.dataItems) ? exercise.dataItems.filter(hasMeaningfulHtmlContent) : []
  const explicitConditions = Array.isArray(exercise?.conditionItems) ? exercise.conditionItems.filter(hasMeaningfulHtmlContent) : []
  const explicitClarifications = Array.isArray(exercise?.clarificationItems) ? exercise.clarificationItems.filter(hasMeaningfulHtmlContent) : []
  const explicitTasks = Array.isArray(exercise?.taskItems) ? exercise.taskItems.filter(hasMeaningfulHtmlContent) : []

  if (explicitData.length || explicitConditions.length || explicitClarifications.length || explicitTasks.length) {
    return {
      data: [...explicitData, ...explicitConditions, ...explicitClarifications],
      condition: [],
      clarification: [],
      task: explicitTasks,
    }
  }

  const buckets = {
    data: [],
    condition: [],
    clarification: [],
    task: [],
  }

  ;(Array.isArray(exercise?.dataItems) ? exercise.dataItems : []).forEach((item) => {
    if (!hasMeaningfulHtmlContent(item)) return
    const bucket = classifyExerciseItem(item)
    buckets[bucket].push(item)
  })

  return buckets
}

function buildObjectList(type, items, itemsFr = []) {
  const meta = getNotebookObjectMeta(type)
  return (Array.isArray(items) ? items : []).map((item, index) => buildNotebookObject({
    type,
    index: index + 1,
    title: `${meta.label} ${index + 1}`,
    content: item,
    contentFr: itemsFr[index] || '',
  }))
}

function normalizeObjectList(type, items) {
  return (Array.isArray(items) ? items : []).map((item, index) => normalizeNotebookObject(item, type, index + 1))
}

function getReferenceColumnIdByType(type) {
  const safeType = String(type || '').trim()
  if (safeType === 'condition') return 'conditions'
  if (safeType === 'clarification') return 'clarifications'
  if (safeType === 'task') return 'tasks'
  if (safeType === 'derived') return 'derived'
  return 'data'
}

function normalizeImportedNotebookReferenceType(type) {
  const safeType = String(type || '').trim().toLowerCase()
  if (!safeType) return 'data'

  if (['task', 'tasks', 'consigna', 'consignas', 'prompt', 'prompts', 'goal', 'goals', 'question', 'questions'].includes(safeType)) {
    return 'task'
  }

  if (['derived', 'derivada', 'derivado', 'derived_reference', 'derivedreference', 'equation', 'equations', 'expression', 'expressions'].includes(safeType)) {
    return 'derived'
  }

  if (['condition', 'conditions', 'condicion', 'condiciones', 'hypothesis', 'hypotheses'].includes(safeType)) {
    return 'condition'
  }

  if (['clarification', 'clarifications', 'aclaracion', 'aclaraciones', 'note', 'notes', 'remark', 'remarks'].includes(safeType)) {
    return 'clarification'
  }

  return 'data'
}

function buildReferenceColumnsFromImportedReferences(entries) {
  const grouped = {
    data: [],
    conditions: [],
    clarifications: [],
    tasks: [],
    derived: [],
  }

  ;(Array.isArray(entries) ? entries : []).forEach((entry) => {
    const item = entry && typeof entry === 'object' ? entry : {}
    const type = normalizeImportedNotebookReferenceType(firstFilled(item.type, item.kind, item.referenceType, item.referenceKind))
    const columnId = getReferenceColumnIdByType(type)
    const targetList = Array.isArray(grouped[columnId]) ? grouped[columnId] : []
    targetList.push({
      id: String(firstFilled(item.id, item.referenceId) || '').trim() || createId(`wb-note-${type}`),
      type,
      index: targetList.length + 1,
      referenceCode: String(firstFilled(item.referenceCode, item.code, item.reference, item.ref) || '').trim(),
      title: String(firstFilled(item.title, item.name, item.label) || '').trim(),
      titleFr: String(firstFilled(item.titleFr, item.title_fr, item.nameFr, item.name_fr, item.labelFr, item.label_fr) || '').trim(),
      content: normalizeHtml(firstFilled(item.content, item.html, item.body, item.text, item.value)),
      contentFr: normalizeHtml(firstFilled(item.contentFr, item.content_fr, item.htmlFr, item.html_fr, item.bodyFr, item.body_fr, item.textFr, item.text_fr, item.valueFr, item.value_fr)),
    })
    grouped[columnId] = targetList
  })

  return {
    data: normalizeObjectList('data', grouped.data),
    conditions: normalizeObjectList('condition', grouped.conditions),
    clarifications: normalizeObjectList('clarification', grouped.clarifications),
    tasks: normalizeObjectList('task', grouped.tasks),
    derived: normalizeObjectList('derived', grouped.derived),
  }
}

function extractNotebookImportSource(payload) {
  if (!payload || typeof payload !== 'object') return null

  return payload.notebook
    || payload.whiteboardNotebook
    || payload.whiteboard_notebook
    || payload.record
    || payload
}

function extractNotebookImportReferences(source) {
  if (!source || typeof source !== 'object') return []
  if (Array.isArray(source.references)) return source.references

  return [
    ...(Array.isArray(source.dataReferences) ? source.dataReferences.map((item) => ({ ...item, type: firstFilled(item?.type, item?.kind, 'data') })) : []),
    ...(Array.isArray(source.conditionReferences) ? source.conditionReferences.map((item) => ({ ...item, type: firstFilled(item?.type, item?.kind, 'condition') })) : []),
    ...(Array.isArray(source.clarificationReferences) ? source.clarificationReferences.map((item) => ({ ...item, type: firstFilled(item?.type, item?.kind, 'clarification') })) : []),
    ...(Array.isArray(source.taskReferences) ? source.taskReferences.map((item) => ({ ...item, type: firstFilled(item?.type, item?.kind, 'task') })) : []),
    ...(Array.isArray(source.derivedReferences) ? source.derivedReferences.map((item) => ({ ...item, type: firstFilled(item?.type, item?.kind, 'derived') })) : []),
  ]
}

function buildReferenceColumns(exercise) {
  const buckets = splitExerciseItems(exercise)
  const frenchBuckets = splitExerciseItems({
    ...exercise,
    dataItems: exercise?.dataItemsFr,
    conditionItems: exercise?.conditionItemsFr,
    clarificationItems: exercise?.clarificationItemsFr,
    taskItems: exercise?.taskItemsFr,
  })
  return {
    data: buildObjectList('data', buckets.data, frenchBuckets.data),
    conditions: [],
    clarifications: [],
    tasks: buildObjectList('task', buckets.task, frenchBuckets.task),
    derived: [],
  }
}

function buildSeededNotebookReferenceEntryHtml(item, locale = 'es') {
  if (!item) return '<p></p>'

  const content = getLocalizedNotebookHtml(item.content, item.contentFr, locale) || '<p></p>'
  const referencePrefix = `<strong>[${escapeHtml(item.referenceCode || '')}]</strong>`

  if (/^\s*<p[\s>]/i.test(content)) {
    return content.replace(/<p([^>]*)>/i, `<p$1>${referencePrefix} `)
  }

  return `<p>${referencePrefix} ${content}</p>`
}

function buildSeededStatementHtml(statementHtml) {
  const content = normalizeHtml(statementHtml) || '<p></p>'
  return `<blockquote>${content}</blockquote>`
}

function wrapSeededSectionBodyHtml(contentHtml) {
  return `<blockquote>${contentHtml || '<p></p>'}</blockquote>`
}

function buildSeededReferenceSectionHtml(title, items, options = {}) {
  const safeItems = Array.isArray(items) ? items.filter((item) => item?.referenceCode || item?.content || item?.contentFr) : []
  if (!safeItems.length && !options.renderEmpty) return ''

  if (options.asTable) {
    const rows = safeItems.map((item) => {
      const content = getLocalizedNotebookHtml(item.content, item.contentFr, options.locale) || '<p></p>'
      return [
        '<tr>',
        `<td><p><strong>[${escapeHtml(item.referenceCode || '')}]</strong></p></td>`,
        `<td>${content}</td>`,
        '</tr>',
      ].join('')
    }).join('')

    return [
      `<h2>${escapeHtml(title)}</h2>`,
      '<table>',
      '<thead><tr><th>Referencia</th><th>Contenido</th></tr></thead>',
      `<tbody>${rows}</tbody>`,
      '</table>',
    ].join('')
  }

  if (!safeItems.length) {
    return [
      `<h2>${escapeHtml(title)}</h2>`,
      wrapSeededSectionBodyHtml(options.emptyHtml || '<p></p>'),
    ].join('')
  }

  const chunks = []
  safeItems.forEach((item) => {
    chunks.push(buildSeededNotebookReferenceEntryHtml(item, options.locale))
  })

  return [
    `<h2>${escapeHtml(title)}</h2>`,
    wrapSeededSectionBodyHtml(chunks.join('')),
  ].join('')
}

function normalizeNotebookSectionHeading(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const NOTEBOOK_SECTION_KEY_BY_HEADING = {
  enunciado: 'statement',
  enonce: 'statement',
  datos: 'data',
  donnees: 'data',
  consignas: 'tasks',
  consignes: 'tasks',
  'referencias derivadas': 'derived',
  'references derivees': 'derived',
  solucion: 'solution',
  solution: 'solution',
  resolution: 'solution',
}

function createNotebookHtmlContainer(html) {
  if (typeof document === 'undefined') return null
  const container = document.createElement('div')
  container.innerHTML = normalizeHtml(html)
  return container
}

function extractNotebookSectionHtmlMap(html) {
  const container = createNotebookHtmlContainer(html)
  if (!container) return null

  const sections = {
    statement: [],
    data: [],
    tasks: [],
    derived: [],
    solution: [],
  }

  let currentSection = null
  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/.test(node.nodeName)) {
      const headingKey = NOTEBOOK_SECTION_KEY_BY_HEADING[normalizeNotebookSectionHeading(node.textContent)]
      currentSection = headingKey || null
      return
    }
    if (!currentSection) return
    sections[currentSection].push(node.cloneNode(true))
  })

  return Object.fromEntries(
    Object.entries(sections).map(([key, nodes]) => {
      const wrapper = document.createElement('div')
      nodes.forEach((node) => wrapper.appendChild(node))
      return [key, wrapper.innerHTML.trim()]
    })
  )
}

function unwrapNotebookSectionBodyHtml(sectionHtml) {
  const container = createNotebookHtmlContainer(sectionHtml)
  if (!container) return ''
  if (container.children.length === 1 && container.firstElementChild?.tagName === 'BLOCKQUOTE') {
    return container.firstElementChild.innerHTML.trim()
  }
  return container.innerHTML.trim()
}

function parseSeededReferenceEntries(sectionHtml) {
  const bodyHtml = unwrapNotebookSectionBodyHtml(sectionHtml)
  const container = createNotebookHtmlContainer(bodyHtml)
  if (!container) return []

  const rows = Array.from(container.querySelectorAll('tr'))
  if (rows.length) {
    return rows.map((row) => {
      const cells = row.querySelectorAll('td')
      if (cells.length < 2) return null
      const referenceCode = String(cells[0].textContent || '').replace(/[\[\]\s]/g, '').trim()
      const content = normalizeHtml(cells[1].innerHTML)
      if (!referenceCode && !content) return null
      return { referenceCode, content }
    }).filter(Boolean)
  }

  const elements = Array.from(container.children)
  return elements.map((element) => {
    const html = String(element.innerHTML || '').trim()
    const match = html.match(/^\s*<strong>\s*\[([A-Za-z]\d+)\]\s*<\/strong>\s*/i)
    const referenceCode = String(match?.[1] || '').trim()
    const content = normalizeHtml(match ? html.slice(match[0].length) : html)
    if (!referenceCode && !content) return null
    return { referenceCode, content }
  }).filter(Boolean)
}

function buildLocalizedNotebookItemsFromEntries(type, existingItems, entries, locale = 'es') {
  const safeLocale = normalizeLocale(locale)
  const localeField = safeLocale === 'fr' ? 'contentFr' : 'content'
  const normalizedExisting = normalizeObjectList(type, existingItems)
  const meta = getNotebookObjectMeta(type)

  return entries.map((entry, index) => {
    const byCode = normalizedExisting.find((item) => item.referenceCode === entry.referenceCode)
    const fallback = normalizedExisting[index] || {}
    return {
      ...fallback,
      id: String(byCode?.id || fallback.id || createId(`wb-note-${type}`)).trim(),
      type: byCode?.type || fallback.type || type,
      index: index + 1,
      referenceCode: `${meta.prefix}${index + 1}`,
      title: `${meta.label} ${index + 1}`,
      titleFr: String(byCode?.titleFr || fallback.titleFr || '').trim(),
      content: normalizeHtml(byCode?.content || fallback.content),
      contentFr: normalizeHtml(byCode?.contentFr || fallback.contentFr),
      [localeField]: normalizeHtml(entry.content),
    }
  })
}

function buildLocalizedNotebookDataColumnsFromEntries(referenceColumns, entries, locale = 'es') {
  const mergedExisting = [
    ...normalizeObjectList('data', referenceColumns?.data),
    ...normalizeObjectList('condition', referenceColumns?.conditions),
    ...normalizeObjectList('clarification', referenceColumns?.clarifications),
  ]
  const safeLocale = normalizeLocale(locale)
  const localeField = safeLocale === 'fr' ? 'contentFr' : 'content'

  const nextMerged = entries.map((entry, index) => {
    const byCode = mergedExisting.find((item) => item.referenceCode === entry.referenceCode)
    const fallback = mergedExisting[index] || {}
    const resolvedType = byCode?.type || fallback.type || 'data'
    const meta = getNotebookObjectMeta(resolvedType)

    return {
      ...fallback,
      id: String(byCode?.id || fallback.id || createId(`wb-note-${resolvedType}`)).trim(),
      type: resolvedType,
      index: index + 1,
      referenceCode: `${meta.prefix}${index + 1}`,
      title: `${meta.label} ${index + 1}`,
      titleFr: String(byCode?.titleFr || fallback.titleFr || '').trim(),
      content: normalizeHtml(byCode?.content || fallback.content),
      contentFr: normalizeHtml(byCode?.contentFr || fallback.contentFr),
      [localeField]: normalizeHtml(entry.content),
    }
  })

  return {
    data: nextMerged.filter((item) => item.type === 'data'),
    conditions: nextMerged.filter((item) => item.type === 'condition'),
    clarifications: nextMerged.filter((item) => item.type === 'clarification'),
  }
}

const NOTEBOOK_SOLUTION_HEADING_PATTERN = /<h[1-6]>\s*(Soluci(?:o|Ã³)n|Solution|Resolution|Resolution|Resolu(?:t|c)ion)\s*<\/h[1-6]>/gi
const NOTEBOOK_SEED_HEADING_PATTERN = /<h[1-6]>\s*(Enunciado|Enonce|Énoncé|Datos|Donnees|Données|Consignas|Consignes|Referencias derivadas|References derivees|Références dérivées|Soluci(?:o|Ã³)n|Solution|Resolution|Resolu(?:t|c)ion)\s*<\/h[1-6]>/i

function extractNotebookDocumentBody(solutionHtml) {
  const raw = normalizeHtml(solutionHtml)
  if (!raw) return '<p></p>'

  const solutionHeadingPattern = /<h[1-6]>\s*(Soluci(?:o|ó)n|Solution|Resolution|Resolution|Resolu(?:t|c)ion)\s*<\/h[1-6]>/gi
  const matches = Array.from(raw.matchAll(solutionHeadingPattern))
  const lastMatch = matches.at(-1)

  if (!lastMatch || lastMatch.index == null) {
    return raw
  }

  const body = raw.slice(lastMatch.index + lastMatch[0].length).trim()
  return body || '<p></p>'
}

function extractNotebookDocumentBodySafe(solutionHtml) {
  const raw = extractNotebookDocumentBody(solutionHtml)
  if (!NOTEBOOK_SEED_HEADING_PATTERN.test(raw)) {
    return raw
  }

  const rawWithSolutionHeading = normalizeHtml(solutionHtml)
  if (/<h[1-6]>\s*(Soluci(?:o|Ã³)n|Solution|Resolution|Resolution|Resolu(?:t|c)ion)\s*<\/h[1-6]>/i.test(rawWithSolutionHeading)) {
    return raw
  }

  return '<p></p>'
}

export function buildWhiteboardNotebookSeededDocumentHtml(notebookLike, existingSolutionHtml = '', locale = null) {
  const safe = notebookLike && typeof notebookLike === 'object' ? notebookLike : {}
  const safeLocale = normalizeLocale(locale || safe.locale || 'es')
  const labels = getNotebookLocaleText(safeLocale)
  const referenceColumns = safe.referenceColumns && typeof safe.referenceColumns === 'object' ? safe.referenceColumns : {}
  const statementHtml = getLocalizedNotebookHtml(safe.statementHtml, safe.statementHtmlFr, safeLocale)
  const localizedSolutionHtml = normalizeHtml(existingSolutionHtml) || getWhiteboardNotebookLocalizedSolutionHtml(safe, safeLocale)
  const bodyHtml = extractNotebookDocumentBodySafe(localizedSolutionHtml)
  const dataItems = [
    ...normalizeObjectList('data', referenceColumns.data),
    ...normalizeObjectList('condition', referenceColumns.conditions),
    ...normalizeObjectList('clarification', referenceColumns.clarifications),
  ]
  const taskItems = normalizeObjectList('task', referenceColumns.tasks)
  const derivedItems = normalizeObjectList('derived', referenceColumns.derived)

  return [
    `<h2>${escapeHtml(labels.statement)}</h2>`,
    buildSeededStatementHtml(statementHtml),
    buildSeededReferenceSectionHtml(labels.data, dataItems, { locale: safeLocale, renderEmpty: true }),
    buildSeededReferenceSectionHtml(labels.tasks, taskItems, { locale: safeLocale, renderEmpty: true }),
    buildSeededReferenceSectionHtml(labels.derived, derivedItems, { locale: safeLocale }),
    `<h2>${escapeHtml(labels.solution)}</h2>`,
    bodyHtml || '<p></p>',
  ].filter(Boolean).join('')
}

export function ensureWhiteboardNotebookSeededDocumentHtml(notebookLike, existingSolutionHtml = '', locale = null) {
  return buildWhiteboardNotebookSeededDocumentHtml(
    notebookLike,
    normalizeHtml(existingSolutionHtml) || getWhiteboardNotebookLocalizedSolutionHtml(notebookLike, locale),
    locale
  )
  /*
  const raw = normalizeHtml(existingSolutionHtml || notebookLike?.solutionHtml)
  const hasSeedHeadings = /<h[1-6]>\s*(Enunciado|Enonce|Datos|Donnees|Consignas|Consignes|Referencias derivadas|References derivees|Soluci(?:o|ó)n|Resolution|Solution)\s*<\/h[1-6]>/i.test(raw)

  if (raw && raw !== '<p></p>' && !hasSeedHeadings) {
    return raw
  }

  return buildWhiteboardNotebookSeededDocumentHtml(notebookLike, raw, locale)
  */
}

export function applyWhiteboardNotebookDocumentEdit(notebookLike, documentHtml, locale = 'es') {
  const safeLocale = normalizeLocale(locale)
  const safeNotebook = notebookLike?.exerciseId
    ? normalizeStoredWhiteboardNotebook(notebookLike.exerciseId, notebookLike)
    : null
  if (!safeNotebook) return null

  const normalizedDocumentHtml = normalizeHtml(documentHtml)
  if (!normalizedDocumentHtml) {
    const solutionField = safeLocale === 'fr' ? 'solutionHtmlFr' : 'solutionHtml'
    return normalizeStoredWhiteboardNotebook(safeNotebook.exerciseId, {
      ...safeNotebook,
      [solutionField]: ensureWhiteboardNotebookSeededDocumentHtml(safeNotebook, '<p></p>', safeLocale),
    })
  }

  const sections = extractNotebookSectionHtmlMap(normalizedDocumentHtml)
  if (!sections) {
    const solutionField = safeLocale === 'fr' ? 'solutionHtmlFr' : 'solutionHtml'
    return normalizeStoredWhiteboardNotebook(safeNotebook.exerciseId, {
      ...safeNotebook,
      [solutionField]: normalizedDocumentHtml,
    })
  }

  const statementField = safeLocale === 'fr' ? 'statementHtmlFr' : 'statementHtml'
  const solutionField = safeLocale === 'fr' ? 'solutionHtmlFr' : 'solutionHtml'

  const nextReferenceColumns = {
    ...safeNotebook.referenceColumns,
  }

  if (sections.data) {
    const dataColumns = buildLocalizedNotebookDataColumnsFromEntries(
      safeNotebook.referenceColumns,
      parseSeededReferenceEntries(sections.data),
      safeLocale
    )
    nextReferenceColumns.data = dataColumns.data
    nextReferenceColumns.conditions = dataColumns.conditions
    nextReferenceColumns.clarifications = dataColumns.clarifications
  }

  if (sections.tasks) {
    nextReferenceColumns.tasks = buildLocalizedNotebookItemsFromEntries(
      'task',
      safeNotebook.referenceColumns?.tasks,
      parseSeededReferenceEntries(sections.tasks),
      safeLocale
    )
  }

  if (sections.derived) {
    nextReferenceColumns.derived = buildLocalizedNotebookItemsFromEntries(
      'derived',
      safeNotebook.referenceColumns?.derived,
      parseSeededReferenceEntries(sections.derived),
      safeLocale
    )
  }

  const rawStatementHtml = unwrapNotebookSectionBodyHtml(sections.statement)
  const nextNotebook = {
    ...safeNotebook,
    [statementField]: normalizeHtml(rawStatementHtml),
    referenceColumns: nextReferenceColumns,
  }

  return normalizeStoredWhiteboardNotebook(safeNotebook.exerciseId, {
    ...nextNotebook,
    [solutionField]: normalizedDocumentHtml,
  })
}

export function buildWhiteboardNotebookFromExercise(exercise) {
  const nowIso = new Date().toISOString()
  const statementHtml = normalizeHtml(exercise?.statement || '')
  const statementHtmlFr = normalizeHtml(exercise?.statementFr || exercise?.statement_fr)
  const referenceColumns = buildReferenceColumns(exercise)

  return {
    exerciseId: exercise?.id || '',
    exerciseTitle: String(exercise?.title || '').trim(),
    statementHtml,
    statementHtmlFr,
    locale: 'es',
    referenceColumns,
    solutionHtml: buildWhiteboardNotebookSeededDocumentHtml({
      statementHtml,
      statementHtmlFr,
      referenceColumns,
    }, '<p></p>'),
    solutionHtmlFr: buildWhiteboardNotebookSeededDocumentHtml({
      statementHtml,
      statementHtmlFr,
      referenceColumns,
      locale: 'fr',
    }, '<p></p>', 'fr'),
    activeReferenceId: '',
    linkedTechniqueId: '',
    techniqueOptions: normalizeTechniqueOptions(null),
    techniqueInputValues: normalizeTechniqueInputValues(null),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

export function flattenNotebookObjects(referenceColumns) {
  const safe = referenceColumns && typeof referenceColumns === 'object' ? referenceColumns : {}
  return [
    ...normalizeObjectList('data', safe.data),
    ...normalizeObjectList('condition', safe.conditions),
    ...normalizeObjectList('clarification', safe.clarifications),
    ...normalizeObjectList('task', safe.tasks),
    ...normalizeObjectList('derived', safe.derived),
  ]
}

export function buildWhiteboardNotebookTemplateJson() {
  return {
    format: INTICORE_WHITEBOARD_NOTEBOOK_FORMAT,
    entity: 'whiteboard_notebook',
    version: 1,
    notes: [
      'Use exactly this structure whenever possible: root object with "format", "entity", "version", and a "notebook" object.',
      'Rich fields are "statement", each reference "content", and the locale-specific solution fields.',
      'Optional bilingual fields are "statementFr", reference "contentFr", reference "titleFr", and "solutionFr".',
      'Every rich field accepts either editor HTML or plain text.',
      'If plain text contains inline math, wrap each expression with $...$ so the importer converts it to the internal math-inline HTML used by the notebook and the equations render correctly.',
      'Preferred output format for mathematical content is HTML with <span data-type="math-inline" data-latex="..."></span>.',
      'Use standard LaTeX inside $...$ or inside data-latex. Example: "$x^2+5x+6=0$".',
      'The preferred visible reference families for seeded sheets are "data" and "task". Legacy "condition" and "clarification" are still accepted and will render under Datos when importing older content, but the template should not generate new derived references.',
      'References should be atomic and reusable. Do not mix several unrelated givens in one reference when they are better cited separately.',
      'Data references must stay literal to the statement. Do not turn interpretations, inferred relationships, or progress steps into seeded data.',
      'By default, generate only the seeded sheet: statement plus explicit references. Leave "solution" empty unless the prompt explicitly asks for a solved sheet or a worked resolution.',
      'When a written solution is explicitly requested, cite existing references explicitly using forms such as [D1] or [Q1] when useful.',
      'When a solution is requested, the notebook should read like an ordered student notebook: brief, local steps, no unnecessary repetition, and no giant monolithic solution paragraph.',
      'Do not invent data outside the statement. If the reasoning creates an intermediate conclusion, keep it inside the solution text instead of adding a new seeded reference.',
    ].join(' '),
    notebook: {
      exerciseId: 'optional-existing-exercise-id',
      exerciseTitle: 'Ejercicio 12 - Ecuacion cuadratica basica',
      locale: 'es',
      statement: 'Resuelve $x^2+5x+6=0$.',
      statementFr: 'Resous $x^2+5x+6=0$.',
      references: [
        {
          type: 'data',
          referenceCode: 'D1',
          title: 'Dato 1',
          content: 'La ecuacion dada es $x^2+5x+6=0$.',
          titleFr: 'Donnee 1',
          contentFr: 'L equation donnee est $x^2+5x+6=0$.',
        },
        {
          type: 'task',
          referenceCode: 'Q1',
          title: 'Consigna 1',
          content: 'Resolver la ecuacion.',
          titleFr: 'Consigne 1',
          contentFr: 'Resoudre l equation.',
        },
      ],
      solution: '',
      solutionFr: '',
      linkedTechniqueId: '',
    },
  }
}

export function buildWhiteboardNotebookExportJson(notebook) {
  const normalized = normalizeStoredWhiteboardNotebook(String(notebook?.exerciseId || 'notebook-export').trim() || 'notebook-export', notebook)
  if (!normalized) return buildWhiteboardNotebookTemplateJson()

  const activeReference = flattenNotebookObjects(normalized.referenceColumns).find((item) => item.id === normalized.activeReferenceId) || null

  return {
    format: INTICORE_WHITEBOARD_NOTEBOOK_FORMAT,
    entity: 'whiteboard_notebook',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: 'Rich fields are statement, statementFr, each reference content/contentFr, solution, and solutionFr. Preferred math format is HTML with data-type="math-inline", but plain text with inline LaTeX between $...$ is also accepted by the importer. References may use data, task, derived, condition, or clarification types. Legacy condition and clarification references are rendered under Datos in the current notebook UI.',
    notebook: {
      exerciseId: normalized.exerciseId,
      exerciseTitle: normalized.exerciseTitle,
      locale: normalized.locale,
      statement: normalized.statementHtml,
      statementFr: normalized.statementHtmlFr,
      references: flattenNotebookObjects(normalized.referenceColumns).map((item) => ({
        id: item.id,
        type: item.type,
        referenceCode: item.referenceCode,
        title: item.title,
        titleFr: item.titleFr,
        content: item.content,
        contentFr: item.contentFr,
      })),
      solution: normalized.solutionHtml,
      solutionFr: normalized.solutionHtmlFr,
      linkedTechniqueId: normalized.linkedTechniqueId,
      activeReferenceId: normalized.activeReferenceId,
      activeReferenceCode: activeReference?.referenceCode || '',
    },
  }
}

export function normalizeWhiteboardNotebookImportPayload(targetExercise, payload) {
  const source = extractNotebookImportSource(payload)
  if (!source) return null

  const targetExerciseId = String(targetExercise?.id || firstFilled(source.exerciseId, source.exercise_id) || '').trim()
  if (!targetExerciseId) return null

  if (source.referenceColumns && typeof source.referenceColumns === 'object') {
    return normalizeStoredWhiteboardNotebook(targetExerciseId, {
      ...source,
      exerciseId: targetExerciseId,
      exerciseTitle: String(targetExercise?.title || source.exerciseTitle || source.exercise_title || '').trim(),
      statementHtml: firstFilled(source.statementHtml, source.statement, source.enunciado),
      statementHtmlFr: firstFilled(source.statementHtmlFr, source.statement_fr, source.statementFr, source.enonce, source.enonceHtml),
      solutionHtml: firstFilled(source.solutionHtml, source.solution, source.resolution, source.resolucion),
      solutionHtmlFr: firstFilled(source.solutionHtmlFr, source.solutionHtml_fr, source.solutionFr, source.solution_fr, source.resolutionFr, source.resolution_fr, source.resolucionFr, source.resolucion_fr),
    })
  }

  const referenceColumns = buildReferenceColumnsFromImportedReferences(extractNotebookImportReferences(source))
  const draftNotebook = normalizeStoredWhiteboardNotebook(targetExerciseId, {
    exerciseId: targetExerciseId,
    exerciseTitle: String(targetExercise?.title || source.exerciseTitle || source.exercise_title || '').trim(),
    statementHtml: firstFilled(source.statementHtml, source.statement, source.enunciado),
    statementHtmlFr: firstFilled(source.statementHtmlFr, source.statement_fr, source.statementFr, source.enonce, source.enonceHtml),
    locale: String(firstFilled(source.locale, source.language, 'es') || 'es').trim() || 'es',
    referenceColumns,
    solutionHtml: firstFilled(source.solutionHtml, source.solution, source.resolution, source.resolucion),
    solutionHtmlFr: firstFilled(source.solutionHtmlFr, source.solutionHtml_fr, source.solutionFr, source.solution_fr, source.resolutionFr, source.resolution_fr, source.resolucionFr, source.resolucion_fr),
    activeReferenceId: String(firstFilled(source.activeReferenceId, source.active_reference_id) || '').trim(),
    linkedTechniqueId: String(firstFilled(source.linkedTechniqueId, source.linked_technique_id) || '').trim(),
    techniqueOptions: source.techniqueOptions,
    techniqueInputValues: source.techniqueInputValues,
    createdAt: firstFilled(source.createdAt, source.created_at) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  if (!draftNotebook) return null

  const notebookObjects = flattenNotebookObjects(draftNotebook.referenceColumns)
  const activeReferenceCode = String(firstFilled(source.activeReferenceCode, source.active_reference_code) || '').trim()
  const resolvedActiveReference = notebookObjects.find((item) => item.id === draftNotebook.activeReferenceId)
    || notebookObjects.find((item) => item.referenceCode === activeReferenceCode)
    || null

  return {
    ...draftNotebook,
    activeReferenceId: resolvedActiveReference?.id || draftNotebook.activeReferenceId || '',
  }
}

export function downloadJsonFile(filename, data) {
  if (typeof document === 'undefined') return
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 0)
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

export function normalizeStoredWhiteboardNotebook(exerciseId, record) {
  if (!exerciseId) return null
  if (!record || typeof record !== 'object') return null

  return {
    exerciseId: String(record.exerciseId || exerciseId).trim(),
    exerciseTitle: String(record.exerciseTitle || '').trim(),
    statementHtml: normalizeHtml(record.statementHtml),
    statementHtmlFr: normalizeHtml(record.statementHtmlFr || record.statementHtml_fr),
    locale: String(record.locale || 'es').trim() || 'es',
    referenceColumns: {
      data: normalizeObjectList('data', record.referenceColumns?.data),
      conditions: normalizeObjectList('condition', record.referenceColumns?.conditions),
      clarifications: normalizeObjectList('clarification', record.referenceColumns?.clarifications),
      tasks: normalizeObjectList('task', record.referenceColumns?.tasks),
      derived: normalizeObjectList('derived', record.referenceColumns?.derived),
    },
    solutionHtml: normalizeHtml(record.solutionHtml),
    solutionHtmlFr: normalizeHtml(record.solutionHtmlFr || record.solutionHtml_fr || record.solutionFr || record.solution_fr),
    activeReferenceId: String(record.activeReferenceId || '').trim(),
    linkedTechniqueId: String(record.linkedTechniqueId || '').trim(),
    techniqueOptions: normalizeTechniqueOptions(record.techniqueOptions),
    techniqueInputValues: normalizeTechniqueInputValues(record.techniqueInputValues),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
  }
}

export function getStoredWhiteboardNotebook(exerciseId) {
  if (!exerciseId) return null
  const record = readJson(buildNotebookStorageKey(exerciseId), null)
  return normalizeStoredWhiteboardNotebook(exerciseId, record)
}

export function saveWhiteboardNotebook(exerciseId, notebook) {
  if (!exerciseId) return null

  const normalized = normalizeStoredWhiteboardNotebook(exerciseId, {
    ...notebook,
    exerciseId,
    updatedAt: new Date().toISOString(),
  })

  writeJson(buildNotebookStorageKey(exerciseId), normalized)
  return normalized
}

export function resetWhiteboardNotebook(exercise) {
  const notebook = buildWhiteboardNotebookFromExercise(exercise)
  saveWhiteboardNotebook(exercise?.id, notebook)
  return notebook
}

export function createDerivedNotebookObject(content, existingItems = []) {
  const currentItems = Array.isArray(existingItems) ? existingItems : []
  return buildNotebookObject({
    type: 'derived',
    index: currentItems.length + 1,
    title: `Ecuacion ${currentItems.length + 1}`,
    content,
  })
}

export function createNotebookReferenceObject(type, existingItems = [], content = '') {
  const normalizedItems = normalizeObjectList(type, existingItems)
  return buildNotebookObject({
    type,
    index: normalizedItems.length + 1,
    content,
  })
}

export function reindexNotebookObjectList(type, items) {
  const meta = getNotebookObjectMeta(type)
  return normalizeObjectList(type, items).map((item, index) => ({
    ...item,
    type,
    index: index + 1,
    referenceCode: `${meta.prefix}${index + 1}`,
    title: `${meta.label} ${index + 1}`,
  }))
}
