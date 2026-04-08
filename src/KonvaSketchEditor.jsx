import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Arrow, Ellipse, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'

import {
  buildSketchSvgDataUrl,
  findSketchItemsInRect,
  getSketchItemBounds,
  moveSketchItem,
  normalizeSketchDocument,
  rotateSketchItem,
  scaleSketchItem,
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
} from './lib/editableSketch'

function createPoint(stage, event) {
  const pointer = stage?.getPointerPosition() || event?.target?.getStage?.()?.getPointerPosition()
  return {
    x: Number.isFinite(pointer?.x) ? pointer.x : 0,
    y: Number.isFinite(pointer?.y) ? pointer.y : 0,
  }
}

function createSketchItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sketch-item-${crypto.randomUUID()}`
  }

  return `sketch-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function flattenPoints(points = []) {
  return points.flatMap((point) => [point.x, point.y])
}

function getItemCenter(item) {
  const bounds = getSketchItemBounds(item)
  if (!bounds) return { x: 0, y: 0 }
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  }
}

function itemIntersectsSelection(item, selectionRect) {
  if (!selectionRect) return false
  return findSketchItemsInRect({ items: [item] }, selectionRect).length > 0
}

function isTransformable(item) {
  return item && item.tool !== 'eraser'
}

function SketchImage({ item, selected, onSelect, onDragStart, onDragMove, onDragEnd }) {
  const [image, setImage] = useState(null)

  useEffect(() => {
    if (!item?.src) {
      setImage(null)
      return undefined
    }

    const nextImage = new window.Image()
    nextImage.crossOrigin = 'anonymous'
    nextImage.onload = () => setImage(nextImage)
    nextImage.onerror = () => setImage(null)
    nextImage.src = item.src
    return () => {
      nextImage.onload = null
      nextImage.onerror = null
    }
  }, [item?.src])

  if (!image) return null

  return (
    <KonvaImage
      id={item.id}
      image={image}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height}
      rotation={((item.rotation || 0) * 180) / Math.PI}
      draggable={!item.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      stroke={selected ? '#2563eb' : undefined}
      strokeWidth={selected ? 2 : 0}
      dash={selected ? [8, 6] : undefined}
    />
  )
}

