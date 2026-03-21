import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DescriptionEditor from './DescriptionEditor'
import { downloadJsonFile, parseJsonFile } from './lib/competitiveJson'
import { supabase } from './lib/supabase'
import { listPrivateCompetitiveTechniqueInventory } from './data/competitiveTechniquesRepo'
import {
  cloneWhiteboardWorkspace,
  ensureWhiteboardWorkspace,
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
import {
  buildWhiteboardWorkspaceExportJson,
  extractWhiteboardWorkspaceFromJson,
} from './lib/whiteboardWorkspaceJson'

const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace'
const FIXED_NODE_WIDTH = 220
const FIXED_NODE_HEIGHT = 140
const GROUP_PADDING = 28
const HISTORY_LIMIT = 80
const MIN_ZOOM_LEVEL = 0.6
const MAX_ZOOM_LEVEL = 1.8
const ZOOM_STEP = 0.1

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
  const [editorState, setEditorState] = useState(buildEditorState)
  const [canvasMenu, setCanvasMenu] = useState(buildCanvasMenuState)
  const [techniquesError, setTechniquesError] = useState('')
  const [boardLoading, setBoardLoading] = useState(true)
  const [boardError, setBoardError] = useState('')
  const [collaborationStatus, setCollaborationStatus] = useState('')
  const [collaborationError, setCollaborationError] = useState('')
  const [showOfficialResult, setShowOfficialResult] = useState(false)
  const [historyPast, setHistoryPast] = useState([])
  const [historyFuture, setHistoryFuture] = useState([])
  const [loadedWorkspace, setLoadedWorkspace] = useState(null)
  const [zoomLevel, setZoomLevel] = useState(1)

  const currentBoardSignatureRef = useRef('')
  const remoteAppliedSignatureRef = useRef('')
  const selectedExerciseRef = useRef(null)
  const dragStartSnapshotRef = useRef(null)
  const currentNodesRef = useRef([])
  const currentLinksRef = useRef([])
  const importFileRef = useRef(null)
  const boardCanvasRef = useRef(null)

  useEffect(() => {
    selectedExerciseRef.current = selectedExercise
  }, [selectedExercise])

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

  const selectedLink = useMemo(
    () => links.find((link) => link.id === selectedLinkId) || null,
    [links, selectedLinkId]
  )

  const selectedTechnique = useMemo(
    () => techniques.find((item) => item.id === linkForm.techniqueId) || null,
    [techniques, linkForm.techniqueId]
  )

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

  const isViewingForeignPublicBoard = Boolean(
    loadedWorkspace
    && session?.userId
    && loadedWorkspace.owner_user_id
    && loadedWorkspace.owner_user_id !== session.userId
    && String(loadedWorkspace.visibility || 'public') === 'public'
  )

  const getBoardCoordinatesFromClient = useCallback((clientX, clientY) => {
    const canvasElement = boardCanvasRef.current
    if (!canvasElement) return { x: 24, y: 24 }
    const rect = canvasElement.getBoundingClientRect()
    return {
      x: Math.max(24, (clientX - rect.left + canvasElement.scrollLeft) / zoomLevel),
      y: Math.max(24, (clientY - rect.top + canvasElement.scrollTop) / zoomLevel),
    }
  }, [zoomLevel])

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

    const remoteWorkspace = await ensureWhiteboardWorkspace({
      ownerUserId: session.userId,
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
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== dragState.nodeId) return node
          return {
            ...node,
            x: Math.max(12, pointerPosition.x - dragState.offsetX),
            y: Math.max(12, pointerPosition.y - dragState.offsetY),
          }
        })
      )
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
    const closeFloatingUi = () => {
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
    if (!workspaceId || !session?.userId) return undefined

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
        setLoadedWorkspace(remoteWorkspace)
        applyBoardState(snapshot, boardState.nodes, boardState.links, remoteWorkspace.id)
        setCollaborationStatus('Collaborative changes received in real time.')
      } catch (error) {
        setCollaborationError(error?.message || 'Could not refresh the collaborative whiteboard.')
      }
    }

    const channel = supabase
      .channel(`wb-workspace-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whiteboard_workspaces', filter: `id=eq.${workspaceId}` },
        refreshFromRealtime
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, session?.userId])

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

    if (!workspaceId || !session?.userId) return

    const nextSignature = serializeBoard(nodes, links)
    if (nextSignature === remoteAppliedSignatureRef.current) return

    const timerId = window.setTimeout(async () => {
      try {
        if (isViewingForeignPublicBoard) {
          const clonedWorkspace = await forkForeignWorkspaceForEditing(nodes, links)
          if (clonedWorkspace) {
            remoteAppliedSignatureRef.current = nextSignature
            setCollaborationStatus('Changes were saved to your own copy of this public whiteboard.')
            setCollaborationError('')
            return
          }
        }

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
    isViewingForeignPublicBoard,
  ])

  const updateSelectedNode = (key, value) => {
    if (!selectedNodeId) return
    setNodes((prev) => prev.map((node) => (
      node.id === selectedNodeId ? { ...node, [key]: value } : node
    )))
  }

  const toggleSelectedNodeCollapsed = () => {
    if (!selectedNodeId) return
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    const nextNodes = nodes.map((node) => (
      node.id === selectedNodeId
        ? { ...node, collapsed: !node.collapsed }
        : node
    ))
    applyCommittedBoardChange(nextNodes, links, { preferredNodeId: selectedNodeId })
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
    if (!selectedNode || selectedNode.type === 'group') return
    const nextNode = {
      ...selectedNode,
      id: `wb-node-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      x: selectedNode.x + 28,
      y: selectedNode.y + 28,
      locked: false,
      title: selectedNode.title ? `${selectedNode.title} copia` : 'Copia',
    }
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    applyCommittedBoardChange([...nodes, nextNode], links, { preferredNodeId: nextNode.id })
  }

  const copySelectedNode = async () => {
    if (!selectedNode || selectedNode.type === 'group') return
    const snapshot = {
      type: selectedNode.type,
      title: selectedNode.title || '',
      content: selectedNode.content || '',
      width: selectedNode.width || FIXED_NODE_WIDTH,
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

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return
    commitHistoryEntry(buildBoardSnapshot(nodes, links))
    const nextNodes = nodes.filter((node) => {
      if (node.id === selectedNodeId) return false
      if (node.type === 'group' && Array.isArray(node.memberNodeIds) && node.memberNodeIds.includes(selectedNodeId)) {
        return true
      }
      return true
    }).map((node) => (
      node.type === 'group'
        ? { ...node, memberNodeIds: (node.memberNodeIds || []).filter((memberId) => memberId !== selectedNodeId) }
        : node
    ))
    const nextLinks = links.filter((link) => link.fromNodeId !== selectedNodeId && link.toNodeId !== selectedNodeId)
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
        const clonedWorkspace = await cloneWhiteboardWorkspace({
          ownerUserId: session.userId,
          sourceWorkspaceId: imported.sourceWorkspaceId || null,
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
        visibility: 'public',
        lastEditorUserId: session.userId,
      })
      setLoadedWorkspace(clonedWorkspace)
      setActiveWhiteboardExerciseId(savedExercise.id)
      setActiveWhiteboardWorkspaceId(clonedWorkspace.id)
      await openExercise(savedExercise.id)
      setCollaborationStatus('A new personal copy of this public whiteboard was saved to your account.')
    } catch (error) {
      setCollaborationError(error?.message || 'Could not save your copy of this whiteboard.')
    }
  }

  const forkForeignWorkspaceForEditing = async (currentNodes, currentLinks) => {
    if (!session?.userId || !selectedExercise || !isViewingForeignPublicBoard) return null

    const savedExercise = saveWhiteboardExercise({
      ...buildEmptyWhiteboardExercise(),
      ...selectedExercise,
      id: null,
    })

    saveWorkspace(savedExercise.id, {
      nodes: currentNodes,
      links: currentLinks,
    })

    const clonedWorkspace = await cloneWhiteboardWorkspace({
      ownerUserId: session.userId,
      sourceWorkspaceId: loadedWorkspace?.id || null,
      exerciseLocalId: savedExercise.id,
      exerciseTitle: savedExercise.title || 'Math Whiteboard',
      exerciseSnapshot: { ...savedExercise },
      nodes: currentNodes,
      links: currentLinks,
      visibility: 'public',
      lastEditorUserId: session.userId,
    })

    setExercises(listWhiteboardExercises())
    setSelectedExercise(savedExercise)
    setExerciseId(savedExercise.id)
    setWorkspaceId(clonedWorkspace.id)
    setLoadedWorkspace(clonedWorkspace)
    setActiveWhiteboardExerciseId(savedExercise.id)
    setActiveWhiteboardWorkspaceId(clonedWorkspace.id)

    return clonedWorkspace
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

  const editorStyle = {
    left: `${Math.min(editorState.x, window.innerWidth - 420)}px`,
    top: `${Math.min(editorState.y, window.innerHeight - 520)}px`,
  }

  const canvasMenuStyle = {
    left: `${Math.min(canvasMenu.x, window.innerWidth - 220)}px`,
    top: `${Math.min(canvasMenu.y, window.innerHeight - 120)}px`,
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
          {collaborationStatus && <div className="saved-item-tags">{collaborationStatus}</div>}
          {collaborationError && <div className="auth-error">{collaborationError}</div>}
        </div>
        <div className="wb-header-actions">
          <div className="wb-zoom-controls" role="group" aria-label="Whiteboard zoom controls">
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
          {isViewingForeignPublicBoard && (
            <button type="button" className="btn" onClick={saveMyCopy}>
              Save My Copy
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
        <div ref={boardCanvasRef} className="wb-board-canvas wb-board-canvas-full">
          <div className="wb-board-zoom-shell" style={zoomedBoardStyle}>
            <div
            className="wb-board-stage"
            style={boardStageStyle}
            onClick={() => {
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
                <g
                  key={link.id}
                  onClick={() => {
                    setSelectedLinkId(link.id)
                    setSelectedNodeId(link.fromNodeId)
                    setSelectedNodeIds([link.fromNodeId])
                    setCanvasMenu(buildCanvasMenuState())
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    openLinkEditor(link.id, event)
                  }}
                >
                  <path d={link.d} className={`wb-link-line ${selectedLinkId === link.id ? 'is-selected' : ''}`} />
                  <rect
                    x={link.labelX - (link.labelWidth / 2)}
                    y={link.labelY - 12}
                    width={link.labelWidth}
                    height={24}
                    rx={12}
                    className="wb-link-label-box"
                  />
                  <text x={link.labelX} y={link.labelY} className="wb-link-label">
                    {link.label}
                  </text>
                </g>
              ))}
            </svg>

            {visibleNodes.filter((node) => node.type === 'group').map((node) => {
              const bounds = getNodeBounds(node, nodes)
              const isSelected = node.id === selectedNodeId
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
                </button>
              )
            })}

            {visibleNodes.filter((node) => node.type !== 'group').map((node) => {
              const meta = getNodeTypeMeta(node.type)
              const nodeColor = node.customColor || meta.color
              const isSelected = selectedNodeIds.includes(node.id)

              return (
                <button
                  key={node.id}
                  type="button"
                  className={`wb-node-card ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    borderColor: nodeColor,
                    boxShadow: isSelected ? `0 0 0 1px ${nodeColor}` : 'none',
                  }}
                  data-collapsed={node.collapsed ? 'true' : 'false'}
                  onPointerDown={(event) => {
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
                      nodeId: node.id,
                      offsetX: boardPosition.x - node.x,
                      offsetY: boardPosition.y - node.y,
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
                  <div className="wb-node-pill" style={{ backgroundColor: nodeColor }}>{meta.label}</div>
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
          <div className="wb-context-editor wb-context-menu" style={canvasMenuStyle}>
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
          <div className="wb-context-editor" style={editorStyle}>
            <div className="wb-context-editor-top">
              <div className="saved-title">{editorState.mode === 'node' ? 'Edit Node' : 'Edit Link'}</div>
              <button type="button" className="btn" onClick={() => setEditorState(buildEditorState())}>Close</button>
            </div>

            {editorState.mode === 'node' && nodeEditorTarget && (
              <div className="wb-context-editor-layout">
                <div className="wb-context-editor-sidebar">
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
                    <div className="saved-item-tags">Members: {nodeEditorTarget.memberNodeIds?.length || 0}</div>
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
                    <select
                      value={linkForm.techniqueId}
                      onChange={(e) => setLinkForm((prev) => ({ ...prev, techniqueId: e.target.value }))}
                    >
                      <option value="">No predefined technique</option>
                      {techniques.map((technique) => (
                        <option key={technique.id} value={technique.id}>{technique.name}</option>
                      ))}
                    </select>
                  </label>

                  {techniquesError && <div className="saved-empty">{techniquesError}</div>}
                  {!techniquesError && (
                    <div className="saved-empty">You can choose a saved technique from your account or leave it empty and write your own action or argument.</div>
                  )}
                  {selectedTechnique && (
                    <div
                      className="wb-technique-help"
                      dangerouslySetInnerHTML={{
                        __html: renderNodeHtml(
                          selectedTechnique.effect_description
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
