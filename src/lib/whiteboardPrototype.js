import { hasMeaningfulHtmlContent, normalizeMathHtmlInput } from './mathHtml'

const EXERCISES_KEY = 'inticore-whiteboard-exercises'
const TECHNIQUES_KEY = 'inticore-whiteboard-techniques'
const ACTIVE_EXERCISE_KEY = 'inticore-whiteboard-active-exercise'
const ACTIVE_WORKSPACE_KEY = 'inticore-whiteboard-active-workspace'
const WORKSPACE_PREFIX = 'inticore-whiteboard-workspace:'

export const WHITEBOARD_NODE_TYPES = [
  { id: 'problem', label: 'Problem', color: '#5b8cff' },
  { id: 'antiproblem', label: 'Antiproblem', color: '#ff8a4c' },
  { id: 'data', label: 'Data', color: '#3ecf8e' },
  { id: 'result', label: 'Official Answer', color: '#f5c451' },
  { id: 'group', label: 'Group', color: '#8bd3dd' },
  { id: 'fact', label: 'Fact', color: '#c77dff' },
  { id: 'comment', label: 'Comment', color: '#94a3b8' },
  { id: 'question', label: 'Question', color: '#ff6b9a' },
  { id: 'technique', label: 'Technique', color: '#53d1f0' },
]

export const TECHNIQUE_TEMPLATES = [
  {
    id: 'operator-1',
    label: 'Single-input operator',
    effectKind: 'operator',
    inputMode: 'single',
    summary: 'Transforms one input node into a new element.',
  },
  {
    id: 'operator-2',
    label: 'Two-input operator',
    effectKind: 'operator',
    inputMode: 'double',
    summary: 'Combines two inputs to produce an output.',
  },
  {
    id: 'criterion',
    label: 'Conditional criterion',
    effectKind: 'criterion',
    inputMode: 'single',
    summary: 'Evaluates a condition and enables a conclusion.',
  },
]

const EMPTY_EXERCISE = {
  id: null,
  topic: '',
  title: '',
  sourceBook: '',
  sourceAuthor: '',
  sourcePage: '',
  sourceSection: '',
  sourceReference: '',
  statement: '',
  officialResult: '',
  dataItems: [],
  antiproblem: '',
  createdAt: '',
  updatedAt: '',
}

const EMPTY_TECHNIQUE = {
  id: null,
  name: '',
  effectKind: 'operator',
  inputMode: 'single',
  templateId: TECHNIQUE_TEMPLATES[0].id,
  summary: '',
  createdAt: '',
  updatedAt: '',
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

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function buildEmptyWhiteboardExercise() {
  return { ...EMPTY_EXERCISE }
}

export function buildEmptyWhiteboardTechnique() {
  return { ...EMPTY_TECHNIQUE }
}

export function listWhiteboardExercises() {
  const rows = readJson(EXERCISES_KEY, [])
  return Array.isArray(rows) ? rows.map(normalizeWhiteboardExerciseRecord) : []
}

export function saveWhiteboardExercise(form) {
  const rows = listWhiteboardExercises()
  const timestamp = new Date().toISOString()
  const record = {
    ...EMPTY_EXERCISE,
    ...form,
    id: form.id || createId('wb-exercise'),
    topic: String(form.topic || '').trim(),
    title: String(form.title || '').trim(),
    sourceBook: String(form.sourceBook || '').trim(),
    sourceAuthor: String(form.sourceAuthor || '').trim(),
    sourcePage: String(form.sourcePage || '').trim(),
    sourceSection: String(form.sourceSection || '').trim(),
    sourceReference: String(form.sourceReference || '').trim(),
    statement: normalizeRichHtml(form.statement),
    officialResult: normalizeRichHtml(form.officialResult),
    dataItems: sanitizeRichList(form.dataItems).slice(0, 10),
    antiproblem: normalizeRichHtml(form.antiproblem),
    createdAt: form.createdAt || timestamp,
    updatedAt: timestamp,
  }

  const nextRows = rows.some((item) => item.id === record.id)
    ? rows.map((item) => (item.id === record.id ? record : item))
    : [record, ...rows]

  writeJson(EXERCISES_KEY, nextRows)
  setActiveWhiteboardExerciseId(record.id)
  return record
}

export function deleteWhiteboardExercise(exerciseId) {
  if (!exerciseId) return false

  const rows = listWhiteboardExercises()
  const nextRows = rows.filter((item) => item.id !== exerciseId)
  writeJson(EXERCISES_KEY, nextRows)

  if (getActiveWhiteboardExerciseId() === exerciseId) {
    setActiveWhiteboardExerciseId('')
  }

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(`${WORKSPACE_PREFIX}${exerciseId}`)
  }

  return true
}

