import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'

import MathInlineNode from './MathInlineNode'
import EditableSketchNode from './EditableSketchNode'
import ResizableImageNode from './ResizableImageNode'
import SketchEngineHost from './SketchEngineHost'
import { MathfieldElement } from 'mathlive'
import { DOMSerializer } from '@tiptap/pm/model'
import {
  buildSketchSvgDataUrl,
  createEmptySketchDocument,
  deserializeSketchDocument,
  drawSketchDocumentToCanvas,
  findSketchItemsInLasso,
  findSketchItemsInRect,
  findTopSketchItemAtPoint,
  getCombinedSketchBounds,
  getSketchItemBounds,
  moveSketchItem,
  rotateSketchItem,
  scaleSketchItem,
  serializeSketchDocument,
  SKETCH_COLORS,
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
} from './lib/editableSketch'
import 'mathlive/static.css'

function toPositiveInt(value, fallback) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return fallback
  return n
}

function buildPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  }
}

function hideVirtualKeyboardSafely(mf) {
  try {
    mf?.executeCommand('hideVirtualKeyboard')
  } catch {
    // noop
  }

  try {
    if (typeof window !== 'undefined' && window.mathVirtualKeyboard) {
      if (typeof window.mathVirtualKeyboard.hide === 'function') {
        window.mathVirtualKeyboard.hide()
      }
      window.mathVirtualKeyboard.visible = false
    }
  } catch {
    // noop
  }
}

function readLatexSafely(mf, fallback = '') {
  if (!mf) return String(fallback || '').trim()

  try {
    const value = String(mf.value || '').trim()
    if (value) return value
  } catch {
    // noop
  }

  try {
    const value = String(mf.getValue?.('latex') || '').trim()
    if (value) return value
  } catch {
    // noop
  }

  return String(fallback || '').trim()
}

function uniqueIds(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)))
}

function boundsContainPoint(bounds, point, padding = 0) {
  if (!bounds || !point) return false
  return (
    point.x >= bounds.left - padding
    && point.x <= bounds.right + padding
    && point.y >= bounds.top - padding
    && point.y <= bounds.bottom + padding
  )
}

function isSketchItemResizable(item) {
  return Boolean(item)
}

function isLockableSketchItem(item) {
  return item?.tool === 'image'
}

function fitSizeWithinBounds(width, height, maxWidth, maxHeight) {
  const safeWidth = Math.max(1, Number(width) || 1)
  const safeHeight = Math.max(1, Number(height) || 1)
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1)
  return {
    width: Math.max(24, Math.round(safeWidth * scale)),
    height: Math.max(24, Math.round(safeHeight * scale)),
  }
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

function buildUniformResizeBoundsFromDelta(sourceBounds, deltaX, deltaY, minSize = 24) {
  if (!sourceBounds) return sourceBounds

  const sourceWidth = Math.max(1, sourceBounds.right - sourceBounds.left)
  const sourceHeight = Math.max(1, sourceBounds.bottom - sourceBounds.top)
  const scaleFromX = (sourceWidth + deltaX) / sourceWidth
  const scaleFromY = (sourceHeight + deltaY) / sourceHeight
  const candidateScale = (scaleFromX >= 1 || scaleFromY >= 1)
    ? Math.max(scaleFromX, scaleFromY)
    : Math.min(scaleFromX, scaleFromY)
  const minScale = Math.max(minSize / sourceWidth, minSize / sourceHeight)
  const scale = Math.max(minScale, candidateScale)

  return {
    left: sourceBounds.left,
    top: sourceBounds.top,
    right: sourceBounds.left + (sourceWidth * scale),
    bottom: sourceBounds.top + (sourceHeight * scale),
  }
}

function getSketchSelectionFrame(bounds, selectionCount) {
  if (!bounds) return null
  const padding = selectionCount === 1 ? 8 : 12
  return {
    left: bounds.left - padding,
    top: bounds.top - padding,
    right: bounds.right + padding,
    bottom: bounds.bottom + padding,
    padding,
  }
}

function getSketchResizeHandle(bounds, selectionCount) {
  const frame = getSketchSelectionFrame(bounds, selectionCount)
  if (!frame) return null
  const size = selectionCount === 1 ? 14 : 20
  const left = Math.max(6, Math.min(SKETCH_WIDTH - size - 6, frame.right - size - 2))
  const top = Math.max(6, Math.min(SKETCH_HEIGHT - size - 6, frame.bottom - size - 2))
  return {
    left,
    top,
    size,
    centerX: left + (size / 2),
    centerY: top + (size / 2),
  }
}

function getSketchRotateHandle(bounds, selectionCount) {
  const frame = getSketchSelectionFrame(bounds, selectionCount)
  if (!frame) return null
  const size = selectionCount === 1 ? 14 : 18
  const left = Math.max(6, Math.min(SKETCH_WIDTH - size - 6, ((frame.left + frame.right) / 2) - (size / 2)))
  const top = Math.max(6, Math.min(SKETCH_HEIGHT - size - 6, frame.top - size - 18))
  return {
    left,
    top,
    size,
    centerX: left + (size / 2),
    centerY: top + (size / 2),
    anchorX: (frame.left + frame.right) / 2,
    anchorY: frame.top,
  }
}

function cloneSketchDocument(document) {
  return JSON.parse(JSON.stringify(document))
}

function createEmptySketchDocumentForEditor() {
  return {
    ...createEmptySketchDocument(),
    engine: 'legacy',
  }
}

const TEXT_COLOR_PRESETS = [
  { id: 'white', label: 'Blanco', value: '#ffffff' },
  { id: 'orange', label: 'Naranja', value: '#f97316' },
  { id: 'red', label: 'Rojo', value: '#dc2626' },
  { id: 'yellow', label: 'Amarillo', value: '#facc15' },
  { id: 'green', label: 'Verde', value: '#22c55e' },
  { id: 'blue', label: 'Azul', value: '#38bdf8' },
]

function convertSketchDocumentForModal(document) {
  const safeDocument = document && typeof document === 'object'
    ? document
    : createEmptySketchDocumentForEditor()

  if (safeDocument.engine === 'tldraw' || safeDocument.engine === 'konva' || safeDocument.engine === 'excalidraw') {
    const previewSrc = safeDocument.previewDataUrl || buildSketchSvgDataUrl(safeDocument)
    const fitted = fitSizeWithinBounds(
      safeDocument.width || SKETCH_WIDTH,
      safeDocument.height || SKETCH_HEIGHT,
      SKETCH_WIDTH - 80,
      SKETCH_HEIGHT - 80,
    )

    return {
      ...createEmptySketchDocumentForEditor(),
      items: previewSrc
        ? [{
            id: `sketch-item-${Date.now()}`,
            tool: 'image',
            color: '#111827',
            size: 1,
            src: previewSrc,
            x: Math.round((SKETCH_WIDTH - fitted.width) / 2),
            y: Math.round((SKETCH_HEIGHT - fitted.height) / 2),
            width: fitted.width,
            height: fitted.height,
            rotation: 0,
          }]
        : [],
    }
  }

  return safeDocument
}

function buildSketchHistorySnapshot(document, selectedIds) {
  return {
    document: cloneSketchDocument(document),
    selectedIds: uniqueIds(selectedIds),
  }
}

function canonicalizeEditorHtml(value) {
  const raw = typeof value === 'string' ? value : ''
  if (!raw.trim()) return ''

  if (typeof window === 'undefined') {
    return raw.replace(/\s+/g, ' ').trim()
  }

  try {
    const parser = new window.DOMParser()
    const doc = parser.parseFromString(raw, 'text/html')
    return String(doc.body.innerHTML || '').trim()
  } catch {
    return raw.replace(/\s+/g, ' ').trim()
  }
}