export default function KonvaSketchEditor({
  document,
  selectedIds,
  sketchTool,
  sketchColor,
  sketchSize,
  onSelectionChange,
  onDocumentChange,
  onToolChange,
  onApiChange,
}) {
  const safeDocument = useMemo(() => normalizeSketchDocument(document), [document])
  const stageRef = useRef(null)
  const transformerRef = useRef(null)
  const nodeRefs = useRef(new Map())
  const dragStateRef = useRef(null)
  const draftStateRef = useRef(null)
  const [selectionRect, setSelectionRect] = useState(null)

  useEffect(() => {
    if (!onApiChange) return undefined
    onApiChange({
      exportDocument: async () => ({
        ...normalizeSketchDocument(safeDocument),
        engine: 'legacy',
        previewDataUrl: buildSketchSvgDataUrl(safeDocument),
      }),
    })
    return () => onApiChange(null)
  }, [onApiChange, safeDocument])

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter(Boolean)
      .filter((node) => {
        const item = safeDocument.items.find((entry) => entry.id === node.id())
        return isTransformable(item)
      })
    transformer.nodes(nodes)
    transformer.getLayer()?.batchDraw()
  }, [safeDocument.items, selectedIds])

  const commitDocument = useCallback((updater, options = {}) => {
    onDocumentChange?.(updater, options)
  }, [onDocumentChange])

  const commitSelection = useCallback((nextIds, options = {}) => {
    onSelectionChange?.(nextIds, options)
  }, [onSelectionChange])

  const handleStageMouseDown = useCallback((event) => {
    const stage = stageRef.current
    const point = createPoint(stage, event)
    const clickedOnEmpty = event.target === stage

    if (sketchTool === 'text') {
      const nextItem = {
        id: createSketchItemId(),
        tool: 'text',
        color: sketchColor,
        size: sketchSize,
        x: point.x,
        y: point.y,
        text: 'Text',
        fontSize: Math.max(16, sketchSize * 4),
        width: 180,
        height: 32,
        rotation: 0,
      }
      commitDocument((prev) => ({ ...prev, items: [...prev.items, nextItem] }), { nextSelectionIds: [nextItem.id] })
      onToolChange?.('select')
      return
    }

    if (sketchTool === 'select' || sketchTool === 'lasso') {
      if (!clickedOnEmpty) return
      setSelectionRect({
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        originX: point.x,
        originY: point.y,
      })
      return
    }

    const nextItemId = createSketchItemId()
    draftStateRef.current = { itemId: nextItemId, tool: sketchTool, origin: point }

    if (sketchTool === 'pen' || sketchTool === 'eraser') {
      const nextItem = {
        id: nextItemId,
        tool: sketchTool,
        color: sketchTool === 'eraser' ? '#ffffff' : sketchColor,
        size: sketchSize,
        points: [point, point],
      }
      commitDocument((prev) => ({ ...prev, items: [...prev.items, nextItem] }), { nextSelectionIds: [nextItem.id] })
      return
    }

    const baseShape = {
      id: nextItemId,
      tool: sketchTool,
      color: sketchColor,
      size: sketchSize,
      fill: 'none',
      rotation: 0,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
    }

    commitDocument((prev) => ({ ...prev, items: [...prev.items, baseShape] }), { nextSelectionIds: [nextItemId] })
  }, [commitDocument, onToolChange, sketchColor, sketchSize, sketchTool])

  const handleStageMouseMove = useCallback((event) => {
    const stage = stageRef.current
    const point = createPoint(stage, event)

    if (selectionRect) {
      setSelectionRect((prev) => ({
        ...prev,
        x: Math.min(prev.originX, point.x),
        y: Math.min(prev.originY, point.y),
        width: Math.abs(point.x - prev.originX),
        height: Math.abs(point.y - prev.originY),
      }))
      return
    }

    if (!draftStateRef.current) return
    const { itemId, tool } = draftStateRef.current

    commitDocument((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== itemId) return item
        if (tool === 'pen' || tool === 'eraser') {
          return {
            ...item,
            points: [...item.points, point],
          }
        }
        return {
          ...item,
          x2: point.x,
          y2: point.y,
        }
      }),
    }), { nextSelectionIds: [itemId], trackHistory: false })
  }, [commitDocument, selectionRect])

  const handleStageMouseUp = useCallback(() => {
    if (selectionRect) {
      const nextIds = safeDocument.items
        .filter((item) => itemIntersectsSelection(item, selectionRect))
        .map((item) => item.id)
      commitSelection(nextIds, { trackHistory: true })
      setSelectionRect(null)
    }

    if (draftStateRef.current) {
      if (draftStateRef.current.tool !== 'pen' && draftStateRef.current.tool !== 'eraser') {
        onToolChange?.('select')
      }
      draftStateRef.current = null
    }
  }, [commitSelection, onToolChange, safeDocument.items, selectionRect])

  const handleSelectItem = useCallback((itemId, event) => {
    const additive = event?.evt?.shiftKey
    if (additive) {
      const nextIds = selectedIds.includes(itemId)
        ? selectedIds.filter((id) => id !== itemId)
        : [...selectedIds, itemId]
      commitSelection(nextIds, { trackHistory: true })
      return
    }
    if (selectedIds.length === 1 && selectedIds[0] === itemId) return
    commitSelection([itemId], { trackHistory: true })
  }, [commitSelection, selectedIds])

  const handleDragStart = useCallback((itemId) => {
    const activeIds = selectedIds.includes(itemId) ? selectedIds : [itemId]
    const snapshot = new Map()
    safeDocument.items.forEach((item) => {
      if (activeIds.includes(item.id)) snapshot.set(item.id, item)
    })
    dragStateRef.current = { activeIds, snapshot }
    if (!selectedIds.includes(itemId)) {
      commitSelection([itemId], { trackHistory: true })
    }
  }, [commitSelection, safeDocument.items, selectedIds])

  const handleDragMove = useCallback((itemId, event) => {
    const dragState = dragStateRef.current
    if (!dragState) return
    const sourceItem = dragState.snapshot.get(itemId)
    if (!sourceItem) return
    const node = event.target
    const bounds = getSketchItemBounds(sourceItem)
    if (!bounds) return
    const deltaX = node.x() - bounds.left
    const deltaY = node.y() - bounds.top
    commitDocument((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const baseItem = dragState.snapshot.get(item.id)
        if (!baseItem) return item
        return moveSketchItem(baseItem, deltaX, deltaY)
      }),
    }), { nextSelectionIds: dragState.activeIds, trackHistory: false })
  }, [commitDocument])

  const handleDragEnd = useCallback(() => {
    dragStateRef.current = null
  }, [])

  const handleTransformEnd = useCallback(() => {
    const transformer = transformerRef.current
    const nodes = transformer?.nodes?.() || []
    if (!nodes.length) return

    const updates = new Map()
    nodes.forEach((node) => {
      const item = safeDocument.items.find((entry) => entry.id === node.id())
      if (!item) return
      const sourceBounds = getSketchItemBounds(item)
      if (!sourceBounds) return
      const scaledWidth = Math.max(24, node.width() * node.scaleX())
      const scaledHeight = Math.max(24, node.height() * node.scaleY())
      const targetBounds = {
        left: node.x(),
        top: node.y(),
        right: node.x() + scaledWidth,
        bottom: node.y() + scaledHeight,
      }
      let nextItem = scaleSketchItem(item, sourceBounds, targetBounds)
      const nextRotation = (node.rotation() * Math.PI) / 180
      const rotationDelta = nextRotation - (item.rotation || 0)
      if (rotationDelta) {
        nextItem = rotateSketchItem(nextItem, rotationDelta, getItemCenter(nextItem))
      }
      updates.set(item.id, nextItem)
      node.scaleX(1)
      node.scaleY(1)
    })

    if (!updates.size) return
    commitDocument((prev) => ({
      ...prev,
      items: prev.items.map((item) => updates.get(item.id) || item),
    }), { nextSelectionIds: selectedIds })
  }, [commitDocument, safeDocument.items, selectedIds])

  const renderItem = useCallback((item) => {
    const selected = selectedIds.includes(item.id)
    const commonProps = {
      key: item.id,
      id: item.id,
      ref: (node) => {
        if (node) nodeRefs.current.set(item.id, node)
        else nodeRefs.current.delete(item.id)
      },
      onClick: (event) => handleSelectItem(item.id, event),
      onTap: (event) => handleSelectItem(item.id, event),
      onDragStart: () => handleDragStart(item.id),
      onDragMove: (event) => handleDragMove(item.id, event),
      onDragEnd: handleDragEnd,
      draggable: sketchTool === 'select' && selected && !item.locked,
      rotation: ((item.rotation || 0) * 180) / Math.PI,
    }

    if (item.tool === 'pen' || item.tool === 'eraser') {
      return (
        <Line
          {...commonProps}
          points={flattenPoints(item.points)}
          stroke={item.tool === 'eraser' ? '#ffffff' : item.color}
          strokeWidth={item.size}
          lineCap="round"
          lineJoin="round"
          tension={0.2}
          hitStrokeWidth={Math.max(12, item.size + 8)}
          dash={selected ? [8, 6] : undefined}
        />
      )
    }

    if (item.tool === 'rect') {
      return (
        <Rect
          {...commonProps}
          x={Math.min(item.x1, item.x2)}
          y={Math.min(item.y1, item.y2)}
          width={Math.max(1, Math.abs(item.x2 - item.x1))}
          height={Math.max(1, Math.abs(item.y2 - item.y1))}
          stroke={item.color}
          strokeWidth={item.size}
          fill={item.fill === 'none' ? undefined : item.fill}
          cornerRadius={4}
          dash={selected ? [8, 6] : undefined}
        />
      )
    }

    if (item.tool === 'ellipse') {
      return (
        <Ellipse
          {...commonProps}
          x={(item.x1 + item.x2) / 2}
          y={(item.y1 + item.y2) / 2}
          radiusX={Math.max(1, Math.abs(item.x2 - item.x1) / 2)}
          radiusY={Math.max(1, Math.abs(item.y2 - item.y1) / 2)}
          stroke={item.color}
          strokeWidth={item.size}
          fill={item.fill === 'none' ? undefined : item.fill}
          dash={selected ? [8, 6] : undefined}
        />
      )
    }

    if (item.tool === 'line' || item.tool === 'arrow') {
      const points = [item.x1, item.y1, item.x2, item.y2]
      if (item.tool === 'arrow') {
        return (
          <Arrow
            {...commonProps}
            points={points}
            stroke={item.color}
            strokeWidth={item.size}
            lineCap="round"
            lineJoin="round"
            dash={selected ? [8, 6] : undefined}
            pointerLength={16}
            pointerWidth={14}
          />
        )
      }
      return (
        <Line
          {...commonProps}
          points={points}
          stroke={item.color}
          strokeWidth={item.size}
          lineCap="round"
          lineJoin="round"
          dash={selected ? [8, 6] : undefined}
        />
      )
    }

    if (item.tool === 'text') {
      return (
        <Text
          {...commonProps}
          x={item.x}
          y={item.y}
          text={item.text || ''}
          width={item.width || 180}
          fontSize={item.fontSize || 24}
          fontFamily="Menlo, Monaco, Consolas, Courier New, monospace"
          fill={item.color}
        />
      )
    }

    if (item.tool === 'image') {
      return (
        <SketchImage
          key={item.id}
          item={item}
          selected={selected}
          onSelect={(event) => handleSelectItem(item.id, event)}
          onDragStart={() => handleDragStart(item.id)}
          onDragMove={(event) => handleDragMove(item.id, event)}
          onDragEnd={handleDragEnd}
        />
      )
    }

    return null
  }, [handleDragEnd, handleDragMove, handleDragStart, handleSelectItem, selectedIds, sketchTool])

  return (
    <div className="rt-konva-shell">
      <Stage
        ref={stageRef}
        width={SKETCH_WIDTH}
        height={SKETCH_HEIGHT}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        <Layer>
          <Rect x={0} y={0} width={SKETCH_WIDTH} height={SKETCH_HEIGHT} fill={safeDocument.background || '#ffffff'} />
          {safeDocument.items.map(renderItem)}
          {selectionRect && (
            <Rect
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="rgba(37, 99, 235, 0.1)"
              stroke="#2563eb"
              dash={[8, 6]}
            />
          )}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            onTransformEnd={handleTransformEnd}
          />
        </Layer>
      </Stage>
    </div>
  )
}
