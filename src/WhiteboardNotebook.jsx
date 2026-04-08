import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SafeDescriptionEditor from './SafeDescriptionEditor'
import { ensureRootWhiteboardWorkspace, getWhiteboardWorkspaceById, updateWhiteboardWorkspace } from './data/whiteboardWorkspaceRepo'
import { createNotebookCollabPage, getNotebookCollabPageById, subscribeToNotebookCollabPage, updateNotebookCollabPage } from './data/notebookCollabRepo'
import { subscribeToWhiteboardWorkspace } from './data/whiteboardWorkspaceRealtime'
import { listPrivateCompetitiveTechniqueInventory } from './data/competitiveTechniquesRepo'
import { getTechniqueTranslation, TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
import { extractTextFromHtml, normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'
import {
  createNotebookPage,
  deleteNotebookPage,
  getActiveNotebookBookId,
  getActiveNotebookCollabPageId,
  getActiveNotebookPageId,
  getNotebookBookById,
  saveNotebookBook,
  setActiveNotebookBookId,
  setActiveNotebookCollabPageId,
  setActiveNotebookPageId,
  updateNotebookPage,
} from './lib/notebookLibrary'
import {
  buildNotebookBookExportJson,
  buildNotebookPageExportJson,
  buildNotebookPageTemplateJson,
  materializeImportedNotebookPage,
  normalizeNotebookLibraryImportPayload,
} from './lib/notebookLibraryJson'
import {
  buildNotebookPageTitleFromExercise,
  buildWhiteboardNotebookExportJson,
  buildWhiteboardNotebookTemplateJson,
  buildWhiteboardNotebookFromExercise,
  applyWhiteboardNotebookDocumentEdit,
  ensureWhiteboardNotebookSeededDocumentHtml,
  createNotebookReferenceObject,
  createDerivedNotebookObject,
  downloadJsonFile,
  flattenNotebookObjects,
  getWhiteboardNotebookLocalizedSolutionHtml,
  getNotebookPageKindLabel as getSharedNotebookPageKindLabel,
  getStoredWhiteboardNotebook,
  normalizeStoredWhiteboardNotebook,
  normalizeWhiteboardNotebookImportPayload,
  parseJsonFile,
  reindexNotebookObjectList,
  resetWhiteboardNotebook,
  saveWhiteboardNotebook,
} from './lib/whiteboardNotebook'
import {
  buildEmptyWhiteboardExercise,
  deleteWhiteboardExercise,
  generateWorkspaceFromExercise,
  generateWorkspaceLinksFromExercise,
  getActiveWhiteboardExerciseId,
  getActiveWhiteboardWorkspaceId,
  getStoredWorkspace,
  listWhiteboardExercises,
  saveWhiteboardExercise,
  setActiveWhiteboardExerciseId,
  setActiveWhiteboardWorkspaceId,
} from './lib/whiteboardPrototype'

const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'
const COLLABORATOR_COLORS = ['#53d1f0', '#f5c451', '#ef7d57', '#8bd3dd', '#9b8cff', '#73e2a7', '#ff9ecd', '#ffcf70']
const COLLABORATION_READY_MESSAGE = 'Cuaderno colaborativo en servidor local.'
const REFERENCE_INSERT_COLORS = {
  data: '#1d4ed8',
  task: '#166534',
  derived: '#c2410c',
}
const NOTEBOOK_TEXT_COLOR_PRESETS = [
  { id: 'ink', label: 'Tinta', value: '#0f172a' },
  { id: 'wine', label: 'Vino', value: '#6b1220' },
  { id: 'blue', label: 'Azul', value: '#1d4ed8' },
  { id: 'green', label: 'Verde', value: '#166534' },
  { id: 'orange', label: 'Naranja', value: '#c2410c' },
  { id: 'gray', label: 'Gris', value: '#475569' },
]
const EDITABLE_REFERENCE_COLUMNS = [
  {
    id: 'data',
    title: 'Datos',
    objectType: 'data',
    emptyMessage: 'Click derecho para agregar un dato explicito del enunciado.',
  },
  {
    id: 'conditions',
    title: 'Condiciones',
    objectType: 'condition',
    emptyMessage: 'Puede quedar vacio si el enunciado no declara condiciones explicitas.',
  },
  {
    id: 'clarifications',
    title: 'Aclaraciones',
    objectType: 'clarification',
    emptyMessage: 'Puede quedar vacio si el enunciado no trae aclaraciones explicitas.',
  },
  {
    id: 'tasks',
    title: 'Consignas',
    objectType: 'task',
    emptyMessage: 'Click derecho para agregar una consigna literal del enunciado.',
  },
]
const DERIVED_REFERENCE_COLUMN = {
  id: 'derived',
  title: 'Objetos derivados',
  objectType: 'derived',
  emptyMessage: 'Selecciona texto o una expresion en la solucion para crear una referencia derivada.',
}
const ALL_REFERENCE_COLUMNS = [...EDITABLE_REFERENCE_COLUMNS, DERIVED_REFERENCE_COLUMN]
const EDITABLE_REFERENCE_COLUMN_IDS = new Set(ALL_REFERENCE_COLUMNS.map((column) => column.id))
const EDITABLE_REFERENCE_TYPES = new Set(ALL_REFERENCE_COLUMNS.map((column) => column.objectType))
const SHEET_REFERENCE_SECTIONS = [
  {
    id: 'data',
    title: 'Datos',
    sourceColumnIds: ['data', 'conditions', 'clarifications'],
    addColumnId: 'data',
    addLabel: 'Agregar dato',
    emptyMessage: 'Agrega o selecciona datos literales del enunciado para tenerlos visibles en la hoja.',
  },
  {
    id: 'tasks',
    title: 'Consignas',
    sourceColumnIds: ['tasks'],
    addColumnId: 'tasks',
    addLabel: 'Agregar consigna',
    emptyMessage: 'Agrega una consigna literal si quieres dejarla explicitada dentro de la hoja.',
  },
]

function sanitizeNotebookFilenamePart(value, fallback = 'notebook') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

function getNotebookPageKindLabel(page, locale = 'es') {
  return getSharedNotebookPageKindLabel(page?.kind || 'sheet', locale)
}

function normalizeNotebookLocale(locale) {
  return String(locale || 'es').trim().toLowerCase() === 'fr' ? 'fr' : 'es'
}

function extractNotebookShareCode(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const directMatch = raw.match(/\bNP-[A-Z0-9-]+\b/i)
  if (directMatch?.[0]) {
    return directMatch[0].toUpperCase()
  }

  if (typeof window === 'undefined') return ''

  try {
    const parsed = new URL(raw, window.location.origin)
    const queryCode = parsed.searchParams.get('notebookShare') || parsed.searchParams.get('code') || ''
    const queryMatch = String(queryCode || '').trim().match(/\bNP-[A-Z0-9-]+\b/i)
    return queryMatch?.[0]?.toUpperCase?.() || ''
  } catch {
    return ''
  }
}

function buildNotebookShareLink(code) {
  const normalizedCode = extractNotebookShareCode(code)
  if (!normalizedCode || typeof window === 'undefined') return ''

  const url = new URL(window.location.href)
  url.searchParams.set('notebookShare', normalizedCode)
  return url.toString()
}

function getLocalizedNotebookHtml(primary, alternate, locale = 'es') {
  const safeLocale = normalizeNotebookLocale(locale)
  const primaryHtml = normalizeMathHtmlInput(primary || '')
  const alternateHtml = normalizeMathHtmlInput(alternate || '')
  return safeLocale === 'fr'
    ? (alternateHtml || primaryHtml)
    : (primaryHtml || alternateHtml)
}

function getLocalizedNotebookText(primary, alternate, locale = 'es') {
  const safeLocale = normalizeNotebookLocale(locale)
  const primaryText = String(primary || '').trim()
  const alternateText = String(alternate || '').trim()
  return safeLocale === 'fr'
    ? (alternateText || primaryText)
    : (primaryText || alternateText)
}

function buildRealtimeClientId() {
  return `wb-note-client-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`
}

function pickCollaboratorColor(seed) {
  const key = String(seed || '')
  const hash = key.split('').reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 0)
  return COLLABORATOR_COLORS[hash % COLLABORATOR_COLORS.length]
}

function closeRealtimeChannel(channel) {
  if (!channel) return
  if (typeof channel.close === 'function') {
    channel.close()
  }
}

function buildNotebookPresencePayload({
  session,
  clientId,
  selectedExerciseId,
  activeReferenceId,
  focusArea,
}) {
  const username = String(session?.username || session?.userId || 'Anonymous').trim()
  const userId = String(session?.userId || '').trim()
  const color = pickCollaboratorColor(userId || username)
  const safeFocusArea = String(focusArea || '').trim() || 'browsing'
  return {
    clientId,
    userId,
    username,
    color,
    editingType: 'notebook',
    targetId: activeReferenceId || selectedExerciseId || '',
    activity: safeFocusArea,
    updatedAt: new Date().toISOString(),
  }
}

function serializeNotebook(notebook) {
  return JSON.stringify(notebook || null)
}

function renderHtmlPreview(value) {
  return renderMathInHtml(value || '')
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function buildReferenceMenuState() {
  return {
    open: false,
    x: 0,
    y: 0,
    columnId: '',
    itemId: '',
  }
}

function handlePanelHeadKeyDown(event, onToggle) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onToggle()
}

function clampFloatingMenuPosition(x, y, element, padding = 12) {
  if (typeof window === 'undefined') {
    return { x, y }
  }

  const rect = element?.getBoundingClientRect?.()
  const width = rect?.width || 0
  const height = rect?.height || 0
  const maxX = Math.max(padding, window.innerWidth - width - padding)
  const maxY = Math.max(padding, window.innerHeight - height - padding)

  return {
    x: Math.min(Math.max(padding, x), maxX),
    y: Math.min(Math.max(padding, y), maxY),
  }
}

function isEditableReferenceType(type) {
  return EDITABLE_REFERENCE_TYPES.has(String(type || '').trim())
}

function buildInlineReferenceContentHtml(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  if (typeof document === 'undefined') {
    return raw
      .replace(/^<p>/i, '')
      .replace(/<\/p>$/i, '')
      .trim()
  }

  const container = document.createElement('div')
  container.innerHTML = raw

  const parts = Array.from(container.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return escapeHtml(node.textContent || '').trim()
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return ''
      }

      const element = node
      const tagName = element.tagName.toLowerCase()
      if (tagName === 'p' || tagName === 'div' || /^h[1-6]$/.test(tagName) || tagName === 'blockquote') {
        return element.innerHTML.trim()
      }

      return element.outerHTML.trim()
    })
    .filter(Boolean)

  return parts.join(' ').trim()
}

function buildReferenceInsertionHtml(reference) {
  if (!reference) return ''

  const referenceColor = String(reference.type || '').trim() === 'task'
    ? REFERENCE_INSERT_COLORS.task
    : (String(reference.type || '').trim() === 'derived' ? REFERENCE_INSERT_COLORS.derived : REFERENCE_INSERT_COLORS.data)
  const referenceHeader = `<strong>[${escapeHtml(reference.referenceCode)}]</strong>`
  const referenceContent = buildInlineReferenceContentHtml(reference.content)
  const body = referenceContent ? `${referenceHeader} ${referenceContent}` : referenceHeader
  return `<span style="color: ${referenceColor};">${body}</span>`
}

function buildReferenceMentionHtml(reference) {
  if (!reference) return ''
  const referenceColor = String(reference.type || '').trim() === 'task'
    ? REFERENCE_INSERT_COLORS.task
    : (String(reference.type || '').trim() === 'derived' ? REFERENCE_INSERT_COLORS.derived : REFERENCE_INSERT_COLORS.data)
  return `<span style="color: ${referenceColor}; white-space: nowrap;">&nbsp;<strong>[${escapeHtml(reference.referenceCode)}]</strong></span>`
}

function buildMathInlineHtml(latex) {
  const safeLatex = String(latex || '').trim()
  if (!safeLatex) return ''
  return `<span data-type="math-inline" data-latex="${escapeHtmlAttribute(safeLatex)}"></span>`
}

function buildTechniqueInputInlineHtml(input, fallbackHtml = '', fallbackText = '') {
  const html = buildInlineReferenceContentHtml(input?.html || fallbackHtml)
  if (html) return html
  return escapeHtml(input?.text || fallbackText || '')
}

function resolveTechniqueInputValue(options, inputIds = []) {
  const ids = Array.isArray(inputIds) ? inputIds : [inputIds]
  return ids
    .map((id) => options?.inputs?.[id] || null)
    .find((value) => value && (String(value.text || '').trim() || String(value.referenceId || '').trim() || String(value.html || '').trim()))
}

function interpolateTechniqueIntroTemplate(template, values = {}) {
  const rawTemplate = String(template || '').trim()
  if (!rawTemplate) return ''

  return rawTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => values[key] || '')
}

function resolveTechniqueExecutionIntro(executionResult, locale) {
  if (!executionResult || typeof executionResult !== 'object' || Array.isArray(executionResult)) return ''

  const htmlCandidate = locale === 'fr'
    ? executionResult.intro_html_fr || executionResult.introHtmlFr || executionResult.intro_html || executionResult.introHtml
    : executionResult.intro_html_es || executionResult.introHtmlEs || executionResult.intro_html || executionResult.introHtml

  const textCandidate = locale === 'fr'
    ? executionResult.intro_fr || executionResult.introFr || executionResult.intro
    : executionResult.intro_es || executionResult.introEs || executionResult.intro

  const safeHtml = buildInlineReferenceContentHtml(htmlCandidate)
  if (safeHtml) return `<p>${safeHtml}</p>`

  const safeText = String(textCandidate || '').trim()
  return safeText ? `<p>${escapeHtml(safeText)}</p>` : ''
}

function unwrapTechniqueExecutionResult(executionResult) {
  if (executionResult && typeof executionResult === 'object' && !Array.isArray(executionResult) && Object.prototype.hasOwnProperty.call(executionResult, 'result')) {
    return executionResult.result
  }

  return executionResult
}

function buildTechniqueApplicationIntroHtml({ locale, techniqueName, selectionHtml, selectionText, options, schemaDefinition, executionResult }) {
  const runtimeIntro = resolveTechniqueExecutionIntro(executionResult, locale)
  if (runtimeIntro) return runtimeIntro

  const safeName = escapeHtml(techniqueName || (locale === 'fr' ? 'la technique selectionnee' : 'la tecnica seleccionada'))
  const safeTarget = buildInlineReferenceContentHtml(selectionHtml) || escapeHtml(selectionText || '')
  const sourceInput = resolveTechniqueInputValue(options, ['source_reference', 'source_expression', 'replacement_reference', 'replacement_expression'])
  const targetInput = resolveTechniqueInputValue(options, ['target_reference', 'target_expression', 'destination_reference', 'destination_expression'])
  const customTemplate = locale === 'fr'
    ? schemaDefinition?.introTemplateFr || schemaDefinition?.introTemplate
    : schemaDefinition?.introTemplateEs || schemaDefinition?.introTemplate

  if (customTemplate) {
    const sourceHtml = buildTechniqueInputInlineHtml(sourceInput)
    const targetHtml = buildTechniqueInputInlineHtml(targetInput, selectionHtml, selectionText) || safeTarget
    const customHtml = interpolateTechniqueIntroTemplate(customTemplate, {
      technique: safeName,
      source: sourceHtml,
      target: targetHtml,
      selection: safeTarget,
    })
    if (customHtml) return `<p>${customHtml}</p>`
  }

  if (sourceInput && (targetInput || safeTarget)) {
    const sourceHtml = buildTechniqueInputInlineHtml(sourceInput)
    const targetHtml = targetInput ? buildTechniqueInputInlineHtml(targetInput, selectionHtml, selectionText) : safeTarget

    if (locale === 'fr') {
      return `<p>En remplacant ${sourceHtml}${targetHtml ? ` dans ${targetHtml}` : ''}, on obtient :</p>`
    }

    return `<p>Reemplazando ${sourceHtml}${targetHtml ? ` en ${targetHtml}` : ''} se obtiene:</p>`
  }

  if (locale === 'fr') {
    return `<p>En appliquant ${safeName}${safeTarget ? ` a ${safeTarget}` : ''}, on obtient :</p>`
  }

  return `<p>Aplicando ${safeName}${safeTarget ? ` a ${safeTarget}` : ''} se obtiene:</p>`
}

function buildTechniqueResultHtml(executionResult, locale = 'es') {
  const resolvedResult = unwrapTechniqueExecutionResult(executionResult)
  const renderedSteps = Array.isArray(executionResult?.steps)
    ? executionResult.steps
      .map((step) => {
        if (step && typeof step === 'object' && !Array.isArray(step)) {
          const htmlValue = String(
            locale === 'fr'
              ? (step.html_fr || step.htmlFr || step.html || '')
              : (step.html_es || step.htmlEs || step.html || '')
          ).trim()
          const textValue = String(
            locale === 'fr'
              ? (step.text_fr || step.textFr || step.text || '')
              : (step.text_es || step.textEs || step.text || '')
          ).trim()
          const latexValue = String(step.latex || '').trim()

          if (htmlValue) return `<p>${buildInlineReferenceContentHtml(htmlValue)}</p>`
          if (textValue && latexValue) return `<p>${escapeHtml(textValue)}</p><p>${buildMathInlineHtml(latexValue)}</p>`
          if (latexValue) return `<p>${buildMathInlineHtml(latexValue)}</p>`
          if (textValue) return `<p>${escapeHtml(textValue)}</p>`
        }

        const rawStep = String(step || '').trim()
        return rawStep ? `<p>${escapeHtml(rawStep)}</p>` : ''
      })
      .filter(Boolean)
      .join('')
    : ''

  if (resolvedResult && typeof resolvedResult === 'object' && !Array.isArray(resolvedResult)) {
    const latexValue = String(resolvedResult.latex || '').trim()
    if (latexValue) {
      return `${renderedSteps}<p>${buildMathInlineHtml(latexValue)}</p>`
    }

    const textValue = String(resolvedResult.text || '').trim()
    if (textValue) {
      return `${renderedSteps}<p>${escapeHtml(textValue)}</p>`
    }
  }

  if (Array.isArray(resolvedResult)) {
    return resolvedResult.length
      ? `${renderedSteps}<p>${escapeHtml(JSON.stringify(resolvedResult))}</p>`
      : (renderedSteps || '<p></p>')
  }

  const raw = String(resolvedResult || '').trim()
  if (raw) return `${renderedSteps}<p>${escapeHtml(raw)}</p>`
  return renderedSteps || '<p></p>'
}