export default function DescriptionEditor({
  value,
  onChange,
  baseFontFamily,
  baseFontSize,
  readOnly = false,
  extraToolbarButtons = [],
  textColorPresets = TEXT_COLOR_PRESETS,
  onFocusCapture,
  onBlurCapture,
  onSelectionSnapshotChange,
  onExternalContentApplied,
  contextMenuActions = [],
  resetKey = '',
}) {
  const [textColor, setTextColor] = useState(() => textColorPresets[0]?.value || '#ffffff')
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [editorUiVersion, setEditorUiVersion] = useState(0)
  const [isSketchOpen, setIsSketchOpen] = useState(false)
  const [sketchDialogMode, setSketchDialogMode] = useState('insert')
  const [sketchColor, setSketchColor] = useState(SKETCH_COLORS[0])
  const [sketchSize, setSketchSize] = useState(4)
  const [sketchTool, setSketchTool] = useState('pen')
  const [sketchDocument, setSketchDocument] = useState(() => createEmptySketchDocument())
  const [sketchNodeWidth, setSketchNodeWidth] = useState(360)
  const [editingSketchNodePos, setEditingSketchNodePos] = useState(null)
  const [selectedSketchItemIds, setSelectedSketchItemIds] = useState([])
  const [sketchSelectionOverlay, setSketchSelectionOverlay] = useState(null)
  const [sketchHistoryPast, setSketchHistoryPast] = useState([])
  const [sketchHistoryFuture, setSketchHistoryFuture] = useState([])
  const [isMathDialogOpen, setIsMathDialogOpen] = useState(false)
  const [contextMenuQuery, setContextMenuQuery] = useState('')
  const [lastSelectionSnapshot, setLastSelectionSnapshot] = useState({ text: '', html: '', isEmpty: true, from: null, to: null, blockInsertPosition: null })
  const [editorContextMenu, setEditorContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    actions: [],
    selectionSnapshot: { text: '', html: '', isEmpty: true, from: null, to: null, blockInsertPosition: null },
  })
  const fileInputRef = useRef(null)
  const sketchImageInputRef = useRef(null)
  const sketchCanvasRef = useRef(null)
  const sketchStrokeRef = useRef(null)
  const sketchDragRef = useRef(null)
  const sketchResizeRef = useRef(null)
  const sketchRotateRef = useRef(null)
  const sketchSelectionRef = useRef(null)
  const sketchClipboardRef = useRef(null)
  const sketchOperationSnapshotRef = useRef(null)
  const sketchInsertSelectionRef = useRef(null)
  const sketchInsertBookmarkRef = useRef(null)
  const editorContextMenuRef = useRef(null)
  const tldrawSketchApiRef = useRef(null)
  const mathFieldHostRef = useRef(null)
  const mathFieldRef = useRef(null)
  const mathDraftRef = useRef('\\sin(t)')
  const lastEmittedHtmlRef = useRef(typeof value === 'string' ? value : '')
  const isApplyingExternalHtmlRef = useRef(false)
  const appliedResetKeyRef = useRef(resetKey)
  const pendingExternalHtmlRef = useRef(typeof value === 'string' ? value : '')
  const externalApplyTimeoutRef = useRef(null)
  const editorRef = useRef(null)
  const sketchEngine = sketchDocument.engine === 'excalidraw'
    ? 'excalidraw'
    : (sketchDocument.engine === 'konva'
        ? 'konva'
        : (sketchDocument.engine === 'tldraw' ? 'tldraw' : 'legacy'))
  const isExcalidrawSketch = sketchEngine === 'excalidraw'
  const isTldrawSketch = sketchEngine === 'tldraw'
  const isKonvaSketch = sketchEngine === 'konva'
  const sketchUsesHostedEngine = isExcalidrawSketch || isTldrawSketch || isKonvaSketch
  const selectedSketchItemId = selectedSketchItemIds[selectedSketchItemIds.length - 1] || ''
  const selectedSketchItems = sketchDocument.items.filter((item) => selectedSketchItemIds.includes(item.id))
  const selectedSketchBounds = getCombinedSketchBounds(selectedSketchItems)
  const canResizeSelectedSketch = selectedSketchItems.length > 0 && selectedSketchItems.every(isSketchItemResizable)
  const visibleSelectionFrame = selectedSketchBounds ? getSketchSelectionFrame(selectedSketchBounds, selectedSketchItemIds.length) : null
  const visibleResizeHandle = canResizeSelectedSketch ? getSketchResizeHandle(selectedSketchBounds, selectedSketchItemIds.length) : null
  const visibleRotateHandle = canResizeSelectedSketch ? getSketchRotateHandle(selectedSketchBounds, selectedSketchItemIds.length) : null
  const canLockSelectedSketchItems = selectedSketchItems.length > 0 && selectedSketchItems.every(isLockableSketchItem) && selectedSketchItems.some((item) => !item.locked)
  const hasLockedSketchImages = sketchDocument.items.some((item) => item.tool === 'image' && item.locked)
  const sketchHistoryLimit = 80

  const applySketchSnapshot = useCallback((snapshot) => {
    if (!snapshot) return
    setSketchDocument(cloneSketchDocument(snapshot.document))
    setSelectedSketchItemIds(uniqueIds(snapshot.selectedIds))
    setSketchSelectionOverlay(null)
    sketchStrokeRef.current = null
    sketchDragRef.current = null
    sketchResizeRef.current = null
    sketchRotateRef.current = null
    sketchSelectionRef.current = null
  }, [])

  const pushSketchHistorySnapshot = useCallback((snapshot) => {
    if (!snapshot) return
    setSketchHistoryPast((prev) => [...prev, snapshot].slice(-sketchHistoryLimit))
    setSketchHistoryFuture([])
  }, [])

  const replaceSketchSelection = useCallback((ids, options = {}) => {
    const nextIds = uniqueIds(ids)
    const trackHistory = Boolean(options.trackHistory)
    const currentIds = uniqueIds(selectedSketchItemIds)
    const sameSelection = currentIds.length === nextIds.length && currentIds.every((id, index) => id === nextIds[index])
    if (sameSelection) return
    if (trackHistory) {
      pushSketchHistorySnapshot(buildSketchHistorySnapshot(sketchDocument, currentIds))
    }
    setSelectedSketchItemIds(nextIds)
  }, [pushSketchHistorySnapshot, selectedSketchItemIds, sketchDocument])

  const mutateSketchDocument = useCallback((updater, options = {}) => {
    if (typeof updater !== 'function') return
    const trackHistory = options.trackHistory !== false
    if (trackHistory) {
      pushSketchHistorySnapshot(buildSketchHistorySnapshot(sketchDocument, selectedSketchItemIds))
    }
    setSketchDocument((prev) => updater(prev))
    if (Object.prototype.hasOwnProperty.call(options, 'nextSelectionIds')) {
      setSelectedSketchItemIds(uniqueIds(options.nextSelectionIds))
    }
    setSketchHistoryFuture([])
  }, [pushSketchHistorySnapshot, selectedSketchItemIds, sketchDocument])

  const undoSketchChange = useCallback(() => {
    if (!sketchHistoryPast.length) return
    const previous = sketchHistoryPast[sketchHistoryPast.length - 1]
    const current = buildSketchHistorySnapshot(sketchDocument, selectedSketchItemIds)
    setSketchHistoryPast((prev) => prev.slice(0, -1))
    setSketchHistoryFuture((prev) => [...prev, current].slice(-sketchHistoryLimit))
    applySketchSnapshot(previous)
  }, [applySketchSnapshot, selectedSketchItemIds, sketchDocument, sketchHistoryPast])

  const redoSketchChange = useCallback(() => {
    if (!sketchHistoryFuture.length) return
    const next = sketchHistoryFuture[sketchHistoryFuture.length - 1]
    const current = buildSketchHistorySnapshot(sketchDocument, selectedSketchItemIds)
    setSketchHistoryFuture((prev) => prev.slice(0, -1))
    setSketchHistoryPast((prev) => [...prev, current].slice(-sketchHistoryLimit))
    applySketchSnapshot(next)
  }, [applySketchSnapshot, selectedSketchItemIds, sketchDocument, sketchHistoryFuture])

  const openSketchDialog = useCallback((payload = null) => {
    const currentEditor = editorRef.current
    const isEditingExistingSketch = Boolean(payload?.sketch && Number.isInteger(payload?.nodePos))
    const sourceDocument = payload?.sketch
      ? deserializeSketchDocument(payload.sketch)
      : createEmptySketchDocumentForEditor()
    const nextDocument = convertSketchDocumentForModal(sourceDocument)

    setSketchDialogMode(payload?.sketch ? 'edit' : 'insert')
    setSketchDocument(nextDocument)
    setSketchNodeWidth(Number(payload?.width) > 0 ? Number(payload.width) : 360)
    setSketchTool('pen')
    setSketchColor(SKETCH_COLORS[0])
    setSketchSize(4)
    setEditingSketchNodePos(Number.isInteger(payload?.nodePos) ? payload.nodePos : null)
    setSelectedSketchItemIds([])
    setSketchSelectionOverlay(null)
    setSketchHistoryPast([])
    setSketchHistoryFuture([])
    setIsSketchOpen(true)
    sketchInsertSelectionRef.current = !isEditingExistingSketch && currentEditor
      ? {
          from: currentEditor.state.selection.from,
          to: currentEditor.state.selection.to,
        }
      : null
    sketchInsertBookmarkRef.current = !isEditingExistingSketch && currentEditor?.state?.selection?.getBookmark
      ? currentEditor.state.selection.getBookmark()
      : null
    sketchStrokeRef.current = null
    sketchDragRef.current = null
    sketchResizeRef.current = null
    sketchRotateRef.current = null
    sketchSelectionRef.current = null
    tldrawSketchApiRef.current = null
  }, [])

  const closeSketchDialog = useCallback(() => {
    setIsSketchOpen(false)
    setEditingSketchNodePos(null)
    sketchInsertSelectionRef.current = null
    sketchInsertBookmarkRef.current = null
    tldrawSketchApiRef.current = null
  }, [])

  const handleTldrawApiChange = useCallback((api) => {
    tldrawSketchApiRef.current = api
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Underline,
      ResizableImageNode,
      MathInlineNode,
      EditableSketchNode,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    editable: !readOnly,
    onTransaction: ({ editor, transaction }) => {
      if (!transaction?.docChanged) return
      const nextHtml = editor.getHTML()
      const nextCanonicalHtml = canonicalizeEditorHtml(nextHtml)
      if (isApplyingExternalHtmlRef.current) {
        lastEmittedHtmlRef.current = nextHtml
        return
      }
      if (
        pendingExternalHtmlRef.current
        && nextCanonicalHtml === canonicalizeEditorHtml(pendingExternalHtmlRef.current)
      ) {
        lastEmittedHtmlRef.current = nextHtml
        return
      }
      pendingExternalHtmlRef.current = ''
      if (readOnly || typeof onChange !== 'function') return
      lastEmittedHtmlRef.current = nextHtml
      onChange(nextHtml)
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => () => {
    if (externalApplyTimeoutRef.current) {
      window.clearTimeout(externalApplyTimeoutRef.current)
      externalApplyTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const nextValue = typeof value === 'string' ? value : ''
    const currentCanonical = canonicalizeEditorHtml(current)
    const nextCanonical = canonicalizeEditorHtml(nextValue)
    const lastEmittedCanonical = canonicalizeEditorHtml(lastEmittedHtmlRef.current)
    const didResetChange = appliedResetKeyRef.current !== resetKey
    appliedResetKeyRef.current = resetKey
    if (currentCanonical === nextCanonical) {
      lastEmittedHtmlRef.current = current
      pendingExternalHtmlRef.current = current
      if (typeof onExternalContentApplied === 'function') {
        onExternalContentApplied(current)
      }
      return
    }
    if (!didResetChange && nextCanonical === lastEmittedCanonical) return
    if (!didResetChange && editor.isFocused) {
      lastEmittedHtmlRef.current = current
      pendingExternalHtmlRef.current = current
      if (typeof onExternalContentApplied === 'function') {
        onExternalContentApplied(current)
      }
      return
    }

    isApplyingExternalHtmlRef.current = true
    pendingExternalHtmlRef.current = nextValue
    editor.commands.setContent(nextValue, false)
    lastEmittedHtmlRef.current = nextValue
    if (externalApplyTimeoutRef.current) {
      window.clearTimeout(externalApplyTimeoutRef.current)
    }
    externalApplyTimeoutRef.current = window.setTimeout(() => {
      const settledHtml = editor.getHTML()
      lastEmittedHtmlRef.current = settledHtml
      pendingExternalHtmlRef.current = settledHtml
      isApplyingExternalHtmlRef.current = false
      externalApplyTimeoutRef.current = null
      if (typeof onExternalContentApplied === 'function') {
        onExternalContentApplied(settledHtml)
      }
    }, 120)
  }, [value, editor, onExternalContentApplied, resetKey])

  useEffect(() => {
    if (!editor) return undefined

    const refreshToolbarState = () => {
      if (isSketchOpen || isMathDialogOpen) return
      setEditorUiVersion((version) => version + 1)
    }

    editor.on('selectionUpdate', refreshToolbarState)
    editor.on('transaction', refreshToolbarState)
    editor.on('focus', refreshToolbarState)
    editor.on('blur', refreshToolbarState)

    return () => {
      editor.off('selectionUpdate', refreshToolbarState)
      editor.off('transaction', refreshToolbarState)
      editor.off('focus', refreshToolbarState)
      editor.off('blur', refreshToolbarState)
    }
  }, [editor, isMathDialogOpen, isSketchOpen])

  useEffect(() => {
    if (!isSketchOpen) return
    const canvas = sketchCanvasRef.current
    if (!canvas) return
    canvas.width = SKETCH_WIDTH
    canvas.height = SKETCH_HEIGHT
    drawSketchDocumentToCanvas(canvas, sketchDocument)

    const ctx = canvas.getContext('2d')
    if (ctx) {
      sketchDocument.items.forEach((item) => {
        if (item.tool !== 'image' || !item.locked) return
        const bounds = getSketchItemBounds(item)
        if (!bounds) return
        ctx.save()
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)'
        ctx.lineWidth = 2
        ctx.setLineDash([12, 8])
        ctx.strokeRect(bounds.left - 4, bounds.top - 4, (bounds.right - bounds.left) + 8, (bounds.bottom - bounds.top) + 8)
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(245, 158, 11, 0.92)'
        ctx.fillRect(bounds.left + 8, bounds.top + 8, 76, 24)
        ctx.fillStyle = '#111827'
        ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Courier New, monospace'
        ctx.textBaseline = 'middle'
        ctx.fillText('LOCKED', bounds.left + 18, bounds.top + 20)
        ctx.restore()
      })
    }

    if (ctx && selectedSketchItemIds.length) {
      selectedSketchItems.forEach((item) => {
        const itemBounds = getSketchItemBounds(item)
        if (!itemBounds) return
        ctx.save()
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.7)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 4])
        ctx.strokeRect(
          itemBounds.left - 5,
          itemBounds.top - 5,
          (itemBounds.right - itemBounds.left) + 10,
          (itemBounds.bottom - itemBounds.top) + 10,
        )
        ctx.restore()
      })

      ctx.save()
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])

      if (selectedSketchBounds) {
        const frame = getSketchSelectionFrame(selectedSketchBounds, selectedSketchItemIds.length)
        if (frame) {
          ctx.strokeRect(
            frame.left,
            frame.top,
            frame.right - frame.left,
            frame.bottom - frame.top,
          )
        }
        ctx.setLineDash([])
      }

      ctx.restore()
    }

    if (ctx && sketchSelectionOverlay) {
      ctx.save()
      ctx.strokeStyle = '#1d4ed8'
      ctx.fillStyle = 'rgba(37, 99, 235, 0.12)'
      ctx.lineWidth = 2
      if (sketchSelectionOverlay.type === 'box') {
        const left = Math.min(sketchSelectionOverlay.x1, sketchSelectionOverlay.x2)
        const top = Math.min(sketchSelectionOverlay.y1, sketchSelectionOverlay.y2)
        const width = Math.abs(sketchSelectionOverlay.x2 - sketchSelectionOverlay.x1)
        const height = Math.abs(sketchSelectionOverlay.y2 - sketchSelectionOverlay.y1)
        ctx.setLineDash([10, 6])
        ctx.fillRect(left, top, width, height)
        ctx.strokeRect(left, top, width, height)
      }
      if (sketchSelectionOverlay.type === 'lasso' && sketchSelectionOverlay.points.length > 1) {
        ctx.setLineDash([10, 6])
        ctx.beginPath()
        ctx.moveTo(sketchSelectionOverlay.points[0].x, sketchSelectionOverlay.points[0].y)
        sketchSelectionOverlay.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y))
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
  }, [canResizeSelectedSketch, isSketchOpen, selectedSketchBounds, selectedSketchItemIds, sketchDocument, sketchSelectionOverlay])

  const insertMath = useCallback((latex) => {
    if (!editor) return
    editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex } }).run()
  }, [editor])

  useEffect(() => {
    const host = mathFieldHostRef.current
    if (!isMathDialogOpen || !host) return

    const mathField = new MathfieldElement()
    mathFieldRef.current = mathField
    mathField.mathVirtualKeyboardPolicy = 'manual'
    mathField.smartFence = true
    mathField.smartSuperscript = true
    mathField.style.width = '100%'
    mathField.style.fontSize = '22px'
    mathField.value = mathDraftRef.current || '\\sin(t)'

    const handleInput = () => {
      mathDraftRef.current = readLatexSafely(mathField, mathDraftRef.current)
    }

    mathField.addEventListener('input', handleInput)
    host.appendChild(mathField)

    window.setTimeout(() => {
      try {
        mathField.focus()
        mathField.executeCommand('showVirtualKeyboard')
      } catch {
        // noop
      }
    }, 0)

    return () => {
      hideVirtualKeyboardSafely(mathField)
      try {
        mathField.removeEventListener('input', handleInput)
      } catch {
        // noop
      }
      try {
        host.removeChild(mathField)
      } catch {
        // noop
      }
      mathFieldRef.current = null
    }
  }, [isMathDialogOpen])

  const closeMathDialog = useCallback(() => {
    hideVirtualKeyboardSafely(mathFieldRef.current)
    setIsMathDialogOpen(false)
  }, [])

  const saveMathDialog = useCallback(() => {
    const nextLatex = readLatexSafely(mathFieldRef.current, mathDraftRef.current || '\\sin(t)')
    if (!nextLatex) return
    mathDraftRef.current = nextLatex
    insertMath(nextLatex)
    closeMathDialog()
  }, [closeMathDialog, insertMath])

  useEffect(() => {
    if (!isMathDialogOpen) return

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMathDialog()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMathDialogOpen, closeMathDialog])

  const insertImageByUrl = (rawUrl) => {
    if (!editor) return
    const url = String(rawUrl || '').trim()
    if (!url) return
    editor.chain().focus().setImage({ src: url }).run()
    setImageUrlInput('')
  }

  const getSelectedSketchSelection = useCallback(() => {
    const selectedNode = editor?.state?.selection?.node
    if (!selectedNode || selectedNode.type?.name !== 'editableSketch') return null
    return {
      node: selectedNode,
      pos: editor.state.selection.from,
    }
  }, [editor])

  const setSketchSelectionIds = useCallback((ids) => {
    setSelectedSketchItemIds(uniqueIds(ids))
  }, [])

  const toggleSketchSelectionId = useCallback((itemId) => {
    setSelectedSketchItemIds((prev) => (
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    ))
  }, [])

  const editSelectedSketchText = useCallback(() => {
    if (!selectedSketchItemId) return

    mutateSketchDocument((prev) => {
      const selectedItem = prev.items.find((item) => item.id === selectedSketchItemId)
      if (!selectedItem || selectedItem.tool !== 'text') return prev

      const nextText = window.prompt('Edit sketch text:', selectedItem.text || '')
      if (nextText === null) return prev

      const trimmed = String(nextText).trim()
      if (!trimmed) {
        return {
          ...prev,
          items: prev.items.filter((item) => item.id !== selectedSketchItemId),
        }
      }

      return {
        ...prev,
        items: prev.items.map((item) => (
          item.id === selectedSketchItemId
            ? {
                ...item,
                text: trimmed,
                width: Math.max(80, trimmed.length * Math.max(10, (item.fontSize || 24) * 0.55)),
                height: Math.max(24, item.fontSize || 24),
              }
            : item
        )),
      }
    }, { nextSelectionIds: selectedSketchItemId ? [selectedSketchItemId] : [] })
  }, [mutateSketchDocument, selectedSketchItemId])

  const cloneSketchItemForClipboard = useCallback((item, offset = 0) => {
    if (!item) return null
    const clone = JSON.parse(JSON.stringify(item))
    clone.id = `sketch-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    if (clone.tool === 'pen' || clone.tool === 'eraser') {
      clone.points = clone.points.map((point) => ({
        x: point.x + offset,
        y: point.y + offset,
      }))
      return clone
    }

    if (clone.tool === 'text') {
      clone.x += offset
      clone.y += offset
      return clone
    }

    if (clone.tool === 'image') {
      clone.x += offset
      clone.y += offset
      return clone
    }

    clone.x1 += offset
    clone.y1 += offset
    clone.x2 += offset
    clone.y2 += offset
    return clone
  }, [])

  const cloneSketchItemsForClipboard = useCallback((items, offset = 0) => (
    (Array.isArray(items) ? items : [])
      .map((item) => cloneSketchItemForClipboard(item, offset))
      .filter(Boolean)
  ), [cloneSketchItemForClipboard])

  const updateSelectedSketchItems = useCallback((mapper) => {
    if (typeof mapper !== 'function' || !selectedSketchItemIds.length) return
    mutateSketchDocument((prev) => ({
      ...prev,
      items: prev.items.map((item) => (
        selectedSketchItemIds.includes(item.id) ? mapper(item) : item
      )),
    }), { nextSelectionIds: selectedSketchItemIds })
  }, [mutateSketchDocument, selectedSketchItemIds])

  const lockSelectedSketchItems = useCallback(() => {
    updateSelectedSketchItems((item) => (
      isLockableSketchItem(item) ? { ...item, locked: true } : item
    ))
    replaceSketchSelection([], { trackHistory: true })
  }, [replaceSketchSelection, updateSelectedSketchItems])

  const unlockAllSketchImages = useCallback(() => {
    mutateSketchDocument((prev) => ({
      ...prev,
      items: prev.items.map((item) => (
        item.tool === 'image' && item.locked ? { ...item, locked: false } : item
      )),
    }))
  }, [mutateSketchDocument])

  const moveSelectedSketchItemsInLayer = useCallback((direction) => {
    if (!selectedSketchItemIds.length) return

    mutateSketchDocument((prev) => {
      const items = [...prev.items]
      const selectedIds = new Set(selectedSketchItemIds)

      if (direction === 'front') {
        const selectedItems = items.filter((item) => selectedIds.has(item.id))
        const otherItems = items.filter((item) => !selectedIds.has(item.id))
        return {
          ...prev,
          items: [...otherItems, ...selectedItems],
        }
      }

      if (direction === 'back') {
        const selectedItems = items.filter((item) => selectedIds.has(item.id))
        const otherItems = items.filter((item) => !selectedIds.has(item.id))
        return {
          ...prev,
          items: [...selectedItems, ...otherItems],
        }
      }

      if (direction === 'forward') {
        for (let index = items.length - 2; index >= 0; index -= 1) {
          if (selectedIds.has(items[index].id) && !selectedIds.has(items[index + 1].id)) {
            const temp = items[index]
            items[index] = items[index + 1]
            items[index + 1] = temp
          }
        }
        return {
          ...prev,
          items,
        }
      }

      if (direction === 'backward') {
        for (let index = 1; index < items.length; index += 1) {
          if (selectedIds.has(items[index].id) && !selectedIds.has(items[index - 1].id)) {
            const temp = items[index]
            items[index] = items[index - 1]
            items[index - 1] = temp
          }
        }
        return {
          ...prev,
          items,
        }
      }

      return prev
    }, { nextSelectionIds: selectedSketchItemIds })
  }, [mutateSketchDocument, selectedSketchItemIds])

  const saveSketchNode = useCallback(async () => {
    if (!editor) return

    let nextDocument = sketchDocument
    if (sketchUsesHostedEngine) {
      if (!tldrawSketchApiRef.current?.exportDocument) return
      nextDocument = await tldrawSketchApiRef.current.exportDocument()
    } else if (!sketchDocument.items.length) {
      return
    }

    const attrs = {
      sketch: serializeSketchDocument(nextDocument),
      width: sketchNodeWidth,
      align: 'center',
    }

    if (sketchDialogMode === 'edit' && Number.isInteger(editingSketchNodePos)) {
      editor.commands.command(({ tr, state, dispatch }) => {
        const targetNode = state.doc.nodeAt(editingSketchNodePos)
        if (!targetNode || targetNode.type?.name !== 'editableSketch') return false
        dispatch(tr.setNodeMarkup(editingSketchNodePos, undefined, { ...targetNode.attrs, ...attrs }))
        return true
      })
    } else {
      const insertBookmark = sketchInsertBookmarkRef.current
      const resolvedBookmark = insertBookmark?.resolve?.(editor.state.doc)
      const insertSelection = resolvedBookmark && Number.isInteger(resolvedBookmark.from) && Number.isInteger(resolvedBookmark.to)
        ? {
            from: resolvedBookmark.from,
            to: resolvedBookmark.to,
          }
        : sketchInsertSelectionRef.current

      if (insertSelection && Number.isInteger(insertSelection.from) && Number.isInteger(insertSelection.to)) {
        editor.chain().focus().insertContentAt(
          { from: insertSelection.from, to: insertSelection.to },
          { type: 'editableSketch', attrs },
        ).run()
      } else {
        editor.chain().focus().insertContent({ type: 'editableSketch', attrs }).run()
      }
    }

    setIsSketchOpen(false)
    setSketchDocument(createEmptySketchDocument())
    setEditingSketchNodePos(null)
    setSelectedSketchItemIds([])
    setSketchHistoryPast([])
    setSketchHistoryFuture([])
    sketchStrokeRef.current = null
    sketchDragRef.current = null
    sketchResizeRef.current = null
    sketchRotateRef.current = null
    sketchSelectionRef.current = null
    sketchOperationSnapshotRef.current = null
    sketchInsertSelectionRef.current = null
    sketchInsertBookmarkRef.current = null
    tldrawSketchApiRef.current = null
    setSketchSelectionOverlay(null)
  }, [editingSketchNodePos, editor, sketchDialogMode, sketchDocument, sketchNodeWidth, sketchUsesHostedEngine])

  const deleteCurrentSketchNode = useCallback(() => {
    if (!editor || !Number.isInteger(editingSketchNodePos)) return

    editor.commands.command(({ tr, state, dispatch }) => {
      const targetNode = state.doc.nodeAt(editingSketchNodePos)
      if (!targetNode || targetNode.type?.name !== 'editableSketch') return false
      dispatch(tr.delete(editingSketchNodePos, editingSketchNodePos + targetNode.nodeSize))
      return true
    })

    setIsSketchOpen(false)
    setSketchDocument(createEmptySketchDocument())
    setEditingSketchNodePos(null)
    setSelectedSketchItemIds([])
    setSketchHistoryPast([])
    setSketchHistoryFuture([])
    setSketchSelectionOverlay(null)
    sketchInsertSelectionRef.current = null
    sketchInsertBookmarkRef.current = null
    tldrawSketchApiRef.current = null
  }, [editingSketchNodePos, editor])

  const duplicateSelectedSketch = () => {
    if (!editor) return
    const selectedSketch = getSelectedSketchSelection()
    if (!selectedSketch) return

    editor.chain().focus().insertContent({
      type: 'editableSketch',
      attrs: {
        sketch: selectedSketch.node.attrs.sketch,
        width: selectedSketch.node.attrs.width || 360,
        align: selectedSketch.node.attrs.align || 'center',
      },
    }).run()
  }

  const deleteSelectedSketch = useCallback(() => {
    if (!editor) return false
    const selectedSketch = getSelectedSketchSelection()
    if (!selectedSketch) return false

    return editor.commands.command(({ tr, dispatch }) => {
      dispatch(tr.delete(selectedSketch.pos, selectedSketch.pos + selectedSketch.node.nodeSize))
      return true
    })
  }, [editor, getSelectedSketchSelection])

  const insertTable = () => {
    if (!editor) return

    const rows = toPositiveInt(window.prompt('Table rows:', '2'), 2)
    const cols = toPositiveInt(window.prompt('Table columns:', '2'), 2)

    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run()
  }

  const insertColumnLayout = (cols = 2) => {
    if (!editor) return

    editor
      .chain()
      .focus()
      .insertTable({ rows: 1, cols: toPositiveInt(cols, 2), withHeaderRow: false })
      .run()
  }

  const onPickImageFile = async (e) => {
    if (!editor) return
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result || '')
      if (!src) return
      editor.chain().focus().setImage({ src }).run()
    }
    reader.readAsDataURL(file)
  }

  const onPickSketchImageFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result || '')
      if (!src) return

      const image = new Image()
      image.onload = () => {
        const fitted = fitSizeWithinBounds(image.naturalWidth || 320, image.naturalHeight || 240, 720, 320)
        const nextItem = {
          id: `sketch-item-${Date.now()}`,
          tool: 'image',
          color: '#111827',
          size: 1,
          src,
          x: Math.round((SKETCH_WIDTH - fitted.width) / 2),
          y: Math.round((SKETCH_HEIGHT - fitted.height) / 2),
          width: fitted.width,
          height: fitted.height,
        }

        setSketchDocument((prev) => ({
          ...prev,
          items: [nextItem, ...prev.items],
        }))
        pushSketchHistorySnapshot(buildSketchHistorySnapshot(sketchDocument, selectedSketchItemIds))
        setSketchSelectionIds([nextItem.id])
        setSketchTool('select')
      }
      image.src = src
    }
    reader.readAsDataURL(file)
  }

  const beginOverlaySketchResize = (event) => {
    const canvas = sketchCanvasRef.current
    if (!canvas || !selectedSketchBounds || !selectedSketchItemIds.length) return
    event.preventDefault()
    event.stopPropagation()
    const firstPoint = buildPoint(event, canvas)
    sketchOperationSnapshotRef.current = buildSketchHistorySnapshot(sketchDocument, selectedSketchItemIds)
    sketchResizeRef.current = {
      itemIds: selectedSketchItemIds,
      sourceBounds: selectedSketchBounds,
      startPoint: firstPoint,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // noop
    }
  }

  const beginOverlaySketchRotate = (event) => {
    const canvas = sketchCanvasRef.current
    if (!canvas || !selectedSketchBounds || !selectedSketchItemIds.length) return
    event.preventDefault()
    event.stopPropagation()
    const firstPoint = buildPoint(event, canvas)
    const centerX = (selectedSketchBounds.left + selectedSketchBounds.right) / 2
    const centerY = (selectedSketchBounds.top + selectedSketchBounds.bottom) / 2
    sketchOperationSnapshotRef.current = buildSketchHistorySnapshot(sketchDocument, selectedSketchItemIds)
    sketchRotateRef.current = {
      itemIds: selectedSketchItemIds,
      sourceBounds: selectedSketchBounds,
      centerX,
      centerY,
      startAngle: Math.atan2(firstPoint.y - centerY, firstPoint.x - centerX),
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // noop
    }
  }

  const handleOverlaySketchTransformMove = (event) => {
    if (!sketchResizeRef.current && !sketchRotateRef.current) return
    event.preventDefault()
    event.stopPropagation()
    extendSketchStroke(event)
  }

  const handleOverlaySketchTransformEnd = (event) => {
    if (!sketchResizeRef.current && !sketchRotateRef.current) return
    event.preventDefault()
    event.stopPropagation()
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // noop
    }
    endSketchStroke()
  }

  const startSketchStroke = (event) => {
    const canvas = sketchCanvasRef.current
    if (!canvas) return
    const firstPoint = buildPoint(event, canvas)
    sketchOperationSnapshotRef.current = buildSketchHistorySnapshot(sketchDocument, selectedSketchItemIds)

    if (sketchTool === 'select') {
      const selectedItem = selectedSketchItemIds.length === 1
        ? sketchDocument.items.find((item) => item.id === selectedSketchItemId)
        : null
      const selectedBounds = selectedSketchItemIds.length > 1
        ? selectedSketchBounds
        : getSketchItemBounds(selectedItem)
      if (selectedBounds && canResizeSelectedSketch) {
        const rotateHandle = getSketchRotateHandle(selectedBounds, selectedSketchItemIds.length)
        const handle = getSketchResizeHandle(selectedBounds, selectedSketchItemIds.length)
        if (
          rotateHandle
          && firstPoint.x >= rotateHandle.left
          && firstPoint.x <= rotateHandle.left + rotateHandle.size
          && firstPoint.y >= rotateHandle.top
          && firstPoint.y <= rotateHandle.top + rotateHandle.size
        ) {
          sketchRotateRef.current = {
            itemIds: selectedSketchItemIds,
            sourceBounds: selectedBounds,
            centerX: (selectedBounds.left + selectedBounds.right) / 2,
            centerY: (selectedBounds.top + selectedBounds.bottom) / 2,
            startAngle: Math.atan2(firstPoint.y - ((selectedBounds.top + selectedBounds.bottom) / 2), firstPoint.x - ((selectedBounds.left + selectedBounds.right) / 2)),
          }
          return
        }
        if (
          handle
          && firstPoint.x >= handle.left
          && firstPoint.x <= handle.left + handle.size
          && firstPoint.y >= handle.top
          && firstPoint.y <= handle.top + handle.size
        ) {
          sketchResizeRef.current = {
            itemIds: selectedSketchItemIds,
            itemId: selectedItem?.id || null,
            sourceBounds: selectedBounds,
            startPoint: firstPoint,
          }
          return
        }
      }

      const hit = findTopSketchItemAtPoint(sketchDocument, firstPoint)
      if (!hit && selectedSketchBounds && boundsContainPoint(selectedSketchBounds, firstPoint, 12)) {
        sketchDragRef.current = {
          itemIds: selectedSketchItemIds,
          lastPoint: firstPoint,
        }
        return
      }

      if (!hit) {
        sketchSelectionRef.current = {
          type: 'box',
          x1: firstPoint.x,
          y1: firstPoint.y,
          x2: firstPoint.x,
          y2: firstPoint.y,
          additive: event.shiftKey,
          moved: false,
          sourceTool: 'select',
        }
        setSketchSelectionOverlay(sketchSelectionRef.current)
        sketchDragRef.current = null
        return
      }

      if (event.shiftKey) {
        replaceSketchSelection(
          selectedSketchItemIds.includes(hit.item.id)
            ? selectedSketchItemIds.filter((id) => id !== hit.item.id)
            : [...selectedSketchItemIds, hit.item.id],
          { trackHistory: true }
        )
        sketchDragRef.current = null
        sketchOperationSnapshotRef.current = null
        return
      }

      const nextSelectionIds = selectedSketchItemIds.includes(hit.item.id) ? selectedSketchItemIds : [hit.item.id]
      replaceSketchSelection(nextSelectionIds, { trackHistory: true })
      sketchDragRef.current = {
        itemIds: nextSelectionIds,
        lastPoint: firstPoint,
      }
      return
    }

    if (sketchTool === 'lasso') {
      sketchSelectionRef.current = {
        type: 'lasso',
        points: [firstPoint],
        additive: event.shiftKey,
        moved: false,
      }
      setSketchSelectionOverlay(sketchSelectionRef.current)
      return
    }

    if (sketchTool === 'text') {
      const text = window.prompt('Text for sketch:', '')
      if (!String(text || '').trim()) return
      const nextItem = {
        id: `sketch-item-${Date.now()}`,
        tool: 'text',
        color: sketchColor,
        size: sketchSize,
        x: firstPoint.x,
        y: firstPoint.y,
        text: String(text).trim(),
        fontSize: Math.max(16, sketchSize * 6),
        width: Math.max(80, String(text).trim().length * 12),
        height: Math.max(24, sketchSize * 6),
      }
      mutateSketchDocument((prev) => ({
        ...prev,
        items: [...prev.items, nextItem],
      }), { nextSelectionIds: [nextItem.id] })
      sketchOperationSnapshotRef.current = null
      return
    }

    const nextStroke = {
      id: `sketch-item-${Date.now()}`,
      tool: sketchTool,
      color: sketchColor,
      size: sketchSize,
      ...(sketchTool === 'pen' || sketchTool === 'eraser'
        ? { points: [firstPoint] }
        : {
            x1: firstPoint.x,
            y1: firstPoint.y,
            x2: firstPoint.x,
            y2: firstPoint.y,
            fill: 'none',
          }),
    }

    sketchStrokeRef.current = nextStroke
    setSelectedSketchItemIds([nextStroke.id])
    setSketchDocument((prev) => ({
      ...prev,
      items: [...prev.items, nextStroke],
    }))
  }

  const extendSketchStroke = (event) => {
    const canvas = sketchCanvasRef.current
    const activeStroke = sketchStrokeRef.current
    if (!canvas) return

    const point = buildPoint(event, canvas)

    if (sketchTool === 'select') {
      const selectionState = sketchSelectionRef.current
      if (selectionState?.type === 'box') {
        const nextOverlay = {
          ...selectionState,
          x2: point.x,
          y2: point.y,
          moved: selectionState.moved || Math.abs(point.x - selectionState.x1) > 3 || Math.abs(point.y - selectionState.y1) > 3,
        }
        sketchSelectionRef.current = nextOverlay
        setSketchSelectionOverlay(nextOverlay)
        return
      }

      const resizeState = sketchResizeRef.current
      const rotateState = sketchRotateRef.current
      if (rotateState?.itemIds?.length) {
        const nextAngle = Math.atan2(point.y - rotateState.centerY, point.x - rotateState.centerX)
        const angleDelta = nextAngle - rotateState.startAngle
        if (!angleDelta) return
        sketchRotateRef.current = {
          ...rotateState,
          startAngle: nextAngle,
        }
        setSketchDocument((prev) => ({
          ...prev,
          items: prev.items.map((item) => (
            rotateState.itemIds.includes(item.id)
              ? rotateSketchItem(item, angleDelta, { x: rotateState.centerX, y: rotateState.centerY })
              : item
          )),
        }))
        return
      }
      if (resizeState?.itemIds?.length) {
        const sourceBounds = resizeState.sourceBounds
        const deltaX = point.x - resizeState.startPoint.x
        const deltaY = point.y - resizeState.startPoint.y
        const targetBounds = buildUniformResizeBoundsFromDelta(sourceBounds, deltaX, deltaY, 24)
        setSketchDocument((prev) => ({
          ...prev,
          items: prev.items.map((item) => (
            resizeState.itemIds.includes(item.id)
              ? scaleSketchItem(item, sourceBounds, targetBounds)
              : item
          )),
        }))
        return
      }

      const activeDrag = sketchDragRef.current
      if (!activeDrag?.itemIds?.length) return
      const deltaX = point.x - activeDrag.lastPoint.x
      const deltaY = point.y - activeDrag.lastPoint.y
      if (!deltaX && !deltaY) return

      sketchDragRef.current = {
        ...activeDrag,
        lastPoint: point,
      }
      setSketchDocument((prev) => ({
        ...prev,
        items: prev.items.map((item) => (
          activeDrag.itemIds.includes(item.id)
            ? moveSketchItem(item, deltaX, deltaY)
            : item
        )),
      }))
      return
    }

    {
      const selectionState = sketchSelectionRef.current
      if (selectionState?.type === 'box' || selectionState?.type === 'lasso') {
        if (selectionState.type === 'box') {
          const nextOverlay = {
            ...selectionState,
            x2: point.x,
            y2: point.y,
            moved: selectionState.moved || Math.abs(point.x - selectionState.x1) > 3 || Math.abs(point.y - selectionState.y1) > 3,
          }
          sketchSelectionRef.current = nextOverlay
          setSketchSelectionOverlay(nextOverlay)
        }
        if (selectionState.type === 'lasso') {
          const lastPoint = selectionState.points[selectionState.points.length - 1]
          if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= 4) {
            const nextOverlay = {
              ...selectionState,
              points: [...selectionState.points, point],
              moved: true,
            }
            sketchSelectionRef.current = nextOverlay
            setSketchSelectionOverlay(nextOverlay)
          }
        }
        return
      }
    }

    if (!activeStroke) return

    const nextStroke = {
      ...activeStroke,
      ...(activeStroke.tool === 'pen' || activeStroke.tool === 'eraser'
        ? { points: [...activeStroke.points, point] }
        : {
            x2: point.x,
            y2: point.y,
          }),
    }

    sketchStrokeRef.current = nextStroke
    setSketchDocument((prev) => ({
      ...prev,
      items: [...prev.items.slice(0, -1), nextStroke],
    }))
  }

  const endSketchStroke = () => {
    const selectionState = sketchSelectionRef.current
    if (selectionState?.type === 'box') {
      if (selectionState.sourceTool === 'select' && !selectionState.moved) {
        replaceSketchSelection([], { trackHistory: true })
      } else {
        const matchedIds = findSketchItemsInRect(sketchDocument, selectionState).map((item) => item.id)
        replaceSketchSelection(selectionState.additive ? [...selectedSketchItemIds, ...matchedIds] : matchedIds, { trackHistory: true })
      }
      setSketchTool('select')
    }
    if (selectionState?.type === 'lasso') {
      const matchedIds = findSketchItemsInLasso(sketchDocument, selectionState.points).map((item) => item.id)
      replaceSketchSelection(selectionState.additive ? [...selectedSketchItemIds, ...matchedIds] : matchedIds, { trackHistory: true })
      setSketchTool('select')
    }

    const operationSnapshot = sketchOperationSnapshotRef.current
    if (!selectionState?.type && operationSnapshot) {
      const nextSnapshot = buildSketchHistorySnapshot(sketchDocument, selectedSketchItemIds)
      if (JSON.stringify(operationSnapshot) !== JSON.stringify(nextSnapshot)) {
        pushSketchHistorySnapshot(operationSnapshot)
      }
    }

    sketchStrokeRef.current = null
    sketchDragRef.current = null
    sketchResizeRef.current = null
    sketchSelectionRef.current = null
    sketchOperationSnapshotRef.current = null
    setSketchSelectionOverlay(null)
  }

  const handleSketchCanvasDoubleClick = (event) => {
    const canvas = sketchCanvasRef.current
    if (!canvas) return
    const point = buildPoint(event, canvas)
    const hit = findTopSketchItemAtPoint(sketchDocument, point)
    if (!hit) return

    replaceSketchSelection([hit.item.id], { trackHistory: true })
    if (hit.item.tool !== 'text') return

    window.setTimeout(() => {
      mutateSketchDocument((prev) => {
        const targetItem = prev.items.find((item) => item.id === hit.item.id)
        if (!targetItem || targetItem.tool !== 'text') return prev

        const nextText = window.prompt('Edit sketch text:', targetItem.text || '')
        if (nextText === null) return prev

        const trimmed = String(nextText).trim()
        if (!trimmed) {
          return {
            ...prev,
            items: prev.items.filter((item) => item.id !== hit.item.id),
          }
        }

        return {
          ...prev,
          items: prev.items.map((item) => (
            item.id === hit.item.id
              ? {
                  ...item,
                  text: trimmed,
                  width: Math.max(80, trimmed.length * Math.max(10, (item.fontSize || 24) * 0.55)),
                  height: Math.max(24, item.fontSize || 24),
                }
            : item
          )),
        }
      }, { nextSelectionIds: [hit.item.id] })
    }, 0)
  }

  useEffect(() => {
    if (!isSketchOpen) return undefined

    const handleSketchShortcuts = async (event) => {
      if (sketchUsesHostedEngine) return
      if (isMathDialogOpen) return

      const key = String(event.key || '').toLowerCase()

      if ((key === 'delete' || key === 'backspace') && selectedSketchItemIds.length) {
        const activeElement = typeof document !== 'undefined' ? document.activeElement : null
        const tagName = String(activeElement?.tagName || '').toLowerCase()
        const isTypingTarget = activeElement?.isContentEditable || tagName === 'input' || tagName === 'textarea'
        if (isTypingTarget) return

        event.preventDefault()
        mutateSketchDocument((prev) => ({
          ...prev,
          items: prev.items.filter((item) => !selectedSketchItemIds.includes(item.id)),
        }), { nextSelectionIds: [] })
        return
      }

      if (!(event.ctrlKey || event.metaKey)) return

      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redoSketchChange()
        } else {
          undoSketchChange()
        }
        return
      }

      if (key === 'y') {
        event.preventDefault()
        redoSketchChange()
        return
      }

      if (key === 'c') {
        const selectedItems = sketchDocument.items.filter((item) => selectedSketchItemIds.includes(item.id))
        if (!selectedItems.length) return
        event.preventDefault()
        const payload = JSON.stringify({ kind: 'sketch-items', items: selectedItems })
        sketchClipboardRef.current = payload
        try {
          await navigator.clipboard.writeText(payload)
        } catch {
          // noop
        }
        return
      }

      if (key === 'x') {
        const selectedItems = sketchDocument.items.filter((item) => selectedSketchItemIds.includes(item.id))
        if (!selectedItems.length) return
        event.preventDefault()
        const payload = JSON.stringify({ kind: 'sketch-items', items: selectedItems })
        sketchClipboardRef.current = payload
        try {
          await navigator.clipboard.writeText(payload)
        } catch {
          // noop
        }
        setSketchDocument((prev) => ({
          ...prev,
          items: prev.items.filter((item) => !selectedSketchItemIds.includes(item.id)),
        }), { nextSelectionIds: [] })
        return
      }

      if (key === 'v') {
        event.preventDefault()
        let payload = sketchClipboardRef.current
        if (!payload) {
          try {
            payload = await navigator.clipboard.readText()
          } catch {
            payload = ''
          }
        }
        if (!payload) return

        try {
          const parsed = JSON.parse(payload)
          const sourceItems = Array.isArray(parsed?.items) ? parsed.items : [parsed]
          const clonedItems = cloneSketchItemsForClipboard(sourceItems, 24)
          if (!clonedItems.length) return
          mutateSketchDocument((prev) => ({
            ...prev,
            items: [...prev.items, ...clonedItems],
          }), { nextSelectionIds: clonedItems.map((item) => item.id) })
        } catch {
          // noop
        }
      }
    }

    window.addEventListener('keydown', handleSketchShortcuts)
    return () => window.removeEventListener('keydown', handleSketchShortcuts)
  }, [cloneSketchItemsForClipboard, isMathDialogOpen, isSketchOpen, mutateSketchDocument, redoSketchChange, selectedSketchItemIds, sketchDocument.items, sketchUsesHostedEngine, undoSketchChange])

  useEffect(() => {
    if (!editor || isSketchOpen || isMathDialogOpen) return undefined

    const handleEditorSketchDelete = (event) => {
      if (event.defaultPrevented) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return

      const activeElement = typeof document !== 'undefined' ? document.activeElement : null
      const activeTag = String(activeElement?.tagName || '').toLowerCase()
      const isTypingSurface = activeElement?.isContentEditable || activeTag === 'input' || activeTag === 'textarea'
      if (isTypingSurface && activeElement !== editor.view.dom) return

      if (!getSelectedSketchSelection()) return

      event.preventDefault()
      deleteSelectedSketch()
    }

    window.addEventListener('keydown', handleEditorSketchDelete)
    return () => window.removeEventListener('keydown', handleEditorSketchDelete)
  }, [deleteSelectedSketch, editor, getSelectedSketchSelection, isMathDialogOpen, isSketchOpen])

  const hasSelection = Boolean(editor && !editor.state.selection.empty)
  const selectedSketch = getSelectedSketchSelection()
  void editorUiVersion

  const toggleInlineMark = (mark) => {
    if (!editor || !hasSelection) return

    if (mark === 'bold') editor.chain().focus().toggleBold().run()
    if (mark === 'italic') editor.chain().focus().toggleItalic().run()
    if (mark === 'underline') editor.chain().focus().toggleUnderline().run()
  }

  const toggleList = (type) => {
    if (!editor) return
    if (type === 'bullet') editor.chain().focus().toggleBulletList().run()
    if (type === 'ordered') editor.chain().focus().toggleOrderedList().run()
  }

  const getSelectionSnapshot = useCallback(() => {
    if (!editor) {
      return {
        text: '',
        html: '',
        isEmpty: true,
        from: null,
        to: null,
        blockInsertPosition: null,
      }
    }

    const { from, to, empty, $to } = editor.state.selection
    let blockInsertPosition = to
    for (let depth = $to.depth; depth > 0; depth -= 1) {
      if (!$to.node(depth)?.isBlock) continue
      try {
        blockInsertPosition = $to.after(depth)
      } catch {
        blockInsertPosition = to
      }
      break
    }

    if (empty || from === to) {
      return {
        text: '',
        html: '',
        isEmpty: true,
        from,
        to,
        blockInsertPosition,
      }
    }

    const fragment = editor.state.doc.cut(from, to).content
    const serializer = DOMSerializer.fromSchema(editor.state.schema)
    const container = document.createElement('div')
    container.appendChild(serializer.serializeFragment(fragment))

    return {
      text: editor.state.doc.textBetween(from, to, ' ').trim(),
      html: container.innerHTML,
      isEmpty: false,
      from,
      to,
      blockInsertPosition,
    }
  }, [editor])

  useEffect(() => {
    if (!editor || typeof onSelectionSnapshotChange !== 'function') return undefined

    const notifySelectionSnapshot = () => {
      const snapshot = getSelectionSnapshot()
      if (!snapshot.isEmpty || snapshot.html || snapshot.text) {
        setLastSelectionSnapshot(snapshot)
      }
      onSelectionSnapshotChange(editor, snapshot)
    }

    notifySelectionSnapshot()
    editor.on('selectionUpdate', notifySelectionSnapshot)
    editor.on('transaction', notifySelectionSnapshot)
    editor.on('focus', notifySelectionSnapshot)
    editor.on('blur', notifySelectionSnapshot)

    return () => {
      editor.off('selectionUpdate', notifySelectionSnapshot)
      editor.off('transaction', notifySelectionSnapshot)
      editor.off('focus', notifySelectionSnapshot)
      editor.off('blur', notifySelectionSnapshot)
    }
  }, [editor, getSelectionSnapshot, onSelectionSnapshotChange])

  useEffect(() => {
    if (!editorContextMenu.open) return undefined

    const closeMenu = (event) => {
      if (editorContextMenuRef.current?.contains(event?.target)) return
      setContextMenuQuery('')
      setEditorContextMenu({
        open: false,
        x: 0,
        y: 0,
        actions: [],
        selectionSnapshot: { text: '', html: '', isEmpty: true, from: null, to: null, blockInsertPosition: null },
      })
    }

    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('scroll', closeMenu, true)

    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [editorContextMenu.open])

  useEffect(() => {
    if (!editorContextMenu.open) return undefined

    const syncMenuPosition = () => {
      const nextPosition = clampFloatingMenuPosition(
        editorContextMenu.x,
        editorContextMenu.y,
        editorContextMenuRef.current,
      )

      setEditorContextMenu((prev) => {
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
  }, [contextMenuQuery, editorContextMenu.actions.length, editorContextMenu.open, editorContextMenu.x, editorContextMenu.y])

  if (!editor) {
    return (
      <div className="rt-shell">
        <div className="rt-toolbar">
          <div className="rt-hint">Preparando editor enriquecido...</div>
        </div>
        <div
          className={`rt-editor ${readOnly ? 'is-readonly' : ''}`}
          style={{
            fontFamily: baseFontFamily,
            fontSize: `${baseFontSize}px`,
          }}
          onFocusCapture={onFocusCapture}
          onBlurCapture={onBlurCapture}
        >
          <p>Preparando editor enriquecido...</p>
        </div>
      </div>
    )
  }

  const mathDialog = isMathDialogOpen ? (
    <div
      className="math-modal-backdrop"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="math-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="math-close"
          onClick={closeMathDialog}
          aria-label="Close"
        >
          X
        </button>

        <div className="math-modal-title">Insert math expression</div>

        <div className="math-modal-actions math-modal-actions-top">
          <button
            type="button"
            className="rt-btn"
            onClick={saveMathDialog}
          >
            Insert
          </button>
          <button
            type="button"
            className="rt-btn"
            onClick={closeMathDialog}
          >
            Cancel
          </button>
        </div>

        <div ref={mathFieldHostRef} className="mathfield-host" />
        <div className="math-hint">Use English math notation such as {'\\sin(t)'}, {'\\sqrt{x}'}, or {'\\sum_{i=1}^{n} a_i'}.</div>
      </div>
    </div>
  ) : null

  return (
    <>
      <div className="rt-wrap">
        {!readOnly && (
        <div className="rt-toolbar">
          <button
            type="button"
            className={`rt-btn ${editor.isActive('bold') ? 'is-on' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleInlineMark('bold')}
            disabled={!hasSelection}
            title={hasSelection ? 'Bold selected text' : 'Select text first'}
          >
            B
          </button>

          <button
            type="button"
            className={`rt-btn ${editor.isActive('italic') ? 'is-on' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleInlineMark('italic')}
            disabled={!hasSelection}
            title={hasSelection ? 'Italic selected text' : 'Select text first'}
          >
            I
          </button>

          <button
            type="button"
            className={`rt-btn ${editor.isActive('underline') ? 'is-on' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleInlineMark('underline')}
            disabled={!hasSelection}
            title={hasSelection ? 'Underline selected text' : 'Select text first'}
          >
            U
          </button>

          <div className="rt-sep" />

          <div className="rt-color">
            <span>Color</span>
            <div className="rt-color-palette">
              {textColorPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`rt-color-chip ${textColor === preset.value ? 'is-active' : ''}`}
                  style={{ backgroundColor: preset.value }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTextColor(preset.value)
                    editor.chain().focus().setColor(preset.value).run()
                  }}
                  title={preset.label}
                  aria-label={preset.label}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().unsetColor().run()}
            title="Clear color"
          >
            Clear color
          </button>

          <div className="rt-sep" />

          <button
            type="button"
            className={`rt-btn ${editor.isActive('bulletList') ? 'is-on' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleList('bullet')}
            title="Bullet list"
          >
            Bullet
          </button>

          <button
            type="button"
            className={`rt-btn ${editor.isActive('orderedList') ? 'is-on' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleList('ordered')}
            title="Numbered list"
          >
            1. List
          </button>

          <div className="rt-sep" />

          <input
            className="rt-url-input"
            type="url"
            value={imageUrlInput}
            onChange={(e) => setImageUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                insertImageByUrl(imageUrlInput)
              }
            }}
            placeholder="https://image-url"
            title="Image URL"
          />

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertImageByUrl(imageUrlInput)}
            title="Insert image by URL"
          >
            Add Img URL
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            title="Upload image from your computer"
          >
            Upload Img
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openSketchDialog()}
            title="Create an editable sketch"
          >
            New Sketch
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!selectedSketch) return
              openSketchDialog({
                sketch: selectedSketch.node.attrs.sketch,
                width: selectedSketch.node.attrs.width,
                nodePos: selectedSketch.pos,
              })
            }}
            disabled={!selectedSketch}
            title={selectedSketch ? 'Edit selected sketch' : 'Select a sketch node first'}
          >
            Edit Sketch
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={duplicateSelectedSketch}
            disabled={!selectedSketch}
            title={selectedSketch ? 'Duplicate selected sketch' : 'Select a sketch node first'}
          >
            Duplicate Sketch
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={deleteSelectedSketch}
            disabled={!selectedSketch}
            title={selectedSketch ? 'Delete selected sketch' : 'Select a sketch node first'}
          >
            Delete Sketch
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onPickImageFile}
          />

          <div className="rt-sep" />

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertTable}
            title="Insert table"
          >
            Table
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertColumnLayout(2)}
            title="Insert a 2-column layout"
          >
            2 Cols
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertColumnLayout(3)}
            title="Insert a 3-column layout"
          >
            3 Cols
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            disabled={!editor.isActive('table')}
            title="Add column"
          >
            +Col
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().addRowAfter().run()}
            disabled={!editor.isActive('table')}
            title="Add row"
          >
            +Row
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().deleteColumn().run()}
            disabled={!editor.isActive('table')}
            title="Delete column"
          >
            -Col
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().deleteRow().run()}
            disabled={!editor.isActive('table')}
            title="Delete row"
          >
            -Row
          </button>

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().deleteTable().run()}
            disabled={!editor.isActive('table')}
            title="Delete table"
          >
            Del Table
          </button>

          <div className="rt-sep" />

          <button
            type="button"
            className="rt-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setIsMathDialogOpen(true)}
            title="Insert a math expression using English notation"
          >
            Insert Math Expression
          </button>

          {extraToolbarButtons.map((button) => (
            <button
              key={button.id || button.label}
              type="button"
              className="rt-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => button.onClick?.(editor, getSelectionSnapshot())}
              title={button.title || button.label}
              disabled={Boolean(button.disabled)}
            >
              {button.label}
            </button>
          ))}

          <div className="rt-hint">Tip: use image URL, sketches, uploads, and tables for graph statements and structured data.</div>
        </div>
        )}

        <div
          className={`rt-editor ${readOnly ? 'is-readonly' : ''}`}
          style={{
            fontFamily: baseFontFamily,
            fontSize: `${baseFontSize}px`,
          }}
          onFocusCapture={onFocusCapture}
          onBlurCapture={onBlurCapture}
          onContextMenu={(event) => {
            if (readOnly || !contextMenuActions.length) return
            const currentSnapshot = getSelectionSnapshot()
            const selectionSnapshot = (!currentSnapshot.isEmpty || currentSnapshot.html || currentSnapshot.text)
              ? currentSnapshot
              : lastSelectionSnapshot
            const actions = contextMenuActions.filter((action) => !action?.hidden?.(editor, selectionSnapshot))
            if (!actions.length) return
            event.preventDefault()
            setContextMenuQuery('')
            setEditorContextMenu({
              open: true,
              x: event.clientX,
              y: event.clientY,
              actions,
              selectionSnapshot,
            })
          }}
        >
          <EditorContent editor={editor} />
        </div>

        {editorContextMenu.open && typeof document !== 'undefined' ? createPortal(
          <div
            ref={editorContextMenuRef}
            className="wb-context-editor wb-context-menu"
            style={{
              left: `${editorContextMenu.x}px`,
              top: `${editorContextMenu.y}px`,
              position: 'fixed',
              zIndex: 1200,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="construct-technique-picker is-open">
              <input
                className="construct-technique-input"
                value={contextMenuQuery}
                onChange={(event) => setContextMenuQuery(event.target.value)}
                placeholder="Search techniques or actions"
                autoFocus
              />
              <div className="construct-technique-options" role="listbox">
                {editorContextMenu.actions
                  .filter((action) => String(action.label || '').toLowerCase().includes(String(contextMenuQuery || '').trim().toLowerCase()))
                  .map((action) => {
              const disabled = typeof action.disabled === 'function'
                ? Boolean(action.disabled(editor, editorContextMenu.selectionSnapshot))
                : Boolean(action.disabled)

              return (
                <button
                  key={action.id || action.label}
                  type="button"
                  className={`construct-technique-option ${action.danger ? 'danger' : ''}`}
                  disabled={disabled}
                  onClick={() => {
                    setContextMenuQuery('')
                    setEditorContextMenu({
                      open: false,
                      x: 0,
                      y: 0,
                      actions: [],
                      selectionSnapshot: { text: '', html: '', isEmpty: true, from: null, to: null, blockInsertPosition: null },
                    })
                    action.onClick?.(editor, editorContextMenu.selectionSnapshot)
                  }}
                >
                  {action.label}
                </button>
              )
                })}
                {!editorContextMenu.actions.some((action) => String(action.label || '').toLowerCase().includes(String(contextMenuQuery || '').trim().toLowerCase())) && (
                  <div className="construct-technique-empty">No matching techniques or actions.</div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        ) : null}

        {!readOnly && isSketchOpen && (typeof document !== 'undefined' ? createPortal(
          <div
            className={`rt-sketch-overlay ${isExcalidrawSketch ? 'is-workspace' : ''}`}
            onClick={closeSketchDialog}
          >
            <div
              className={isExcalidrawSketch ? 'rt-sketch-workspace' : 'rt-sketch-dialog'}
              onClick={(event) => event.stopPropagation()}
            >
            <div className={`rt-sketch-top ${isExcalidrawSketch ? 'is-workspace' : ''}`}>
              <div className="saved-title">{sketchDialogMode === 'edit' ? 'Edit Sketch' : 'Sketch Pad'}</div>
              <div className="menu-actions wb-inline-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={undoSketchChange}
                  disabled={sketchUsesHostedEngine || !sketchHistoryPast.length}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={redoSketchChange}
                  disabled={sketchUsesHostedEngine || !sketchHistoryFuture.length}
                >
                  Redo
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => mutateSketchDocument(() => createEmptySketchDocument(), { nextSelectionIds: [] })}
                  disabled={sketchUsesHostedEngine || !sketchDocument.items.length}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={closeSketchDialog}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={saveSketchNode}
                  disabled={sketchUsesHostedEngine ? false : !sketchDocument.items.length}
                >
                  {sketchDialogMode === 'edit' ? 'Save Sketch' : 'Insert Sketch'}
                </button>
                {sketchDialogMode === 'edit' && Number.isInteger(editingSketchNodePos) && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={deleteCurrentSketchNode}
                  >
                    Delete Sketch
                  </button>
                )}
              </div>
            </div>

            {sketchUsesHostedEngine && (
              <div className={`rt-sketch-toolbar ${isExcalidrawSketch ? 'is-workspace' : ''}`}>
                <label className="rt-sketch-size">
                  <span>Node width {sketchNodeWidth}px</span>
                  <input
                    type="range"
                    min="220"
                    max="720"
                    step="10"
                    value={sketchNodeWidth}
                    onChange={(e) => setSketchNodeWidth(Number(e.target.value))}
                  />
                </label>
                <div className="rt-hint">The embedded drawing engine handles selection, transform tools, and shortcuts inside the canvas.</div>
              </div>
            )}

            {!sketchUsesHostedEngine && (
            <div className="rt-sketch-toolbar">
              <div className="rt-sketch-tool-group">
                <button
                  type="button"
                  className={`rt-btn ${sketchTool === 'select' ? 'is-on' : ''}`}
                  onClick={() => setSketchTool('select')}
                >
                  Select
                </button>
                <button
                  type="button"
                  className={`rt-btn ${sketchTool === 'lasso' ? 'is-on' : ''}`}
                  onClick={() => setSketchTool('lasso')}
                >
                  Lasso
                </button>
                <button
                  type="button"
                  className={`rt-btn ${sketchTool === 'pen' ? 'is-on' : ''}`}
                  onClick={() => setSketchTool('pen')}
                >
                  Pen
                </button>
                <button
                  type="button"
                  className={`rt-btn ${sketchTool === 'eraser' ? 'is-on' : ''}`}
                  onClick={() => setSketchTool('eraser')}
                >
                  Eraser
                </button>
                <button
                  type="button"
                  className={`rt-btn ${sketchTool === 'line' ? 'is-on' : ''}`}
                  onClick={() => setSketchTool('line')}
                >
                  Line
                </button>
                <button
                  type="button"
                  className={`rt-btn ${sketchTool === 'arrow' ? 'is-on' : ''}`}
                  onClick={() => setSketchTool('arrow')}
                >
                  Arrow
                </button>
                <button
                  type="button"
                  className={`rt-btn ${sketchTool === 'text' ? 'is-on' : ''}`}
                  onClick={() => setSketchTool('text')}
                >
                  Text
                </button>
                <button
                  type="button"
                  className={`rt-btn ${sketchTool === 'rect' ? 'is-on' : ''}`}
                  onClick={() => setSketchTool('rect')}
                >
                  Rect
                </button>
                <button
                  type="button"
                  className={`rt-btn ${sketchTool === 'ellipse' ? 'is-on' : ''}`}
                  onClick={() => setSketchTool('ellipse')}
                >
                  Ellipse
                </button>
              </div>

              <div className="rt-sketch-tool-group">
                {SKETCH_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`rt-sketch-swatch ${sketchColor === color ? 'is-on' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setSketchColor(color)
                      setSketchTool('pen')
                    }}
                    title={color}
                  />
                ))}
                <input
                  type="color"
                  value={sketchColor}
                  onChange={(e) => {
                    setSketchColor(e.target.value)
                    setSketchTool('pen')
                  }}
                />
              </div>

              <label className="rt-sketch-size">
                <span>Brush {sketchSize}px</span>
                <input
                  type="range"
                  min="2"
                  max="24"
                  step="1"
                  value={sketchSize}
                  onChange={(e) => setSketchSize(Number(e.target.value))}
                />
              </label>

              <label className="rt-sketch-size">
                <span>Node width {sketchNodeWidth}px</span>
                <input
                  type="range"
                  min="220"
                  max="720"
                  step="10"
                  value={sketchNodeWidth}
                  onChange={(e) => setSketchNodeWidth(Number(e.target.value))}
                />
              </label>

              <button
                type="button"
                className="rt-btn"
                onClick={() => sketchImageInputRef.current?.click()}
              >
                Insert Image
              </button>

              <input
                ref={sketchImageInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onPickSketchImageFile}
              />

              <button
                type="button"
                className="rt-btn"
                onClick={() => moveSelectedSketchItemsInLayer('forward')}
                disabled={!selectedSketchItemIds.length}
              >
                Bring Forward
              </button>

              <button
                type="button"
                className="rt-btn"
                onClick={() => moveSelectedSketchItemsInLayer('backward')}
                disabled={!selectedSketchItemIds.length}
              >
                Send Backward
              </button>

              <button
                type="button"
                className="rt-btn"
                onClick={() => moveSelectedSketchItemsInLayer('front')}
                disabled={!selectedSketchItemIds.length}
              >
                To Front
              </button>

              <button
                type="button"
                className="rt-btn"
                onClick={() => moveSelectedSketchItemsInLayer('back')}
                disabled={!selectedSketchItemIds.length}
              >
                To Back
              </button>

              <button
                type="button"
                className="rt-btn"
                onClick={lockSelectedSketchItems}
                disabled={!canLockSelectedSketchItems}
              >
                Lock Selected
              </button>

              <button
                type="button"
                className="rt-btn"
                onClick={unlockAllSketchImages}
                disabled={!hasLockedSketchImages}
              >
                Unlock Images
              </button>

              <button
                type="button"
                className="rt-btn"
                onClick={() => {
                  if (!selectedSketchItemIds.length) return
                  mutateSketchDocument((prev) => ({
                    ...prev,
                    items: prev.items.filter((item) => !selectedSketchItemIds.includes(item.id)),
                  }), { nextSelectionIds: [] })
                }}
                disabled={!selectedSketchItemIds.length}
              >
                Delete Selected
              </button>

              <button
                type="button"
                className="rt-btn"
                onClick={editSelectedSketchText}
                disabled={selectedSketchItemIds.length !== 1 || !sketchDocument.items.some((item) => item.id === selectedSketchItemId && item.tool === 'text')}
              >
                Edit Selected Text
              </button>

            </div>
            )}

            <div className={`rt-sketch-stage ${isExcalidrawSketch ? 'is-workspace' : ''}`}>
              <SketchEngineHost
                engine={sketchEngine}
                excalidrawProps={{
                  initialDocument: sketchDocument,
                  onApiChange: handleTldrawApiChange,
                }}
                konvaProps={{
                  document: sketchDocument,
                  selectedIds: selectedSketchItemIds,
                  sketchTool,
                  sketchColor,
                  sketchSize,
                  onSelectionChange: replaceSketchSelection,
                  onDocumentChange: mutateSketchDocument,
                  onToolChange: setSketchTool,
                  onApiChange: handleTldrawApiChange,
                }}
                tldrawProps={{
                  initialDocument: sketchDocument,
                  onApiChange: handleTldrawApiChange,
                }}
                legacyProps={{
                  sketchCanvasRef,
                  onPointerDown: (event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    startSketchStroke(event)
                  },
                  onPointerMove: (event) => {
                    if ((event.buttons & 1) !== 1) return
                    extendSketchStroke(event)
                  },
                  onPointerUp: (event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId)
                    endSketchStroke()
                  },
                  onPointerLeave: () => endSketchStroke(),
                  onDoubleClick: handleSketchCanvasDoubleClick,
                  width: SKETCH_WIDTH,
                  height: SKETCH_HEIGHT,
                  visibleSelectionFrame,
                }}
              />
            </div>
          </div>
          </div>,
          document.body,
        ) : null)}
      </div>

      {typeof document !== 'undefined' ? createPortal(mathDialog, document.body) : mathDialog}
    </>
  )
}
