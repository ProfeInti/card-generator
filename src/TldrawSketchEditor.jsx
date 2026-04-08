import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Tldraw } from 'tldraw'
import { b64Vecs, toRichText } from '@tldraw/tlschema'
import 'tldraw/tldraw.css'

import { buildSketchSvgDataUrl, createEmptySketchDocument, normalizeSketchDocument, SKETCH_HEIGHT, SKETCH_WIDTH } from './lib/editableSketch'

function buildTldrawPreviewUrl(svg) {
  if (!svg) return ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function createTldrawRecordId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`
  }

  return `${prefix}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function mapLegacyColor(color) {
  const normalized = String(color || '').trim().toLowerCase()
  if (normalized === '#2563eb') return 'blue'
  if (normalized === '#0f766e') return 'green'
  if (normalized === '#7c3aed') return 'violet'
  if (normalized === '#dc2626') return 'red'
  if (normalized === '#ea580c') return 'orange'
  if (normalized === '#ca8a04') return 'yellow'
  if (normalized === '#ffffff') return 'white'
  if (normalized === '#9ca3af' || normalized === '#6b7280') return 'grey'
  return 'black'
}

function mapLegacySize(size) {
  const n = Number(size) || 1
  if (n <= 3) return 's'
  if (n <= 6) return 'm'
  if (n <= 10) return 'l'
  return 'xl'
}

function buildLegacyShapesForTldraw(document) {
  const assets = []
  const shapes = []
  let includePreviewBackground = false

  for (const item of document.items || []) {
    if (!item) continue

    if (item.tool === 'eraser') {
      includePreviewBackground = true
      continue
    }

    if (item.tool === 'pen') {
      const points = Array.isArray(item.points) ? item.points : []
      if (points.length < 1) continue
      const minX = Math.min(...points.map((point) => point.x))
      const minY = Math.min(...points.map((point) => point.y))
      const localPoints = points.map((point) => ({
        x: point.x - minX,
        y: point.y - minY,
        z: 0.5,
      }))
      shapes.push({
        id: createTldrawRecordId('shape'),
        type: 'draw',
        x: minX,
        y: minY,
        props: {
          color: mapLegacyColor(item.color),
          fill: 'none',
          dash: 'draw',
          size: mapLegacySize(item.size),
          segments: [{
            type: 'free',
            path: b64Vecs.encodePoints(localPoints),
          }],
          isComplete: true,
          isClosed: false,
          isPen: false,
          scale: 1,
          scaleX: 1,
          scaleY: 1,
        },
      })
      continue
    }

    if (item.tool === 'rect' || item.tool === 'ellipse') {
      const left = Math.min(item.x1, item.x2)
      const top = Math.min(item.y1, item.y2)
      const width = Math.max(1, Math.abs(item.x2 - item.x1))
      const height = Math.max(1, Math.abs(item.y2 - item.y1))
      shapes.push({
        id: createTldrawRecordId('shape'),
        type: 'geo',
        x: left,
        y: top,
        rotation: item.rotation || 0,
        props: {
          geo: item.tool === 'ellipse' ? 'ellipse' : 'rectangle',
          w: width,
          h: height,
          color: mapLegacyColor(item.color),
          labelColor: mapLegacyColor(item.color),
          fill: item.fill && item.fill !== 'none' ? 'solid' : 'none',
          dash: 'solid',
          size: mapLegacySize(item.size),
          font: 'mono',
          align: 'middle',
          verticalAlign: 'middle',
          richText: toRichText(''),
          url: '',
          growY: 0,
          scale: 1,
        },
      })
      continue
    }

    if (item.tool === 'line' || item.tool === 'arrow') {
      const left = Math.min(item.x1, item.x2)
      const top = Math.min(item.y1, item.y2)
      shapes.push({
        id: createTldrawRecordId('shape'),
        type: 'arrow',
        x: left,
        y: top,
        props: {
          kind: 'straight',
          labelColor: mapLegacyColor(item.color),
          color: mapLegacyColor(item.color),
          fill: 'none',
          dash: 'solid',
          size: mapLegacySize(item.size),
          arrowheadStart: 'none',
          arrowheadEnd: item.tool === 'arrow' ? 'arrow' : 'none',
          font: 'mono',
          start: { x: item.x1 - left, y: item.y1 - top },
          end: { x: item.x2 - left, y: item.y2 - top },
          bend: 0,
          richText: toRichText(''),
          labelPosition: 0.5,
          scale: 1,
          elbowMidPoint: 0.5,
        },
      })
      continue
    }

    if (item.tool === 'text') {
      shapes.push({
        id: createTldrawRecordId('shape'),
        type: 'text',
        x: item.x,
        y: item.y,
        rotation: item.rotation || 0,
        props: {
          color: mapLegacyColor(item.color),
          size: mapLegacySize(item.fontSize || item.size),
          font: 'mono',
          textAlign: 'start',
          w: Math.max(40, item.width || 180),
          richText: toRichText(item.text || ''),
          scale: 1,
          autoSize: false,
        },
      })
      continue
    }

    if (item.tool === 'image' && item.src) {
      const assetId = createTldrawRecordId('asset')
      assets.push({
        id: assetId,
        typeName: 'asset',
        type: 'image',
        meta: {},
        props: {
          name: 'Legacy image',
          src: item.src,
          w: item.width || 240,
          h: item.height || 180,
          mimeType: item.src.startsWith('data:image/png') ? 'image/png' : 'image/*',
          isAnimated: false,
        },
      })
      shapes.push({
        id: createTldrawRecordId('shape'),
        type: 'image',
        x: item.x || 0,
        y: item.y || 0,
        rotation: item.rotation || 0,
        isLocked: Boolean(item.locked),
        props: {
          assetId,
          w: item.width || 240,
          h: item.height || 180,
          playing: true,
          url: item.src,
          crop: null,
          flipX: false,
          flipY: false,
          altText: 'Legacy image',
        },
      })
      continue
    }

    includePreviewBackground = true
  }

  return { assets, shapes, includePreviewBackground }
}

export default function TldrawSketchEditor({
  initialDocument,
  onApiChange,
}) {
  const safeDocument = useMemo(() => normalizeSketchDocument(initialDocument), [initialDocument])
  const editorRef = useRef(null)
  const latestDocumentRef = useRef(safeDocument)
  const hasInitializedRef = useRef(false)
  const initFrameRef = useRef(0)

  useEffect(() => {
    latestDocumentRef.current = safeDocument
  }, [safeDocument])

  const exportDocument = useCallback(async () => {
    const editor = editorRef.current
    const currentDocument = latestDocumentRef.current
    if (!editor) {
      return normalizeSketchDocument({
        ...createEmptySketchDocument(),
        engine: 'tldraw',
      })
    }

    const shapes = editor.getCurrentPageShapesSorted()
    const snapshot = editor.getSnapshot()
    let previewDataUrl = ''
    let width = currentDocument.width || SKETCH_WIDTH
    let height = currentDocument.height || SKETCH_HEIGHT

    if (shapes.length) {
      const exported = await editor.getSvgString(shapes, {
        background: true,
        padding: 16,
      })
      if (exported?.svg) {
        previewDataUrl = buildTldrawPreviewUrl(exported.svg)
        width = Math.max(1, Math.ceil(exported.width || width))
        height = Math.max(1, Math.ceil(exported.height || height))
      }
    }

    if (!previewDataUrl) {
      previewDataUrl = buildSketchSvgDataUrl({
        ...currentDocument,
        engine: 'tldraw',
        items: [],
        previewDataUrl: '',
      })
    }

    return normalizeSketchDocument({
      ...currentDocument,
      engine: 'tldraw',
      width,
      height,
      items: [],
      tldrawSnapshot: snapshot,
      previewDataUrl,
    })
  }, [])

  useEffect(() => {
    if (!onApiChange) return undefined
    onApiChange({ exportDocument })
    return () => onApiChange(null)
  }, [exportDocument, onApiChange])

  const initializeEditorDocument = useCallback((nextEditor, currentDocument) => {
    const currentPreviewDataUrl = currentDocument.previewDataUrl || buildSketchSvgDataUrl(currentDocument)
    if (currentDocument.tldrawSnapshot) {
      nextEditor.loadSnapshot(currentDocument.tldrawSnapshot)
    } else if (currentDocument.items?.length) {
      const { assets, shapes, includePreviewBackground } = buildLegacyShapesForTldraw(currentDocument)
      if (assets.length) {
        nextEditor.createAssets(assets)
      }
      if (includePreviewBackground) {
        const assetId = createTldrawRecordId('asset')
        nextEditor.createAssets([{
          id: assetId,
          typeName: 'asset',
          type: 'image',
          meta: {},
          props: {
            name: 'Legacy sketch background',
            src: currentPreviewDataUrl,
            w: currentDocument.width || SKETCH_WIDTH,
            h: currentDocument.height || SKETCH_HEIGHT,
            mimeType: 'image/svg+xml',
            isAnimated: false,
          },
        }])
        nextEditor.createShape({
          id: createTldrawRecordId('shape'),
          type: 'image',
          x: 0,
          y: 0,
          props: {
            assetId,
            w: currentDocument.width || SKETCH_WIDTH,
            h: currentDocument.height || SKETCH_HEIGHT,
            playing: true,
            url: currentPreviewDataUrl,
            crop: null,
            flipX: false,
            flipY: false,
            altText: 'Legacy sketch background',
          },
        })
      }
      if (shapes.length) {
        nextEditor.createShapes(shapes)
      }
      nextEditor.setCurrentTool('draw')
    } else if (currentDocument.previewDataUrl) {
      const assetId = createTldrawRecordId('asset')
      nextEditor.createAssets([{
        id: assetId,
        typeName: 'asset',
        type: 'image',
        meta: {},
        props: {
          name: 'Legacy sketch',
          src: currentDocument.previewDataUrl,
          w: currentDocument.width || SKETCH_WIDTH,
          h: currentDocument.height || SKETCH_HEIGHT,
          mimeType: 'image/svg+xml',
          isAnimated: false,
        },
      }])
      nextEditor.createShape({
        id: createTldrawRecordId('shape'),
        type: 'image',
        x: 80,
        y: 80,
        props: {
          assetId,
          w: currentDocument.width || SKETCH_WIDTH,
          h: currentDocument.height || SKETCH_HEIGHT,
        },
      })
      nextEditor.setCurrentTool('draw')
    } else {
      nextEditor.setCurrentTool('draw')
    }
  }, [])

  const handleMount = useCallback((nextEditor) => {
    editorRef.current = nextEditor
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true
    initFrameRef.current = window.requestAnimationFrame(() => {
      initializeEditorDocument(nextEditor, latestDocumentRef.current)
    })
  }, [initializeEditorDocument])

  useEffect(() => () => {
    if (initFrameRef.current) {
      window.cancelAnimationFrame(initFrameRef.current)
    }
  }, [])

  return (
    <div className="rt-tldraw-shell">
      <Tldraw
        hideUi={false}
        onMount={handleMount}
      />
    </div>
  )
}