function buildParagraphNodeFromText(text) {
  const safeText = String(text || '').trim()
  if (!safeText) return null
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: safeText }],
  }
}

function buildParagraphNodeFromLatex(latex) {
  const safeLatex = String(latex || '').trim()
  if (!safeLatex) return null
  return {
    type: 'paragraph',
    content: [{ type: 'mathInline', attrs: { latex: safeLatex } }],
  }
}

function buildParagraphNodeFromParts(parts, locale = 'es') {
  const safeParts = Array.isArray(parts) ? parts : []
  const content = safeParts.flatMap((part) => {
    if (part && typeof part === 'object' && !Array.isArray(part)) {
      const textValue = String(
        locale === 'fr'
          ? (part.text_fr || part.textFr || part.text || '')
          : (part.text_es || part.textEs || part.text || '')
      ).trim()
      const latexValue = String(part.latex || '').trim()
      const nodes = []
      if (textValue) nodes.push({ type: 'text', text: textValue })
      if (latexValue) nodes.push({ type: 'mathInline', attrs: { latex: latexValue } })
      return nodes
    }

    const rawText = String(part || '').trim()
    return rawText ? [{ type: 'text', text: rawText }] : []
  })

  if (!content.length) return null
  return {
    type: 'paragraph',
    content,
  }
}

function buildTechniqueInsertionNodes({ introHtml, executionResult, locale = 'es' }) {
  const nodes = []
  const introText = buildMathTextFromHtml(introHtml, extractTextFromHtml(introHtml || '')).trim()
  const introNode = buildParagraphNodeFromText(introText)
  if (introNode) nodes.push(introNode)

  const steps = Array.isArray(executionResult?.steps) ? executionResult.steps : []
  steps.forEach((step) => {
    if (step && typeof step === 'object' && !Array.isArray(step)) {
      const partsNode = buildParagraphNodeFromParts(step.parts, locale)
      if (partsNode) {
        nodes.push(partsNode)
        return
      }

      const htmlValue = String(
        locale === 'fr'
          ? (step.html_fr || step.htmlFr || step.html || '')
          : (step.html_es || step.htmlEs || step.html || '')
      ).trim()
      const textValue = String(
        locale === 'fr'
          ? (step.text_fr || step.textFr || step.text || '')
          : (step.text_es || step.textEs || step.text || '')
      ).trim()
      const latexValue = String(step.latex || '').trim()

      const htmlNode = buildParagraphNodeFromText(buildMathTextFromHtml(htmlValue, extractTextFromHtml(htmlValue)))
      if (htmlNode) nodes.push(htmlNode)

      const textNode = buildParagraphNodeFromText(textValue)
      if (textNode) nodes.push(textNode)

      const latexNode = buildParagraphNodeFromLatex(latexValue)
      if (latexNode) nodes.push(latexNode)
      return
    }

    const rawNode = buildParagraphNodeFromText(step)
    if (rawNode) nodes.push(rawNode)
  })

  const resolvedResult = unwrapTechniqueExecutionResult(executionResult)
  if (resolvedResult && typeof resolvedResult === 'object' && !Array.isArray(resolvedResult)) {
    const latexNode = buildParagraphNodeFromLatex(resolvedResult.latex)
    if (latexNode) nodes.push(latexNode)
    else {
      const textNode = buildParagraphNodeFromText(resolvedResult.text)
      if (textNode) nodes.push(textNode)
    }
    return nodes
  }

  if (Array.isArray(resolvedResult)) {
    const arrayNode = buildParagraphNodeFromText(JSON.stringify(resolvedResult))
    if (arrayNode) nodes.push(arrayNode)
    return nodes
  }

  const rawNode = buildParagraphNodeFromText(resolvedResult)
  if (rawNode) nodes.push(rawNode)
  return nodes
}

function findReferenceMentionInsertPosition(editor, referenceCode) {
  const safeReferenceCode = String(referenceCode || '').trim()
  if (!editor || !safeReferenceCode) return null

  const needle = `[${safeReferenceCode}]`
  let foundPosition = null

  editor.state.doc.descendants((node, pos) => {
    if (!node?.isText || foundPosition !== null) return true
    const text = String(node.text || '')
    const index = text.indexOf(needle)
    if (index === -1) return true

    const endPos = pos + index + needle.length
    try {
      const $pos = editor.state.doc.resolve(endPos)
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        if (!$pos.node(depth)?.isBlock) continue
        foundPosition = $pos.after(depth)
        break
      }
    } catch {
      foundPosition = endPos
    }

    return false
  })

  return foundPosition
}

function buildTechniqueSelectedText(selectionSnapshot) {

  const rawText = String(selectionSnapshot?.text || '').trim()
  const rawHtml = String(selectionSnapshot?.html || '').trim()
  if (!rawHtml) return rawText

  if (typeof document === 'undefined') return rawText

  const container = document.createElement('div')
  container.innerHTML = rawHtml

  const mathNodes = Array.from(container.querySelectorAll('span[data-type="math-inline"]'))
  mathNodes.forEach((node) => {
    const latex = String(node.getAttribute('data-latex') || '').trim()
    node.replaceWith(document.createTextNode(latex))
  })

  const htmlDerivedText = container.textContent.replace(/\s+/g, ' ').trim()
  return htmlDerivedText || rawText
}

function buildMathTextFromHtml(html, fallback = '') {
  const rawHtml = String(html || '').trim()
  if (!rawHtml) return String(fallback || '').trim()

  if (typeof document === 'undefined') return String(fallback || '').trim()

  const container = document.createElement('div')
  container.innerHTML = rawHtml

  const mathNodes = Array.from(container.querySelectorAll('span[data-type="math-inline"]'))
  mathNodes.forEach((node) => {
    const latex = String(node.getAttribute('data-latex') || '').trim()
    node.replaceWith(document.createTextNode(latex))
  })

  const derived = container.textContent.replace(/\s+/g, ' ').trim()
  return derived || String(fallback || '').trim()
}

function buildTechniqueApplicationStructureHtml(techniqueRow, language = 'es') {
  const translation = getTechniqueTranslation(techniqueRow, language)
  const preferred = String(translation.applicationStructure || translation.workedExample || '').trim()

  if (preferred) {
    return normalizeMathHtmlInput(preferred)
  }

  const safeName = escapeHtml(translation.name || (language === 'fr' ? 'la technique selectionnee' : 'la tecnica seleccionada'))
  return language === 'fr'
    ? `<p>En appliquant ${safeName}, on obtient <span data-type="math-inline" data-latex="\\ldots"></span>.</p>`
    : `<p>Aplicando ${safeName}, se obtiene <span data-type="math-inline" data-latex="\\ldots"></span>.</p>`
}

function parseTechniqueInputSchema(rawSchema) {
  const parsedSchema = rawSchema && typeof rawSchema === 'object'
    ? rawSchema
    : (() => {
        const raw = String(rawSchema || '').trim()
        if (!raw) return null
        try {
          return JSON.parse(raw)
        } catch {
          return null
        }
      })()

  if (!parsedSchema) {
    return {
      inputs: [],
      introTemplate: '',
      introTemplateEs: '',
      introTemplateFr: '',
    }
  }

  const inputs = Array.isArray(parsedSchema) ? parsedSchema : (Array.isArray(parsedSchema?.inputs) ? parsedSchema.inputs : [])
  return {
    inputs: inputs
      .map((item) => {
        const safe = item && typeof item === 'object' ? item : {}
        const id = String(safe.id || '').trim()
        if (!id) return null
        return {
          id,
          type: String(safe.type || 'text').trim() || 'text',
          labelEs: String(safe.labelEs || safe.label || id).trim(),
          labelFr: String(safe.labelFr || safe.label || id).trim(),
          placeholderEs: String(safe.placeholderEs || '').trim(),
          placeholderFr: String(safe.placeholderFr || '').trim(),
          required: Boolean(safe.required),
          allowManual: safe.allowManual !== false,
        }
      })
      .filter(Boolean),
    introTemplate: String(parsedSchema?.introTemplate || '').trim(),
    introTemplateEs: String(parsedSchema?.introTemplateEs || '').trim(),
    introTemplateFr: String(parsedSchema?.introTemplateFr || '').trim(),
  }
}

function resolveTechniqueExecutionConfig(techniqueRow, language = 'es') {
  const rawSympyTransformation = getTechniqueSympyTransformation(techniqueRow, language)
  const structuredSpec = getTechniqueStructuredSpec(techniqueRow)
  const structuredSympyTransformation = compileStructuredTechniqueSpecToSympy(structuredSpec)
  const structuredInputDefinition = buildStructuredTechniqueInputDefinition(structuredSpec)
  const legacyInputDefinition = parseTechniqueInputSchema(techniqueRow?.sympy_input_schema)

  return {
    rawSympyTransformation,
    structuredSpec,
    sympyTransformation: rawSympyTransformation || structuredSympyTransformation,
    inputDefinition: structuredInputDefinition || legacyInputDefinition,
    source: rawSympyTransformation ? 'raw_sympy' : (structuredSympyTransformation ? 'structured_spec' : 'none'),
  }
}

function buildSheetReferenceSections(referenceColumns) {
  const safe = referenceColumns && typeof referenceColumns === 'object' ? referenceColumns : {}
  const seedSections = SHEET_REFERENCE_SECTIONS.map((section) => ({
    ...section,
    items: section.sourceColumnIds.flatMap((columnId) => {
      const sourceItems = Array.isArray(safe[columnId]) ? safe[columnId] : []
      return sourceItems.map((item) => ({
        ...item,
        columnId,
      }))
    }),
  }))
  const derivedItems = Array.isArray(safe.derived)
    ? safe.derived.map((item) => ({
        ...item,
        columnId: 'derived',
      }))
    : []

  return derivedItems.length
    ? [
        ...seedSections,
        {
          id: 'derived',
          title: 'Referencias derivadas',
          sourceColumnIds: ['derived'],
          addColumnId: '',
          addLabel: '',
          emptyMessage: '',
          items: derivedItems,
        },
      ]
    : seedSections
}

function getReferenceColumnConfig(columnId) {
  return ALL_REFERENCE_COLUMNS.find((column) => column.id === columnId) || null
}

function getReferenceColumnIdByType(type) {
  if (type === 'condition') return 'conditions'
  if (type === 'clarification') return 'clarifications'
  if (type === 'task') return 'tasks'
  if (type === 'derived') return 'derived'
  return 'data'
}

