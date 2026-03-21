import { normalizeMathHtmlInput } from './mathHtml'

const WHITEBOARD_WORKSPACE_FORMAT = 'inticore-whiteboard-workspace-v1'

function normalizeRichValue(value) {
  if (value === null || value === undefined) return ''
  const raw = String(value || '')
  if (!raw.trim()) return ''
  return normalizeMathHtmlInput(raw)
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') return null
  return {
    id: String(node.id || '').trim() || `wb-node-imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: String(node.type || 'fact').trim() || 'fact',
    title: String(node.title || '').trim(),
    content: normalizeRichValue(node.content),
    x: Number.isFinite(Number(node.x)) ? Number(node.x) : 120,
    y: Number.isFinite(Number(node.y)) ? Number(node.y) : 120,
    width: Number.isFinite(Number(node.width)) ? Number(node.width) : 220,
    locked: Boolean(node.locked),
    isOfficial: Boolean(node.isOfficial),
    collapsed: Boolean(node.collapsed),
    customColor: String(node.customColor || '').trim(),
    memberNodeIds: Array.isArray(node.memberNodeIds) ? node.memberNodeIds.map((item) => String(item || '').trim()).filter(Boolean) : [],
  }
}

function normalizeLink(link) {
  if (!link || typeof link !== 'object') return null
  return {
    id: String(link.id || '').trim() || `wb-link-imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromNodeId: String(link.fromNodeId || '').trim(),
    toNodeId: String(link.toNodeId || '').trim(),
    label: String(link.label || '').trim(),
    techniqueId: String(link.techniqueId || '').trim(),
    justification: normalizeRichValue(link.justification),
  }
}

export function buildWhiteboardWorkspaceExportJson({
  workspace,
  exercise,
  exportedByUserId = '',
}) {
  return {
    format: WHITEBOARD_WORKSPACE_FORMAT,
    entity: 'whiteboard_workspace',
    version: 1,
    notes: 'This file stores a full whiteboard snapshot including the base exercise, nodes, links, groups, collapsed states, colors, and rich math content. Rich fields accept editor HTML and preserve inline math.',
    exportedAt: new Date().toISOString(),
    exportedByUserId: String(exportedByUserId || '').trim(),
    workspace: {
      title: String(workspace?.exercise_title || exercise?.title || 'Math Whiteboard').trim(),
      sourceWorkspaceId: String(workspace?.id || '').trim(),
      visibility: String(workspace?.visibility || 'public').trim() || 'public',
      exercise: exercise || workspace?.exercise_snapshot || null,
      nodes: Array.isArray(workspace?.nodes) ? workspace.nodes : [],
      links: Array.isArray(workspace?.links) ? workspace.links : [],
    },
  }
}

export function buildWhiteboardWorkspaceTemplateJson() {
  return {
    format: WHITEBOARD_WORKSPACE_FORMAT,
    entity: 'whiteboard_workspace',
    version: 1,
    notes: 'Use workspace.exercise for the base exercise. Use workspace.nodes and workspace.links for the whiteboard graph. Nodes may include rich HTML with inline math. Links may include rich justification. Groups are nodes with type "group" and memberNodeIds. collapsed=true reduces a node to its title in the board.',
    workspace: {
      title: 'Exercise 12 - Quadratic Intersections',
      visibility: 'public',
      exercise: {
        topic: 'Analytic Geometry',
        title: 'Exercise 12 - Quadratic Intersections',
        sourceBook: 'Geometry Workbook',
        sourceAuthor: 'Author Name',
        sourcePage: '45',
        sourceSection: 'Parabolas',
        sourceReference: 'Example set B',
        statement: '<p>Find the intersection points of <span data-type="math-inline" data-latex="y=x^2"></span> and <span data-type="math-inline" data-latex="y=4"></span>.</p>',
        officialResult: '<p>The intersection points are <span data-type="math-inline" data-latex="(-2,4)"></span> and <span data-type="math-inline" data-latex="(2,4)"></span>.</p>',
        dataItems: [
          '<p>The parabola is <span data-type="math-inline" data-latex="y=x^2"></span>.</p>',
          '<p>The horizontal line is <span data-type="math-inline" data-latex="y=4"></span>.</p>',
        ],
        antiproblem: '<p>The intersection points are...</p>',
      },
      nodes: [
        {
          id: 'wb-node-problem',
          type: 'problem',
          title: 'Exercise 12 - Quadratic Intersections',
          content: '<p>Find the intersection points of <span data-type="math-inline" data-latex="y=x^2"></span> and <span data-type="math-inline" data-latex="y=4"></span>.</p>',
          x: 80,
          y: 60,
          width: 220,
          locked: true,
        },
      ],
      links: [],
    },
  }
}

export function extractWhiteboardWorkspaceFromJson(json) {
  const root = json && typeof json === 'object' ? json : null
  const workspace = root?.workspace && typeof root.workspace === 'object'
    ? root.workspace
    : root?.whiteboard && typeof root.whiteboard === 'object'
      ? root.whiteboard
      : root

  if (!workspace || typeof workspace !== 'object') return null

  const exercise = workspace.exercise && typeof workspace.exercise === 'object' ? workspace.exercise : null
  const nodes = (Array.isArray(workspace.nodes) ? workspace.nodes : []).map(normalizeNode).filter(Boolean)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const links = (Array.isArray(workspace.links) ? workspace.links : [])
    .map(normalizeLink)
    .filter((link) => link && nodeIds.has(link.fromNodeId) && nodeIds.has(link.toNodeId))

  if (!exercise || !nodes.length) return null

  return {
    title: String(workspace.title || exercise.title || 'Imported Whiteboard').trim(),
    visibility: String(workspace.visibility || 'public').trim() || 'public',
    sourceWorkspaceId: String(workspace.sourceWorkspaceId || '').trim(),
    exercise,
    nodes,
    links,
  }
}
