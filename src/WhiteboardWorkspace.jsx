import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import { downloadJsonFile, parseJsonFile } from './lib/competitiveJson'
import { supabase } from './lib/supabase'
import { listPrivateCompetitiveTechniqueInventory } from './data/competitiveTechniquesRepo'
import {
  cloneWhiteboardWorkspace,
  ensureRootWhiteboardWorkspace,
  getWhiteboardWorkspaceById,
  updateWhiteboardWorkspace,
} from './data/whiteboardWorkspaceRepo'
import {
  WHITEBOARD_NODE_TYPES,
  buildEmptyWhiteboardExercise,
  createGroupNode,
  createManualNode,
  createWorkspaceLink,
  generateWorkspaceFromExercise,
  generateWorkspaceLinksFromExercise,
  getActiveWhiteboardExerciseId,
  getActiveWhiteboardWorkspaceId,
  getNodeTypeMeta,
  getStoredWorkspace,
  listWhiteboardExercises,
  saveWhiteboardExercise,
  saveWorkspace,
  setActiveWhiteboardExerciseId,
  setActiveWhiteboardWorkspaceId,
} from './lib/whiteboardPrototype'
import { normalizeMathHtmlInput, renderMathInHtml } from './lib/mathHtml'
import { getTechniqueTranslation, TECHNIQUE_LANGUAGE_OPTIONS } from './lib/competitiveTechniqueLocale'
import {
  buildWhiteboardWorkspaceExportJson,
  extractWhiteboardWorkspaceFromJson,
} from './lib/whiteboardWorkspaceJson'

const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'
const FIXED_NODE_WIDTH = 260
const FIXED_NODE_HEIGHT = 140
const GROUP_PADDING = 28
const HISTORY_LIMIT = 80
const MIN_ZOOM_LEVEL = 0.6
const MAX_ZOOM_LEVEL = 1.8
const ZOOM_STEP = 0.1
const COLLABORATOR_COLORS = ['#53d1f0', '#f5c451', '#ef7d57', '#8bd3dd', '#9b8cff', '#73e2a7', '#ff9ecd', '#ffcf70']

function buildRealtimeClientId() {
  return `wb-client-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`
}

function pickCollaboratorColor(seed) {
  const key = String(seed || '')
  const hash = key.split('').reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 0)
  return COLLABORATOR_COLORS[hash % COLLABORATOR_COLORS.length]
}

function buildPresencePayload({
  session,
  editorState,
  dragState,
  selectedNodeId,
  selectedLinkId,
  linkForm,
  clientId,
}) {
  const username = String(session?.username || session?.userId || 'Anonymous').trim()
  const userId = String(session?.userId || '').trim()
  const color = pickCollaboratorColor(userId || username)
  let editingType = 'board'
  let targetId = ''
  let activity = 'browsing'

  if (dragState?.nodeId) {
    editingType = 'node'
    targetId = dragState.nodeId
    activity = 'moving'
  } else if (editorState?.mode === 'node') {
    editingType = 'node'
    targetId = editorState.targetId || selectedNodeId || ''
    activity = 'editing'
  } else if (editorState?.mode === 'link') {
    editingType = 'link'
    targetId = editorState.targetId || selectedLinkId || ''
    activity = 'editing'
  } else if (selectedLinkId) {
    editingType = 'link'
    targetId = selectedLinkId
    activity = 'selected'
  } else if (selectedNodeId) {
    editingType = 'node'
    targetId = selectedNodeId
    activity = 'selected'
  }

  return {
    clientId,
    userId,
    username,
    color,
    editingType,
    targetId,
    sourceNodeId: linkForm?.sourceNodeId || '',
    activity,
    updatedAt: new Date().toISOString(),
  }
}

function flattenPresenceState(state) {
  return Object.values(state || {}).flatMap((entries) => (Array.isArray(entries) ? entries : [])).filter(Boolean)
}

function getNodeBounds(node, allNodes) {
  if (!node) return null
  if (node.type !== 'group') {
    const collapsed = Boolean(node.collapsed)
    return {
      x: node.x,
      y: node.y,
      width: node.width || FIXED_NODE_WIDTH,
      height: collapsed ? 72 : FIXED_NODE_HEIGHT,
    }
  }

  const memberNodes = (Array.isArray(node.memberNodeIds) ? node.memberNodeIds : [])
    .map((memberId) => allNodes.find((item) => item.id === memberId && item.type !== 'group'))
    .filter(Boolean)

  if (!memberNodes.length) {
    return {
      x: node.x || 120,
      y: node.y || 120,
      width: 320,
      height: 180,
    }
  }

  const minX = Math.min(...memberNodes.map((item) => item.x))
  const minY = Math.min(...memberNodes.map((item) => item.y))
  const maxX = Math.max(...memberNodes.map((item) => item.x + (item.width || FIXED_NODE_WIDTH)))
  const maxY = Math.max(...memberNodes.map((item) => item.y + FIXED_NODE_HEIGHT))

  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING - 18,
    width: (maxX - minX) + GROUP_PADDING * 2,
    height: (maxY - minY) + GROUP_PADDING * 2 + 18,
  }
}

function pointInsideBounds(point, bounds) {
  return point.x > bounds.x && point.x < bounds.x + bounds.width && point.y > bounds.y && point.y < bounds.y + bounds.height
}

function buildRouteSegments(points) {
  return points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
  }))
}

function segmentIntersectsBounds(segment, bounds, padding = 14) {
  const rect = {
    left: bounds.x - padding,
    right: bounds.x + bounds.width + padding,
    top: bounds.y - padding,
    bottom: bounds.y + bounds.height + padding,
  }

  const { from, to } = segment
  if (from.x === to.x) {
    const x = from.x
    if (x <= rect.left || x >= rect.right) return false
    const minY = Math.min(from.y, to.y)
    const maxY = Math.max(from.y, to.y)
    return maxY > rect.top && minY < rect.bottom
  }

  if (from.y === to.y) {
    const y = from.y
    if (y <= rect.top || y >= rect.bottom) return false
    const minX = Math.min(from.x, to.x)
    const maxX = Math.max(from.x, to.x)
    return maxX > rect.left && minX < rect.right
  }

  return false
}

function segmentsIntersect(first, second) {
  const firstVertical = first.from.x === first.to.x
  const secondVertical = second.from.x === second.to.x

  if (firstVertical === secondVertical) return false

  const vertical = firstVertical ? first : second
  const horizontal = firstVertical ? second : first

  const vx = vertical.from.x
  const hy = horizontal.from.y
  const vMinY = Math.min(vertical.from.y, vertical.to.y)
  const vMaxY = Math.max(vertical.from.y, vertical.to.y)
  const hMinX = Math.min(horizontal.from.x, horizontal.to.x)
  const hMaxX = Math.max(horizontal.from.x, horizontal.to.x)

  return vx > hMinX && vx < hMaxX && hy > vMinY && hy < vMaxY
}

function buildOrthogonalLinkRoute(link, nodes, existingRoutes, linkIndex) {
  const fromNode = nodes.find((node) => node.id === link.fromNodeId)
  const toNode = nodes.find((node) => node.id === link.toNodeId)
  if (!fromNode || !toNode) return null

  const fromBounds = getNodeBounds(fromNode, nodes)
  const toBounds = getNodeBounds(toNode, nodes)
  if (!fromBounds || !toBounds) return null

  const goingRight = fromBounds.x <= toBounds.x
  const start = {
    x: goingRight ? fromBounds.x + fromBounds.width : fromBounds.x,
    y: fromBounds.y + (fromBounds.height / 2),
  }
  const end = {
    x: goingRight ? toBounds.x : toBounds.x + toBounds.width,
    y: toBounds.y + (toBounds.height / 2),
  }
  const centerMidpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }

  const midX = ((start.x + end.x) / 2) + ((linkIndex % 4) - 1.5) * 18
  const allRenderableBounds = nodes
    .filter((node) => node.id !== fromNode.id && node.id !== toNode.id)
    .map((node) => ({ id: node.id, ...getNodeBounds(node, nodes) }))

  const laneOffset = 48 + (linkIndex % 5) * 20
  const candidateXs = Array.from(new Set([
    midX,
    ...allRenderableBounds.flatMap((bounds) => [
      bounds.x - laneOffset,
      bounds.x + bounds.width + laneOffset,
    ]),
  ]))

  const candidateYs = Array.from(new Set([
    Math.min(fromBounds.y, toBounds.y) - laneOffset,
    Math.max(fromBounds.y + fromBounds.height, toBounds.y + toBounds.height) + laneOffset,
    ...allRenderableBounds.flatMap((bounds) => [
      bounds.y - laneOffset,
      bounds.y + bounds.height + laneOffset,
    ]),
  ]))

  const candidates = [
    ...candidateXs.map((laneX) => [start, { x: laneX, y: start.y }, { x: laneX, y: end.y }, end]),
    ...candidateYs.map((laneY) => [start, { x: start.x, y: laneY }, { x: end.x, y: laneY }, end]),
    ...candidateXs.flatMap((laneX) => candidateYs.map((laneY) => (
      [start, { x: laneX, y: start.y }, { x: laneX, y: laneY }, { x: end.x, y: laneY }, end]
    ))),
  ]

  const scored = candidates.map((points, index) => {
    const segments = buildRouteSegments(points)
    const nodePenalty = allRenderableBounds.reduce((acc, bounds) => {
      const collisions = segments.reduce(
        (segmentAcc, segment) => segmentAcc + (segmentIntersectsBounds(segment, bounds) ? 1 : 0),
        0
      )
      return acc + collisions
    }, 0)
    const linkPenalty = existingRoutes.reduce((acc, route) => {
      const collisions = segments.reduce((segmentAcc, segment) => (
        segmentAcc + route.segments.reduce((routeAcc, routeSegment) => (
          routeAcc + (segmentsIntersect(segment, routeSegment) ? 1 : 0)
        ), 0)
      ), 0)
      return acc + collisions
    }, 0)
    const length = points.reduce((acc, point, pointIndex) => {
      if (pointIndex === 0) return 0
      const prev = points[pointIndex - 1]
      return acc + Math.abs(point.x - prev.x) + Math.abs(point.y - prev.y)
    }, 0)
    const bendPenalty = Math.max(0, points.length - 2) * 8
    return {
      index,
      points,
      segments,
      score: nodePenalty * 5000 + linkPenalty * 800 + bendPenalty + length,
    }
  })

  const winner = scored.sort((a, b) => a.score - b.score)[0]
  const d = winner.points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const labelWidth = Math.max(72, Math.min(220, String(link.label || '').length * 7 + 26))

  return {
    ...link,
    d,
    labelX: centerMidpoint.x,
    labelY: centerMidpoint.y,
    labelWidth,
    segments: winner.segments,
  }
}

function renderNodeHtml(value) {
  return renderMathInHtml(normalizeMathHtmlInput(value || ''))
}

function buildEmptyLinkForm(sourceNodeId = '') {
  return {
    sourceNodeId,
    targetNodeId: '',
    techniqueId: '',
    label: '',
    justification: '',
  }
}

function buildEditorState() {
  return {
    mode: '',
    targetId: '',
    x: 0,
    y: 0,
  }
}

function buildCanvasMenuState() {
  return {
    open: false,
    mode: '',
    targetId: '',
    x: 0,
    y: 0,
    boardX: 0,
    boardY: 0,
  }
}

function buildPanState() {
  return {
    active: false,
    startClientX: 0,
    startClientY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  }
}

function buildSelectionBoxState() {
  return {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    additive: false,
    initialNodeIds: [],
    hasMoved: false,
  }
}

function clampFloatingPosition(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

function clampZoomLevel(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 1
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, numericValue))
}

function serializeBoard(nodes, links) {
  return JSON.stringify({
    nodes: Array.isArray(nodes) ? nodes : [],
    links: Array.isArray(links) ? links : [],
  })
}