function getExerciseTimestamp(value) {
  const raw = String(value?.updatedAt || value?.createdAt || '').trim()
  if (!raw) return 0
  const timestamp = Date.parse(raw)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getExerciseStructuredItemCount(exercise) {
  return (
    (Array.isArray(exercise?.dataItems) ? exercise.dataItems.length : 0)
    + (Array.isArray(exercise?.conditionItems) ? exercise.conditionItems.length : 0)
    + (Array.isArray(exercise?.clarificationItems) ? exercise.clarificationItems.length : 0)
    + (Array.isArray(exercise?.taskItems) ? exercise.taskItems.length : 0)
  )
}

function mergeExerciseSources(primaryExercise, fallbackExercise = null) {
  if (!primaryExercise?.id) return fallbackExercise || null
  if (!fallbackExercise?.id || fallbackExercise.id !== primaryExercise.id) return primaryExercise

  const primaryTimestamp = getExerciseTimestamp(primaryExercise)
  const fallbackTimestamp = getExerciseTimestamp(fallbackExercise)
  const preferredBase = primaryTimestamp >= fallbackTimestamp ? primaryExercise : fallbackExercise
  const secondaryBase = preferredBase === primaryExercise ? fallbackExercise : primaryExercise

  return {
    ...secondaryBase,
    ...preferredBase,
    statement: String(preferredBase.statement || secondaryBase.statement || '').trim(),
    officialResult: String(preferredBase.officialResult || secondaryBase.officialResult || '').trim(),
    antiproblem: String(preferredBase.antiproblem || secondaryBase.antiproblem || '').trim(),
    dataItems: Array.isArray(primaryExercise?.dataItems) && primaryExercise.dataItems.length
      ? primaryExercise.dataItems
      : (Array.isArray(fallbackExercise?.dataItems) ? fallbackExercise.dataItems : []),
    conditionItems: Array.isArray(primaryExercise?.conditionItems) && primaryExercise.conditionItems.length
      ? primaryExercise.conditionItems
      : (Array.isArray(fallbackExercise?.conditionItems) ? fallbackExercise.conditionItems : []),
    clarificationItems: Array.isArray(primaryExercise?.clarificationItems) && primaryExercise.clarificationItems.length
      ? primaryExercise.clarificationItems
      : (Array.isArray(fallbackExercise?.clarificationItems) ? fallbackExercise.clarificationItems : []),
    taskItems: Array.isArray(primaryExercise?.taskItems) && primaryExercise.taskItems.length
      ? primaryExercise.taskItems
      : (Array.isArray(fallbackExercise?.taskItems) ? fallbackExercise.taskItems : []),
  }
}

function resolvePreferredExercise(primaryExercise, fallbackExercise = null) {
  if (!primaryExercise?.id) return fallbackExercise || null
  if (!fallbackExercise?.id || fallbackExercise.id !== primaryExercise.id) return primaryExercise

  const merged = mergeExerciseSources(primaryExercise, fallbackExercise)
  const mergedStructuredCount = getExerciseStructuredItemCount(merged)
  if (mergedStructuredCount > 0) return merged

  const primaryTimestamp = getExerciseTimestamp(primaryExercise)
  const fallbackTimestamp = getExerciseTimestamp(fallbackExercise)
  if (primaryTimestamp !== fallbackTimestamp) {
    return primaryTimestamp >= fallbackTimestamp ? primaryExercise : fallbackExercise
  }

  const primaryStructuredCount = getExerciseStructuredItemCount(primaryExercise)
  const fallbackStructuredCount = getExerciseStructuredItemCount(fallbackExercise)
  if (primaryStructuredCount !== fallbackStructuredCount) {
    return primaryStructuredCount >= fallbackStructuredCount ? primaryExercise : fallbackExercise
  }

  const primaryStatementLength = String(primaryExercise.statement || '').trim().length
  const fallbackStatementLength = String(fallbackExercise.statement || '').trim().length
  return primaryStatementLength >= fallbackStatementLength ? primaryExercise : fallbackExercise
}

function reconcileCollaborativeExercise(localExercise, remoteExercise = null) {
  if (!localExercise?.id) {
    return remoteExercise?.id ? remoteExercise : (localExercise || null)
  }

  if (!remoteExercise || typeof remoteExercise !== 'object') {
    return localExercise
  }

  return {
    ...localExercise,
    ...remoteExercise,
    id: localExercise.id,
    createdAt: localExercise.createdAt || remoteExercise.createdAt,
  }
}

function resolveNotebookState(exercise, workspaceRow = null) {
  if (!exercise?.id) return null

  const remoteNotebook = normalizeStoredWhiteboardNotebook(exercise.id, workspaceRow?.notebook_state)
  if (remoteNotebook) return remoteNotebook

  const localNotebook = getStoredWhiteboardNotebook(exercise.id)
  if (localNotebook) return localNotebook

  return buildWhiteboardNotebookFromExercise(exercise)
}

function getNotebookTimestamp(value) {
  const raw = String(value?.updatedAt || value?.createdAt || '').trim()
  if (!raw) return 0
  const timestamp = Date.parse(raw)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function shouldApplyIncomingNotebook(currentNotebook, incomingNotebook) {
  if (!incomingNotebook) return false
  if (!currentNotebook) return true

  const currentTimestamp = getNotebookTimestamp(currentNotebook)
  const incomingTimestamp = getNotebookTimestamp(incomingNotebook)

  return incomingTimestamp >= currentTimestamp
}

function buildWorkspaceSeedFromExercise(exercise) {
  const localStoredWorkspace = getStoredWorkspace(exercise?.id)
  const nodes = localStoredWorkspace?.nodes?.length
    ? localStoredWorkspace.nodes
    : generateWorkspaceFromExercise(exercise)
  const links = localStoredWorkspace?.links?.length
    ? localStoredWorkspace.links
    : generateWorkspaceLinksFromExercise(nodes)

  return { nodes, links }
}

export default function WhiteboardNotebook({
  onBackToWhiteboard,
  session,
  syncMode = 'whiteboard',
  allowExercisePicker = true,
}) {
  const isNotebookLibraryMode = !allowExercisePicker
  const usesWhiteboardSync = syncMode === 'whiteboard'
  const usesNotebookCollabSync = syncMode === 'notebook-page'
  const isRemoteSyncEnabled = usesWhiteboardSync || usesNotebookCollabSync
  const [exercises, setExercises] = useState(() => listWhiteboardExercises())
  const [exerciseId, setExerciseId] = useState(() => getActiveWhiteboardExerciseId() || '')
  const [workspaceId, setWorkspaceId] = useState(() => getActiveWhiteboardWorkspaceId() || '')
  const [collabPageId, setCollabPageId] = useState(() => getActiveNotebookCollabPageId() || '')
  const [activeNotebookBookId, setActiveNotebookBookIdState] = useState(() => getActiveNotebookBookId() || '')
  const [activeNotebookPageId, setActiveNotebookPageIdState] = useState(() => getActiveNotebookPageId() || '')
  const [selectedSidebarExerciseId, setSelectedSidebarExerciseId] = useState('')
  const [notebookBook, setNotebookBook] = useState(null)
  const [notebookBookDraft, setNotebookBookDraft] = useState({ title: '', description: '' })
  const [notebook, setNotebook] = useState(null)
  const [activeSidebarTab, setActiveSidebarTab] = useState('exercise')
  const [notebookEditorDraftHtml, setNotebookEditorDraftHtml] = useState('<p></p>')
  const [isNotebookEditorFocused, setIsNotebookEditorFocused] = useState(false)
  const [emptyNotebookSolutionHtml, setEmptyNotebookSolutionHtml] = useState('<p></p>')
  const [loadedWorkspace, setLoadedWorkspace] = useState(null)
  const [techniques, setTechniques] = useState([])
  const [techniquesError, setTechniquesError] = useState('')
  const [techniqueLanguage, setTechniqueLanguage] = useState('es')
  const [solutionSelectionSnapshot, setSolutionSelectionSnapshot] = useState({ text: '', html: '', isEmpty: true, from: null, to: null, blockInsertPosition: null })
  const [techniqueAssistant, setTechniqueAssistant] = useState(null)
  const [modalTechniqueId, setModalTechniqueId] = useState('')
  const [techniqueApplying, setTechniqueApplying] = useState(false)
  const [notebookLoading, setNotebookLoading] = useState(true)
  const [collaborationStatus, setCollaborationStatus] = useState('')
  const [collaborationError, setCollaborationError] = useState('')
  const [collaborators, setCollaborators] = useState([])
  const [notice, setNotice] = useState('')
  const [referenceMenu, setReferenceMenu] = useState(buildReferenceMenuState)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => !isNotebookLibraryMode)
  const [isReferenceDockCollapsed, setIsReferenceDockCollapsed] = useState(true)
  const bothSidePanelsCollapsed = isSidebarCollapsed && isReferenceDockCollapsed
  const hasExpandedSidePanel = !bothSidePanelsCollapsed

  const realtimeChannelRef = useRef(null)
  const referenceMenuRef = useRef(null)
  const realtimeClientIdRef = useRef(buildRealtimeClientId())
  const currentNotebookSignatureRef = useRef('')
  const remoteAppliedSignatureRef = useRef('')
  const lastBroadcastSignatureRef = useRef('')
  const importFileRef = useRef(null)
  const libraryImportFileRef = useRef(null)
  const selectedExerciseRef = useRef(null)
  const notebookRef = useRef(null)
  const focusAreaRef = useRef('browsing')
  const bootstrapRequestIdRef = useRef(0)
  const activeWorkspaceIdRef = useRef(workspaceId)
  const activeCollabPageIdRef = useRef(collabPageId)
  const suppressNotebookEditorChangeRef = useRef(false)
  const pendingNotebookProgrammaticHtmlRef = useRef('')
  const notebookProgrammaticReleaseTimeoutRef = useRef(null)
  const pendingNotebookLocaleRef = useRef('')
  const pendingNotebookLocaleDeadlineRef = useRef(0)
  const solutionEditorRef = useRef(null)

  useEffect(() => {
    setExercises(listWhiteboardExercises())
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadTechniques() {
      if (!session?.userId) {
        setTechniques([])
        setTechniquesError('')
        return
      }

      try {
        const rows = await listPrivateCompetitiveTechniqueInventory(session.userId)
        if (cancelled) return
        setTechniques(Array.isArray(rows) ? rows : [])
        setTechniquesError('')
      } catch (error) {
        if (cancelled) return
        setTechniques([])
        setTechniquesError(error?.message || 'Could not load techniques.')
      }
    }

    loadTechniques()
    return () => {
      cancelled = true
    }
  }, [session?.userId])

  const selectedExercise = useMemo(
    () => exercises.find((item) => item.id === exerciseId) || null,
    [exercises, exerciseId]
  )
  const activeNotebookPage = useMemo(
    () => notebookBook?.pages?.find((page) => page.id === activeNotebookPageId) || null,
    [activeNotebookPageId, notebookBook]
  )

  const ensureNotebookBookUsable = useCallback((book) => {
    if (!isNotebookLibraryMode || !session?.userId || !book?.id) return book

    let mutated = false
    const currentPages = Array.isArray(book.pages) ? book.pages : []

    currentPages.forEach((page, index) => {
      const linkedExerciseId = String(page?.linkedExerciseId || '').trim()
      const linkedExercise = linkedExerciseId
        ? listWhiteboardExercises().find((item) => item.id === linkedExerciseId) || null
        : null

      if (linkedExercise) return

      const repairedExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        title: String(page?.title || buildNotebookPageTitleFromExercise(null, {
          kind: page?.kind || 'sheet',
          pageIndex: index,
        })).trim() || buildNotebookPageTitleFromExercise(null, {
          kind: page?.kind || 'sheet',
          pageIndex: index,
        }),
        topic: book.title || '',
      })
      updateNotebookPage(session.userId, book.id, page.id, {
        linkedExerciseId: repairedExercise.id,
        exerciseOwnership: 'managed',
      })
      mutated = true
    })

    if (!mutated) return book
    return getNotebookBookById(book.id, session.userId) || book
  }, [isNotebookLibraryMode, session?.userId])

  const refreshNotebookBook = useCallback(() => {
    if (!isNotebookLibraryMode || !session?.userId) {
      setNotebookBook(null)
      return null
    }

    const nextBookId = getActiveNotebookBookId() || activeNotebookBookId || ''
    setActiveNotebookBookIdState(nextBookId)
    const baseBook = nextBookId ? (getNotebookBookById(nextBookId, session.userId) || null) : null
    const nextBook = ensureNotebookBookUsable(baseBook)
    if (!nextBook) {
      setNotebookBook(null)
      setNotebook(null)
      setLoadedWorkspace(null)
      setActiveNotebookPageIdState('')
      setActiveNotebookPageId('')
      setActiveNotebookCollabPageId('')
      setCollabPageId('')
      setActiveWhiteboardExerciseId('')
      setExerciseId('')
      setActiveWhiteboardWorkspaceId('')
      setWorkspaceId('')
      selectedExerciseRef.current = null
      return null
    }
    setNotebookBook(nextBook)
    return nextBook
  }, [activeNotebookBookId, ensureNotebookBookUsable, isNotebookLibraryMode, session?.userId])

  useEffect(() => {
    selectedExerciseRef.current = selectedExercise
  }, [selectedExercise])

  useEffect(() => {
    setNotebookBookDraft({
      title: notebookBook?.title || '',
      description: notebookBook?.description || '',
    })
  }, [notebookBook?.description, notebookBook?.title])

  useEffect(() => {
    refreshNotebookBook()
  }, [refreshNotebookBook])

  useEffect(() => {
    notebookRef.current = notebook
    currentNotebookSignatureRef.current = serializeNotebook(notebook)
  }, [notebook])

  useEffect(() => {
    activeCollabPageIdRef.current = collabPageId
  }, [collabPageId])

  useEffect(() => {
    return () => {
      if (notebookProgrammaticReleaseTimeoutRef.current) {
        window.clearTimeout(notebookProgrammaticReleaseTimeoutRef.current)
        notebookProgrammaticReleaseTimeoutRef.current = null
      }
    }
  }, [])

  const markFocusArea = useCallback((nextFocusArea) => {
    focusAreaRef.current = String(nextFocusArea || 'browsing').trim() || 'browsing'
  }, [])

  const handleNotebookPageChange = useCallback((pageId) => {
    if (!isNotebookLibraryMode) return

    const nextBook = refreshNotebookBook()
    const nextPage = nextBook?.pages?.find((page) => page.id === pageId) || null
    const previousChannel = realtimeChannelRef.current

    if (previousChannel) {
      realtimeChannelRef.current = null
      closeRealtimeChannel(previousChannel)
    }

    setNotice('')
    setReferenceMenu(buildReferenceMenuState())
    setCollaborationError('')
    setCollaborators([])
    markFocusArea('page_navigator')
    bootstrapRequestIdRef.current += 1

    setActiveNotebookPageIdState(nextPage?.id || '')
    setActiveNotebookPageId(nextPage?.id || '')
    setActiveNotebookCollabPageId(nextPage?.collabPageId || '')
    setCollabPageId(nextPage?.collabPageId || '')
    setActiveWhiteboardExerciseId(nextPage?.linkedExerciseId || '')
    setExerciseId(nextPage?.linkedExerciseId || '')
    setActiveWhiteboardWorkspaceId('')
    setWorkspaceId('')
    setNotebookLoading(Boolean(nextPage?.linkedExerciseId))
  }, [isNotebookLibraryMode, markFocusArea, refreshNotebookBook])

  useEffect(() => {
    if (!isNotebookLibraryMode) return

    const storedPageId = getActiveNotebookPageId() || ''
    if (storedPageId && storedPageId !== activeNotebookPageId) {
      setActiveNotebookPageIdState(storedPageId)
      return
    }

    if (!notebookBook || !Array.isArray(notebookBook.pages)) return
    if (activeNotebookPageId && notebookBook.pages.some((page) => page.id === activeNotebookPageId)) return

    const firstPage = notebookBook.pages[0] || null
    setActiveNotebookPageIdState(firstPage?.id || '')
    setActiveNotebookPageId(firstPage?.id || '')
  }, [activeNotebookPageId, isNotebookLibraryMode, notebookBook])

  useEffect(() => {
    if (!isNotebookLibraryMode) return

    if (!activeNotebookPage || !selectedExercise || !notebook) {
      setIsSidebarCollapsed(false)
    }
  }, [activeNotebookPage, isNotebookLibraryMode, notebook, selectedExercise])

  useEffect(() => {
    if (!isNotebookLibraryMode) return

    if (!activeNotebookPage) {
      if (!exerciseId && !collabPageId) return
      setExerciseId('')
      setCollabPageId('')
      setActiveWhiteboardExerciseId('')
      setActiveNotebookCollabPageId('')
      return
    }

    const nextExerciseId = String(activeNotebookPage.linkedExerciseId || '').trim()
    const nextCollabPageId = String(activeNotebookPage.collabPageId || '').trim()
    if (nextExerciseId === exerciseId && nextCollabPageId === collabPageId) return

    handleNotebookPageChange(activeNotebookPage.id)
  }, [activeNotebookPage, collabPageId, exerciseId, handleNotebookPageChange, isNotebookLibraryMode])

  useEffect(() => {
    if (!referenceMenu.open) return undefined

    const handlePointerDown = (event) => {
      if (referenceMenuRef.current?.contains(event.target)) return
      setReferenceMenu(buildReferenceMenuState())
    }

    const handleWindowScroll = () => {
      setReferenceMenu(buildReferenceMenuState())
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', handleWindowScroll, true)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', handleWindowScroll, true)
    }
  }, [referenceMenu.open])

  useEffect(() => {
    if (!referenceMenu.open) return undefined

    const syncMenuPosition = () => {
      const nextPosition = clampFloatingMenuPosition(
        referenceMenu.x,
        referenceMenu.y,
        referenceMenuRef.current,
      )

      setReferenceMenu((prev) => {
        if (!prev.open) return prev
        if (prev.x === nextPosition.x && prev.y === nextPosition.y) return prev
        return {
          ...prev,
          x: nextPosition.x,
          y: nextPosition.y,
        }
      })
    }

    const frameId = window.requestAnimationFrame(syncMenuPosition)
    window.addEventListener('resize', syncMenuPosition)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', syncMenuPosition)
    }
  }, [referenceMenu.open, referenceMenu.x, referenceMenu.y])

  const applyNotebookState = useCallback((nextNotebook, options = {}) => {
    const normalized = nextNotebook?.exerciseId
      ? normalizeStoredWhiteboardNotebook(nextNotebook.exerciseId, nextNotebook)
      : null
    const seededNotebook = normalized
      ? {
          ...normalized,
          solutionHtml: ensureWhiteboardNotebookSeededDocumentHtml(normalized, normalized.solutionHtml, 'es'),
          solutionHtmlFr: ensureWhiteboardNotebookSeededDocumentHtml(
            normalized,
            getWhiteboardNotebookLocalizedSolutionHtml(normalized, 'fr'),
            'fr'
          ),
        }
      : null
    const signature = serializeNotebook(seededNotebook)

    setNotebook(seededNotebook)
    currentNotebookSignatureRef.current = signature
    remoteAppliedSignatureRef.current = signature
    lastBroadcastSignatureRef.current = signature
    notebookRef.current = seededNotebook

    if (seededNotebook?.exerciseId) {
      saveWhiteboardNotebook(seededNotebook.exerciseId, seededNotebook)
    }

    if (Object.prototype.hasOwnProperty.call(options, 'exercise')) {
      const nextExerciseId = options.exercise?.id || ''
      setExerciseId(nextExerciseId)
      setActiveWhiteboardExerciseId(nextExerciseId)
      selectedExerciseRef.current = options.exercise || null
    }

    if (options.workspaceId !== undefined) {
      setWorkspaceId(options.workspaceId || '')
      setActiveWhiteboardWorkspaceId(options.workspaceId || '')
      activeWorkspaceIdRef.current = options.workspaceId || ''
    }

    if (Object.prototype.hasOwnProperty.call(options, 'collabPageId')) {
      setCollabPageId(options.collabPageId || '')
      setActiveNotebookCollabPageId(options.collabPageId || '')
      activeCollabPageIdRef.current = options.collabPageId || ''
    }

    if (Object.prototype.hasOwnProperty.call(options, 'workspaceRow')) {
      setLoadedWorkspace(options.workspaceRow || null)
    }
  }, [])

  const loadLocalNotebook = useCallback((exercise) => {
    if (!exercise?.id) {
      applyNotebookState(null, { exercise: null, workspaceId: '', collabPageId: '', workspaceRow: null })
      setNotebookLoading(false)
      return
    }

    const localNotebook = getStoredWhiteboardNotebook(exercise.id) || resetWhiteboardNotebook(exercise)
    applyNotebookState(localNotebook, { exercise, workspaceId: '', collabPageId: '', workspaceRow: null })
    setCollaborationStatus(
      isRemoteSyncEnabled
        ? 'Modo local. Inicia sesion para sincronizar este cuaderno.'
        : 'Modo cuaderno. Esta hoja se gestiona desde tu biblioteca personal.'
    )
    setCollaborationError('')
    setNotebookLoading(false)
  }, [applyNotebookState, isRemoteSyncEnabled])

  const loadRemoteNotebook = useCallback(async (targetWorkspaceId, exerciseOverride = null, requestId = 0) => {
    const remoteWorkspace = await getWhiteboardWorkspaceById(targetWorkspaceId)
    if (!remoteWorkspace) {
      throw new Error('No se encontro el cuaderno colaborativo solicitado.')
    }

    const snapshot = remoteWorkspace.exercise_snapshot && typeof remoteWorkspace.exercise_snapshot === 'object'
      ? remoteWorkspace.exercise_snapshot
      : exerciseOverride
    const fallbackExercise = exercises.find((item) => item.id === remoteWorkspace.exercise_local_id) || null
    const nextExercise = resolvePreferredExercise(exerciseOverride || fallbackExercise, snapshot || fallbackExercise)

    if (!nextExercise?.id) {
      throw new Error('El cuaderno colaborativo no tiene un ejercicio base reconocido.')
    }

    if (requestId && bootstrapRequestIdRef.current !== requestId) {
      return false
    }

    const resolvedNotebook = resolveNotebookState(nextExercise, remoteWorkspace)
    applyNotebookState(resolvedNotebook, {
      exercise: nextExercise,
      workspaceId: remoteWorkspace.id,
      collabPageId: '',
      workspaceRow: remoteWorkspace,
    })
    setCollaborationStatus(COLLABORATION_READY_MESSAGE)
    setCollaborationError('')
    setNotebookLoading(false)
    return true
  }, [applyNotebookState, exercises])

  const loadRemoteCollaborativePage = useCallback(async (targetCollabPageId, exerciseOverride = null, requestId = 0) => {
    const remotePage = await getNotebookCollabPageById(targetCollabPageId)
    if (!remotePage) {
      throw new Error('No se encontro la hoja colaborativa solicitada.')
    }

    const snapshot = remotePage.exercise_snapshot && typeof remotePage.exercise_snapshot === 'object'
      ? remotePage.exercise_snapshot
      : exerciseOverride
    const fallbackExercise = exercises.find((item) => item.id === exerciseOverride?.id) || null
    const nextExercise = resolvePreferredExercise(exerciseOverride || fallbackExercise, snapshot || fallbackExercise)

    if (!nextExercise?.id) {
      throw new Error('La hoja colaborativa no tiene un ejercicio base reconocido.')
    }

    if (requestId && bootstrapRequestIdRef.current !== requestId) {
      return false
    }

    const resolvedNotebook = normalizeStoredWhiteboardNotebook(nextExercise.id, remotePage.notebook_state)
      || buildWhiteboardNotebookFromExercise(nextExercise)

    applyNotebookState(resolvedNotebook, {
      exercise: nextExercise,
      workspaceId: '',
      collabPageId: remotePage.id,
      workspaceRow: null,
    })
    setCollaborationStatus('Hoja colaborativa activa por codigo.')
    setCollaborationError('')
    setNotebookLoading(false)
    return true
  }, [applyNotebookState, exercises])

  const ensureRemoteWorkspaceForExercise = useCallback(async (exercise, requestId = 0) => {
    const workspaceSeed = buildWorkspaceSeedFromExercise(exercise)
    const notebookSeed = getStoredWhiteboardNotebook(exercise.id) || buildWhiteboardNotebookFromExercise(exercise)
    const remoteWorkspace = await ensureRootWhiteboardWorkspace({
      ownerUserId: session.userId,
      visibility: 'public',
      exerciseLocalId: exercise.id,
      exerciseTitle: exercise.title || 'Whiteboard Notebook',
      exerciseSnapshot: exercise,
      notebookState: notebookSeed,
      nodes: workspaceSeed.nodes,
      links: workspaceSeed.links,
      lastEditorUserId: session.userId,
    })

    if (requestId && bootstrapRequestIdRef.current !== requestId) {
      return false
    }

    const resolvedNotebook = resolveNotebookState(exercise, remoteWorkspace)
    applyNotebookState(resolvedNotebook, {
      exercise,
      workspaceId: remoteWorkspace.id,
      collabPageId: '',
      workspaceRow: remoteWorkspace,
    })
    setCollaborationStatus(COLLABORATION_READY_MESSAGE)
    setCollaborationError('')
    setNotebookLoading(false)
    return true
  }, [applyNotebookState, session?.userId])

  useEffect(() => {
    let cancelled = false

    async function bootstrapNotebook() {
      const requestId = bootstrapRequestIdRef.current + 1
      bootstrapRequestIdRef.current = requestId
      setNotebookLoading((prev) => (notebookRef.current ? prev : true))
      setCollaborationError('')
      setExercises(listWhiteboardExercises())

      const nextExerciseId = getActiveWhiteboardExerciseId() || exerciseId || ''
      const localExercises = listWhiteboardExercises()
      const nextExercise = localExercises.find((item) => item.id === nextExerciseId) || null
      const nextWorkspaceId = getActiveWhiteboardWorkspaceId() || workspaceId || ''

      try {
        if (!nextExercise) {
          if (requestId === bootstrapRequestIdRef.current) {
            applyNotebookState(null, { exercise: null, workspaceId: nextWorkspaceId, collabPageId: '', workspaceRow: null })
          }
          if (!cancelled) setNotebookLoading(false)
          return
        }

        if (!isRemoteSyncEnabled) {
          if (requestId === bootstrapRequestIdRef.current) {
            loadLocalNotebook(nextExercise)
          }
          return
        }

        if (usesNotebookCollabSync) {
          const nextCollabPageId = getActiveNotebookCollabPageId() || collabPageId || ''
          if (session?.userId && nextCollabPageId) {
            await loadRemoteCollaborativePage(nextCollabPageId, nextExercise, requestId)
            return
          }
          if (requestId === bootstrapRequestIdRef.current) {
            loadLocalNotebook(nextExercise)
          }
          return
        }

        if (session?.userId && nextWorkspaceId) {
          await loadRemoteNotebook(nextWorkspaceId, nextExercise, requestId)
          return
        }

        if (session?.userId) {
          await ensureRemoteWorkspaceForExercise(nextExercise, requestId)
          return
        }

        if (requestId === bootstrapRequestIdRef.current) {
          loadLocalNotebook(nextExercise)
        }
      } catch (error) {
        if (cancelled) return
        setCollaborationError(error?.message || 'No se pudo sincronizar el cuaderno colaborativo.')
        if (requestId === bootstrapRequestIdRef.current) {
          loadLocalNotebook(nextExercise)
        }
      } finally {
        if (!cancelled) setNotebookLoading(false)
      }
    }

    bootstrapNotebook()
    return () => {
      cancelled = true
    }
  }, [applyNotebookState, collabPageId, ensureRemoteWorkspaceForExercise, exerciseId, isRemoteSyncEnabled, loadLocalNotebook, loadRemoteCollaborativePage, loadRemoteNotebook, session?.userId, usesNotebookCollabSync, workspaceId])

  const updateNotebook = useCallback((updater) => {
    setNotebook((prev) => {
      if (!prev) return prev
      const nextPatch = typeof updater === 'function' ? updater(prev) : updater
      return {
        ...prev,
        ...nextPatch,
        updatedAt: new Date().toISOString(),
      }
    })
  }, [])

  const releaseNotebookProgrammaticEditorLock = useCallback((appliedHtml = '') => {
    if (!suppressNotebookEditorChangeRef.current) return

    const settledHtml = String(appliedHtml || '')
    if (settledHtml && settledHtml !== pendingNotebookProgrammaticHtmlRef.current) {
      pendingNotebookProgrammaticHtmlRef.current = settledHtml
    }

    if (notebookProgrammaticReleaseTimeoutRef.current) {
      window.clearTimeout(notebookProgrammaticReleaseTimeoutRef.current)
    }

    const remainingTransitionMs = Math.max(0, pendingNotebookLocaleDeadlineRef.current - Date.now())
    const releaseDelay = Math.max(220, Math.min(remainingTransitionMs, 1400))
    notebookProgrammaticReleaseTimeoutRef.current = window.setTimeout(() => {
      suppressNotebookEditorChangeRef.current = false
      pendingNotebookProgrammaticHtmlRef.current = ''
      notebookProgrammaticReleaseTimeoutRef.current = null
    }, releaseDelay)
  }, [])

  const clearNotebookProgrammaticEditorLock = useCallback(() => {
    if (notebookProgrammaticReleaseTimeoutRef.current) {
      window.clearTimeout(notebookProgrammaticReleaseTimeoutRef.current)
      notebookProgrammaticReleaseTimeoutRef.current = null
    }
    suppressNotebookEditorChangeRef.current = false
    pendingNotebookProgrammaticHtmlRef.current = ''
  }, [])

  const isNotebookLocaleTransitionPending = useCallback(() => {
    const pendingLocale = pendingNotebookLocaleRef.current
    const deadline = pendingNotebookLocaleDeadlineRef.current
    if (!pendingLocale || !deadline) return false

    if (Date.now() > deadline) {
      pendingNotebookLocaleRef.current = ''
      pendingNotebookLocaleDeadlineRef.current = 0
      return false
    }

    return true
  }, [])

  const shouldIgnoreIncomingNotebookLocale = useCallback((incomingNotebook) => {
    if (!incomingNotebook) return false
    return isNotebookLocaleTransitionPending()
  }, [isNotebookLocaleTransitionPending])

  const reseedNotebookDocument = useCallback((draftNotebook, locale = draftNotebook?.locale || 'es') => {
    if (!draftNotebook) return '<p></p>'
    const nextLocale = normalizeNotebookLocale(locale)
    const localizedSolutionHtml = getWhiteboardNotebookLocalizedSolutionHtml(draftNotebook, nextLocale)
    return ensureWhiteboardNotebookSeededDocumentHtml(
      {
        ...draftNotebook,
        locale: nextLocale,
      },
      localizedSolutionHtml,
      nextLocale
    )
  }, [])

  const getNotebookSolutionField = useCallback((locale = 'es') => (
    normalizeNotebookLocale(locale) === 'fr' ? 'solutionHtmlFr' : 'solutionHtml'
  ), [])

  const buildNotebookSeededSolutionsPatch = useCallback((draftNotebook) => ({
    solutionHtml: reseedNotebookDocument(draftNotebook, 'es'),
    solutionHtmlFr: reseedNotebookDocument(draftNotebook, 'fr'),
  }), [reseedNotebookDocument])

  const notebookObjects = useMemo(
    () => flattenNotebookObjects(notebook?.referenceColumns),
    [notebook?.referenceColumns]
  )

  const notebookLocale = normalizeNotebookLocale(techniqueLanguage)
  const canShowShareSidebarTab = Boolean(isNotebookLibraryMode && activeNotebookPage && selectedExercise && notebook && session?.userId)
  const sidebarExerciseTabLabel = notebookLocale === 'fr' ? 'Exercice' : 'Ejercicio'
  const sidebarShareTabLabel = notebookLocale === 'fr' ? 'Partager' : 'Compartir'
  const activeSidebarTabLabel = activeSidebarTab === 'share' ? sidebarShareTabLabel : sidebarExerciseTabLabel
  const notebookEditorResetKey = [
    activeNotebookPage?.id || notebook?.exerciseId || 'notebook',
    notebookLocale,
  ].join(':')
  const notebookRenderedSolutionHtml = useMemo(() => {
    if (!notebook) return '<p></p>'
    return getWhiteboardNotebookLocalizedSolutionHtml(notebook, notebookLocale)
      || reseedNotebookDocument(
        {
          ...notebook,
          locale: notebookLocale,
        },
        notebookLocale
      )
  }, [notebook, notebookLocale, reseedNotebookDocument])

  const lastNotebookEditorResetKeyRef = useRef(notebookEditorResetKey)

  useEffect(() => {
    const nextHtml = String(notebookRenderedSolutionHtml || '<p></p>')
    const didResetChange = lastNotebookEditorResetKeyRef.current !== notebookEditorResetKey
    lastNotebookEditorResetKeyRef.current = notebookEditorResetKey

    setNotebookEditorDraftHtml((prev) => {
      if (!didResetChange && isNotebookEditorFocused) {
        return prev || nextHtml
      }
      return nextHtml
    })

    if (didResetChange) {
      setIsNotebookEditorFocused(false)
    }
  }, [isNotebookEditorFocused, notebookEditorResetKey, notebookRenderedSolutionHtml])

  useEffect(() => {
    if (canShowShareSidebarTab) return
    setActiveSidebarTab('exercise')
  }, [canShowShareSidebarTab])

  const activeReference = useMemo(
    () => notebookObjects.find((item) => item.id === notebook?.activeReferenceId) || null,
    [notebook?.activeReferenceId, notebookObjects]
  )

  const replacementReference = useMemo(
    () => notebookObjects.find((item) => item.id === notebook?.techniqueOptions?.replacementReferenceId) || null,
    [notebook?.techniqueOptions?.replacementReferenceId, notebookObjects]
  )

  const linkedTechnique = useMemo(
    () => techniques.find((item) => item.id === notebook?.linkedTechniqueId) || null,
    [techniques, notebook?.linkedTechniqueId]
  )

  const describeTechniqueRecord = useCallback(async (techniqueRow, language = techniqueLanguage) => {
    const resolvedExecution = resolveTechniqueExecutionConfig(techniqueRow, language)
    const sympyTransformation = resolvedExecution.sympyTransformation
    const fallbackInputDefinition = resolvedExecution.inputDefinition

    if (!sympyTransformation) {
      return {
        sympyTransformation: '',
        inputDefinition: fallbackInputDefinition,
        error: language === 'fr'
          ? 'La version choisie de cette technique nÃ¢â‚¬â„¢a pas encore de code SymPy.'
          : 'La version elegida de esta tecnica todavia no tiene codigo SymPy.',
      }
    }

    if (resolvedExecution.source === 'structured_spec') {
      return {
        sympyTransformation,
        inputDefinition: fallbackInputDefinition,
        behavior: null,
      }
    }

    if (!session?.userId) {
      return {
        sympyTransformation,
        inputDefinition: fallbackInputDefinition,
        behavior: null,
      }
    }

    try {
      const response = await describeWhiteboardNotebookTechnique({
        locale: language,
        selectedText: '',
        selectedHtml: '',
        technique: {
          id: techniqueRow?.id || '',
          name: getTechniqueTranslation(techniqueRow, language).name || 'tecnica',
          sympyTransformation,
        },
        options: {},
      })

      const behavior = response?.behavior && typeof response.behavior === 'object' ? response.behavior : null
      return {
        sympyTransformation,
        behavior,
        inputDefinition: parseTechniqueInputSchema(
          behavior?.input_schema
          || behavior?.inputSchema
          || (behavior && Object.keys(behavior).length ? behavior : null)
          || fallbackInputDefinition
        ),
      }
    } catch (error) {
      return {
        sympyTransformation,
        behavior: null,
        inputDefinition: fallbackInputDefinition,
        error: error?.message || 'No se pudo describir la tecnica SymPy. Reinicia el backend para habilitar describe-technique.',
      }
    }
  }, [session?.userId, techniqueLanguage])

  const buildTechniqueSchemaInputsPayload = useCallback((inputDefinition, inputValues, selectionSnapshot) => {
    const inputs = Array.isArray(inputDefinition?.inputs) ? inputDefinition.inputs : []
    return inputs.reduce((acc, input) => {
      const currentValue = inputValues?.[input.id] || { text: '', referenceId: '' }
      const reference = notebookObjects.find((item) => item.id === currentValue.referenceId) || null
      const fallbackSelectionText = input.type === 'reference_or_selection' && selectionSnapshot && !selectionSnapshot.isEmpty
        ? buildTechniqueSelectedText(selectionSnapshot)
        : ''
      const fallbackSelectionHtml = input.type === 'reference_or_selection' && selectionSnapshot && !selectionSnapshot.isEmpty
        ? String(selectionSnapshot.html || '')
        : ''
      const textValue = reference
        ? buildMathTextFromHtml(reference.content, currentValue.text || '')
        : String(currentValue.text || fallbackSelectionText).trim()

      acc[input.id] = {
        type: input.type,
        text: textValue,
        referenceId: reference?.id || '',
        referenceCode: reference?.referenceCode || '',
        html: reference?.content || fallbackSelectionHtml,
      }
      return acc
    }, {})
  }, [notebookObjects])

  const modalTechnique = useMemo(
    () => techniques.find((item) => item.id === modalTechniqueId) || null,
    [techniques, modalTechniqueId]
  )

  const sheetReferenceSections = useMemo(
    () => buildSheetReferenceSections(notebook?.referenceColumns),
    [notebook?.referenceColumns]
  )

  const editableActiveReference = useMemo(
    () => (activeReference && isEditableReferenceType(activeReference.type) ? activeReference : null),
    [activeReference]
  )

  const localizedActiveReferenceTitle = useMemo(
    () => getLocalizedNotebookText(activeReference?.title, activeReference?.titleFr, notebookLocale),
    [activeReference?.title, activeReference?.titleFr, notebookLocale]
  )

  const localizedActiveReferenceContent = useMemo(
    () => getLocalizedNotebookHtml(activeReference?.content, activeReference?.contentFr, notebookLocale),
    [activeReference?.content, activeReference?.contentFr, notebookLocale]
  )

  const localizedEditableReferenceContent = useMemo(
    () => getLocalizedNotebookHtml(editableActiveReference?.content, editableActiveReference?.contentFr, notebookLocale),
    [editableActiveReference?.content, editableActiveReference?.contentFr, notebookLocale]
  )

  const visibleReferenceDockSections = useMemo(() => {
    const dataItems = notebookObjects.filter((item) => ['data', 'condition', 'clarification'].includes(String(item?.type || '').trim()))
    const taskItems = notebookObjects.filter((item) => String(item?.type || '').trim() === 'task')
    return [
      {
        id: 'data',
        title: notebookLocale === 'fr' ? 'Donnees' : 'Datos',
        items: dataItems,
      },
      {
        id: 'tasks',
        title: notebookLocale === 'fr' ? 'Consignes' : 'Consignas',
        items: taskItems,
      },
    ]
  }, [notebookLocale, notebookObjects])

  const selectNotebookReference = useCallback((referenceId) => {
    if (!referenceId) return
    markFocusArea('reference_palette')
    updateNotebook({ activeReferenceId: referenceId })
  }, [markFocusArea, updateNotebook])

  const openReferenceMenu = useCallback((event, columnId, itemId = '') => {
    if (!EDITABLE_REFERENCE_COLUMN_IDS.has(columnId)) return

    event.preventDefault()
    event.stopPropagation()
    if (itemId) {
      selectNotebookReference(itemId)
    }

    setReferenceMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      columnId,
      itemId,
    })
  }, [selectNotebookReference])

  const updateEditableReferenceContent = useCallback((referenceId, value) => {
    updateNotebook((prev) => {
      if (!prev || !referenceId) return {}

      const nextColumns = { ...(prev.referenceColumns || {}) }
      let changed = false
      const localeField = notebookLocale === 'fr' ? 'contentFr' : 'content'

      for (const column of ALL_REFERENCE_COLUMNS) {
        const currentItems = Array.isArray(nextColumns[column.id]) ? nextColumns[column.id] : []
        const nextItems = currentItems.map((item) => {
          if (item.id !== referenceId) return item
          changed = true
          return {
            ...item,
            [localeField]: value,
          }
        })

        if (changed) {
          nextColumns[column.id] = reindexNotebookObjectList(column.objectType, nextItems)
          break
        }
      }

      if (!changed) return {}

      const nextNotebook = {
        ...prev,
        referenceColumns: nextColumns,
      }

      return {
        referenceColumns: nextColumns,
        ...buildNotebookSeededSolutionsPatch(nextNotebook),
      }
    })
  }, [buildNotebookSeededSolutionsPatch, updateNotebook])

  const updateTechniqueInputValue = useCallback((inputId, patch) => {
    if (!inputId) return
    updateNotebook((prev) => {
      if (!prev) return {}
      const currentEntry = prev.techniqueInputValues?.[inputId] && typeof prev.techniqueInputValues[inputId] === 'object'
        ? prev.techniqueInputValues[inputId]
        : { text: '', referenceId: '' }

      return {
        techniqueInputValues: {
          ...(prev.techniqueInputValues || {}),
          [inputId]: {
            ...currentEntry,
            ...patch,
          },
        },
      }
    })
  }, [updateNotebook])

  const addNotebookObjectToColumn = useCallback((columnId) => {
    const columnConfig = getReferenceColumnConfig(columnId)
    if (!columnConfig) return

    setNotice(`Nuevo bloque en ${columnConfig.title} listo para editar.`)
    setReferenceMenu(buildReferenceMenuState())
    markFocusArea('reference_palette')

    updateNotebook((prev) => {
      if (!prev) return {}
      const currentItems = Array.isArray(prev.referenceColumns?.[columnId]) ? prev.referenceColumns[columnId] : []
      const nextObject = createNotebookReferenceObject(columnConfig.objectType, currentItems, '<p></p>')
      const nextItems = reindexNotebookObjectList(columnConfig.objectType, [...currentItems, nextObject])
      const nextNotebook = {
        ...prev,
        referenceColumns: {
          ...prev.referenceColumns,
          [columnId]: nextItems,
        },
      }

      return {
        referenceColumns: nextNotebook.referenceColumns,
        activeReferenceId: nextObject.id,
        ...buildNotebookSeededSolutionsPatch(nextNotebook),
      }
    })
  }, [buildNotebookSeededSolutionsPatch, markFocusArea, updateNotebook])

  const deleteNotebookObjectFromColumn = useCallback((columnId, itemId) => {
    const columnConfig = getReferenceColumnConfig(columnId)
    if (!columnConfig || !itemId) return

    setNotice(`Bloque eliminado de ${columnConfig.title}.`)
    setReferenceMenu(buildReferenceMenuState())

    updateNotebook((prev) => {
      if (!prev) return {}

      const currentItems = Array.isArray(prev.referenceColumns?.[columnId]) ? prev.referenceColumns[columnId] : []
      const targetIndex = currentItems.findIndex((item) => item.id === itemId)
      if (targetIndex < 0) return {}

      const nextItems = reindexNotebookObjectList(
        columnConfig.objectType,
        currentItems.filter((item) => item.id !== itemId)
      )
      const fallbackActiveReferenceId = prev.activeReferenceId === itemId
        ? (nextItems[targetIndex]?.id || nextItems[targetIndex - 1]?.id || '')
        : prev.activeReferenceId
      const nextNotebook = {
        ...prev,
        referenceColumns: {
          ...prev.referenceColumns,
          [columnId]: nextItems,
        },
      }

      return {
        referenceColumns: nextNotebook.referenceColumns,
        activeReferenceId: fallbackActiveReferenceId,
        ...buildNotebookSeededSolutionsPatch(nextNotebook),
      }
    })
  }, [buildNotebookSeededSolutionsPatch, updateNotebook])

  const deleteNotebookReference = useCallback((reference) => {
    if (!reference?.id) return
    deleteNotebookObjectFromColumn(getReferenceColumnIdByType(reference.type), reference.id)
  }, [deleteNotebookObjectFromColumn])

  const getCurrentActiveReference = useCallback(() => {
    const currentNotebook = notebookRef.current
    if (!currentNotebook) return null
    return flattenNotebookObjects(currentNotebook.referenceColumns).find((item) => item.id === currentNotebook.activeReferenceId) || null
  }, [])

  const publishPresence = useCallback(async () => {
    const channel = realtimeChannelRef.current
    const collaborationTargetId = usesNotebookCollabSync
      ? (activeCollabPageIdRef.current || collabPageId || '')
      : (workspaceId || '')
    if (!channel || !collaborationTargetId || !session?.userId) return

    try {
      await channel.track(buildNotebookPresencePayload({
        session,
        clientId: realtimeClientIdRef.current,
        selectedExerciseId: selectedExerciseRef.current?.id || '',
        activeReferenceId: notebookRef.current?.activeReferenceId || '',
        focusArea: focusAreaRef.current,
      }))
    } catch (error) {
      console.error('Could not publish notebook presence:', error)
    }
  }, [collabPageId, session, usesNotebookCollabSync, workspaceId])

  useEffect(() => {
    if (!selectedExercise?.id || !notebook) return
    saveWhiteboardNotebook(selectedExercise.id, notebook)
  }, [notebook, selectedExercise])

  useEffect(() => {
    if (!usesWhiteboardSync) {
      setCollaborators([])
      return undefined
    }

    if (!workspaceId || !session?.userId) {
      setCollaborators([])
      return undefined
    }

    let cancelled = false
    let channel = null

    const connectRealtime = async () => {
      try {
        channel = await subscribeToWhiteboardWorkspace(workspaceId, {
          clientId: realtimeClientIdRef.current,
          presence: buildNotebookPresencePayload({
            session,
            clientId: realtimeClientIdRef.current,
            selectedExerciseId: selectedExerciseRef.current?.id || '',
            activeReferenceId: notebookRef.current?.activeReferenceId || '',
            focusArea: focusAreaRef.current,
          }),
          onSnapshot: (remoteWorkspace, payload) => {
            if (cancelled || workspaceId !== activeWorkspaceIdRef.current) return
            if (!remoteWorkspace) return

            const nextExercise = remoteWorkspace.exercise_snapshot && typeof remoteWorkspace.exercise_snapshot === 'object'
              ? remoteWorkspace.exercise_snapshot
              : selectedExerciseRef.current
            if (!nextExercise?.id) return

            const nextNotebook = resolveNotebookState(nextExercise, remoteWorkspace)
            const nextSignature = serializeNotebook(nextNotebook)
            if (payload?.sourceClientId === realtimeClientIdRef.current) return
            if (nextSignature === currentNotebookSignatureRef.current) return
            if (shouldIgnoreIncomingNotebookLocale(nextNotebook)) return
            if (!shouldApplyIncomingNotebook(notebookRef.current, nextNotebook)) return

            applyNotebookState(nextNotebook, {
              exercise: nextExercise,
              workspaceId: remoteWorkspace.id,
              collabPageId: '',
              workspaceRow: remoteWorkspace,
            })
            setCollaborationStatus('Cambios colaborativos del cuaderno recibidos en tiempo real.')
            setCollaborationError('')
          },
          onPresence: (nextCollaborators) => {
            if (cancelled) return
            setCollaborators(Array.isArray(nextCollaborators) ? nextCollaborators : [])
          },
          onNotebookSync: (payload) => {
            if (cancelled || workspaceId !== activeWorkspaceIdRef.current) return
            if (!payload || payload.sourceClientId === realtimeClientIdRef.current) return

            const nextExercise = payload.exerciseSnapshot && typeof payload.exerciseSnapshot === 'object'
              ? payload.exerciseSnapshot
              : selectedExerciseRef.current
            const nextNotebook = nextExercise?.id
              ? normalizeStoredWhiteboardNotebook(nextExercise.id, payload.notebook)
              : null
            const nextSignature = serializeNotebook(nextNotebook)

            if (!nextNotebook || nextSignature === currentNotebookSignatureRef.current) return
            if (shouldIgnoreIncomingNotebookLocale(nextNotebook)) return
            if (!shouldApplyIncomingNotebook(notebookRef.current, nextNotebook)) return

            applyNotebookState(nextNotebook, {
              exercise: nextExercise,
              workspaceId,
              collabPageId: '',
              workspaceRow: loadedWorkspace,
            })
            setCollaborationStatus(`Actualizacion en vivo recibida de ${payload.username || 'otro colaborador'}.`)
            setCollaborationError('')
          },
          onError: (error) => {
            if (cancelled) return
            setCollaborationError(error?.message || 'No se pudo refrescar el cuaderno colaborativo.')
          },
        })

        if (cancelled) {
          closeRealtimeChannel(channel)
          return
        }

        if (workspaceId !== activeWorkspaceIdRef.current) {
          closeRealtimeChannel(channel)
          return
        }

        realtimeChannelRef.current = channel
        publishPresence()
      } catch (error) {
        if (cancelled) return
        setCollaborationError(error?.message || 'No se pudo conectar el cuaderno colaborativo.')
      }
    }

    connectRealtime()

    return () => {
      cancelled = true
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null
      }
      setCollaborators([])
      closeRealtimeChannel(channel)
    }
  }, [applyNotebookState, publishPresence, session, usesWhiteboardSync, workspaceId])

  useEffect(() => {
    if (!usesWhiteboardSync) return undefined
    if (!workspaceId || !session?.userId) return undefined

    const timerId = window.setTimeout(() => {
      publishPresence()
    }, 80)

    return () => window.clearTimeout(timerId)
  }, [
    notebook?.activeReferenceId,
    publishPresence,
    session?.userId,
    session?.username,
    workspaceId,
    usesWhiteboardSync,
  ])

  useEffect(() => {
    if (!usesWhiteboardSync) return undefined
    if (!selectedExercise?.id || !workspaceId || !session?.userId || !notebook) return undefined

    const nextSignature = serializeNotebook(notebook)
    if (nextSignature === remoteAppliedSignatureRef.current) return undefined
    if (nextSignature === lastBroadcastSignatureRef.current) return undefined

    const timerId = window.setTimeout(async () => {
      const channel = realtimeChannelRef.current
      if (!channel || typeof channel.sendNotebookSync !== 'function') return

      try {
        await channel.sendNotebookSync({
          clientId: realtimeClientIdRef.current,
          userId: session.userId,
          username: session.username || session.userId,
          workspaceId,
          exerciseSnapshot: selectedExercise,
          notebook,
        })
        lastBroadcastSignatureRef.current = nextSignature
      } catch (error) {
        console.error('Could not broadcast notebook changes:', error)
      }
    }, 120)

    return () => window.clearTimeout(timerId)
  }, [notebook, selectedExercise, session?.userId, session?.username, usesWhiteboardSync, workspaceId])

  useEffect(() => {
    if (!usesWhiteboardSync) return undefined
    if (!selectedExercise?.id || !workspaceId || !session?.userId || !notebook) return undefined

    const nextSignature = serializeNotebook(notebook)
    if (nextSignature === remoteAppliedSignatureRef.current) return undefined

    const timerId = window.setTimeout(async () => {
      const workspaceSeed = buildWorkspaceSeedFromExercise(selectedExercise)

      try {
        await updateWhiteboardWorkspace(workspaceId, session.userId, {
          clientId: realtimeClientIdRef.current,
          exerciseTitle: selectedExercise.title || 'Whiteboard Notebook',
          exerciseSnapshot: selectedExercise,
          notebookState: notebook,
          nodes: Array.isArray(loadedWorkspace?.nodes) ? loadedWorkspace.nodes : workspaceSeed.nodes,
          links: Array.isArray(loadedWorkspace?.links) ? loadedWorkspace.links : workspaceSeed.links,
          visibility: loadedWorkspace?.visibility || 'public',
          lastEditorUserId: session.userId,
        })
        remoteAppliedSignatureRef.current = nextSignature
        setCollaborationError('')
      } catch (error) {
        setCollaborationError(error?.message || 'No se pudieron guardar los cambios colaborativos del cuaderno.')
      }
    }, 420)

    return () => window.clearTimeout(timerId)
  }, [loadedWorkspace, notebook, selectedExercise, session?.userId, usesWhiteboardSync, workspaceId])

  useEffect(() => {
    if (!usesNotebookCollabSync) {
      setCollaborators([])
      return undefined
    }

    if (!collabPageId || !session?.userId) {
      setCollaborators([])
      return undefined
    }

    let cancelled = false
    let channel = null

    const connectRealtime = async () => {
      try {
        channel = await subscribeToNotebookCollabPage(collabPageId, {
          clientId: realtimeClientIdRef.current,
          presence: buildNotebookPresencePayload({
            session,
            clientId: realtimeClientIdRef.current,
            selectedExerciseId: selectedExerciseRef.current?.id || '',
            activeReferenceId: notebookRef.current?.activeReferenceId || '',
            focusArea: focusAreaRef.current,
          }),
          onSnapshot: (remotePage, payload) => {
            if (cancelled || collabPageId !== activeCollabPageIdRef.current) return

            const nextExercise = reconcileCollaborativeExercise(
              selectedExerciseRef.current,
              remotePage.exercise_snapshot && typeof remotePage.exercise_snapshot === 'object'
                ? remotePage.exercise_snapshot
                : null,
            )
            if (!nextExercise?.id) return

            const nextNotebook = normalizeStoredWhiteboardNotebook(nextExercise.id, remotePage.notebook_state)
            const nextSignature = serializeNotebook(nextNotebook)
            if (!nextNotebook || nextSignature === currentNotebookSignatureRef.current) return
            if (shouldIgnoreIncomingNotebookLocale(nextNotebook)) return
            if (!shouldApplyIncomingNotebook(notebookRef.current, nextNotebook)) return

            applyNotebookState(nextNotebook, {
              exercise: nextExercise,
              workspaceId: '',
              collabPageId: remotePage.id,
              workspaceRow: null,
            })
            setCollaborationStatus(
              payload?.sourceClientId && payload.sourceClientId !== realtimeClientIdRef.current
                ? 'Actualizacion colaborativa recibida en tiempo real.'
                : 'Hoja colaborativa local conectada.'
            )
            setCollaborationError('')
          },
          onPresence: (nextCollaborators) => {
            if (cancelled) return
            setCollaborators(Array.isArray(nextCollaborators) ? nextCollaborators : [])
          },
          onNotebookSync: (payload) => {
            if (cancelled || collabPageId !== activeCollabPageIdRef.current) return
            if (!payload || payload.sourceClientId === realtimeClientIdRef.current) return

            const nextExercise = reconcileCollaborativeExercise(
              selectedExerciseRef.current,
              payload.exerciseSnapshot && typeof payload.exerciseSnapshot === 'object'
                ? payload.exerciseSnapshot
                : null,
            )
            if (!nextExercise?.id) return

            const nextNotebook = normalizeStoredWhiteboardNotebook(nextExercise.id, payload.notebook)
            const nextSignature = serializeNotebook(nextNotebook)
            if (!nextNotebook || nextSignature === currentNotebookSignatureRef.current) return
            if (shouldIgnoreIncomingNotebookLocale(nextNotebook)) return
            if (!shouldApplyIncomingNotebook(notebookRef.current, nextNotebook)) return

            applyNotebookState(nextNotebook, {
              exercise: nextExercise,
              workspaceId: '',
              collabPageId,
              workspaceRow: null,
            })
            setCollaborationStatus(`Actualizacion en vivo recibida de ${payload.username || 'otro colaborador'}.`)
            setCollaborationError('')
          },
          onError: (error) => {
            if (cancelled) return
            setCollaborationError(error?.message || 'No se pudo sincronizar la hoja colaborativa local.')
          },
        })

        if (cancelled) {
          closeRealtimeChannel(channel)
          return
        }

        realtimeChannelRef.current = channel
        setCollaborationStatus('Hoja colaborativa local conectada.')
        publishPresence()
      } catch (error) {
        if (cancelled) return
        setCollaborationError(error?.message || 'No se pudo sincronizar la hoja colaborativa local.')
      }
    }

    connectRealtime()

    return () => {
      cancelled = true
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null
      }
      setCollaborators([])
      closeRealtimeChannel(channel)
    }
  }, [applyNotebookState, collabPageId, publishPresence, session, usesNotebookCollabSync])

  useEffect(() => {
    if (!usesNotebookCollabSync) return undefined
    if (!collabPageId || !session?.userId) return undefined

    const timerId = window.setTimeout(() => {
      publishPresence()
    }, 80)

    return () => window.clearTimeout(timerId)
  }, [
    collabPageId,
    notebook?.activeReferenceId,
    publishPresence,
    session?.userId,
    session?.username,
    usesNotebookCollabSync,
  ])

  useEffect(() => {
    if (!usesNotebookCollabSync) return undefined
    if (!selectedExercise?.id || !collabPageId || !session?.userId || !notebook) return undefined

    const nextSignature = serializeNotebook(notebook)
    if (nextSignature === remoteAppliedSignatureRef.current) return undefined
    if (nextSignature === lastBroadcastSignatureRef.current) return undefined

    const timerId = window.setTimeout(async () => {
      const channel = realtimeChannelRef.current
      if (!channel || typeof channel.send !== 'function') return

      try {
        await channel.send({
          clientId: realtimeClientIdRef.current,
          userId: session.userId,
          username: session.username || session.userId,
          collabPageId,
          exerciseSnapshot: selectedExercise,
          notebook,
        })
        lastBroadcastSignatureRef.current = nextSignature
      } catch (error) {
        console.error('Could not broadcast collaborative notebook page changes:', error)
      }
    }, 120)

    return () => window.clearTimeout(timerId)
  }, [collabPageId, notebook, selectedExercise, session?.userId, session?.username, usesNotebookCollabSync])

  useEffect(() => {
    if (!usesNotebookCollabSync) return undefined
    if (!selectedExercise?.id || !collabPageId || !session?.userId || !notebook) return undefined

    const nextSignature = serializeNotebook(notebook)
    if (nextSignature === remoteAppliedSignatureRef.current) return undefined

    const timerId = window.setTimeout(async () => {
      try {
        await updateNotebookCollabPage(collabPageId, session.userId, {
          title: selectedExercise.title || notebook.exerciseTitle || 'Hoja colaborativa',
          exerciseSnapshot: selectedExercise,
          notebookState: notebook,
          visibility: 'code',
          lastEditorUserId: session.userId,
          clientId: realtimeClientIdRef.current,
        })
        remoteAppliedSignatureRef.current = nextSignature
        setCollaborationError('')
      } catch (error) {
        setCollaborationError(error?.message || 'No se pudieron guardar los cambios colaborativos de la hoja.')
      }
    }, 420)

    return () => window.clearTimeout(timerId)
  }, [collabPageId, notebook, selectedExercise, session?.userId, usesNotebookCollabSync])

  const handleResetNotebook = () => {
    const latestExercises = listWhiteboardExercises()
    const latestExercise = latestExercises.find((item) => item.id === selectedExercise?.id) || selectedExercise
    if (!latestExercise) return

    setReferenceMenu(buildReferenceMenuState())
    setExercises(latestExercises)
    const resetNotebook = resetWhiteboardNotebook(latestExercise)
    setNotebook(resetNotebook)
    setNotice('Cuaderno regenerado desde el ejercicio.')
  }

  const handleDownloadNotebookTemplate = useCallback(() => {
    downloadJsonFile('inticore-whiteboard-notebook-template.json', buildWhiteboardNotebookTemplateJson())
    setNotice('Plantilla JSON del notebook descargada.')
  }, [])

  const handleExportNotebookJson = useCallback(() => {
    if (!selectedExercise?.id || !notebook) {
      setNotice('Selecciona primero un ejercicio para exportar su cuaderno.')
      return
    }

    const exportPayload = buildWhiteboardNotebookExportJson({
      ...notebook,
      exerciseId: selectedExercise.id,
      exerciseTitle: selectedExercise.title || notebook.exerciseTitle || 'Whiteboard Notebook',
    })
    const filename = `inticore-notebook-${sanitizeNotebookFilenamePart(selectedExercise.title || selectedExercise.id, selectedExercise.id || 'notebook')}.json`
    downloadJsonFile(filename, exportPayload)
    setNotice('Cuaderno exportado a JSON.')
  }, [notebook, selectedExercise])

  const handleImportNotebookJson = useCallback(async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!selectedExercise?.id) {
      setNotice('Selecciona primero un ejercicio antes de importar un cuaderno.')
      return
    }

    try {
      const payload = await parseJsonFile(file)
      const importedNotebook = normalizeWhiteboardNotebookImportPayload(selectedExercise, payload)
      if (!importedNotebook) {
        throw new Error('No se encontro un notebook valido dentro del JSON.')
      }

      setReferenceMenu(buildReferenceMenuState())
      applyNotebookState(importedNotebook, { exercise: selectedExercise, workspaceId: '', collabPageId: '', workspaceRow: null })
      setNotice('Cuaderno importado correctamente desde JSON.')
    } catch (error) {
      setNotice(error?.message || 'No se pudo importar el notebook desde JSON.')
    }
  }, [applyNotebookState, selectedExercise])

  const ensureRemotePageForNotebookShare = useCallback(async () => {
    if (!isNotebookLibraryMode || !session?.userId || !notebookBook?.id || !activeNotebookPage?.id || !selectedExercise?.id || !notebook) {
      throw new Error('Abre primero una hoja del notebook para compartirla.')
    }

    const pageTitle = activeNotebookPage.title || selectedExercise.title || notebook.exerciseTitle || 'Hoja colaborativa'
    const remotePage = activeNotebookPage.collabPageId
      ? await updateNotebookCollabPage(activeNotebookPage.collabPageId, session.userId, {
        title: pageTitle,
        exerciseSnapshot: selectedExercise,
        notebookState: notebook,
        visibility: 'code',
        lastEditorUserId: session.userId,
      })
      : await createNotebookCollabPage({
        ownerUserId: session.userId,
        title: pageTitle,
        exerciseSnapshot: selectedExercise,
        notebookState: notebook,
        visibility: 'code',
        lastEditorUserId: session.userId,
      })

    updateNotebookPage(session.userId, notebookBook.id, activeNotebookPage.id, {
      collabPageId: remotePage.id,
      shareCode: remotePage.share_code,
    })

    refreshNotebookBook()
    applyNotebookState(notebook, {
      exercise: selectedExercise,
      workspaceId: '',
      collabPageId: remotePage.id,
      workspaceRow: null,
    })
    return remotePage
  }, [
    activeNotebookPage,
    applyNotebookState,
    isNotebookLibraryMode,
    notebook,
    notebookBook?.id,
    refreshNotebookBook,
    selectedExercise,
    session?.userId,
  ])

  const handleCopyNotebookShareCode = useCallback(async () => {
    try {
      setNotice('')
      const remotePage = await ensureRemotePageForNotebookShare()
      if (!remotePage) return

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(remotePage.share_code)
        setNotice(`Codigo ${remotePage.share_code} copiado. La hoja sigue siendo privada y solo abre por codigo o enlace.`)
        return
      }

      setNotice(`Codigo de colaboracion: ${remotePage.share_code}.`)
    } catch (error) {
      setNotice(error?.message || 'No se pudo activar el codigo de colaboracion de la hoja.')
    }
  }, [ensureRemotePageForNotebookShare])

  const handleCopyNotebookShareLink = useCallback(async () => {
    try {
      setNotice('')
      const remotePage = await ensureRemotePageForNotebookShare()
      if (!remotePage) return

      const shareLink = buildNotebookShareLink(remotePage.share_code)
      if (!shareLink) {
        setNotice(`Enlace no disponible. Usa el codigo ${remotePage.share_code}.`)
        return
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
        setNotice(`Enlace privado copiado. Tambien puedes compartir el codigo ${remotePage.share_code}.`)
        return
      }

      setNotice(`Enlace privado: ${shareLink}`)
    } catch (error) {
      setNotice(error?.message || 'No se pudo generar el enlace privado de la hoja.')
    }
  }, [ensureRemotePageForNotebookShare])

  const toggleSidebarPanel = useCallback(() => {
    if (!isSidebarCollapsed) {
      setIsSidebarCollapsed(true)
      return
    }

    if (!bothSidePanelsCollapsed) return
    setIsSidebarCollapsed(false)
  }, [bothSidePanelsCollapsed, isSidebarCollapsed])

  const toggleReferenceDockPanel = useCallback(() => {
    if (!isReferenceDockCollapsed) {
      setIsReferenceDockCollapsed(true)
      return
    }

    if (!bothSidePanelsCollapsed) return
    setIsReferenceDockCollapsed(false)
  }, [bothSidePanelsCollapsed, isReferenceDockCollapsed])

  const handleNotebookLanguageChange = useCallback((languageId) => {
    const nextLocale = normalizeNotebookLocale(languageId)
    const currentNotebook = notebookRef.current
    if (!currentNotebook) return
    if (nextLocale === notebookLocale && !isNotebookLocaleTransitionPending()) return

    const nextSolutionHtml = reseedNotebookDocument(
      {
        ...currentNotebook,
        locale: nextLocale,
      },
      nextLocale
    )

    if (notebookProgrammaticReleaseTimeoutRef.current) {
      window.clearTimeout(notebookProgrammaticReleaseTimeoutRef.current)
      notebookProgrammaticReleaseTimeoutRef.current = null
    }
    suppressNotebookEditorChangeRef.current = true
    pendingNotebookProgrammaticHtmlRef.current = nextSolutionHtml
    pendingNotebookLocaleRef.current = nextLocale
    pendingNotebookLocaleDeadlineRef.current = Date.now() + 2500
    setTechniqueLanguage(nextLocale)
  }, [isNotebookLocaleTransitionPending, notebookLocale, reseedNotebookDocument])

  const handleExerciseChange = useCallback((nextId) => {
    const nextExercise = exercises.find((item) => item.id === nextId) || null
    const previousChannel = realtimeChannelRef.current

    if (previousChannel) {
      realtimeChannelRef.current = null
      closeRealtimeChannel(previousChannel)
    }

    setNotice('')
    setReferenceMenu(buildReferenceMenuState())
    setCollaborationError('')
    setCollaborators([])
    markFocusArea('exercise_picker')
    bootstrapRequestIdRef.current += 1

    if (!nextExercise) {
      applyNotebookState(null, { exercise: null, workspaceId: '', collabPageId: '', workspaceRow: null })
      setCollaborationStatus('')
      setNotebookLoading(false)
      return
    }

    const localNotebook = getStoredWhiteboardNotebook(nextExercise.id) || buildWhiteboardNotebookFromExercise(nextExercise)
    applyNotebookState(localNotebook, { exercise: nextExercise, workspaceId: '', collabPageId: '', workspaceRow: null })
    setCollaborationStatus(
      isRemoteSyncEnabled && session?.userId
        ? 'Preparando cuaderno colaborativo...'
        : (isRemoteSyncEnabled
          ? 'Modo local. Inicia sesion para sincronizar este cuaderno.'
          : 'Modo cuaderno. Esta hoja se gestiona desde tu biblioteca personal.')
    )
    setNotebookLoading(Boolean(isRemoteSyncEnabled && session?.userId))
  }, [applyNotebookState, exercises, isRemoteSyncEnabled, markFocusArea, session?.userId])

  const handleCreateNotebookBlankPage = useCallback(() => {
    if (!isNotebookLibraryMode || !session?.userId) return

    const currentBook = refreshNotebookBook()
    if (!currentBook) {
      setNotice('Abre primero un cuaderno para crear una hoja.')
      return
    }

    try {
      const pageTitle = buildNotebookPageTitleFromExercise(null, {
        kind: 'sheet',
        pageIndex: currentBook.pages.length,
      })
      const createdExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        title: pageTitle,
        topic: currentBook.title || '',
      })
      const createdPage = createNotebookPage(session.userId, currentBook.id, {
        title: createdExercise.title,
        kind: 'sheet',
        linkedExerciseId: createdExercise.id,
        exerciseOwnership: 'managed',
      })
      refreshNotebookBook()
      handleNotebookPageChange(createdPage.id)
      setNotice(`Se creo la hoja ${createdPage.title}.`)
    } catch (error) {
      setNotice(error?.message || 'No se pudo crear la hoja del cuaderno.')
    }
  }, [handleNotebookPageChange, isNotebookLibraryMode, refreshNotebookBook, session?.userId])

  const handleLinkExerciseAsNotebookPage = useCallback(() => {
    if (!isNotebookLibraryMode || !session?.userId) return
    if (!selectedSidebarExerciseId) {
      setNotice('Selecciona primero un ejercicio para agregarlo como hoja.')
      return
    }

    const currentBook = refreshNotebookBook()
    const exercise = exercises.find((item) => item.id === selectedSidebarExerciseId) || null
    if (!currentBook || !exercise) {
      setNotice('No se encontro el cuaderno o el ejercicio seleccionado.')
      return
    }

    try {
      const pageTitle = buildNotebookPageTitleFromExercise(exercise, {
        kind: 'exercise',
        pageIndex: currentBook.pages.length,
      })
      const createdPage = createNotebookPage(session.userId, currentBook.id, {
        title: pageTitle,
        kind: 'exercise',
        linkedExerciseId: exercise.id,
        exerciseOwnership: 'linked',
      })
      setSelectedSidebarExerciseId('')
      refreshNotebookBook()
      handleNotebookPageChange(createdPage.id)
      setNotice(`Se agrego ${createdPage.title} al cuaderno.`)
    } catch (error) {
      setNotice(error?.message || 'No se pudo agregar el ejercicio al cuaderno.')
    }
  }, [exercises, handleNotebookPageChange, isNotebookLibraryMode, refreshNotebookBook, selectedSidebarExerciseId, session?.userId])

  const handleDeleteNotebookPage = useCallback((page) => {
    if (!isNotebookLibraryMode || !session?.userId || !page?.id) return

    const currentBook = refreshNotebookBook()
    if (!currentBook?.id) {
      setNotice('Abre primero un cuaderno para eliminar una hoja.')
      return
    }

    if (!window.confirm(`Eliminar la hoja "${page.title || 'Sin titulo'}"?`)) return

    try {
      const pageIndex = currentBook.pages.findIndex((entry) => entry.id === page.id)
      const removed = deleteNotebookPage(session.userId, currentBook.id, page.id)
      if (!removed) {
        setNotice('No se encontro la hoja que querias eliminar.')
        return
      }

      if (removed.exerciseOwnership === 'managed' && removed.linkedExerciseId) {
        deleteWhiteboardExercise(removed.linkedExerciseId)
      }

      const nextBook = refreshNotebookBook()
      const remainingPages = Array.isArray(nextBook?.pages) ? nextBook.pages : []
      const fallbackPage = remainingPages.length
        ? remainingPages[Math.min(pageIndex, remainingPages.length - 1)]
        : null

      if (fallbackPage?.id) {
        handleNotebookPageChange(fallbackPage.id)
      } else {
        setActiveNotebookPageIdState('')
        setActiveNotebookPageId('')
        setActiveNotebookCollabPageId('')
        setCollabPageId('')
        setActiveWhiteboardExerciseId('')
        setExerciseId('')
        setActiveWhiteboardWorkspaceId('')
        setWorkspaceId('')
        setNotebook(null)
        setLoadedWorkspace(null)
        setNotebookLoading(false)
        setReferenceMenu(buildReferenceMenuState())
        selectedExerciseRef.current = null
      }

      setNotice(`Se elimino la hoja ${page.title || 'sin titulo'}.`)
    } catch (error) {
      setNotice(error?.message || 'No se pudo eliminar la hoja.')
    }
  }, [handleNotebookPageChange, isNotebookLibraryMode, refreshNotebookBook, session?.userId])

  const handleSaveNotebookBookMetadata = useCallback(() => {
    if (!isNotebookLibraryMode || !session?.userId) return

    const currentBook = refreshNotebookBook()
    if (!currentBook) {
      setNotice('Abre primero un cuaderno para editar sus datos.')
      return
    }

    try {
      const savedBook = saveNotebookBook(session.userId, {
        ...currentBook,
        title: notebookBookDraft.title,
        description: notebookBookDraft.description,
      })
      setNotebookBook(savedBook)
      setNotebookBookDraft({
        title: savedBook.title || '',
        description: savedBook.description || '',
      })
      setNotice(`Se actualizo el cuaderno ${savedBook.title || 'sin titulo'}.`)
    } catch (error) {
      setNotice(error?.message || 'No se pudo guardar la informacion del cuaderno.')
    }
  }, [isNotebookLibraryMode, notebookBookDraft.description, notebookBookDraft.title, refreshNotebookBook, session?.userId])

  const handleDownloadNotebookPageTemplate = useCallback(() => {
    downloadJsonFile('inticore-notebook-page-template.json', buildNotebookPageTemplateJson())
    setNotice('Plantilla de hoja sembrada descargada.')
  }, [])

  const handleExportNotebookLibraryPage = useCallback(() => {
    if (!activeNotebookPage) {
      setNotice('Selecciona primero una hoja para exportarla.')
      return
    }

    const pageExercise = exercises.find((item) => item.id === activeNotebookPage.linkedExerciseId) || selectedExercise || null
    const pageNotebook = activeNotebookPage.linkedExerciseId
      ? (getStoredWhiteboardNotebook(activeNotebookPage.linkedExerciseId)
        || (pageExercise ? buildWhiteboardNotebookFromExercise(pageExercise) : null))
      : null

    const filename = `inticore-notebook-page-${sanitizeNotebookFilenamePart(activeNotebookPage.title || pageExercise?.title || activeNotebookPage.id, activeNotebookPage.id || 'hoja')}.json`
    downloadJsonFile(
      filename,
      buildNotebookPageExportJson({
        page: activeNotebookPage,
        exercise: pageExercise,
        notebook: pageNotebook,
      })
    )
    setNotice(`Se exporto la hoja ${activeNotebookPage.title || 'sin titulo'}.`)
  }, [activeNotebookPage, exercises, selectedExercise])

  const handleExportNotebookLibraryBook = useCallback(() => {
    const currentBook = refreshNotebookBook()
    if (!currentBook) {
      setNotice('Abre primero un cuaderno para exportarlo.')
      return
    }

    const exportPages = currentBook.pages.map((page) => {
      const pageExercise = exercises.find((item) => item.id === page.linkedExerciseId) || null
      const pageNotebook = page.linkedExerciseId
        ? (getStoredWhiteboardNotebook(page.linkedExerciseId)
          || (pageExercise ? buildWhiteboardNotebookFromExercise(pageExercise) : null))
        : null

      return {
        page,
        exercise: pageExercise,
        notebook: pageNotebook,
      }
    })

    const filename = `inticore-notebook-book-${sanitizeNotebookFilenamePart(currentBook.title || currentBook.id, currentBook.id || 'cuaderno')}.json`
    downloadJsonFile(
      filename,
      buildNotebookBookExportJson({
        book: currentBook,
        pages: exportPages,
      })
    )
    setNotice(`Se exporto el cuaderno ${currentBook.title || 'sin titulo'}.`)
  }, [exercises, refreshNotebookBook])

  const importPagesIntoNotebookBook = useCallback((book, importedPages = []) => {
    if (!session?.userId || !book?.id) {
      throw new Error('No hay un cuaderno disponible para importar hojas.')
    }

    return importedPages.map((entry, index) => {
      const title = String(entry?.title || buildNotebookPageTitleFromExercise(entry?.exercise, {
        kind: entry?.kind || 'sheet',
        pageIndex: index,
      })).trim() || buildNotebookPageTitleFromExercise(entry?.exercise, {
        kind: entry?.kind || 'sheet',
        pageIndex: index,
      })
      const savedExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        ...(entry?.exercise || {}),
        id: null,
        title,
        topic: String(entry?.exercise?.topic || book.title || '').trim(),
      })
      const importedNotebook = materializeImportedNotebookPage(entry, savedExercise)
      saveWhiteboardNotebook(savedExercise.id, importedNotebook)
      return createNotebookPage(session.userId, book.id, {
        title,
        kind: String(entry?.kind || 'sheet').trim() || 'sheet',
        linkedExerciseId: savedExercise.id,
        exerciseOwnership: 'managed',
      })
    })
  }, [session?.userId])

  const handleImportNotebookLibraryFile = useCallback(async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!isNotebookLibraryMode || !session?.userId) {
      setNotice('Abre un cuaderno personal antes de importar hojas aqui.')
      return
    }

    const currentBook = refreshNotebookBook()
    if (!currentBook) {
      setNotice('Abre primero un cuaderno para importar archivos.')
      return
    }

    try {
      const payload = await parseJsonFile(file)
      const imported = normalizeNotebookLibraryImportPayload(payload)
      if (!imported || !Array.isArray(imported.pages) || !imported.pages.length) {
        throw new Error('El archivo no contiene una hoja o cuaderno importable.')
      }

      const createdPages = importPagesIntoNotebookBook(currentBook, imported.pages)
      setExercises(listWhiteboardExercises())
      refreshNotebookBook()
      if (createdPages[0]?.id) {
        handleNotebookPageChange(createdPages[0].id)
      }
      setNotice(imported.kind === 'book'
        ? 'Se importaron las hojas del archivo dentro del cuaderno actual.'
        : 'Se importo la hoja dentro del cuaderno actual.')
    } catch (error) {
      setNotice(error?.message || 'No se pudo importar el archivo del cuaderno.')
    }
  }, [handleNotebookPageChange, importPagesIntoNotebookBook, isNotebookLibraryMode, refreshNotebookBook, session?.userId])

  const insertReferenceIntoSolution = (editor) => {
    const currentReference = getCurrentActiveReference()
    if (!currentReference || !editor) return
    const localizedReference = {
      ...currentReference,
      content: getLocalizedNotebookHtml(currentReference.content, currentReference.contentFr, notebookLocale),
      title: getLocalizedNotebookText(currentReference.title, currentReference.titleFr, notebookLocale),
    }
    editor.chain().focus().insertContent(buildReferenceInsertionHtml(localizedReference)).unsetColor().run()
  }

  const insertExistingReferenceIntoEditor = useCallback((reference, editor) => {
    if (!reference || !editor) return
    const localizedReference = {
      ...reference,
      content: getLocalizedNotebookHtml(reference.content, reference.contentFr, notebookLocale),
      title: getLocalizedNotebookText(reference.title, reference.titleFr, notebookLocale),
    }
    selectNotebookReference(reference.id)
    editor.chain().focus().insertContent(buildReferenceInsertionHtml(localizedReference)).unsetColor().run()
  }, [notebookLocale, selectNotebookReference])

  const captureSelectionAsObject = (editor, selectionSnapshot, options = {}) => {
    const effectiveSelection = selectionSnapshot && (!selectionSnapshot.isEmpty || selectionSnapshot.html || selectionSnapshot.text)
      ? selectionSnapshot
      : solutionSelectionSnapshot

    if (!effectiveSelection || effectiveSelection.isEmpty || !effectiveSelection.html) {
      setNotice('Selecciona primero una expresion o ecuacion dentro de la solucion.')
      return
    }

    const currentDerived = Array.isArray(notebook?.referenceColumns?.derived) ? notebook.referenceColumns.derived : []
    const createdReference = createDerivedNotebookObject(effectiveSelection.html, currentDerived)
    updateNotebook((prev) => {
      const nextNotebook = {
        ...prev,
        referenceColumns: {
          ...prev.referenceColumns,
          derived: [...currentDerived, createdReference],
        },
      }
      return {
        referenceColumns: nextNotebook.referenceColumns,
        activeReferenceId: createdReference.id,
        ...buildNotebookSeededSolutionsPatch(nextNotebook),
      }
    })

    if (options.insertMention !== false && editor && createdReference) {
      const insertPosition = Number.isInteger(effectiveSelection?.to) ? effectiveSelection.to : editor.state.selection.to
      editor.chain().focus().insertContentAt(insertPosition, buildReferenceMentionHtml(createdReference)).run()
    }

    setNotice(
      createdReference
        ? `La seleccion ahora es la referencia ${createdReference.referenceCode}.`
        : 'La seleccion se convirtio en un objeto matematico referenciable.'
    )
  }

  const executeTechniqueApplication = useCallback(async ({
    editor,
    selectionSnapshot,
    techniqueRow,
    sympyTransformation,
    inputDefinition,
    inputValues,
    insertPosition,
  }) => {
    if (!editor || !techniqueRow) {
      setNotice(
        techniqueLanguage === 'fr'
          ? 'Choisis une technique depuis le menu contextuel.'
          : 'Elige una tecnica desde el menu contextual.'
      )
      return false
    }

    if (!session?.userId) {
      setNotice('Inicia sesion para ejecutar transformaciones SymPy desde el cuaderno.')
      return false
    }

    if (!selectionSnapshot || selectionSnapshot.isEmpty || (!selectionSnapshot.text && !selectionSnapshot.html)) {
      setNotice('Selecciona primero una expresion o fragmento matematico dentro de la solucion.')
      return false
    }

    if (!sympyTransformation) {
      setNotice(
        techniqueLanguage === 'fr'
          ? 'La version francesa de esta tecnica todavia no tiene codigo SymPy.'
          : 'La version espanola de esta tecnica todavia no tiene codigo SymPy.'
      )
      return false
    }

    const referenceAnchoredInsertPosition = activeReference?.referenceCode
      ? findReferenceMentionInsertPosition(editor, activeReference.referenceCode)
      : null
    const resolvedInsertPosition = Number.isInteger(referenceAnchoredInsertPosition)
      ? referenceAnchoredInsertPosition
      : (
          Number.isInteger(insertPosition)
            ? insertPosition
            : (
                Number.isInteger(selectionSnapshot?.blockInsertPosition)
                  ? selectionSnapshot.blockInsertPosition
                  : (Number.isInteger(selectionSnapshot?.to) ? selectionSnapshot.to : editor.state.selection.to)
              )
        )
    const techniqueName = getTechniqueTranslation(techniqueRow, techniqueLanguage).name || 'tecnica'
    const selectedText = buildTechniqueSelectedText(selectionSnapshot)
    const resolvedInputDefinition = inputDefinition || { inputs: [] }
    const schemaInputsPayload = buildTechniqueSchemaInputsPayload(resolvedInputDefinition, inputValues, selectionSnapshot)
    const replacementText = replacementReference
      ? buildMathTextFromHtml(replacementReference.content, notebook?.techniqueOptions?.replacementText || '')
      : String(notebook?.techniqueOptions?.replacementText || '').trim()

    const missingRequiredInput = (resolvedInputDefinition.inputs || []).find((input) => {
      if (!input.required) return false
      const current = schemaInputsPayload[input.id]
      return !String(current?.text || '').trim() && !String(current?.referenceId || '').trim()
    })
    if (missingRequiredInput) {
      setNotice(
        techniqueLanguage === 'fr'
          ? `Il manque l'input requis: ${missingRequiredInput.labelFr || missingRequiredInput.id}.`
          : `Falta el input requerido: ${missingRequiredInput.labelEs || missingRequiredInput.id}.`
      )
      return false
    }

    setTechniqueApplying(true)
    setNotice('')

    try {
      const response = await applyWhiteboardNotebookTechnique({
        locale: techniqueLanguage,
        selectedText,
        selectedHtml: selectionSnapshot.html || '',
        technique: {
          id: techniqueRow.id,
          name: techniqueName,
          sympyTransformation,
        },
        options: (resolvedInputDefinition.inputs || []).length
          ? { inputs: schemaInputsPayload }
          : {
              target: String(notebook?.techniqueOptions?.targetText || '').trim(),
              replacementText,
              replacementHtml: replacementReference?.content || '',
              replacementReferenceId: replacementReference?.id || '',
              replacementReferenceCode: replacementReference?.referenceCode || '',
            },
      })

      const executionResult = response?.execution?.result
      const introHtml = buildTechniqueApplicationIntroHtml({
        locale: techniqueLanguage,
        techniqueName,
        selectionHtml: selectionSnapshot.html,
        selectionText: selectedText,
        options: (resolvedInputDefinition.inputs || []).length ? { inputs: schemaInputsPayload } : undefined,
        schemaDefinition: resolvedInputDefinition,
        executionResult,
      })
      const insertionNodes = buildTechniqueInsertionNodes({
        introHtml,
        executionResult,
        locale: techniqueLanguage,
      })

      if (!Array.isArray(insertionNodes) || !insertionNodes.length) {
        setNotice('La tecnica se ejecuto, pero no devolvio contenido para insertar en la solucion.')
        return false
      }

      const inserted = editor.chain().focus().insertContentAt(resolvedInsertPosition, insertionNodes).run()
      if (!inserted) {
        setNotice('La tecnica se ejecuto, pero el editor no pudo insertar el resultado en la solucion.')
        return false
      }
      setNotice(
        techniqueLanguage === 'fr'
          ? 'La transformation SymPy a ete inseree sous le bloque de travail.'
          : 'La transformacion SymPy se inserto debajo del bloque de trabajo.'
      )
      return true
    } catch (error) {
      setNotice(error?.message || 'No se pudo aplicar la tecnica SymPy.')
      return false
    } finally {
      setTechniqueApplying(false)
    }
  }, [
    activeReference,
    buildTechniqueSchemaInputsPayload,
    notebook?.techniqueOptions?.replacementText,
    notebook?.techniqueOptions?.targetText,
    replacementReference,
    session?.userId,
    techniqueLanguage,
  ])

  const handleSolutionSelectionChange = useCallback((editor, selectionSnapshot) => {
    solutionEditorRef.current = editor || null
    if (selectionSnapshot && (!selectionSnapshot.isEmpty || selectionSnapshot.html || selectionSnapshot.text)) {
      setSolutionSelectionSnapshot(selectionSnapshot)
    }
  }, [])

  const openTechniqueAssistant = useCallback((payload) => {
    setTechniqueAssistant(payload)
  }, [])

  const closeTechniqueAssistant = useCallback(() => {
    setTechniqueAssistant(null)
  }, [])

  const handleTechniqueContextAction = useCallback(async (techniqueRow, editor, selectionSnapshot) => {
    if (!techniqueRow || !editor) return

    const effectiveSelection = selectionSnapshot && (!selectionSnapshot.isEmpty || selectionSnapshot.html || selectionSnapshot.text)
      ? selectionSnapshot
      : solutionSelectionSnapshot

    solutionEditorRef.current = editor
    setSolutionSelectionSnapshot(effectiveSelection || { text: '', html: '', isEmpty: true, from: null, to: null, blockInsertPosition: null })
    updateNotebook({ linkedTechniqueId: techniqueRow.id })
    const insertPosition = Number.isInteger(effectiveSelection?.blockInsertPosition)
      ? effectiveSelection.blockInsertPosition
      : (Number.isInteger(effectiveSelection?.to) ? effectiveSelection.to : editor.state.selection.to)
    const applicationHtml = buildTechniqueApplicationStructureHtml(techniqueRow, techniqueLanguage)
    const inserted = editor.chain().focus().insertContentAt(insertPosition, applicationHtml).run()

    if (!inserted) {
      setNotice(
        techniqueLanguage === 'fr'
          ? 'Le notebook n a pas pu inserer la structure d application de cette technique.'
          : 'El notebook no pudo insertar la estructura de aplicacion de esta tecnica.'
      )
      return
    }

    setNotice(
      techniqueLanguage === 'fr'
        ? 'La structure d application de la technique a ete inseree dans la feuille.'
        : 'La estructura de aplicacion de la tecnica se inserto en la hoja.'
    )
  }, [solutionSelectionSnapshot, techniqueLanguage, updateNotebook])

  const solutionTechniqueContextActions = useMemo(() => {
    const actions = [
      {
        id: 'create-reference-from-selection',
        label: techniqueLanguage === 'fr' ? 'Creer une reference' : 'Crear referencia',
        hidden: (_editor, selectionSnapshot) => !selectionSnapshot || selectionSnapshot.isEmpty || !selectionSnapshot.html,
        onClick: (editor, selectionSnapshot) => {
          captureSelectionAsObject(editor, selectionSnapshot, { insertMention: true })
        },
      },
      ...notebookObjects.map((reference) => ({
        id: `insert-reference-${reference.id}`,
        label: `${techniqueLanguage === 'fr' ? 'Inserer' : 'Insertar'} [${reference.referenceCode}] ${getLocalizedNotebookText(reference.title, reference.titleFr, notebookLocale) || ''}`.trim(),
        onClick: (editor) => {
          insertExistingReferenceIntoEditor(reference, editor)
        },
      })),
    ]

    return [
      ...actions,
      ...techniques.map((techniqueRow) => ({
        id: `apply-technique-${techniqueRow.id}`,
        label: getTechniqueTranslation(techniqueRow, techniqueLanguage).name || 'Technique',
        onClick: (editor, selectionSnapshot) => {
          handleTechniqueContextAction(techniqueRow, editor, selectionSnapshot)
        },
      })),
    ]
  }, [captureSelectionAsObject, handleTechniqueContextAction, insertExistingReferenceIntoEditor, notebookLocale, notebookObjects, techniqueLanguage, techniques])

  const renderedModalEffectDescription = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(getTechniqueTranslation(modalTechnique, techniqueLanguage).effectDescription || '')),
    [modalTechnique, techniqueLanguage]
  )

  const renderedModalWorkedExample = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(getTechniqueTranslation(modalTechnique, techniqueLanguage).workedExample || '')),
    [modalTechnique, techniqueLanguage]
  )

  const renderedModalApplicationStructure = useMemo(
    () => renderMathInHtml(normalizeMathHtmlInput(getTechniqueTranslation(modalTechnique, techniqueLanguage).applicationStructure || '')),
    [modalTechnique, techniqueLanguage]
  )

  return (
    <>
      <div className="page wb-page wb-notebook-page">
        <div className="wb-screen-header">
          <div>
            <h1 className="page-title">Whiteboard Notebook</h1>
            <div className="saved-empty">Hoja normal con objetos matematicos referenciados y una zona unica de solucion.</div>
          </div>
          <div className="wb-header-actions">
            {!isNotebookLibraryMode ? (
              <>
                <button type="button" className="btn" onClick={handleExportNotebookJson} disabled={!selectedExercise || !notebook}>
                  Export JSON
                </button>
                <button type="button" className="btn" onClick={() => importFileRef.current?.click()}>
                  Import JSON
                </button>
                <button type="button" className="btn" onClick={handleDownloadNotebookTemplate}>
                  Template JSON
                </button>
              </>
            ) : null}
            <button type="button" className="btn" onClick={handleResetNotebook} disabled={!selectedExercise}>Reset Notebook</button>
            <button type="button" className="btn" onClick={onBackToWhiteboard}>
              {isNotebookLibraryMode ? 'Back to Notebooks' : 'Back to Module'}
            </button>
          </div>
        </div>
        {!isNotebookLibraryMode ? (
          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportNotebookJson}
          />
        ) : null}
        <input
          ref={libraryImportFileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImportNotebookLibraryFile}
        />

        <div className={`wb-notebook-layout ${isSidebarCollapsed ? 'has-collapsed-sidebar' : ''} ${isReferenceDockCollapsed ? 'has-collapsed-reference-dock' : ''}`}>
          <div className={`wb-notebook-sidebars ${hasExpandedSidePanel ? 'has-expanded-panel' : ''}`}>
            {(bothSidePanelsCollapsed || !isSidebarCollapsed) && (
            <div className={`panel wb-panel wb-notebook-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
              <div
                className={`wb-notebook-panel-head ${isSidebarCollapsed ? 'is-clickable' : ''}`}
                onClick={isSidebarCollapsed ? toggleSidebarPanel : undefined}
                onKeyDown={isSidebarCollapsed ? (event) => handlePanelHeadKeyDown(event, toggleSidebarPanel) : undefined}
                role={isSidebarCollapsed ? 'button' : undefined}
                tabIndex={isSidebarCollapsed ? 0 : undefined}
              >
                {isNotebookLibraryMode && !isSidebarCollapsed ? (
                  <div className="wb-notebook-panel-tabs" role="tablist" aria-label="Notebook sidebar sections">
                    <button
                      type="button"
                      className={`wb-notebook-panel-tab ${activeSidebarTab === 'exercise' ? 'is-active' : ''}`}
                      onClick={() => setActiveSidebarTab('exercise')}
                    >
                      {sidebarExerciseTabLabel}
                    </button>
                    <button
                      type="button"
                      className={`wb-notebook-panel-tab ${activeSidebarTab === 'share' ? 'is-active' : ''}`}
                      onClick={() => setActiveSidebarTab('share')}
                      disabled={!canShowShareSidebarTab}
                      title={canShowShareSidebarTab ? sidebarShareTabLabel : (notebookLocale === 'fr' ? 'Ouvrez une feuille pour la partager.' : 'Abre una hoja para compartirla.')}
                    >
                      {sidebarShareTabLabel}
                    </button>
                  </div>
                ) : (
                  <div className="saved-title">{isNotebookLibraryMode ? activeSidebarTabLabel : (notebookLocale === 'fr' ? 'Exercice' : 'Ejercicio')}</div>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleSidebarPanel()
                  }}
                >
                  {isSidebarCollapsed ? '>' : '<'}
                </button>
              </div>

              {!isSidebarCollapsed && (
                <>
                  {(!isNotebookLibraryMode || collabPageId) ? (
                    <div className="wb-collaboration-strip">
                      {collaborationStatus && <div className="wb-collaboration-activity">{collaborationStatus}</div>}
                      {collaborationError && <div className="auth-error">{collaborationError}</div>}
                      <div className="wb-collaboration-presence">
                        {collaborators.length > 0 ? collaborators.map((collaborator) => (
                          <div key={`${collaborator.clientId || collaborator.userId}-${collaborator.updatedAt || ''}`} className="wb-collab-chip">
                            <span className="wb-collab-dot" style={{ backgroundColor: collaborator.color || '#53d1f0' }} />
                            <span>{collaborator.username || 'Colaborador'}</span>
                            <span className="wb-collaboration-activity">{collaborator.activity || 'viendo'}</span>
                          </div>
                        )) : (
                          <div className="wb-collab-chip is-muted">
                            <span className="wb-collab-dot" style={{ backgroundColor: '#667085' }} />
                            <span>{notebookLocale === 'fr' ? 'Aucun collaborateur actif' : 'Sin colaboradores activos'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {(!isNotebookLibraryMode || activeSidebarTab === 'exercise') && allowExercisePicker ? (
                    <label className="field">
                      <span>{notebookLocale === 'fr' ? 'Exercice selectionne' : 'Ejercicio seleccionado'}</span>
                      <select
                        value={exerciseId}
                        onChange={(event) => {
                          handleExerciseChange(event.target.value)
                        }}
                        onFocus={() => markFocusArea('exercise_picker')}
                      >
                        <option value="">{notebookLocale === 'fr' ? 'Selectionner un exercice' : 'Selecciona un ejercicio'}</option>
                        {exercises.map((exercise) => (
                          <option key={exercise.id} value={exercise.id}>{exercise.title || 'Untitled exercise'}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {(!isNotebookLibraryMode || activeSidebarTab === 'exercise') && !allowExercisePicker ? (
                    <>
                      <div className="saved-empty" style={{ marginBottom: 10 }}>
                        {notebookLocale === 'fr'
                          ? 'Ce cahier ouvre directement ses feuilles dans cette vue.'
                          : 'Este cuaderno abre directamente sus hojas en esta vista.'}
                      </div>

                      {notebookBook ? (
                        <>
                          <div className="wb-template-summary">
                            <div className="saved-item-title">{notebookBook.title || 'Cuaderno sin titulo'}</div>
                            <div className="saved-item-meta">{notebookBook.description || 'Sin descripcion todavia.'}</div>
                            <div className="saved-item-tags">
                              {(notebookLocale === 'fr' ? 'Feuilles' : 'Hojas')}: {notebookBook.pages?.length || 0}
                            </div>
                          </div>

                          <label className="field">
                            <span>{notebookLocale === 'fr' ? 'Titre du cahier' : 'Titulo del cuaderno'}</span>
                            <input
                              type="text"
                              value={notebookBookDraft.title}
                              onChange={(event) => setNotebookBookDraft((prev) => ({ ...prev, title: event.target.value }))}
                              placeholder={notebookLocale === 'fr' ? 'Titre du cahier' : 'Titulo del cuaderno'}
                            />
                          </label>

                          <label className="field">
                            <span>{notebookLocale === 'fr' ? 'Description' : 'Descripcion'}</span>
                            <textarea
                              rows={3}
                              value={notebookBookDraft.description}
                              onChange={(event) => setNotebookBookDraft((prev) => ({ ...prev, description: event.target.value }))}
                              placeholder={notebookLocale === 'fr' ? 'Description breve du cahier' : 'Descripcion breve del cuaderno'}
                            />
                          </label>

                          <div className="wb-notebook-page-actions">
                            <button type="button" className="btn" onClick={handleSaveNotebookBookMetadata}>
                              {notebookLocale === 'fr' ? 'Enregistrer cahier' : 'Guardar cuaderno'}
                            </button>
                            <button type="button" className="btn" onClick={handleCreateNotebookBlankPage}>
                              {notebookLocale === 'fr' ? 'Nouvelle feuille' : 'Nueva hoja'}
                            </button>
                          </div>

                          <div className="saved-title wb-notebook-sidebar-section-title">
                            {notebookLocale === 'fr' ? 'Fichiers et modeles' : 'Archivos y plantillas'}
                          </div>
                          <div className="wb-notebook-sidebar-actions">
                            <button type="button" className="btn" onClick={handleExportNotebookLibraryPage} disabled={!activeNotebookPage}>
                              {notebookLocale === 'fr' ? 'Exporter feuille' : 'Exportar hoja'}
                            </button>
                            <button type="button" className="btn" onClick={handleExportNotebookLibraryBook} disabled={!notebookBook}>
                              {notebookLocale === 'fr' ? 'Exporter cahier' : 'Exportar cuaderno'}
                            </button>
                            <button type="button" className="btn" onClick={() => libraryImportFileRef.current?.click()} disabled={!notebookBook}>
                              {notebookLocale === 'fr' ? 'Importer fichier' : 'Importar archivo'}
                            </button>
                            <button type="button" className="btn" onClick={handleDownloadNotebookPageTemplate}>
                              {notebookLocale === 'fr' ? 'Modele feuille IA' : 'Plantilla hoja IA'}
                            </button>
                          </div>

                          <div className="wb-notebook-page-create">
                            <select
                              value={selectedSidebarExerciseId}
                              onChange={(event) => setSelectedSidebarExerciseId(event.target.value)}
                            >
                              <option value="">
                                {notebookLocale === 'fr' ? 'Lier un exercice existant' : 'Vincular ejercicio existente'}
                              </option>
                              {exercises.map((exercise) => (
                                <option key={exercise.id} value={exercise.id}>
                                  {exercise.title || 'Ejercicio sin titulo'}
                                </option>
                              ))}
                            </select>
                            <button type="button" className="btn" onClick={handleLinkExerciseAsNotebookPage}>
                              {notebookLocale === 'fr' ? 'Ajouter' : 'Agregar'}
                            </button>
                          </div>

                          {notebookBook.pages?.length ? (
                            <div className="saved-list wb-notebook-page-list">
                              {notebookBook.pages.map((page, index) => (
                                <div key={page.id} className="wb-notebook-page-row">
                                  <button
                                    type="button"
                                    className={`wb-reference-dock-item wb-notebook-page-nav-item ${activeNotebookPageId === page.id ? 'is-active' : ''}`}
                                    onClick={() => handleNotebookPageChange(page.id)}
                                  >
                                    <div className="wb-reference-dock-code-row">
                                      <strong>{notebookLocale === 'fr' ? 'Feuille' : 'Hoja'} {index + 1}</strong>
                                    </div>
                                    <div className="saved-item-title">{page.title || 'Hoja sin titulo'}</div>
                                    <div className="saved-item-meta">{getNotebookPageKindLabel(page, notebookLocale)}</div>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn danger wb-notebook-page-delete"
                                    onClick={() => handleDeleteNotebookPage(page)}
                                  >
                                    {notebookLocale === 'fr' ? 'Supprimer' : 'Eliminar'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="saved-empty">
                              {notebookLocale === 'fr'
                                ? 'Ce cahier n a pas encore de feuilles. Cree la premiere ici.'
                                : 'Este cuaderno todavia no tiene hojas. Crea la primera desde aqui.'}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="saved-empty">
                          {notebookLocale === 'fr'
                            ? 'Aucun cahier actif pour le moment.'
                            : 'No hay un cuaderno activo en este momento.'}
                        </div>
                      )}
                    </>
                  ) : null}

                  {(!isNotebookLibraryMode || activeSidebarTab === 'exercise') && (!selectedExercise || !notebook) ? (
                    <div className="saved-empty">
                      {isNotebookLibraryMode
                        ? 'Selecciona una hoja del cuaderno o crea una nueva desde este panel.'
                        : 'Create or select an exercise to open the notebook sheet.'}
                    </div>
                  ) : null}

                  {(!isNotebookLibraryMode || activeSidebarTab === 'exercise') && selectedExercise && notebook ? (
                    <div className="wb-template-summary">
                      <div className="saved-item-title">
                        {isNotebookLibraryMode
                          ? (activeNotebookPage?.title || selectedExercise.title || 'Untitled exercise')
                          : (selectedExercise.title || 'Untitled exercise')}
                      </div>
                      <div className="saved-item-meta">{selectedExercise.topic || 'No topic'}</div>
                      <div className="saved-item-tags">Referencias disponibles: {notebookObjects.length}</div>
                    </div>
                  ) : null}

                  {isNotebookLibraryMode && activeSidebarTab === 'share' ? (
                    canShowShareSidebarTab ? (
                      <>
                        <div className="wb-template-summary">
                          <div className="saved-item-title">{activeNotebookPage.title || selectedExercise.title || 'Hoja sin titulo'}</div>
                          <div className="saved-item-meta">{getNotebookPageKindLabel(activeNotebookPage, notebookLocale)}</div>
                          <div className="saved-item-tags">
                            {activeNotebookPage.shareCode
                              ? `${notebookLocale === 'fr' ? 'Code actif' : 'Codigo activo'}: ${activeNotebookPage.shareCode}`
                              : (notebookLocale === 'fr' ? 'Feuille privee sans code actif.' : 'Hoja privada sin codigo activo.')}
                          </div>
                        </div>

                        <div className="wb-notebook-share-card">
                          <div className="saved-title wb-notebook-sidebar-section-title" style={{ marginTop: 0 }}>
                            {notebookLocale === 'fr' ? 'Partager la feuille' : 'Compartir hoja'}
                          </div>
                          <div className="saved-empty">
                            {notebookLocale === 'fr'
                              ? 'Cette feuille reste privee. Elle ne peut etre ouverte qu avec son code ou son lien prive.'
                              : 'Esta hoja sigue siendo privada. Solo puede abrirse mediante su codigo o su enlace privado.'}
                          </div>
                          <div className="wb-notebook-share-status">
                            <span className="saved-item-tags">
                              {activeNotebookPage.shareCode
                                ? `${notebookLocale === 'fr' ? 'Code actif' : 'Codigo activo'}: ${activeNotebookPage.shareCode}`
                                : (notebookLocale === 'fr' ? 'Aucun code actif pour le moment.' : 'Todavia no hay un codigo activo.')}
                            </span>
                            <span className="saved-item-meta">
                              {activeNotebookPage.collabPageId
                                ? (notebookLocale === 'fr' ? 'Collaboration temps reel active.' : 'Colaboracion en tiempo real activa.')
                                : (notebookLocale === 'fr' ? 'Activez le partage pour collaborer en temps reel.' : 'Activa el compartido para colaborar en tiempo real.')}
                            </span>
                          </div>
                          <div className="wb-notebook-share-actions">
                            <button type="button" className="btn" onClick={handleCopyNotebookShareCode}>
                              {activeNotebookPage.shareCode
                                ? (notebookLocale === 'fr' ? 'Copier le code' : 'Copiar codigo')
                                : (notebookLocale === 'fr' ? 'Activer le code' : 'Activar codigo')}
                            </button>
                            <button type="button" className="btn" onClick={handleCopyNotebookShareLink}>
                              {activeNotebookPage.shareCode
                                ? (notebookLocale === 'fr' ? 'Copier le lien' : 'Copiar enlace')
                                : (notebookLocale === 'fr' ? 'Activer le lien' : 'Activar enlace')}
                            </button>
                          </div>
                        </div>

                      </>
                    ) : (
                      <div className="saved-empty">
                        {notebookLocale === 'fr'
                          ? 'Ouvrez une feuille du cahier pour activer son partage prive.'
                          : 'Abre una hoja del cuaderno para activar su compartido privado.'}
                      </div>
                    )
                  ) : null}

                  {notice && <div className="saved-empty">{notice}</div>}
                </>
              )}
            </div>
            )}

            {(bothSidePanelsCollapsed || !isReferenceDockCollapsed) && (
            <div className={`panel wb-panel wb-notebook-reference-dock ${isReferenceDockCollapsed ? 'is-collapsed' : ''}`}>
              <div
                className={`wb-notebook-panel-head ${isReferenceDockCollapsed ? 'is-clickable' : ''}`}
                onClick={isReferenceDockCollapsed ? toggleReferenceDockPanel : undefined}
                onKeyDown={isReferenceDockCollapsed ? (event) => handlePanelHeadKeyDown(event, toggleReferenceDockPanel) : undefined}
                role={isReferenceDockCollapsed ? 'button' : undefined}
                tabIndex={isReferenceDockCollapsed ? 0 : undefined}
              >
                <div className="saved-title">{notebookLocale === 'fr' ? 'References' : 'Referencias'}</div>
                <button
                  type="button"
                  className="btn"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleReferenceDockPanel()
                  }}
                >
                  {isReferenceDockCollapsed ? '>' : '<'}
                </button>
              </div>

              {!isReferenceDockCollapsed && (
                <>
                  {!selectedExercise || !notebook ? (
                    <div className="saved-empty">Los datos y las consignas apareceran aqui al abrir un cuaderno.</div>
                  ) : (
                    <>
                      {visibleReferenceDockSections.map((section) => (
                        <div key={section.id} className="wb-reference-dock-section">
                          <div className="saved-title">{section.title}</div>
                          {section.items.length ? (
                            <div className="saved-list wb-reference-dock-list">
                              {section.items.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={`wb-reference-dock-item ${activeReference?.id === item.id ? 'is-active' : ''}`}
                                  onClick={() => selectNotebookReference(item.id)}
                                >
                                  <div className="wb-reference-dock-code-row">
                                    <strong>[{item.referenceCode}]</strong>
                                  </div>
                                  <div
                                    className="wb-reference-dock-preview rich-html"
                                    dangerouslySetInnerHTML={{
                                      __html: renderHtmlPreview(getLocalizedNotebookHtml(item.content, item.contentFr, notebookLocale)),
                                    }}
                                  />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="saved-empty">{notebookLocale === 'fr' ? 'Aucune reference dans cette section.' : 'No hay referencias en esta seccion.'}</div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
            )}
          </div>

          <div className="wb-notebook-paper-shell">
            {!selectedExercise || !notebook ? (
              isNotebookLibraryMode ? (
                <div className="wb-notebook-paper wb-notebook-sheet wb-notebook-empty-sheet">
                  <div className="wb-notebook-paper-header">
                    <div className="wb-notebook-kicker">Cuaderno</div>
                    <h2>{notebookBook?.title || 'Cuaderno sin titulo'}</h2>
                  </div>

                  <section className="wb-sheet-section">
                    <h3 className="wb-sheet-title">Hoja vacia</h3>
                    <div className="auth-tabs" style={{ marginBottom: 8 }}>
                      {TECHNIQUE_LANGUAGE_OPTIONS.map((language) => (
                        <button
                          key={language.id}
                          type="button"
                          className={`auth-tab ${notebookLocale === language.id ? 'active' : ''}`}
                          onClick={() => handleNotebookLanguageChange(language.id)}
                        >
                          {language.label}
                        </button>
                      ))}
                    </div>
                    <div className="saved-empty" style={{ marginBottom: 10 }}>
                      Este cuaderno aun no tiene hojas. Puedes crear una hoja nueva, importar una hoja sembrada o preparar texto libre aqui mientras organizas el cuaderno.
                    </div>
                    <div className="wb-notebook-main-editor">
                      <SafeDescriptionEditor
                        value={emptyNotebookSolutionHtml}
                        onChange={(value) => setEmptyNotebookSolutionHtml(value)}
                        baseFontFamily={EDITOR_FONT_FAMILY}
                        baseFontSize={18}
                        textColorPresets={NOTEBOOK_TEXT_COLOR_PRESETS}
                        onFocusCapture={() => markFocusArea('solution_editor')}
                        contextMenuActions={[]}
                        extraToolbarButtons={[]}
                      />
                    </div>
                  </section>
                </div>
              ) : (
                <div className="wb-notebook-paper wb-notebook-sheet wb-notebook-empty-sheet">
                  <div className="wb-notebook-paper-header">
                    <div className="wb-notebook-kicker">Notebook</div>
                    <h2>Whiteboard Notebook</h2>
                  </div>
                  <section className="wb-sheet-section">
                    <h3 className="wb-sheet-title">Notebook</h3>
                    <div className="saved-empty">The notebook sheet will appear here once an exercise is selected.</div>
                  </section>
                </div>
              )
            ) : (
                <div className="wb-notebook-paper wb-notebook-sheet">
                  <div className="wb-notebook-paper-header">
                    <div className="wb-notebook-kicker">Cuaderno</div>
                    <h2>{(isNotebookLibraryMode ? activeNotebookPage?.title : '') || notebook.exerciseTitle || 'Untitled notebook'}</h2>
                  </div>

                <section className="wb-sheet-section">
                  <h3 className="wb-sheet-title">Hoja</h3>
                  <div className="auth-tabs" style={{ marginBottom: 8 }}>
                    {TECHNIQUE_LANGUAGE_OPTIONS.map((language) => (
                      <button
                        key={language.id}
                        type="button"
                        className={`auth-tab ${notebookLocale === language.id ? 'active' : ''}`}
                        onClick={() => handleNotebookLanguageChange(language.id)}
                      >
                        {language.label}
                      </button>
                    ))}
                  </div>
                  <div className="saved-empty" style={{ marginBottom: 10 }}>
                    {notebookLocale === 'fr'
                      ? 'L enonce, les donnees et les consignes sont deja semes dans la feuille. La barre reste en haut et le clic droit applique une technique dans le document.'
                      : 'El enunciado, los datos y las consignas ya estan sembrados dentro de la hoja. La barra queda arriba y el clic derecho aplica una tecnica dentro del documento.'}
                  </div>
                  {techniquesError && <div className="auth-error" style={{ marginBottom: 10 }}>{techniquesError}</div>}
                  <div className="wb-notebook-main-editor">
                    <SafeDescriptionEditor
                      resetKey={notebookEditorResetKey}
                      value={notebookEditorDraftHtml}
                      onExternalContentApplied={releaseNotebookProgrammaticEditorLock}
                      onChange={(value) => {
                        if (suppressNotebookEditorChangeRef.current) return
                        if (isNotebookLocaleTransitionPending()) return
                        setNotebookEditorDraftHtml(value)
                        updateNotebook((prev) => {
                          const nextNotebook = applyWhiteboardNotebookDocumentEdit(prev, value, notebookLocale)
                          if (nextNotebook) return nextNotebook
                          return { [getNotebookSolutionField(notebookLocale)]: value }
                        })
                      }}
                      baseFontFamily={EDITOR_FONT_FAMILY}
                      baseFontSize={18}
                      textColorPresets={NOTEBOOK_TEXT_COLOR_PRESETS}
                      onFocusCapture={() => {
                        setIsNotebookEditorFocused(true)
                        if (!isNotebookLocaleTransitionPending()) {
                          clearNotebookProgrammaticEditorLock()
                        }
                        markFocusArea('solution_editor')
                      }}
                      onBlurCapture={() => {
                        setIsNotebookEditorFocused(false)
                      }}
                      onSelectionSnapshotChange={handleSolutionSelectionChange}
                      contextMenuActions={solutionTechniqueContextActions}
                      extraToolbarButtons={[
                        {
                          id: 'insert-reference',
                          label: activeReference ? `Insert ${activeReference.referenceCode}` : 'Insert Ref',
                          title: activeReference ? `Insert ${activeReference.referenceCode}` : 'Select a notebook object first',
                          onClick: insertReferenceIntoSolution,
                          disabled: !activeReference,
                        },
                        {
                          id: 'capture-selection',
                          label: 'Create Ref From Selection',
                          title: 'Capture the current selection and convert it into a reusable notebook object',
                          onClick: captureSelectionAsObject,
                          disabled: false,
                        },
                      ]}
                    />
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      {referenceMenu.open && (
        <div
          ref={referenceMenuRef}
          className="wb-context-editor wb-context-menu wb-notebook-context-menu"
          style={{
            left: `${referenceMenu.x}px`,
            top: `${referenceMenu.y}px`,
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={() => addNotebookObjectToColumn(referenceMenu.columnId)}
          >
            Agregar bloque
          </button>
          {referenceMenu.itemId && (
            <button
              type="button"
              className="btn danger"
              onClick={() => deleteNotebookObjectFromColumn(referenceMenu.columnId, referenceMenu.itemId)}
            >
              Eliminar bloque
            </button>
          )}
        </div>
      )}

      {modalTechnique && (
        <div className="mp-details-backdrop" onClick={() => setModalTechniqueId('')}>
          <div className="mp-details-modal is-wide" onClick={(event) => event.stopPropagation()}>
            <div className="mp-details-header">
              <div>
                <div className="mp-details-kicker">Technique Reference</div>
                <div className="mp-details-title">{getTechniqueTranslation(modalTechnique, techniqueLanguage).name || 'Technique'}</div>
              </div>
              <button type="button" className="btn" onClick={() => setModalTechniqueId('')}>Close</button>
            </div>

            <div className="mp-details-grid">
              <div className="mp-details-item">Topic: {modalTechnique.topic_fr || modalTechnique.topic || 'N/A'}</div>
              <div className="mp-details-item">Subtopic: {modalTechnique.subtopic_fr || modalTechnique.subtopic || 'N/A'}</div>
              <div className="mp-details-item">Effect type: {modalTechnique.effect_type_fr || modalTechnique.effect_type || 'N/A'}</div>
              <div className="mp-details-item">Locale: {techniqueLanguage.toUpperCase()}</div>
            </div>

            <div className="mp-details-section">
              <div className="mp-details-section-title">Effect description</div>
              <div className="mp-details-body" dangerouslySetInnerHTML={{ __html: renderedModalEffectDescription }} />
            </div>

            <div className="mp-details-section">
              <div className="mp-details-section-title">Worked example</div>
              <div className="mp-details-body" dangerouslySetInnerHTML={{ __html: renderedModalWorkedExample }} />
            </div>

            <div className="mp-details-section">
              <div className="mp-details-section-title">Application structure</div>
              <div className="mp-details-body" dangerouslySetInnerHTML={{ __html: renderedModalApplicationStructure }} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