export function listWhiteboardTechniques() {
  const rows = readJson(TECHNIQUES_KEY, [])
  return Array.isArray(rows) ? rows : []
}

export function saveWhiteboardTechnique(form) {
  const rows = listWhiteboardTechniques()
  const timestamp = new Date().toISOString()
  const record = {
    ...EMPTY_TECHNIQUE,
    ...form,
    id: form.id || createId('wb-technique'),
    name: String(form.name || '').trim(),
    effectKind: String(form.effectKind || 'operator').trim() || 'operator',
    inputMode: String(form.inputMode || 'single').trim() || 'single',
    templateId: String(form.templateId || TECHNIQUE_TEMPLATES[0].id).trim(),
    summary: String(form.summary || '').trim(),
    createdAt: form.createdAt || timestamp,
    updatedAt: timestamp,
  }

  const nextRows = rows.some((item) => item.id === record.id)
    ? rows.map((item) => (item.id === record.id ? record : item))
    : [record, ...rows]

  writeJson(TECHNIQUES_KEY, nextRows)
  return record
}

export function getActiveWhiteboardExerciseId() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(ACTIVE_EXERCISE_KEY) || ''
}

export function setActiveWhiteboardExerciseId(exerciseId) {
  if (typeof window === 'undefined') return
  if (!exerciseId) {
    window.localStorage.removeItem(ACTIVE_EXERCISE_KEY)
    return
  }
  window.localStorage.setItem(ACTIVE_EXERCISE_KEY, exerciseId)
}

export function getActiveWhiteboardWorkspaceId() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) || ''
}

export function setActiveWhiteboardWorkspaceId(workspaceId) {
  if (typeof window === 'undefined') return
  if (!workspaceId) {
    window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
    return
  }
  window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId)
}

export function getNodeTypeMeta(typeId) {
  return WHITEBOARD_NODE_TYPES.find((item) => item.id === typeId) || WHITEBOARD_NODE_TYPES[0]
}

export function createWorkspaceNode(type, title, content, x, y, extra = {}) {
  return {
    id: createId('wb-node'),
    type,
    title,
    content,
    x,
    y,
    width: 260,
    ...extra,
  }
}

export function createWorkspaceLink(fromNodeId, toNodeId, label, extra = {}) {
  return {
    id: createId('wb-link'),
    fromNodeId,
    toNodeId,
    label: String(label || '').trim(),
    justification: String(extra.justification || '').trim(),
    ...extra,
  }
}

export function generateWorkspaceFromExercise(exercise) {
  if (!exercise) return []

  const nodes = [
    createWorkspaceNode('problem', exercise.title || 'Problem', exercise.statement || '', 80, 60, { locked: true }),
    createWorkspaceNode('result', 'Official Answer', exercise.officialResult || '', 760, 60, {
      locked: true,
      isOfficial: true,
    }),
  ]

  if (hasMeaningfulHtmlContent(exercise.antiproblem)) {
    nodes.push(
      createWorkspaceNode('antiproblem', 'Antiproblem', exercise.antiproblem, 760, 250, {
        locked: true,
      })
    )
  }

  ;(exercise.dataItems || []).forEach((item, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    nodes.push(
      createWorkspaceNode('data', `Data ${index + 1}`, item, 80 + column * 320, 320 + row * 170, {
        locked: true,
      })
    )
  })

  return nodes
}