function buildBoardSnapshot(nodes, links) {
  return {
    nodes: Array.isArray(nodes) ? nodes : [],
    links: Array.isArray(links) ? links : [],
  }
}

function resolveBoardState(exercise, storedWorkspace = null) {
  const nextNodes = storedWorkspace?.nodes?.length
    ? storedWorkspace.nodes
    : exercise
      ? generateWorkspaceFromExercise(exercise)
      : []
  const nextLinks = storedWorkspace?.links?.length
    ? storedWorkspace.links
    : generateWorkspaceLinksFromExercise(nextNodes)

  return {
    nodes: nextNodes,
    links: nextLinks,
  }
}

export default function WhiteboardWorkspace({ onBackToWhiteboard, session }) {
  const [exercises, setExercises] = useState(() => listWhiteboardExercises())
  const [exerciseId, setExerciseId] = useState(() => getActiveWhiteboardExerciseId() || '')
  const [selectedExercise, setSelectedExercise] = useState(null)
  const [workspaceId, setWorkspaceId] = useState(() => getActiveWhiteboardWorkspaceId() || '')
  const [techniques, setTechniques] = useState([])
  const [nodes, setNodes] = useState([])
  const [links, setLinks] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [selectedNodeIds, setSelectedNodeIds] = useState([])
  const [selectedLinkId, setSelectedLinkId] = useState('')
  const [copiedNode, setCopiedNode] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [linkForm, setLinkForm] = useState(() => buildEmptyLinkForm(''))
  const [linkTechniquePickerOpen, setLinkTechniquePickerOpen] = useState(false)
  const [linkTechniqueSearch, setLinkTechniqueSearch] = useState('')
  const [linkTechniqueLanguage, setLinkTechniqueLanguage] = useState('es')
  const [nodeTechniquePickerOpen, setNodeTechniquePickerOpen] = useState(false)
  const [nodeTechniqueSearch, setNodeTechniqueSearch] = useState('')
  const [nodeTechniqueLanguage, setNodeTechniqueLanguage] = useState('es')
  const [editorState, setEditorState] = useState(buildEditorState)
  const [canvasMenu, setCanvasMenu] = useState(buildCanvasMenuState)
  const [techniquesError, setTechniquesError] = useState('')
  const [boardLoading, setBoardLoading] = useState(true)
  const [boardError, setBoardError] = useState('')
  const [collaborationStatus, setCollaborationStatus] = useState('')
  const [collaborationError, setCollaborationError] = useState('')
  const [collaborators, setCollaborators] = useState([])
  const [showOfficialResult, setShowOfficialResult] = useState(false)
  const [historyPast, setHistoryPast] = useState([])
  const [historyFuture, setHistoryFuture] = useState([])
  const [loadedWorkspace, setLoadedWorkspace] = useState(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [interactionMode, setInteractionMode] = useState('select')
  const [panState, setPanState] = useState(buildPanState)
  const [selectionBox, setSelectionBox] = useState(buildSelectionBoxState)

  const currentBoardSignatureRef = useRef('')
  const remoteAppliedSignatureRef = useRef('')
  const lastBroadcastSignatureRef = useRef('')
  const selectedExerciseRef = useRef(null)
  const dragStartSnapshotRef = useRef(null)
  const currentNodesRef = useRef([])
  const currentLinksRef = useRef([])
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  const importFileRef = useRef(null)
  const boardCanvasRef = useRef(null)
  const editorPanelRef = useRef(null)
  const canvasMenuRef = useRef(null)
  const realtimeChannelRef = useRef(null)
  const realtimeClientIdRef = useRef(buildRealtimeClientId())
  const editorStateRef = useRef(editorState)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const selectedLinkIdRef = useRef(selectedLinkId)
  const dragStateRef = useRef(dragState)
  const linkFormRef = useRef(linkForm)
  const suppressNextStageClickRef = useRef(false)

  useEffect(() => {
    selectedExerciseRef.current = selectedExercise
  }, [selectedExercise])

  useEffect(() => {
    editorStateRef.current = editorState
  }, [editorState])

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  useEffect(() => {
    selectedLinkIdRef.current = selectedLinkId
  }, [selectedLinkId])

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds
  }, [selectedNodeIds])

  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  useEffect(() => {
    linkFormRef.current = linkForm
  }, [linkForm])

  useEffect(() => {
    if (editorState.mode !== 'link') {
      setLinkTechniquePickerOpen(false)
      setLinkTechniqueSearch('')
    }
    if (editorState.mode !== 'node') {
      setNodeTechniquePickerOpen(false)
      setNodeTechniqueSearch('')
    }
  }, [editorState.mode])

  useEffect(() => {
    currentBoardSignatureRef.current = serializeBoard(nodes, links)
    currentNodesRef.current = nodes
    currentLinksRef.current = links
  }, [nodes, links])

  useEffect(() => {
    setLoadedWorkspace((prev) => (
      prev
        ? {
            ...prev,
            exercise_title: selectedExercise?.title || prev.exercise_title || '',
            exercise_snapshot: selectedExercise || prev.exercise_snapshot || null,
            nodes,
            links,
          }
        : prev
    ))
  }, [nodes, links, selectedExercise])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  )

  const activeNodeEditorId = editorState.mode === 'node' ? editorState.targetId || '' : ''

  const activeEditableNodeId = activeNodeEditorId || selectedNodeId

  const activeEditableNode = useMemo(
    () => nodes.find((node) => node.id === activeEditableNodeId) || null,
    [nodes, activeEditableNodeId]
  )

  const selectedLink = useMemo(
    () => links.find((link) => link.id === selectedLinkId) || null,
    [links, selectedLinkId]
  )

  const selectedTechnique = useMemo(
    () => techniques.find((item) => item.id === linkForm.techniqueId) || null,
    [techniques, linkForm.techniqueId]
  )

  const selectedNodeTechnique = useMemo(
    () => techniques.find((item) => item.id === activeEditableNode?.techniqueId) || null,
    [techniques, activeEditableNode?.techniqueId]
  )

  const filteredTechniques = useMemo(() => {
    const search = String(linkTechniqueSearch || '').trim().toLowerCase()
    if (!search) return techniques
    return techniques.filter((item) => String(getTechniqueTranslation(item, linkTechniqueLanguage).name || '').toLowerCase().includes(search))
  }, [techniques, linkTechniqueSearch, linkTechniqueLanguage])

  const filteredNodeTechniques = useMemo(() => {
    const search = String(nodeTechniqueSearch || '').trim().toLowerCase()
    if (!search) return techniques
    return techniques.filter((item) => String(getTechniqueTranslation(item, nodeTechniqueLanguage).name || '').toLowerCase().includes(search))
  }, [techniques, nodeTechniqueSearch, nodeTechniqueLanguage])

  const selectableLinkTechniques = useMemo(() => (
    selectedTechnique?.id && !filteredTechniques.some((item) => item.id === selectedTechnique.id)
      ? [selectedTechnique, ...filteredTechniques]
      : filteredTechniques
  ), [filteredTechniques, selectedTechnique])

  const selectableNodeTechniques = useMemo(() => (
    selectedNodeTechnique?.id && !filteredNodeTechniques.some((item) => item.id === selectedNodeTechnique.id)
      ? [selectedNodeTechnique, ...filteredNodeTechniques]
      : filteredNodeTechniques
  ), [filteredNodeTechniques, selectedNodeTechnique])

  const boardMetrics = useMemo(() => {
    const maxX = nodes.reduce((acc, node) => {
      const bounds = getNodeBounds(node, nodes)
      return Math.max(acc, bounds.x + bounds.width)
    }, 1400)
    const maxY = nodes.reduce((acc, node) => {
      const bounds = getNodeBounds(node, nodes)
      return Math.max(acc, bounds.y + bounds.height)
    }, 840)
    return {
      width: maxX + 180,
      height: maxY + 180,
    }
  }, [nodes])

  const renderedLinks = useMemo(() => {
    const visibleBoardNodes = nodes.filter((node) => showOfficialResult || !node.isOfficial)
    return links.reduce((acc, link, index) => {
      const nextRoute = buildOrthogonalLinkRoute(link, visibleBoardNodes, acc, index)
      if (nextRoute) acc.push(nextRoute)
      return acc
    }, [])
  }, [links, nodes, showOfficialResult])

  const visibleNodes = useMemo(
    () => nodes.filter((node) => showOfficialResult || !node.isOfficial),
    [nodes, showOfficialResult]
  )

  const selectableGroupMembers = useMemo(
    () => nodes.filter((node) => node.type !== 'group'),
    [nodes]
  )

  const selectionBounds = useMemo(() => {
    if (!selectionBox.active) return null
    return {
      left: Math.min(selectionBox.startX, selectionBox.currentX),
      top: Math.min(selectionBox.startY, selectionBox.currentY),
      right: Math.max(selectionBox.startX, selectionBox.currentX),
      bottom: Math.max(selectionBox.startY, selectionBox.currentY),
    }
  }, [selectionBox])

  const isWorkspaceOwner = Boolean(
    loadedWorkspace
    && session?.userId
    && loadedWorkspace.owner_user_id
    && loadedWorkspace.owner_user_id === session.userId
  )

  const participantList = useMemo(() => {
    const ownClientId = realtimeClientIdRef.current
    return collaborators
      .map((item) => ({
        clientId: String(item.clientId || ''),
        userId: String(item.userId || ''),
        username: String(item.username || item.userId || 'Anonymous').trim(),
        color: String(item.color || pickCollaboratorColor(item.userId || item.username)),
        editingType: String(item.editingType || 'board'),
        targetId: String(item.targetId || ''),
        activity: String(item.activity || 'browsing'),
        isSelf: String(item.clientId || '') === ownClientId,
      }))
      .filter((item) => item.userId || item.clientId)
      .sort((a, b) => {
        if (a.isSelf && !b.isSelf) return -1
        if (!a.isSelf && b.isSelf) return 1
        return a.username.localeCompare(b.username)
      })
  }, [collaborators])

  const remoteParticipants = useMemo(
    () => participantList.filter((item) => !item.isSelf),
    [participantList]
  )

  const remoteNodeEditorsById = useMemo(() => (
    remoteParticipants.reduce((acc, participant) => {
      if (participant.editingType !== 'node' || !participant.targetId) return acc
      acc[participant.targetId] = [...(acc[participant.targetId] || []), participant]
      return acc
    }, {})
  ), [remoteParticipants])

  const remoteLinkEditorsById = useMemo(() => (
    remoteParticipants.reduce((acc, participant) => {
      if (participant.editingType !== 'link' || !participant.targetId) return acc
      acc[participant.targetId] = [...(acc[participant.targetId] || []), participant]
      return acc
    }, {})
  ), [remoteParticipants])

  const activeCollaboratorSummary = useMemo(() => {
    if (!remoteParticipants.length) return ''

    const labels = remoteParticipants
      .filter((participant) => participant.activity === 'editing' || participant.activity === 'moving')
      .map((participant) => {
        if (participant.editingType === 'node') {
          const node = nodes.find((item) => item.id === participant.targetId)
          const target = node?.title || getNodeTypeMeta(node?.type || 'fact').label || 'node'
          return `${participant.username} editing "${target}"`
        }
        if (participant.editingType === 'link') {
          const link = links.find((item) => item.id === participant.targetId)
          const target = link?.label || 'a link'
          return `${participant.username} editing "${target}"`
        }
        return `${participant.username} on the board`
      })

    return labels.join(' · ')
  }, [remoteParticipants, nodes, links])

  const getBoardCoordinatesFromClient = useCallback((clientX, clientY) => {
    const canvasElement = boardCanvasRef.current
    if (!canvasElement) return { x: 24, y: 24 }
    const rect = canvasElement.getBoundingClientRect()
    return {
      x: Math.max(24, (clientX - rect.left + canvasElement.scrollLeft) / zoomLevel),
      y: Math.max(24, (clientY - rect.top + canvasElement.scrollTop) / zoomLevel),
    }
  }, [zoomLevel])

  const startCanvasPan = useCallback((event) => {
    const canvasElement = boardCanvasRef.current
    if (!canvasElement) return

    event.preventDefault()
    event.stopPropagation()
    setEditorState(buildEditorState())
    setCanvasMenu(buildCanvasMenuState())
    setPanState({
      active: true,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: canvasElement.scrollLeft,
      startScrollTop: canvasElement.scrollTop,
    })
  }, [])

  const applySelectionBox = useCallback((nextSelectionBox) => {
    const bounds = {
      left: Math.min(nextSelectionBox.startX, nextSelectionBox.currentX),
      top: Math.min(nextSelectionBox.startY, nextSelectionBox.currentY),
      right: Math.max(nextSelectionBox.startX, nextSelectionBox.currentX),
      bottom: Math.max(nextSelectionBox.startY, nextSelectionBox.currentY),
    }
    const hitNodeIds = visibleNodes
      .filter((node) => {
        const nodeBounds = getNodeBounds(node, nodes)
        if (!nodeBounds) return false
        return (
          nodeBounds.x < bounds.right
          && nodeBounds.x + nodeBounds.width > bounds.left
          && nodeBounds.y < bounds.bottom
          && nodeBounds.y + nodeBounds.height > bounds.top
        )
      })
      .map((node) => node.id)
    const nextSelectedNodeIds = nextSelectionBox.additive
      ? Array.from(new Set([...(nextSelectionBox.initialNodeIds || []), ...hitNodeIds]))
      : hitNodeIds
    setSelectedNodeIds(nextSelectedNodeIds)
    setSelectedNodeId(nextSelectedNodeIds[0] || '')
    setSelectedLinkId('')
    setCanvasMenu(buildCanvasMenuState())
  }, [nodes, visibleNodes])

  const publishPresence = useCallback(async () => {
    const channel = realtimeChannelRef.current
    if (!channel || !workspaceId || !session?.userId) return

    try {
      await channel.track(buildPresencePayload({
        session,
        editorState: editorStateRef.current,
        dragState: dragStateRef.current,
        selectedNodeId: selectedNodeIdRef.current,
        selectedLinkId: selectedLinkIdRef.current,
        linkForm: linkFormRef.current,
        clientId: realtimeClientIdRef.current,
      }))
    } catch (error) {
      console.error('Could not publish whiteboard presence:', error)
    }
  }, [session, workspaceId])

  const preserveActiveEditorValues = useCallback((incomingNodes, incomingLinks) => {
    const normalizedNodes = Array.isArray(incomingNodes) ? incomingNodes : []
    const normalizedLinks = Array.isArray(incomingLinks) ? incomingLinks : []
    const activeEditor = editorStateRef.current

    if (!activeEditor?.mode || !activeEditor.targetId) {
      return {
        nodes: normalizedNodes,
        links: normalizedLinks,
      }
    }

    if (activeEditor.mode === 'node') {
      const localNode = currentNodesRef.current.find((node) => node.id === activeEditor.targetId)
      if (!localNode) {
        return {
          nodes: normalizedNodes,
          links: normalizedLinks,
        }
      }

      return {
        nodes: normalizedNodes.map((node) => (
          node.id === activeEditor.targetId
            ? { ...node, ...localNode }
            : node
        )),
        links: normalizedLinks,
      }
    }

    if (activeEditor.mode === 'link') {
      const localLink = currentLinksRef.current.find((link) => link.id === activeEditor.targetId)
      if (!localLink) {
        return {
          nodes: normalizedNodes,
          links: normalizedLinks,
        }
      }

      return {
        nodes: normalizedNodes,
        links: normalizedLinks.map((link) => (
          link.id === activeEditor.targetId
            ? { ...link, ...localLink }
            : link
        )),
      }
    }

    return {
      nodes: normalizedNodes,
      links: normalizedLinks,
    }
  }, [])

  const applyRemoteRealtimeBoardState = useCallback((nextNodes, nextLinks, options = {}) => {
    const preservedBoard = preserveActiveEditorValues(nextNodes, nextLinks)
    const normalizedNodes = preservedBoard.nodes
    const normalizedLinks = preservedBoard.links
    const signature = serializeBoard(normalizedNodes, normalizedLinks)

    remoteAppliedSignatureRef.current = signature
    currentBoardSignatureRef.current = signature
    lastBroadcastSignatureRef.current = signature
    currentNodesRef.current = normalizedNodes
    currentLinksRef.current = normalizedLinks

    setNodes(normalizedNodes)
    setLinks(normalizedLinks)
    setHistoryPast([])
    setHistoryFuture([])
    setSelectedNodeId((prev) => (
      normalizedNodes.some((node) => node.id === prev)
        ? prev
        : (normalizedNodes[0]?.id || '')
    ))
    setSelectedNodeIds((prev) => {
      const preserved = prev.filter((nodeId) => normalizedNodes.some((node) => node.id === nodeId))
      if (preserved.length) return preserved
      return normalizedNodes[0]?.id ? [normalizedNodes[0].id] : []
    })
    setSelectedLinkId((prev) => (
      normalizedLinks.some((link) => link.id === prev) ? prev : ''
    ))
    setLinkForm((prev) => ({
      ...prev,
      sourceNodeId: normalizedNodes.some((node) => node.id === prev.sourceNodeId) ? prev.sourceNodeId : '',
      targetNodeId: normalizedNodes.some((node) => node.id === prev.targetNodeId) ? prev.targetNodeId : '',
    }))
    setEditorState((prev) => {
      if (!prev.mode) return prev
      if (prev.mode === 'node' && normalizedNodes.some((node) => node.id === prev.targetId)) return prev
      if (prev.mode === 'link' && (!prev.targetId || normalizedLinks.some((link) => link.id === prev.targetId))) return prev
      return buildEditorState()
    })

    if (options.exercise) {
      setSelectedExercise(options.exercise)
      setExerciseId(options.exercise.id || '')
      selectedExerciseRef.current = options.exercise
    }

    if (options.workspaceId) {
      setWorkspaceId(options.workspaceId)
      setActiveWhiteboardWorkspaceId(options.workspaceId)
    }

    if (options.workspaceRow) {
      setLoadedWorkspace(options.workspaceRow)
    } else {
      setLoadedWorkspace((prev) => (
        prev
          ? {
              ...prev,
              nodes: normalizedNodes,
              links: normalizedLinks,
              last_editor_user_id: options.lastEditorUserId || prev.last_editor_user_id,
              exercise_snapshot: options.exercise || prev.exercise_snapshot || null,
            }
          : prev
      ))
    }
  }, [preserveActiveEditorValues])

  const commitHistoryEntry = (snapshot) => {
    setHistoryPast((prev) => [...prev, snapshot].slice(-HISTORY_LIMIT))
    setHistoryFuture([])
  }

  const syncSelectionAfterBoardChange = (nextNodes, nextLinks, preferredNodeId = '', preferredLinkId = '') => {
    const nextNodeId = nextNodes.some((node) => node.id === preferredNodeId)
      ? preferredNodeId
      : (nextNodes[0]?.id || '')
    const nextLinkId = nextLinks.some((link) => link.id === preferredLinkId) ? preferredLinkId : ''
    setSelectedNodeId(nextNodeId)
    setSelectedNodeIds(nextNodeId ? [nextNodeId] : [])
    setSelectedLinkId(nextLinkId)
    setLinkForm(buildEmptyLinkForm(nextNodeId))
  }

  const applyCommittedBoardChange = (nextNodes, nextLinks, options = {}) => {
    const preferredNodeId = options.preferredNodeId || ''
    const preferredLinkId = options.preferredLinkId || ''
    setNodes(nextNodes)
    setLinks(nextLinks)
    syncSelectionAfterBoardChange(nextNodes, nextLinks, preferredNodeId, preferredLinkId)
    if (options.preserveEditor) {
      setEditorState((prev) => ({
        ...prev,
        targetId: options.editorTargetId || prev.targetId,
      }))
    } else {
      setEditorState(buildEditorState())
    }
    if (options.preserveCanvasMenu) {
      setCanvasMenu((prev) => prev)
    } else {
      setCanvasMenu(buildCanvasMenuState())
    }
  }

  const undoLastChange = () => {
    if (!historyPast.length) return
    const previous = historyPast[historyPast.length - 1]
    const current = buildBoardSnapshot(nodes, links)
    setHistoryPast((prev) => prev.slice(0, -1))
    setHistoryFuture((prev) => [...prev, current].slice(-HISTORY_LIMIT))
    applyCommittedBoardChange(previous.nodes, previous.links)
    setCollaborationStatus('Last whiteboard change reverted.')
  }

  const redoLastChange = () => {
    if (!historyFuture.length) return
    const next = historyFuture[historyFuture.length - 1]
    const current = buildBoardSnapshot(nodes, links)
    setHistoryFuture((prev) => prev.slice(0, -1))
    setHistoryPast((prev) => [...prev, current].slice(-HISTORY_LIMIT))
    applyCommittedBoardChange(next.nodes, next.links)
    setCollaborationStatus('Whiteboard change restored.')
  }

  const applyBoardState = (exercise, nextNodes, nextLinks, nextWorkspaceId = '') => {
    const normalizedNodes = Array.isArray(nextNodes) ? nextNodes : []
    const normalizedLinks = Array.isArray(nextLinks) ? nextLinks : []
    const signature = serializeBoard(normalizedNodes, normalizedLinks)

    setSelectedExercise(exercise || null)
    setExerciseId(exercise?.id || '')
    setWorkspaceId(nextWorkspaceId || '')
    setNodes(normalizedNodes)
    setLinks(normalizedLinks)
    setSelectedNodeId(normalizedNodes[0]?.id || '')
    setSelectedNodeIds(normalizedNodes[0]?.id ? [normalizedNodes[0].id] : [])
    setSelectedLinkId('')
    setLinkForm(buildEmptyLinkForm(normalizedNodes[0]?.id || ''))
    setEditorState(buildEditorState())
    setCanvasMenu(buildCanvasMenuState())
    setHistoryPast([])
    setHistoryFuture([])
    currentBoardSignatureRef.current = signature
    remoteAppliedSignatureRef.current = signature
    lastBroadcastSignatureRef.current = signature
  }

  const loadLocalExercise = (nextExercise) => {
    if (!nextExercise) {
      setLoadedWorkspace(null)
      applyBoardState(null, [], [], '')
      setBoardLoading(false)
      return
    }

    const storedWorkspace = getStoredWorkspace(nextExercise.id)
    const boardState = resolveBoardState(nextExercise, storedWorkspace)
    saveWorkspace(nextExercise.id, boardState)
    setLoadedWorkspace(null)
    applyBoardState(nextExercise, boardState.nodes, boardState.links, '')
    setBoardLoading(false)
  }

  const loadRemoteWorkspace = async (targetWorkspaceId) => {
    const remoteWorkspace = await getWhiteboardWorkspaceById(targetWorkspaceId)
    if (!remoteWorkspace) throw new Error('No se encontro la pizarra colaborativa solicitada.')

    const snapshot = remoteWorkspace.exercise_snapshot && typeof remoteWorkspace.exercise_snapshot === 'object'
      ? remoteWorkspace.exercise_snapshot
      : null
    const fallbackExercise = exercises.find((item) => item.id === remoteWorkspace.exercise_local_id) || null
    const nextExercise = snapshot || fallbackExercise

    if (!nextExercise) {
      throw new Error('La pizarra colaborativa no tiene un ejercicio base reconocido.')
    }

    const boardState = resolveBoardState(nextExercise, remoteWorkspace)
    saveWorkspace(nextExercise.id, boardState)
    setActiveWhiteboardWorkspaceId(remoteWorkspace.id)
    setActiveWhiteboardExerciseId(nextExercise.id || remoteWorkspace.exercise_local_id || '')
    setLoadedWorkspace(remoteWorkspace)
    applyBoardState(nextExercise, boardState.nodes, boardState.links, remoteWorkspace.id)
    setCollaborationStatus('Whiteboard synced with Supabase.')
    setCollaborationError('')
  }

  const ensureRemoteWorkspaceForExercise = async (nextExercise) => {
    const localStoredWorkspace = getStoredWorkspace(nextExercise.id)
    const boardState = resolveBoardState(nextExercise, localStoredWorkspace)

    const remoteWorkspace = await ensureRootWhiteboardWorkspace({
      ownerUserId: session.userId,
      visibility: 'public',
      exerciseLocalId: nextExercise.id,
      exerciseTitle: nextExercise.title || 'Math Whiteboard',
      exerciseSnapshot: nextExercise,
      nodes: boardState.nodes,
      links: boardState.links,
      lastEditorUserId: session.userId,
    })

    const remoteBoardState = resolveBoardState(nextExercise, remoteWorkspace)
    saveWorkspace(nextExercise.id, remoteBoardState)
    setActiveWhiteboardWorkspaceId(remoteWorkspace.id)
    setActiveWhiteboardExerciseId(nextExercise.id)
    setLoadedWorkspace(remoteWorkspace)
    applyBoardState(nextExercise, remoteBoardState.nodes, remoteBoardState.links, remoteWorkspace.id)
    setCollaborationStatus('Collaborative whiteboard active in Supabase.')
    setCollaborationError('')
  }

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event) => {
      const pointerPosition = getBoardCoordinatesFromClient(event.clientX, event.clientY)
      setNodes((prev) => {
        if (dragState.kind === 'group') {
          const deltaX = pointerPosition.x - dragState.startPointerX
          const deltaY = pointerPosition.y - dragState.startPointerY
          return prev.map((node) => {
            const startPosition = dragState.startPositions?.[node.id]
            if (!startPosition) return node
            return {
              ...node,
              x: Math.max(12, startPosition.x + deltaX),
              y: Math.max(12, startPosition.y + deltaY),
            }
          })
        }

        return prev.map((node) => {
          if (node.id !== dragState.nodeId) return node
          return {
            ...node,
            x: Math.max(12, pointerPosition.x - dragState.offsetX),
            y: Math.max(12, pointerPosition.y - dragState.offsetY),
          }
        })
      })
    }

    const handlePointerUp = () => {
      const startSnapshot = dragStartSnapshotRef.current
      if (startSnapshot) {
        const nextSignature = serializeBoard(currentNodesRef.current, currentLinksRef.current)
        const startSignature = serializeBoard(startSnapshot.nodes, startSnapshot.links)
        if (nextSignature !== startSignature) {
          commitHistoryEntry(startSnapshot)
        }
      }
      dragStartSnapshotRef.current = null
      setDragState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, getBoardCoordinatesFromClient])

  useEffect(() => {
    if (!panState.active) return

    const handlePointerMove = (event) => {
      const canvasElement = boardCanvasRef.current
      if (!canvasElement) return
      const deltaX = event.clientX - panState.startClientX
      const deltaY = event.clientY - panState.startClientY
      canvasElement.scrollLeft = panState.startScrollLeft - deltaX
      canvasElement.scrollTop = panState.startScrollTop - deltaY
    }

    const handlePointerUp = () => {
      setPanState(buildPanState())
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [panState])

  useEffect(() => {
    if (!selectionBox.active) return

    const handlePointerMove = (event) => {
      const pointerPosition = getBoardCoordinatesFromClient(event.clientX, event.clientY)
      setSelectionBox((prev) => {
        if (!prev.active) return prev
        const nextSelectionBox = {
          ...prev,
          currentX: pointerPosition.x,
          currentY: pointerPosition.y,
          hasMoved: prev.hasMoved
            || Math.abs(pointerPosition.x - prev.startX) > 6
            || Math.abs(pointerPosition.y - prev.startY) > 6,
        }
        applySelectionBox(nextSelectionBox)
        return nextSelectionBox
      })
    }

    const handlePointerUp = () => {
      if (selectionBox.hasMoved) {
        suppressNextStageClickRef.current = true
      }
      setSelectionBox(buildSelectionBoxState())
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [selectionBox, applySelectionBox, getBoardCoordinatesFromClient])

  useEffect(() => {
    const closeFloatingUi = (event) => {
      const target = event?.target
      if (target instanceof Node) {
        if (editorPanelRef.current?.contains(target) || canvasMenuRef.current?.contains(target)) {
          return
        }
      }
      setEditorState(buildEditorState())
      setCanvasMenu(buildCanvasMenuState())
    }
    window.addEventListener('scroll', closeFloatingUi, true)
    return () => window.removeEventListener('scroll', closeFloatingUi, true)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadTechniques() {
      if (!session?.userId) {
        setTechniques([])
        return
      }

      try {
        setTechniquesError('')
        const rows = await listPrivateCompetitiveTechniqueInventory(session.userId)
        if (cancelled) return
        setTechniques(Array.isArray(rows) ? rows : [])
      } catch (error) {
        if (cancelled) return
        setTechniques([])
        setTechniquesError(error?.message || 'No se pudieron cargar las tecnicas de la cuenta.')
      }
    }

    loadTechniques()
    return () => {
      cancelled = true
    }
  }, [session?.userId])

  useEffect(() => {
    let cancelled = false

    async function bootstrapBoard() {
      setBoardLoading(true)
      setBoardError('')
      setCollaborationError('')
      setExercises(listWhiteboardExercises())

      const nextExerciseId = getActiveWhiteboardExerciseId() || ''
      const nextWorkspaceId = getActiveWhiteboardWorkspaceId() || ''
      const localExercises = listWhiteboardExercises()
      const nextExercise = localExercises.find((item) => item.id === nextExerciseId) || null

      try {
        if (session?.userId && nextWorkspaceId) {
          await loadRemoteWorkspace(nextWorkspaceId)
          if (!cancelled) setBoardLoading(false)
          return
        }

        if (!nextExercise) {
          if (!cancelled) {
            applyBoardState(null, [], [], '')
            setBoardLoading(false)
          }
          return
        }

        if (session?.userId) {
          await ensureRemoteWorkspaceForExercise(nextExercise)
        } else {
          loadLocalExercise(nextExercise)
          setCollaborationStatus('Local mode. Sign in to sync this whiteboard.')
        }
      } catch (error) {
        if (cancelled) return
        setCollaborationError(error?.message || 'Could not sync the collaborative whiteboard.')
        loadLocalExercise(nextExercise)
      } finally {
        if (!cancelled) setBoardLoading(false)
      }
    }

    bootstrapBoard()
    return () => {
      cancelled = true
    }
  }, [session?.userId])

  useEffect(() => {
    if (!workspaceId || !session?.userId) {
      setCollaborators([])
      return undefined
    }

    const refreshFromRealtime = async () => {
      try {
        const remoteWorkspace = await getWhiteboardWorkspaceById(workspaceId)
        if (!remoteWorkspace) return

        const snapshot = remoteWorkspace.exercise_snapshot && typeof remoteWorkspace.exercise_snapshot === 'object'
          ? remoteWorkspace.exercise_snapshot
          : selectedExerciseRef.current
        if (!snapshot) return

        const boardState = resolveBoardState(snapshot, remoteWorkspace)
        const nextSignature = serializeBoard(boardState.nodes, boardState.links)
        if (nextSignature === currentBoardSignatureRef.current) return

        saveWorkspace(snapshot.id || remoteWorkspace.exercise_local_id, boardState)
        applyRemoteRealtimeBoardState(boardState.nodes, boardState.links, {
          exercise: snapshot,
          workspaceId: remoteWorkspace.id,
          workspaceRow: remoteWorkspace,
          lastEditorUserId: remoteWorkspace.last_editor_user_id || '',
        })
        setCollaborationStatus('Collaborative changes received in real time.')
        setCollaborationError('')
      } catch (error) {
        setCollaborationError(error?.message || 'Could not refresh the collaborative whiteboard.')
      }
    }

    const channel = supabase
      .channel(`wb-workspace-${workspaceId}`, {
        config: {
          presence: {
            key: `${session.userId}:${realtimeClientIdRef.current}`,
          },
          broadcast: {
            self: false,
          },
        },
      })
      .on('presence', { event: 'sync' }, () => {
        setCollaborators(flattenPresenceState(channel.presenceState()))
      })
      .on('broadcast', { event: 'board-sync' }, ({ payload }) => {
        const nextNodes = Array.isArray(payload?.nodes) ? payload.nodes : []
        const nextLinks = Array.isArray(payload?.links) ? payload.links : []
        const nextSignature = serializeBoard(nextNodes, nextLinks)

        if (!payload || payload.clientId === realtimeClientIdRef.current) return
        if (nextSignature === currentBoardSignatureRef.current) return

        const nextExercise = payload.exerciseSnapshot && typeof payload.exerciseSnapshot === 'object'
          ? payload.exerciseSnapshot
          : selectedExerciseRef.current

        if (nextExercise?.id) {
          saveWorkspace(nextExercise.id, { nodes: nextNodes, links: nextLinks })
        }

        applyRemoteRealtimeBoardState(nextNodes, nextLinks, {
          exercise: nextExercise,
          workspaceId,
          lastEditorUserId: payload.userId || '',
        })
        setCollaborationStatus(`Live update received from ${payload.username || 'another collaborator'}.`)
        setCollaborationError('')
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whiteboard_workspaces', filter: `id=eq.${workspaceId}` },
        refreshFromRealtime
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeChannelRef.current = channel
          publishPresence()
        }
      })

    realtimeChannelRef.current = channel

    return () => {
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null
      }
      setCollaborators([])
      supabase.removeChannel(channel)
    }
  }, [workspaceId, session, applyRemoteRealtimeBoardState, publishPresence])

  useEffect(() => {
    if (!workspaceId || !session?.userId) return undefined

    const timerId = window.setTimeout(() => {
      publishPresence()
    }, 80)

    return () => window.clearTimeout(timerId)
  }, [
    workspaceId,
    session?.userId,
    session?.username,
    editorState,
    selectedNodeId,
    selectedLinkId,
    dragState,
    linkForm.sourceNodeId,
    publishPresence,
  ])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoLastChange()
        return
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redoLastChange()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [historyPast.length, historyFuture.length, nodes, links])

  useEffect(() => {
    if (!selectedExercise?.id) return

    saveWorkspace(selectedExercise.id, { nodes, links })
  }, [selectedExercise?.id, nodes, links])

  useEffect(() => {
    if (!selectedExercise?.id || !workspaceId || !session?.userId) return undefined

    const nextSignature = serializeBoard(nodes, links)
    if (nextSignature === remoteAppliedSignatureRef.current) return undefined
    if (nextSignature === lastBroadcastSignatureRef.current) return undefined

    const timerId = window.setTimeout(async () => {
      const channel = realtimeChannelRef.current
      if (!channel) return

      try {
        await channel.send({
          type: 'broadcast',
          event: 'board-sync',
          payload: {
            clientId: realtimeClientIdRef.current,
            userId: session.userId,
            username: session.username || session.userId,
            workspaceId,
            exerciseSnapshot: selectedExercise,
            nodes,
            links,
            sentAt: new Date().toISOString(),
          },
        })
        lastBroadcastSignatureRef.current = nextSignature
      } catch (error) {
        console.error('Could not broadcast whiteboard changes:', error)
      }
    }, 120)

    return () => window.clearTimeout(timerId)
  }, [
    nodes,
    links,
    selectedExercise,
    workspaceId,
    session?.userId,
    session?.username,
  ])

  useEffect(() => {
    if (!selectedExercise?.id || !workspaceId || !session?.userId) return undefined

    const nextSignature = serializeBoard(nodes, links)
    if (nextSignature === remoteAppliedSignatureRef.current) return

    const timerId = window.setTimeout(async () => {
      try {
        const updatedWorkspace = await updateWhiteboardWorkspace(workspaceId, session.userId, {
          exerciseTitle: selectedExercise.title || 'Math Whiteboard',
          exerciseSnapshot: selectedExercise,
          nodes,
          links,
          visibility: loadedWorkspace?.visibility || 'public',
          lastEditorUserId: session.userId,
        })
        setLoadedWorkspace(updatedWorkspace)
        remoteAppliedSignatureRef.current = nextSignature
        setCollaborationStatus('Changes synced to Supabase.')
        setCollaborationError('')
      } catch (error) {
        setCollaborationError(error?.message || 'No se pudieron guardar los cambios colaborativos.')
      }
    }, 400)

    return () => window.clearTimeout(timerId)
  }, [
    nodes,
    links,
    selectedExercise,
    workspaceId,
    session?.userId,
    loadedWorkspace,
  ])

  const updateSelectedNode = (key, value) => {
    if (!activeEditableNodeId) return
    setNodes((prev) => prev.map((node) => (
      node.id === activeEditableNodeId ? { ...node, [key]: value } : node
    )))
  }

  const toggleSelectedNodeCollapsed = () => {
    if (!activeEditableNodeId) return
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    const nextNodes = nodes.map((node) => (
      node.id === activeEditableNodeId
        ? { ...node, collapsed: !node.collapsed }
        : node
    ))
    applyCommittedBoardChange(nextNodes, links, { preferredNodeId: activeEditableNodeId })
  }

  const openNodeEditor = (nodeId, event) => {
    const targetNode = nodes.find((node) => node.id === nodeId)
    if (!targetNode) return
    setSelectedNodeId(targetNode.id)
    setSelectedLinkId('')
    setEditorState({
      mode: 'node',
      targetId: targetNode.id,
      x: event.clientX,
      y: event.clientY,
    })
    setCanvasMenu(buildCanvasMenuState())
  }

  const openNodeMenu = (nodeId, event) => {
    const targetNode = nodes.find((node) => node.id === nodeId)
    if (!targetNode) return
    setSelectedNodeId(targetNode.id)
    setSelectedNodeIds((prev) => (prev.includes(targetNode.id) ? prev : [targetNode.id]))
    setSelectedLinkId('')
    setEditorState(buildEditorState())
    setCanvasMenu({
      open: true,
      mode: 'node',
      targetId: targetNode.id,
      x: event.clientX,
      y: event.clientY,
      boardX: 0,
      boardY: 0,
    })
  }

  const openLinkEditor = (linkId, event) => {
    const targetLink = links.find((link) => link.id === linkId)
    if (!targetLink) return
    setSelectedLinkId(targetLink.id)
    setSelectedNodeId(targetLink.fromNodeId)
    setSelectedNodeIds([targetLink.fromNodeId])
    setLinkForm({
      sourceNodeId: targetLink.fromNodeId,
      targetNodeId: targetLink.toNodeId,
      techniqueId: targetLink.techniqueId || '',
      label: targetLink.label || '',
      justification: targetLink.justification || '',
    })
    setLinkTechniquePickerOpen(false)
    setLinkTechniqueSearch('')
    setEditorState({
      mode: 'link',
      targetId: targetLink.id,
      x: event.clientX,
      y: event.clientY,
    })
    setCanvasMenu(buildCanvasMenuState())
  }

  const openNewLinkEditor = (sourceNodeId, event) => {
    const sourceNode = nodes.find((node) => node.id === sourceNodeId)
    if (!sourceNode) return
    setSelectedNodeId(sourceNode.id)
    setSelectedNodeIds([sourceNode.id])
    setSelectedLinkId('')
    setLinkForm(buildEmptyLinkForm(sourceNode.id))
    setLinkTechniquePickerOpen(false)
    setLinkTechniqueSearch('')
    setEditorState({
      mode: 'link',
      targetId: '',
      x: event.clientX,
      y: event.clientY,
    })
    setCanvasMenu(buildCanvasMenuState())
  }

  const addNodeFromCanvasMenu = () => {
    const node = createManualNode('fact')
    const nextNode = {
      ...node,
      x: canvasMenu.boardX,
      y: canvasMenu.boardY,
    }

    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    applyCommittedBoardChange([...nodes, nextNode], links, { preferredNodeId: nextNode.id })
    setEditorState({
      mode: 'node',
      targetId: nextNode.id,
      x: canvasMenu.x,
      y: canvasMenu.y,
    })
  }

  const pasteCopiedNodeAtCanvasMenu = () => {
    if (!copiedNode) return
    const nextNode = {
      ...copiedNode,
      id: `wb-node-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      x: canvasMenu.boardX,
      y: canvasMenu.boardY,
      title: copiedNode.title ? `${copiedNode.title} copia` : 'Copia',
    }
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    applyCommittedBoardChange([...nodes, nextNode], links, { preferredNodeId: nextNode.id })
  }

  const duplicateSelectedNode = () => {
    if (!activeEditableNode || activeEditableNode.type === 'group') return
    const nextNode = {
      ...activeEditableNode,
      id: `wb-node-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      x: activeEditableNode.x + 28,
      y: activeEditableNode.y + 28,
      locked: false,
      title: activeEditableNode.title ? `${activeEditableNode.title} copia` : 'Copia',
    }
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    applyCommittedBoardChange([...nodes, nextNode], links, { preferredNodeId: nextNode.id })
  }

  const copySelectedNode = async () => {
    if (!activeEditableNode || activeEditableNode.type === 'group') return
    const snapshot = {
      type: activeEditableNode.type,
      title: activeEditableNode.title || '',
      content: activeEditableNode.content || '',
      width: activeEditableNode.width || FIXED_NODE_WIDTH,
    }
    setCopiedNode(snapshot)

    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
      setCollaborationStatus('Node copied to the clipboard and ready to paste into the canvas.')
    } catch {
      setCollaborationStatus('Node copied in whiteboard memory. Right-click the canvas to paste it.')
    }
  }

  const createGroupFromSelection = () => {
    const memberNodeIds = selectedNodeIds.filter((nodeId) => {
      const node = nodes.find((item) => item.id === nodeId)
      return node && node.type !== 'group'
    })

    if (memberNodeIds.length < 2) return

    const groupNode = createGroupNode(memberNodeIds)
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    applyCommittedBoardChange([...nodes, groupNode], links, { preferredNodeId: groupNode.id })
    setEditorState({
      mode: 'node',
      targetId: groupNode.id,
      x: canvasMenu.x || 160,
      y: canvasMenu.y || 160,
    })
  }

  const hasGroupableSelection = selectedNodeIds.filter((nodeId) => {
    const node = nodes.find((item) => item.id === nodeId)
    return node && node.type !== 'group'
  }).length >= 2

  const selectedGroupableNodeIds = selectedNodeIds.filter((nodeId) => {
    const node = nodes.find((item) => item.id === nodeId)
    return node && node.type !== 'group'
  })

  const deleteSelectedNode = () => {
    if (!activeEditableNodeId) return
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    const nextNodes = nodes.filter((node) => {
      if (node.id === activeEditableNodeId) return false
      if (node.type === 'group' && Array.isArray(node.memberNodeIds) && node.memberNodeIds.includes(activeEditableNodeId)) {
        return true
      }
      return true
    }).map((node) => (
      node.type === 'group'
        ? { ...node, memberNodeIds: (node.memberNodeIds || []).filter((memberId) => memberId !== activeEditableNodeId) }
        : node
    ))
    const nextLinks = links.filter((link) => link.fromNodeId !== activeEditableNodeId && link.toNodeId !== activeEditableNodeId)
    applyCommittedBoardChange(nextNodes, nextLinks)
  }

  const regenerateBoard = () => {
    if (!selectedExercise) return
    const nextNodes = generateWorkspaceFromExercise(selectedExercise)
    const nextLinks = generateWorkspaceLinksFromExercise(nextNodes)
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    applyCommittedBoardChange(nextNodes, nextLinks, { preferredNodeId: nextNodes[0]?.id || '' })
  }

  const clearBoardSelection = () => {
    setActiveWhiteboardExerciseId('')
    setActiveWhiteboardWorkspaceId('')
    setLoadedWorkspace(null)
    applyBoardState(null, [], [], '')
    setCollaborationStatus('')
    setCollaborationError('')
  }

  const exportCurrentWorkspace = () => {
    if (!selectedExercise) return
    downloadJsonFile(
      'inticore-whiteboard-workspace.json',
      buildWhiteboardWorkspaceExportJson({
        workspace: loadedWorkspace || {
          id: workspaceId || '',
          visibility: 'public',
          exercise_title: selectedExercise.title || 'Math Whiteboard',
          exercise_snapshot: selectedExercise,
          nodes,
          links,
        },
        exercise: selectedExercise,
        exportedByUserId: session?.userId || '',
      })
    )
    setCollaborationStatus('Whiteboard exported to JSON.')
  }

  const importWorkspaceFromFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const json = await parseJsonFile(file)
      const imported = extractWhiteboardWorkspaceFromJson(json)
      if (!imported) throw new Error('The file does not contain a valid whiteboard workspace.')

      const savedExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        ...imported.exercise,
        id: null,
      })
      saveWorkspace(savedExercise.id, {
        nodes: imported.nodes,
        links: imported.links,
      })

      if (session?.userId) {
        const clonedWorkspace = await ensureRootWhiteboardWorkspace({
          ownerUserId: session.userId,
          exerciseLocalId: savedExercise.id,
          exerciseTitle: imported.title || savedExercise.title || 'Math Whiteboard',
          exerciseSnapshot: { ...savedExercise },
          nodes: imported.nodes,
          links: imported.links,
          visibility: 'public',
          lastEditorUserId: session.userId,
        })
        setLoadedWorkspace(clonedWorkspace)
        setActiveWhiteboardWorkspaceId(clonedWorkspace.id)
      } else {
        setLoadedWorkspace(null)
        setActiveWhiteboardWorkspaceId('')
      }

      setActiveWhiteboardExerciseId(savedExercise.id)
      openExercise(savedExercise.id)
      setCollaborationStatus('Whiteboard imported successfully.')
    } catch (error) {
      setCollaborationError(error?.message || 'Could not import the whiteboard file.')
    }
  }

  const saveMyCopy = async () => {
    if (!session?.userId || !selectedExercise) return

    try {
      const savedExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        ...selectedExercise,
        id: null,
      })
      saveWorkspace(savedExercise.id, { nodes, links })
      const clonedWorkspace = await cloneWhiteboardWorkspace({
        ownerUserId: session.userId,
        sourceWorkspaceId: loadedWorkspace?.id || null,
        exerciseLocalId: savedExercise.id,
        exerciseTitle: savedExercise.title || 'Math Whiteboard',
        exerciseSnapshot: { ...savedExercise },
        nodes,
        links,
        visibility: 'private',
        lastEditorUserId: session.userId,
      })
      setExercises(listWhiteboardExercises())
      setLoadedWorkspace(clonedWorkspace)
      setActiveWhiteboardExerciseId(savedExercise.id)
      setActiveWhiteboardWorkspaceId(clonedWorkspace.id)
      applyBoardState(savedExercise, nodes, links, clonedWorkspace.id)
      setCollaborationStatus('A new personal copy of this public whiteboard was saved to your account.')
    } catch (error) {
      setCollaborationError(error?.message || 'Could not save your copy of this whiteboard.')
    }
  }

  const toggleWorkspaceVisibility = async () => {
    if (!session?.userId || !workspaceId || !loadedWorkspace || !isWorkspaceOwner) return

    const nextVisibility = String(loadedWorkspace.visibility || 'public') === 'public' ? 'private' : 'public'

    try {
      const updatedWorkspace = await updateWhiteboardWorkspace(workspaceId, session.userId, {
        exerciseTitle: selectedExercise?.title || loadedWorkspace.exercise_title || 'Math Whiteboard',
        exerciseSnapshot: selectedExercise || loadedWorkspace.exercise_snapshot || null,
        nodes,
        links,
        visibility: nextVisibility,
        lastEditorUserId: session.userId,
      })

      setLoadedWorkspace(updatedWorkspace)
      setCollaborationStatus(
        nextVisibility === 'public'
          ? 'Whiteboard is now public and visible to other users.'
          : 'Whiteboard is now private and hidden from other users.'
      )
      setCollaborationError('')
    } catch (error) {
      setCollaborationError(error?.message || 'Could not update the whiteboard visibility.')
    }
  }

  const openExercise = async (nextExerciseId) => {
    setExercises(listWhiteboardExercises())

    if (!nextExerciseId) {
      clearBoardSelection()
      return
    }

    const nextExercise = listWhiteboardExercises().find((item) => item.id === nextExerciseId) || null
    if (!nextExercise) return

    setBoardLoading(true)
    setBoardError('')

    try {
      if (session?.userId) {
        await ensureRemoteWorkspaceForExercise(nextExercise)
      } else {
        setActiveWhiteboardWorkspaceId('')
        setActiveWhiteboardExerciseId(nextExercise.id)
        loadLocalExercise(nextExercise)
        setCollaborationStatus('Local mode. Sign in to sync this whiteboard.')
      }
    } catch (error) {
      setCollaborationError(error?.message || 'Could not open the collaborative whiteboard.')
      setActiveWhiteboardWorkspaceId('')
      setActiveWhiteboardExerciseId(nextExercise.id)
      loadLocalExercise(nextExercise)
    } finally {
      setBoardLoading(false)
    }
  }

  const persistLink = () => {
    const sourceNodeId = linkForm.sourceNodeId || selectedNodeId
    const label = String(linkForm.label || '').trim() || selectedTechnique?.name || ''

    if (!sourceNodeId || !linkForm.targetNodeId || sourceNodeId === linkForm.targetNodeId) return
    if (!label) return

    if (selectedLink) {
      commitHistoryEntry(buildBoardSnapshot(nodes, links))
      const nextLinks = links.map((link) => (
        link.id === selectedLink.id
          ? {
              ...link,
              fromNodeId: sourceNodeId,
              toNodeId: linkForm.targetNodeId,
              label,
              techniqueId: selectedTechnique?.id || '',
              justification: String(linkForm.justification || '').trim(),
            }
          : link
      ))
      applyCommittedBoardChange(nodes, nextLinks, { preferredNodeId: sourceNodeId, preferredLinkId: selectedLink.id })
    } else {
      const nextLink = createWorkspaceLink(sourceNodeId, linkForm.targetNodeId, label, {
        techniqueId: selectedTechnique?.id || '',
        justification: String(linkForm.justification || '').trim(),
      })
      commitHistoryEntry(buildBoardSnapshot(nodes, links))
      applyCommittedBoardChange(nodes, [...links, nextLink], { preferredNodeId: sourceNodeId, preferredLinkId: nextLink.id })
    }
  }

  const deleteSelectedLink = () => {
    if (!selectedLinkId) return
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    applyCommittedBoardChange(
      nodes,
      links.filter((link) => link.id !== selectedLinkId),
      { preferredNodeId: selectedNodeId }
    )
  }

  const nodeEditorTarget = nodes.find((node) => node.id === editorState.targetId) || null

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800
  const editorLeft = clampFloatingPosition(editorState.x, 12, Math.max(12, viewportWidth - 940))
  const editorTop = clampFloatingPosition(editorState.y, 12, Math.max(12, viewportHeight - 280))
  const canvasMenuLeft = clampFloatingPosition(canvasMenu.x, 12, Math.max(12, viewportWidth - 260))
  const canvasMenuTop = clampFloatingPosition(canvasMenu.y, 12, Math.max(12, viewportHeight - 180))

  const editorStyle = {
    left: `${editorLeft}px`,
    top: `${editorTop}px`,
    maxHeight: `${Math.max(280, viewportHeight - editorTop - 16)}px`,
  }

  const canvasMenuStyle = {
    left: `${canvasMenuLeft}px`,
    top: `${canvasMenuTop}px`,
    maxHeight: `${Math.max(140, viewportHeight - canvasMenuTop - 16)}px`,
  }

  const zoomPercent = Math.round(zoomLevel * 100)
  const zoomedBoardStyle = {
    width: `${boardMetrics.width * zoomLevel}px`,
    height: `${boardMetrics.height * zoomLevel}px`,
  }
  const boardStageStyle = {
    width: `${boardMetrics.width}px`,
    height: `${boardMetrics.height}px`,
    transform: `scale(${zoomLevel})`,
    transformOrigin: 'top left',
  }

  if (boardLoading) {
    return (
      <div className="page wb-page">
        <div className="menu-shell">
          <div className="menu-card">
            <div className="saved-empty">Loading whiteboard...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!selectedExercise) {
    return (
      <div className="page wb-page">
        <div className="menu-shell">
          <div className="menu-card">
            <div className="menu-top">
              <h1 className="menu-title">Exercise Selection</h1>
            </div>
            <p className="menu-subtitle">Open an exercise to work on the whiteboard in full-screen mode.</p>
            {boardError && <div className="auth-error">{boardError}</div>}
            {collaborationError && <div className="auth-error">{collaborationError}</div>}
            {collaborationStatus && <div className="saved-empty">{collaborationStatus}</div>}

            <div className="saved-list">
              {exercises.length === 0 ? (
                <div className="saved-empty">There are no whiteboard exercises available yet.</div>
              ) : (
                exercises.map((exercise) => (
                  <button key={exercise.id} type="button" className="saved-item wb-record-card" onClick={() => openExercise(exercise.id)}>
                    <div className="saved-item-title">{exercise.title || 'Untitled exercise'}</div>
                    <div className="saved-item-meta">{exercise.topic || 'No topic'}</div>
                    <div className="saved-item-tags">Data items: {exercise.dataItems?.length || 0}</div>
                  </button>
                ))
              )}
            </div>

            <div className="menu-actions competitive-menu-footer">
              <button type="button" className="btn menu-btn" onClick={onBackToWhiteboard}>Back to Module</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page wb-page wb-fullscreen-page">
      <div className="wb-fullscreen-header">
        <div>
          <h1 className="page-title">{selectedExercise.title || 'Math Whiteboard'}</h1>
          <div className="saved-empty">Right-click empty space to add or paste nodes. Use Shift + click to select multiple nodes and group them. Use Ctrl/Cmd + Z to undo and Ctrl/Cmd + Y to redo.</div>
          {loadedWorkspace && (
            <div className="saved-item-tags">
              {(loadedWorkspace.visibility || 'public') === 'public' ? 'Public whiteboard' : 'Private whiteboard'}
              {isWorkspaceOwner ? ' | You are the owner' : ''}
            </div>
          )}
          <div className="wb-collaboration-strip">
            <div className="wb-collaboration-presence">
              {participantList.length ? (
                participantList.map((participant) => (
                  <div key={participant.clientId || participant.userId} className="wb-collab-chip">
                    <span
                      className="wb-collab-dot"
                      style={{ backgroundColor: participant.color }}
                    />
                    <span>{participant.username}{participant.isSelf ? ' (you)' : ''}</span>
                  </div>
                ))
              ) : (
                <div className="wb-collab-chip is-muted">Solo session</div>
              )}
            </div>
            {activeCollaboratorSummary && (
              <div className="wb-collaboration-activity">{activeCollaboratorSummary}</div>
            )}
          </div>
          {collaborationStatus && <div className="saved-item-tags">{collaborationStatus}</div>}
          {collaborationError && <div className="auth-error">{collaborationError}</div>}
        </div>
        <div className="wb-header-actions">
          <div className="wb-zoom-controls" role="group" aria-label="Whiteboard zoom controls">
            <button
              type="button"
              className={`btn ${interactionMode === 'hand' ? 'is-active' : ''}`}
              onClick={() => setInteractionMode((prev) => (prev === 'hand' ? 'select' : 'hand'))}
            >
              {interactionMode === 'hand' ? 'Hand On' : 'Hand'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setZoomLevel((prev) => clampZoomLevel(prev - ZOOM_STEP))}
              disabled={zoomLevel <= MIN_ZOOM_LEVEL}
            >
              Zoom Out
            </button>
            <button type="button" className="btn" onClick={() => setZoomLevel(1)}>
              {zoomPercent}%
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setZoomLevel((prev) => clampZoomLevel(prev + ZOOM_STEP))}
              disabled={zoomLevel >= MAX_ZOOM_LEVEL}
            >
              Zoom In
            </button>
          </div>
          <button type="button" className="btn" onClick={exportCurrentWorkspace}>
            Export JSON
          </button>
          <button type="button" className="btn" onClick={() => importFileRef.current?.click()}>
            Import JSON
          </button>
          {loadedWorkspace && !isWorkspaceOwner && (
            <button type="button" className="btn" onClick={saveMyCopy}>
              Save My Copy
            </button>
          )}
          {loadedWorkspace && isWorkspaceOwner && (
            <button type="button" className="btn" onClick={toggleWorkspaceVisibility}>
              {(loadedWorkspace.visibility || 'public') === 'public' ? 'Make Private' : 'Make Public'}
            </button>
          )}
          <button type="button" className="btn" onClick={undoLastChange} disabled={!historyPast.length}>
            Undo
          </button>
          <button type="button" className="btn" onClick={redoLastChange} disabled={!historyFuture.length}>
            Redo
          </button>
          <button type="button" className="btn" onClick={createGroupFromSelection} disabled={!hasGroupableSelection}>
            Group Selected
          </button>
          <button type="button" className="btn" onClick={() => setShowOfficialResult((prev) => !prev)}>
            {showOfficialResult ? 'Hide Official Answer' : 'Show Official Answer'}
          </button>
          <button type="button" className="btn" onClick={regenerateBoard}>Regenerate Board</button>
          <button type="button" className="btn" onClick={() => openExercise('')}>Change Exercise</button>
          <button type="button" className="btn" onClick={onBackToWhiteboard}>Back to Module</button>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            style={{ display: 'none' }}
            onChange={importWorkspaceFromFile}
          />
        </div>
      </div>

      <div className="wb-fullscreen-board">
        <div
          ref={boardCanvasRef}
          className={`wb-board-canvas wb-board-canvas-full ${interactionMode === 'hand' ? 'is-hand-mode' : ''} ${panState.active ? 'is-panning' : ''}`}
          onMouseDown={(event) => {
            if (event.button === 1) {
              event.preventDefault()
            }
          }}
        >
          <div className="wb-board-zoom-shell" style={zoomedBoardStyle}>
            <div
            className="wb-board-stage"
            style={boardStageStyle}
            onPointerDown={(event) => {
              const shouldPanWithMiddleClick = event.button === 1
              const shouldPanWithHandTool = interactionMode === 'hand' && event.button === 0
              if (shouldPanWithMiddleClick || shouldPanWithHandTool) {
                startCanvasPan(event)
                return
              }
              if (event.button !== 0 || event.target !== event.currentTarget) return
              const boardPosition = getBoardCoordinatesFromClient(event.clientX, event.clientY)
              setEditorState(buildEditorState())
              setCanvasMenu(buildCanvasMenuState())
              setSelectionBox({
                active: true,
                startX: boardPosition.x,
                startY: boardPosition.y,
                currentX: boardPosition.x,
                currentY: boardPosition.y,
                additive: Boolean(event.shiftKey || event.ctrlKey || event.metaKey),
                initialNodeIds: event.shiftKey || event.ctrlKey || event.metaKey ? selectedNodeIdsRef.current : [],
                hasMoved: false,
              })
            }}
            onClick={() => {
              if (suppressNextStageClickRef.current) {
                suppressNextStageClickRef.current = false
                return
              }
              setEditorState(buildEditorState())
              setCanvasMenu(buildCanvasMenuState())
              setSelectedNodeId('')
              setSelectedNodeIds([])
              setSelectedLinkId('')
            }}
            onContextMenu={(event) => {
              if (event.target !== event.currentTarget) return
              event.preventDefault()
              const boardPosition = getBoardCoordinatesFromClient(event.clientX, event.clientY)
              setEditorState(buildEditorState())
              setCanvasMenu({
                open: true,
                mode: 'canvas',
                targetId: '',
                x: event.clientX,
                y: event.clientY,
                boardX: Math.max(24, boardPosition.x - 110),
                boardY: Math.max(24, boardPosition.y - 70),
              })
            }}
          >
            <svg className="wb-links-layer" width={boardMetrics.width} height={boardMetrics.height}>
              {renderedLinks.map((link) => (
                (() => {
                  const remoteLinkEditors = remoteLinkEditorsById[link.id] || []
                  const remoteLinkEditor = remoteLinkEditors[0] || null

                  return (
                    <g
                      key={link.id}
                    onClick={() => {
                      if (interactionMode === 'hand') return
                      setSelectedLinkId(link.id)
                      setSelectedNodeId(link.fromNodeId)
                      setSelectedNodeIds([link.fromNodeId])
                        setCanvasMenu(buildCanvasMenuState())
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        if (interactionMode === 'hand') return
                        openLinkEditor(link.id, event)
                      }}
                    >
                      <path
                        d={link.d}
                        className={`wb-link-line ${selectedLinkId === link.id ? 'is-selected' : ''}`}
                        style={remoteLinkEditor ? { stroke: remoteLinkEditor.color, strokeWidth: selectedLinkId === link.id ? 3.5 : 3 } : undefined}
                      />
                      <rect
                        x={link.labelX - (link.labelWidth / 2)}
                        y={link.labelY - 12}
                        width={link.labelWidth}
                        height={24}
                        rx={12}
                        className="wb-link-label-box"
                        style={remoteLinkEditor ? { stroke: remoteLinkEditor.color, strokeWidth: 1.6 } : undefined}
                      />
                      <text x={link.labelX} y={link.labelY} className="wb-link-label">
                        {link.label}
                      </text>
                      {remoteLinkEditor && (
                        <text x={link.labelX} y={link.labelY + 20} className="wb-link-presence" style={{ fill: remoteLinkEditor.color }}>
                          {remoteLinkEditor.username}
                        </text>
                      )}
                    </g>
                  )
                })()
              ))}
            </svg>

            {selectionBounds && (
              <div
                className="wb-selection-box"
                style={{
                  left: `${selectionBounds.left}px`,
                  top: `${selectionBounds.top}px`,
                  width: `${Math.max(0, selectionBounds.right - selectionBounds.left)}px`,
                  height: `${Math.max(0, selectionBounds.bottom - selectionBounds.top)}px`,
                }}
              />
            )}

            {visibleNodes.filter((node) => node.type === 'group').map((node) => {
              const bounds = getNodeBounds(node, nodes)
              const isSelected = node.id === selectedNodeId
              const remoteNodeEditors = remoteNodeEditorsById[node.id] || []
              const remoteNodeEditor = remoteNodeEditors[0] || null
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`wb-group-card ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    left: `${bounds.x}px`,
                    top: `${bounds.y}px`,
                    width: `${bounds.width}px`,
                    height: `${bounds.height}px`,
                    borderColor: remoteNodeEditor ? remoteNodeEditor.color : undefined,
                    boxShadow: remoteNodeEditor ? `0 0 0 1px ${remoteNodeEditor.color}` : undefined,
                  }}
                  onPointerDown={(event) => {
                    const shouldPanWithMiddleClick = event.button === 1
                    const shouldPanWithHandTool = interactionMode === 'hand' && event.button === 0
                    if (shouldPanWithMiddleClick || shouldPanWithHandTool) {
                      startCanvasPan(event)
                      return
                    }
                    if (event.button !== 0) return
                    event.stopPropagation()
                    const memberNodeIds = Array.isArray(node.memberNodeIds) ? node.memberNodeIds : []
                    const movableNodeIds = memberNodeIds.length ? [node.id, ...memberNodeIds] : [node.id]
                    const startPositions = movableNodeIds.reduce((acc, movableId) => {
                      const targetNode = nodes.find((item) => item.id === movableId)
                      if (!targetNode) return acc
                      acc[movableId] = { x: targetNode.x, y: targetNode.y }
                      return acc
                    }, {})
                    const boardPosition = getBoardCoordinatesFromClient(event.clientX, event.clientY)
                    setSelectedNodeId(node.id)
                    setSelectedNodeIds((prev) => {
                      if (event.shiftKey || event.ctrlKey || event.metaKey) {
                        return prev.includes(node.id) ? prev : [...prev, node.id]
                      }
                      return [node.id]
                    })
                    setSelectedLinkId('')
                    dragStartSnapshotRef.current = buildBoardSnapshot(nodes, links)
                    setDragState({
                      kind: 'group',
                      nodeId: node.id,
                      startPointerX: boardPosition.x,
                      startPointerY: boardPosition.y,
                      startPositions,
                    })
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedNodeId(node.id)
                    setSelectedNodeIds((prev) => {
                      if (event.shiftKey || event.ctrlKey || event.metaKey) {
                        return prev.includes(node.id) ? prev : [...prev, node.id]
                      }
                      return [node.id]
                    })
                    setSelectedLinkId('')
                    setCanvasMenu(buildCanvasMenuState())
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    openNodeMenu(node.id, event)
                  }}
                >
                  <span className="wb-group-badge">{node.title || 'Group'}</span>
                  {remoteNodeEditor && (
                    <span className="wb-remote-badge" style={{ borderColor: remoteNodeEditor.color, color: remoteNodeEditor.color }}>
                      {remoteNodeEditor.username}
                    </span>
                  )}
                </button>
              )
            })}

            {visibleNodes.filter((node) => node.type !== 'group').map((node) => {
              const meta = getNodeTypeMeta(node.type)
              const nodeColor = node.customColor || meta.color
              const isSelected = selectedNodeIds.includes(node.id)
              const remoteNodeEditors = remoteNodeEditorsById[node.id] || []
              const remoteNodeEditor = remoteNodeEditors[0] || null

              return (
                <button
                  key={node.id}
                  type="button"
                  className={`wb-node-card ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    borderColor: nodeColor,
                    boxShadow: remoteNodeEditor
                      ? `0 0 0 2px ${remoteNodeEditor.color}${isSelected ? `, 0 0 0 3px ${nodeColor}` : ''}`
                      : (isSelected ? `0 0 0 1px ${nodeColor}` : 'none'),
                  }}
                  data-collapsed={node.collapsed ? 'true' : 'false'}
                  onPointerDown={(event) => {
                    const shouldPanWithMiddleClick = event.button === 1
                    const shouldPanWithHandTool = interactionMode === 'hand' && event.button === 0
                    if (shouldPanWithMiddleClick || shouldPanWithHandTool) {
                      startCanvasPan(event)
                      return
                    }
                    event.stopPropagation()
                    setSelectedNodeId(node.id)
                    setSelectedNodeIds((prev) => (
                      (event.shiftKey || event.ctrlKey || event.metaKey)
                        ? Array.from(new Set([...prev, node.id]))
                        : [node.id]
                    ))
                    setSelectedLinkId('')
                    const boardPosition = getBoardCoordinatesFromClient(event.clientX, event.clientY)
                    dragStartSnapshotRef.current = buildBoardSnapshot(nodes, links)
                    setDragState({
                      kind: 'node',
                      nodeId: node.id,
                      offsetX: boardPosition.x - node.x,
                      offsetY: boardPosition.y - node.y,
                    })
                  }}
                  onClick={(event) => {
                    if (interactionMode === 'hand') return
                    event.stopPropagation()
                    setSelectedNodeId(node.id)
                    setSelectedNodeIds((prev) => {
                      if (event.shiftKey || event.ctrlKey || event.metaKey) {
                        return prev.includes(node.id) ? prev : [...prev, node.id]
                      }
                      return [node.id]
                    })
                    setSelectedLinkId('')
                    setCanvasMenu(buildCanvasMenuState())
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    if (interactionMode === 'hand') return
                    event.stopPropagation()
                    openNodeMenu(node.id, event)
                  }}
                >
                  <div className="wb-node-pill" style={{ backgroundColor: nodeColor }}>{meta.label}</div>
                  {remoteNodeEditor && (
                    <div className="wb-remote-badge" style={{ borderColor: remoteNodeEditor.color, color: remoteNodeEditor.color }}>
                      {remoteNodeEditor.username}
                    </div>
                  )}
                  <div className="wb-node-title">{node.title || meta.label}</div>
                  {!node.collapsed && (
                    <div
                      className="wb-node-content wb-node-rich-content"
                      dangerouslySetInnerHTML={{ __html: renderNodeHtml(node.content || '') }}
                    />
                  )}
                </button>
              )
            })}
            </div>
          </div>
        </div>

        {canvasMenu.open && (
          <div ref={canvasMenuRef} className="wb-context-editor wb-context-menu" style={canvasMenuStyle}>
            {canvasMenu.mode === 'canvas' && (
              <>
                <button type="button" className="btn" onClick={addNodeFromCanvasMenu}>Add Node</button>
                {copiedNode && (
                  <button type="button" className="btn" onClick={pasteCopiedNodeAtCanvasMenu}>Paste Node</button>
                )}
                {selectedNodeIds.length >= 2 && (
                  <button type="button" className="btn" onClick={createGroupFromSelection}>Create Group</button>
                )}
              </>
            )}

            {canvasMenu.mode === 'node' && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    openNodeEditor(canvasMenu.targetId, { clientX: canvasMenu.x, clientY: canvasMenu.y })
                  }}
                >
                  Edit Node
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    openNewLinkEditor(canvasMenu.targetId, { clientX: canvasMenu.x, clientY: canvasMenu.y })
                  }}
                >
                  Create Link
                </button>
                {hasGroupableSelection && (
                  <button type="button" className="btn" onClick={createGroupFromSelection}>
                    Group Selected Nodes
                  </button>
                )}
                {selectedNode?.type !== 'group' && (
                  <button type="button" className="btn" onClick={toggleSelectedNodeCollapsed}>
                    {selectedNode?.collapsed ? 'Expand Node' : 'Collapse Node'}
                  </button>
                )}
                {selectedNode?.type !== 'group' && (
                  <>
                    <button type="button" className="btn" onClick={duplicateSelectedNode}>Duplicate Node</button>
                    <button type="button" className="btn" onClick={copySelectedNode}>Copy Node</button>
                  </>
                )}
                <button type="button" className="btn danger" onClick={deleteSelectedNode}>Delete Node</button>
              </>
            )}
          </div>
        )}

        {editorState.mode && (
          <div ref={editorPanelRef} className="wb-context-editor" style={editorStyle}>
            <div className="wb-context-editor-top">
              <div className="saved-title">{editorState.mode === 'node' ? 'Edit Node' : 'Edit Link'}</div>
              <button type="button" className="btn" onClick={() => setEditorState(buildEditorState())}>Close</button>
            </div>

            {editorState.mode === 'node' && nodeEditorTarget && (
              <div className="wb-context-editor-layout">
                <div className="wb-context-editor-sidebar">
                  {(remoteNodeEditorsById[nodeEditorTarget.id] || []).length > 0 && (
                    <div
                      className="wb-editor-presence"
                      style={{ borderColor: remoteNodeEditorsById[nodeEditorTarget.id][0].color }}
                    >
                      {remoteNodeEditorsById[nodeEditorTarget.id].map((participant) => participant.username).join(', ')} editing this node right now.
                    </div>
                  )}
                  <label className="field">
                    <span>Type</span>
                    <select
                      value={nodeEditorTarget.type}
                      onChange={(e) => updateSelectedNode('type', e.target.value)}
                      disabled={Boolean(nodeEditorTarget.locked) || nodeEditorTarget.type === 'group'}
                    >
                      {WHITEBOARD_NODE_TYPES.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Title</span>
                    <input
                      value={nodeEditorTarget.title || ''}
                      onChange={(e) => updateSelectedNode('title', e.target.value)}
                      maxLength={180}
                      placeholder="Use a longer descriptive node title if needed"
                    />
                  </label>

                  <label className="field">
                    <span>Node Color</span>
                    <input
                      type="color"
                      value={String(nodeEditorTarget.customColor || getNodeTypeMeta(nodeEditorTarget.type).color)}
                      onChange={(e) => updateSelectedNode('customColor', e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Optional Account Technique</span>
                    <div
                      className={`construct-technique-picker ${nodeTechniquePickerOpen ? 'is-open' : ''}`}
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setNodeTechniquePickerOpen(false)
                        }
                      }}
                    >
                      {nodeTechniquePickerOpen ? (
                        <>
                          <input
                            autoFocus
                            className="construct-technique-input"
                            value={nodeTechniqueSearch}
                            onChange={(e) => setNodeTechniqueSearch(e.target.value)}
                            placeholder={nodeTechniqueLanguage === 'fr' ? 'Search technique by French name' : 'Search technique by Spanish name'}
                          />
                          <div className="construct-technique-options" role="listbox">
                            <button
                              type="button"
                              className={`construct-technique-option ${!nodeEditorTarget.techniqueId ? 'is-selected' : ''}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                updateSelectedNode('techniqueId', '')
                                setNodeTechniquePickerOpen(false)
                              }}
                            >
                              No predefined technique
                            </button>
                            {selectableNodeTechniques.length > 0 ? (
                              selectableNodeTechniques.map((technique) => (
                                <button
                                  key={technique.id}
                                  type="button"
                                  className={`construct-technique-option ${technique.id === nodeEditorTarget.techniqueId ? 'is-selected' : ''}`}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    updateSelectedNode('techniqueId', technique.id)
                                    setNodeTechniquePickerOpen(false)
                                  }}
                                >
                                  {(getTechniqueTranslation(technique, nodeTechniqueLanguage).name || 'Untitled technique') + ' | ' + (technique.topic || 'No topic')}
                                </button>
                              ))
                            ) : (
                              <div className="construct-technique-empty">No techniques match that name.</div>
                            )}
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={`construct-technique-trigger ${nodeEditorTarget.techniqueId ? 'has-value' : ''}`}
                          onClick={() => setNodeTechniquePickerOpen(true)}
                        >
                          {selectedNodeTechnique
                            ? `${getTechniqueTranslation(selectedNodeTechnique, nodeTechniqueLanguage).name || 'Untitled technique'} | ${selectedNodeTechnique.topic || 'No topic'}`
                            : 'No predefined technique'}
                        </button>
                      )}
                    </div>
                  </label>

                  <div className="auth-tabs" style={{ marginBottom: 8 }}>
                    {TECHNIQUE_LANGUAGE_OPTIONS.map((language) => (
                      <button
                        key={language.id}
                        type="button"
                        className={`auth-tab ${nodeTechniqueLanguage === language.id ? 'active' : ''}`}
                        onClick={() => setNodeTechniqueLanguage(language.id)}
                      >
                        {language.label}
                      </button>
                    ))}
                  </div>

                  {techniquesError && <div className="saved-empty">{techniquesError}</div>}
                  {!techniquesError && (
                    <div className="saved-empty">You can attach a saved technique to this node or group as a reference for the reasoning step it represents.</div>
                  )}
                  {selectedNodeTechnique && (
                    <div
                      className="wb-technique-help"
                      dangerouslySetInnerHTML={{
                        __html: renderNodeHtml(
                          getTechniqueTranslation(selectedNodeTechnique, nodeTechniqueLanguage).effectDescription
                          || selectedNodeTechnique.effectDescription
                          || selectedNodeTechnique.summary
                          || ''
                        ),
                      }}
                    />
                  )}

                  {nodeEditorTarget.type !== 'group' && (
                    <div className="menu-actions wb-inline-actions">
                      <button type="button" className="btn" onClick={toggleSelectedNodeCollapsed}>
                        {nodeEditorTarget.collapsed ? 'Expand Node' : 'Collapse Node'}
                      </button>
                    </div>
                  )}

                  <div className="saved-item-tags">
                    {nodeEditorTarget.locked ? 'Editable base node' : 'Manual node'}
                  </div>
                  {nodeEditorTarget.type === 'group' && (
                    <>
                      <div className="saved-item-tags">Members: {nodeEditorTarget.memberNodeIds?.length || 0}</div>
                      <div className="saved-empty">Select which nodes belong to this group. Moving the group will move all selected members together.</div>
                      {!!selectedGroupableNodeIds.length && (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            updateSelectedNode(
                              'memberNodeIds',
                              Array.from(new Set([
                                ...(Array.isArray(nodeEditorTarget.memberNodeIds) ? nodeEditorTarget.memberNodeIds : []),
                                ...selectedGroupableNodeIds,
                              ]))
                            )
                          }}
                        >
                          Use Current Selection
                        </button>
                      )}
                      <div className="wb-group-member-list">
                        {selectableGroupMembers.length ? (
                          selectableGroupMembers.map((memberNode) => {
                            const checked = Array.isArray(nodeEditorTarget.memberNodeIds) && nodeEditorTarget.memberNodeIds.includes(memberNode.id)
                            return (
                              <label key={memberNode.id} className="wb-group-member-option">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    const currentMemberIds = Array.isArray(nodeEditorTarget.memberNodeIds)
                                      ? nodeEditorTarget.memberNodeIds
                                      : []
                                    const nextMemberIds = event.target.checked
                                      ? [...currentMemberIds, memberNode.id]
                                      : currentMemberIds.filter((memberId) => memberId !== memberNode.id)
                                    updateSelectedNode('memberNodeIds', Array.from(new Set(nextMemberIds)))
                                  }}
                                />
                                <span>{memberNode.title || getNodeTypeMeta(memberNode.type).label}</span>
                              </label>
                            )
                          })
                        ) : (
                          <div className="saved-empty">There are no non-group nodes available to add.</div>
                        )}
                      </div>
                    </>
                  )}

                  <div className="menu-actions wb-inline-actions">
                    <button type="button" className="btn danger" onClick={deleteSelectedNode}>Delete Node</button>
                  </div>
                </div>

                <div className="wb-context-editor-main">
                  <label className="field">
                    <span>Content</span>
                    <DescriptionEditor
                      value={nodeEditorTarget.content || ''}
                      onChange={(value) => updateSelectedNode('content', value)}
                      baseFontFamily={EDITOR_FONT_FAMILY}
                      baseFontSize={18}
                    />
                  </label>
                </div>
              </div>
            )}

            {editorState.mode === 'link' && (
              <div className="wb-context-editor-layout">
                <div className="wb-context-editor-sidebar">
                  {selectedLinkId && (remoteLinkEditorsById[selectedLinkId] || []).length > 0 && (
                    <div
                      className="wb-editor-presence"
                      style={{ borderColor: remoteLinkEditorsById[selectedLinkId][0].color }}
                    >
                      {remoteLinkEditorsById[selectedLinkId].map((participant) => participant.username).join(', ')} editing this link right now.
                    </div>
                  )}
                  <label className="field">
                    <span>Source Node</span>
                    <select
                      value={linkForm.sourceNodeId || selectedNodeId || ''}
                      onChange={(e) => setLinkForm((prev) => ({ ...prev, sourceNodeId: e.target.value }))}
                    >
                      <option value="">Select a source node</option>
                      {nodes.map((node) => (
                        <option key={node.id} value={node.id}>{node.title || getNodeTypeMeta(node.type).label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Target Node</span>
                    <select
                      value={linkForm.targetNodeId}
                      onChange={(e) => setLinkForm((prev) => ({ ...prev, targetNodeId: e.target.value }))}
                    >
                      <option value="">Select a target node</option>
                      {nodes.filter((node) => node.id !== (linkForm.sourceNodeId || selectedNodeId)).map((node) => (
                        <option key={node.id} value={node.id}>{node.title || getNodeTypeMeta(node.type).label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Optional Account Technique</span>
                    <div
                      className={`construct-technique-picker ${linkTechniquePickerOpen ? 'is-open' : ''}`}
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setLinkTechniquePickerOpen(false)
                        }
                      }}
                    >
                      {linkTechniquePickerOpen ? (
                        <>
                          <input
                                  autoFocus
                                  className="construct-technique-input"
                                  value={linkTechniqueSearch}
                                  onChange={(e) => setLinkTechniqueSearch(e.target.value)}
                                  placeholder={linkTechniqueLanguage === 'fr' ? 'Search technique by French name' : 'Search technique by Spanish name'}
                                />
                                <div className="construct-technique-options" role="listbox">
                            <button
                              type="button"
                              className={`construct-technique-option ${!linkForm.techniqueId ? 'is-selected' : ''}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setLinkForm((prev) => ({ ...prev, techniqueId: '' }))
                                setLinkTechniquePickerOpen(false)
                              }}
                            >
                              No predefined technique
                            </button>
                            {selectableLinkTechniques.length > 0 ? (
                              selectableLinkTechniques.map((technique) => (
                                <button
                                  key={technique.id}
                                  type="button"
                                  className={`construct-technique-option ${technique.id === linkForm.techniqueId ? 'is-selected' : ''}`}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    setLinkForm((prev) => ({ ...prev, techniqueId: technique.id }))
                                    setLinkTechniquePickerOpen(false)
                                  }}
                                >
                                  {(getTechniqueTranslation(technique, linkTechniqueLanguage).name || 'Untitled technique') + ' | ' + (technique.topic || 'No topic')}
                                </button>
                              ))
                            ) : (
                              <div className="construct-technique-empty">No techniques match that name.</div>
                            )}
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={`construct-technique-trigger ${linkForm.techniqueId ? 'has-value' : ''}`}
                          onClick={() => setLinkTechniquePickerOpen(true)}
                        >
                          {selectedTechnique
                            ? `${getTechniqueTranslation(selectedTechnique, linkTechniqueLanguage).name || 'Untitled technique'} | ${selectedTechnique.topic || 'No topic'}`
                            : 'No predefined technique'}
                        </button>
                      )}
                    </div>
                  </label>

                  <div className="auth-tabs" style={{ marginBottom: 8 }}>
                    {TECHNIQUE_LANGUAGE_OPTIONS.map((language) => (
                      <button
                        key={language.id}
                        type="button"
                        className={`auth-tab ${linkTechniqueLanguage === language.id ? 'active' : ''}`}
                        onClick={() => setLinkTechniqueLanguage(language.id)}
                      >
                        {language.label}
                      </button>
                    ))}
                  </div>

                  {techniquesError && <div className="saved-empty">{techniquesError}</div>}
                  {!techniquesError && (
                    <div className="saved-empty">You can choose a saved technique from your account or leave it empty and write your own action or argument.</div>
                  )}
                  {selectedTechnique && (
                    <div
                      className="wb-technique-help"
                      dangerouslySetInnerHTML={{
                        __html: renderNodeHtml(
                          getTechniqueTranslation(selectedTechnique, linkTechniqueLanguage).effectDescription
                          || selectedTechnique.effectDescription
                          || selectedTechnique.summary
                          || ''
                        ),
                      }}
                    />
                  )}
                </div>

                <div className="wb-context-editor-main">
                  <label className="field">
                    <span>Link Title, Action, or Argument</span>
                    <input
                      value={linkForm.label}
                      onChange={(e) => setLinkForm((prev) => ({ ...prev, label: e.target.value }))}
                      placeholder="Ex. factor, substitute, apply criterion"
                    />
                  </label>

                  <label className="field">
                    <span>Link Justification</span>
                    <DescriptionEditor
                      value={linkForm.justification || ''}
                      onChange={(value) => setLinkForm((prev) => ({ ...prev, justification: value }))}
                      baseFontFamily={EDITOR_FONT_FAMILY}
                      baseFontSize={18}
                    />
                  </label>

                  <div className="menu-actions wb-inline-actions">
                    <button type="button" className="btn" onClick={persistLink}>Save Link</button>
                    <button type="button" className="btn danger" onClick={deleteSelectedLink}>Delete Link</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