export function generateWorkspaceLinksFromExercise(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return []

  const problemNode = nodes.find((node) => node.type === 'problem')
  if (!problemNode) return []

  return nodes
    .filter((node) => node.type === 'data')
    .map((node) => createWorkspaceLink(node.id, problemNode.id, 'Statement data'))
}

export function getStoredWorkspace(exerciseId) {
  if (!exerciseId) return null
  const stored = readJson(`${WORKSPACE_PREFIX}${exerciseId}`, null)
  if (Array.isArray(stored)) {
    const sanitizedNodes = sanitizeStoredNodes(stored)
    return {
      nodes: sanitizedNodes,
      links: [],
    }
  }
  if (!stored || typeof stored !== 'object') return null
  const sanitizedNodes = sanitizeStoredNodes(stored.nodes)
  return {
    nodes: sanitizedNodes,
    links: sanitizeStoredLinks(stored.links, sanitizedNodes),
  }
}

export function saveWorkspace(exerciseId, workspace) {
  if (!exerciseId) return
  writeJson(`${WORKSPACE_PREFIX}${exerciseId}`, {
    nodes: Array.isArray(workspace?.nodes) ? workspace.nodes : [],
    links: Array.isArray(workspace?.links) ? workspace.links : [],
  })
}

export function createManualNode(type) {
  const meta = getNodeTypeMeta(type)
  return createWorkspaceNode(type, meta.label, '', 320, 220)
}

export function createGroupNode(memberNodeIds = []) {
  return {
    id: createId('wb-group'),
    type: 'group',
    title: 'Group',
    content: '',
    memberNodeIds: Array.isArray(memberNodeIds) ? memberNodeIds.filter(Boolean) : [],
    width: 0,
    x: 0,
    y: 0,
  }
}

export function listToMultiline(items) {
  return sanitizeList(items).join('\n')
}

export function multilineToList(value) {
  return sanitizeList(String(value || '').split('\n'))
}

function sanitizeList(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeRichHtml(value) {
  if (!value) return ''
  const normalized = normalizeMathHtmlInput(value)
  return hasMeaningfulHtmlContent(normalized) ? normalized : ''
}

function sanitizeRichList(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeRichHtml(item))
    .filter(Boolean)
}

function normalizeWhiteboardExerciseRecord(record) {
  const nextRecord = record && typeof record === 'object' ? record : {}
  const legacySource = String(nextRecord.source || '').trim()
  const legacyAntiproblem = Array.isArray(nextRecord.antiproblemItems)
    ? nextRecord.antiproblemItems.map((item) => `<p>${escapeHtml(String(item || '').trim())}</p>`).join('')
    : ''

  return {
    ...EMPTY_EXERCISE,
    ...nextRecord,
    topic: String(nextRecord.topic || '').trim(),
    title: String(nextRecord.title || '').trim(),
    sourceBook: String(nextRecord.sourceBook || legacySource || '').trim(),
    sourceAuthor: String(nextRecord.sourceAuthor || '').trim(),
    sourcePage: String(nextRecord.sourcePage || '').trim(),
    sourceSection: String(nextRecord.sourceSection || '').trim(),
    sourceReference: String(nextRecord.sourceReference || '').trim(),
    statement: normalizeRichHtml(nextRecord.statement),
    officialResult: normalizeRichHtml(nextRecord.officialResult),
    dataItems: sanitizeRichList(nextRecord.dataItems),
    antiproblem: normalizeRichHtml(nextRecord.antiproblem || legacyAntiproblem),
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function sanitizeStoredNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).filter((node) => !['topic', 'source'].includes(String(node?.type || '').trim()))
}

function sanitizeStoredLinks(links, nodes) {
  const allowedNodeIds = new Set((Array.isArray(nodes) ? nodes : []).map((node) => node.id))
  return (Array.isArray(links) ? links : []).filter((link) => allowedNodeIds.has(link?.fromNodeId) && allowedNodeIds.has(link?.toNodeId))
}
