export const SKETCH_WIDTH = 1400
export const SKETCH_HEIGHT = 900
export const SKETCH_COLORS = ['#111827', '#0f766e', '#2563eb', '#7c3aed', '#dc2626', '#ea580c', '#ca8a04', '#ffffff']
const HIT_PADDING = 10

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizePoint(point) {
  return {
    x: Number.isFinite(Number(point?.x)) ? Number(point.x) : 0,
    y: Number.isFinite(Number(point?.y)) ? Number(point.y) : 0,
  }
}

function rotatePoint(point, center, angle) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return {
    x: center.x + (dx * cos) - (dy * sin),
    y: center.y + (dx * sin) + (dy * cos),
  }
}

function getRotatedBoxCorners(left, top, width, height, rotation = 0) {
  const center = {
    x: left + (width / 2),
    y: top + (height / 2),
  }
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ].map((corner) => rotatePoint(corner, center, rotation))
}

function normalizeSketchItem(item) {
  if (!item || typeof item !== 'object') return null

  const tool = String(item.tool || 'pen').trim() || 'pen'
  const base = {
    id: String(item.id || createId('sketch-item')).trim(),
    tool,
    color: String(item.color || '#111827').trim() || '#111827',
    size: Number.isFinite(Number(item.size)) ? Number(item.size) : 4,
  }

  if (tool === 'pen' || tool === 'eraser') {
    const points = Array.isArray(item.points) ? item.points.map(normalizePoint) : []
    if (!points.length) return null
    return {
      ...base,
      points,
    }
  }

  if (tool === 'text') {
    return {
      ...base,
      x: Number.isFinite(Number(item.x)) ? Number(item.x) : 0,
      y: Number.isFinite(Number(item.y)) ? Number(item.y) : 0,
      text: String(item.text || '').trim(),
      fontSize: Number.isFinite(Number(item.fontSize)) ? Number(item.fontSize) : 24,
      width: Number.isFinite(Number(item.width)) ? Number(item.width) : 180,
      height: Number.isFinite(Number(item.height)) ? Number(item.height) : 32,
      rotation: Number.isFinite(Number(item.rotation)) ? Number(item.rotation) : 0,
    }
  }

  if (tool === 'image') {
    const src = String(item.src || '').trim()
    if (!src) return null
    return {
      ...base,
      src,
      locked: Boolean(item.locked),
      x: Number.isFinite(Number(item.x)) ? Number(item.x) : 0,
      y: Number.isFinite(Number(item.y)) ? Number(item.y) : 0,
      width: Number.isFinite(Number(item.width)) ? Number(item.width) : 240,
      height: Number.isFinite(Number(item.height)) ? Number(item.height) : 180,
      rotation: Number.isFinite(Number(item.rotation)) ? Number(item.rotation) : 0,
    }
  }

  return {
    ...base,
    x1: Number.isFinite(Number(item.x1)) ? Number(item.x1) : 0,
    y1: Number.isFinite(Number(item.y1)) ? Number(item.y1) : 0,
    x2: Number.isFinite(Number(item.x2)) ? Number(item.x2) : 0,
    y2: Number.isFinite(Number(item.y2)) ? Number(item.y2) : 0,
    fill: String(item.fill || 'none').trim() || 'none',
    rotation: Number.isFinite(Number(item.rotation)) ? Number(item.rotation) : 0,
  }
}

export function createEmptySketchDocument() {
  return {
    version: 1,
    engine: 'legacy',
    width: SKETCH_WIDTH,
    height: SKETCH_HEIGHT,
    background: '#ffffff',
    items: [],
    tldrawSnapshot: null,
    excalidrawElements: [],
    excalidrawAppState: null,
    excalidrawFiles: null,
    previewDataUrl: '',
  }
}

export function normalizeSketchDocument(value) {
  const safe = value && typeof value === 'object' ? value : {}
  const engine = String(
    safe.engine || (safe.excalidrawElements ? 'excalidraw' : (safe.tldrawSnapshot ? 'tldraw' : 'legacy')),
  ).trim() || 'legacy'
  return {
    version: 1,
    engine,
    width: Number.isFinite(Number(safe.width)) ? Number(safe.width) : SKETCH_WIDTH,
    height: Number.isFinite(Number(safe.height)) ? Number(safe.height) : SKETCH_HEIGHT,
    background: String(safe.background || '#ffffff').trim() || '#ffffff',
    items: (Array.isArray(safe.items) ? safe.items : []).map(normalizeSketchItem).filter(Boolean),
    tldrawSnapshot: safe.tldrawSnapshot && typeof safe.tldrawSnapshot === 'object' ? safe.tldrawSnapshot : null,
    excalidrawElements: Array.isArray(safe.excalidrawElements) ? safe.excalidrawElements : [],
    excalidrawAppState: safe.excalidrawAppState && typeof safe.excalidrawAppState === 'object' ? safe.excalidrawAppState : null,
    excalidrawFiles: safe.excalidrawFiles && typeof safe.excalidrawFiles === 'object' ? safe.excalidrawFiles : null,
    previewDataUrl: String(safe.previewDataUrl || '').trim(),
  }
}

export function serializeSketchDocument(value) {
  return JSON.stringify(normalizeSketchDocument(value))
}

export function deserializeSketchDocument(value) {
  if (!value) return createEmptySketchDocument()

  try {
    return normalizeSketchDocument(JSON.parse(String(value)))
  } catch {
    return createEmptySketchDocument()
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildStrokePath(points) {
  if (!Array.isArray(points) || !points.length) return ''
  if (points.length === 1) {
    const point = points[0]
    return `M ${point.x} ${point.y} L ${point.x + 0.01} ${point.y + 0.01}`
  }

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function buildShapeMarkup(item) {
  const stroke = item.tool === 'eraser' ? '#ffffff' : (item.color || '#111827')
  const strokeWidth = Math.max(1, Number(item.size || 4))

  if (item.tool === 'pen' || item.tool === 'eraser') {
    return `<path d="${escapeHtml(buildStrokePath(item.points))}" fill="none" stroke="${escapeHtml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`
  }

  if (item.tool === 'line' || item.tool === 'arrow') {
    if (item.tool === 'arrow') {
      const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1)
      const headLength = Math.max(10, strokeWidth * 3)
      const leftX = item.x2 - headLength * Math.cos(angle - Math.PI / 6)
      const leftY = item.y2 - headLength * Math.sin(angle - Math.PI / 6)
      const rightX = item.x2 - headLength * Math.cos(angle + Math.PI / 6)
      const rightY = item.y2 - headLength * Math.sin(angle + Math.PI / 6)
      return `<g><line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" stroke="${escapeHtml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" /><path d="M ${item.x2} ${item.y2} L ${leftX} ${leftY} M ${item.x2} ${item.y2} L ${rightX} ${rightY}" fill="none" stroke="${escapeHtml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" /></g>`
    }

    return `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" stroke="${escapeHtml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" />`
  }

  if (item.tool === 'text') {
    const centerX = item.x + ((item.width || 180) / 2)
    const centerY = item.y + ((item.height || item.fontSize || 24) / 2)
    return `<text x="${item.x}" y="${item.y + item.fontSize}" fill="${escapeHtml(stroke)}" font-size="${item.fontSize}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Courier New, monospace" transform="rotate(${((item.rotation || 0) * 180) / Math.PI} ${centerX} ${centerY})">${escapeHtml(item.text || '')}</text>`
  }

  if (item.tool === 'image') {
    const centerX = item.x + ((item.width || 240) / 2)
    const centerY = item.y + ((item.height || 180) / 2)
    return `<image href="${escapeHtml(item.src)}" x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" preserveAspectRatio="none" transform="rotate(${((item.rotation || 0) * 180) / Math.PI} ${centerX} ${centerY})" />`
  }

  const left = Math.min(item.x1, item.x2)
  const top = Math.min(item.y1, item.y2)
  const width = Math.abs(item.x2 - item.x1)
  const height = Math.abs(item.y2 - item.y1)

  if (item.tool === 'rect') {
    return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${escapeHtml(item.fill || 'none')}" stroke="${escapeHtml(stroke)}" stroke-width="${strokeWidth}" rx="4" ry="4" transform="rotate(${((item.rotation || 0) * 180) / Math.PI} ${left + (width / 2)} ${top + (height / 2)})" />`
  }

  if (item.tool === 'ellipse') {
    return `<ellipse cx="${left + (width / 2)}" cy="${top + (height / 2)}" rx="${width / 2}" ry="${height / 2}" fill="${escapeHtml(item.fill || 'none')}" stroke="${escapeHtml(stroke)}" stroke-width="${strokeWidth}" transform="rotate(${((item.rotation || 0) * 180) / Math.PI} ${left + (width / 2)} ${top + (height / 2)})" />`
  }

  return ''
}

export function buildSketchSvgMarkup(value) {
  const document = normalizeSketchDocument(value)
  if ((document.engine === 'tldraw' || document.engine === 'excalidraw') && document.previewDataUrl) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${document.width} ${document.height}" width="${document.width}" height="${document.height}"><image href="${escapeHtml(document.previewDataUrl)}" x="0" y="0" width="${document.width}" height="${document.height}" preserveAspectRatio="xMidYMid meet" /></svg>`
  }
  const body = document.items.map((item) => buildShapeMarkup(item)).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${document.width} ${document.height}" width="${document.width}" height="${document.height}"><rect width="${document.width}" height="${document.height}" fill="${escapeHtml(document.background)}" />${body}</svg>`
}

export function buildSketchSvgDataUrl(value) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSketchSvgMarkup(value))}`
}

export function drawSketchDocumentToCanvas(canvas, value) {
  if (!canvas) return
  const document = normalizeSketchDocument(value)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = document.width
  canvas.height = document.height
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = document.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

   if ((document.engine === 'tldraw' || document.engine === 'excalidraw') && document.previewDataUrl) {
    const image = new Image()
    image.onload = () => {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = document.background
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      } catch {
        // noop
      }
    }
    image.src = document.previewDataUrl
    return
  }

  document.items.forEach((item) => {
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = item.size
    ctx.strokeStyle = item.tool === 'eraser' ? document.background : item.color
    ctx.fillStyle = item.fill && item.fill !== 'none' ? item.fill : 'transparent'

    if (item.tool === 'text') {
      const width = item.width || 180
      const height = item.height || item.fontSize || 24
      ctx.translate(item.x + (width / 2), item.y + (height / 2))
      ctx.rotate(item.rotation || 0)
      ctx.font = `${item.fontSize || 24}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Courier New, monospace`
      ctx.fillStyle = item.color || '#111827'
      ctx.textBaseline = 'top'
      ctx.fillText(item.text || '', -(width / 2), -(height / 2))
      ctx.restore()
      return
    }

    if (item.tool === 'image') {
      const image = new Image()
      image.onload = () => {
        try {
          drawSketchDocumentToCanvas(canvas, document)
        } catch {
          // noop
        }
      }
      image.src = item.src
      if (image.complete) {
        ctx.translate(item.x + ((item.width || 240) / 2), item.y + ((item.height || 180) / 2))
        ctx.rotate(item.rotation || 0)
        ctx.drawImage(image, -((item.width || 240) / 2), -((item.height || 180) / 2), item.width, item.height)
      }
      ctx.restore()
      return
    }

    if (item.tool === 'pen' || item.tool === 'eraser') {
      ctx.beginPath()
      ctx.moveTo(item.points[0].x, item.points[0].y)
      if (item.points.length === 1) {
        ctx.lineTo(item.points[0].x + 0.01, item.points[0].y + 0.01)
      } else {
        item.points.slice(1).forEach((point) => {
          ctx.lineTo(point.x, point.y)
        })
      }
      ctx.stroke()
      ctx.restore()
      return
    }

    if (item.tool === 'line' || item.tool === 'arrow') {
      ctx.beginPath()
      ctx.moveTo(item.x1, item.y1)
      ctx.lineTo(item.x2, item.y2)
      ctx.stroke()
      if (item.tool === 'arrow') {
        const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1)
        const headLength = Math.max(10, item.size * 3)
        ctx.beginPath()
        ctx.moveTo(item.x2, item.y2)
        ctx.lineTo(
        item.x2 - headLength * Math.cos(angle - Math.PI / 6),
        item.y2 - headLength * Math.sin(angle - Math.PI / 6)
      )
      ctx.moveTo(item.x2, item.y2)
      ctx.lineTo(
        item.x2 - headLength * Math.cos(angle + Math.PI / 6),
        item.y2 - headLength * Math.sin(angle + Math.PI / 6)
      )
        ctx.stroke()
      }
      ctx.restore()
      return
    }

    const left = Math.min(item.x1, item.x2)
    const top = Math.min(item.y1, item.y2)
    const width = Math.abs(item.x2 - item.x1)
    const height = Math.abs(item.y2 - item.y1)

    if (item.tool === 'rect') {
      const centerX = left + (width / 2)
      const centerY = top + (height / 2)
      ctx.translate(centerX, centerY)
      ctx.rotate(item.rotation || 0)
      if (item.fill && item.fill !== 'none') {
        ctx.fillRect(-(width / 2), -(height / 2), width, height)
      }
      ctx.strokeRect(-(width / 2), -(height / 2), width, height)
      ctx.restore()
      return
    }

    if (item.tool === 'ellipse') {
      ctx.translate(left + (width / 2), top + (height / 2))
      ctx.rotate(item.rotation || 0)
      ctx.beginPath()
      ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2)
      if (item.fill && item.fill !== 'none') {
        ctx.fill()
      }
      ctx.stroke()
    }

    ctx.restore()
  })
}

export function getSketchItemBounds(item) {
  if (!item) return null

  if (item.tool === 'pen' || item.tool === 'eraser') {
    const xs = item.points.map((point) => point.x)
    const ys = item.points.map((point) => point.y)
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    }
  }

  if (item.tool === 'text') {
    const corners = getRotatedBoxCorners(item.x, item.y, item.width || 180, item.height || item.fontSize || 24, item.rotation || 0)
    return {
      left: Math.min(...corners.map((point) => point.x)),
      top: Math.min(...corners.map((point) => point.y)),
      right: Math.max(...corners.map((point) => point.x)),
      bottom: Math.max(...corners.map((point) => point.y)),
    }
  }

  if (item.tool === 'image') {
    const corners = getRotatedBoxCorners(item.x, item.y, item.width || 240, item.height || 180, item.rotation || 0)
    return {
      left: Math.min(...corners.map((point) => point.x)),
      top: Math.min(...corners.map((point) => point.y)),
      right: Math.max(...corners.map((point) => point.x)),
      bottom: Math.max(...corners.map((point) => point.y)),
    }
  }

  if (item.tool === 'rect' || item.tool === 'ellipse') {
    const left = Math.min(item.x1, item.x2)
    const top = Math.min(item.y1, item.y2)
    const width = Math.abs(item.x2 - item.x1)
    const height = Math.abs(item.y2 - item.y1)
    const corners = getRotatedBoxCorners(left, top, width, height, item.rotation || 0)
    return {
      left: Math.min(...corners.map((point) => point.x)),
      top: Math.min(...corners.map((point) => point.y)),
      right: Math.max(...corners.map((point) => point.x)),
      bottom: Math.max(...corners.map((point) => point.y)),
    }
  }

  return {
    left: Math.min(item.x1, item.x2),
    top: Math.min(item.y1, item.y2),
    right: Math.max(item.x1, item.x2),
    bottom: Math.max(item.y1, item.y2),
  }
}

function distancePointToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y)
  }

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / ((dx * dx) + (dy * dy))))
  const projection = {
    x: a.x + t * dx,
    y: a.y + t * dy,
  }

  return Math.hypot(point.x - projection.x, point.y - projection.y)
}

export function hitTestSketchItem(item, point) {
  if (!item || !point) return false
  if (item.locked) return false

  if (item.tool === 'pen' || item.tool === 'eraser') {
    for (let index = 1; index < item.points.length; index += 1) {
      if (distancePointToSegment(point, item.points[index - 1], item.points[index]) <= Math.max(HIT_PADDING, item.size + 4)) {
        return true
      }
    }
    return item.points.length === 1
      ? Math.hypot(point.x - item.points[0].x, point.y - item.points[0].y) <= Math.max(HIT_PADDING, item.size + 4)
      : false
  }

  if (item.tool === 'line' || item.tool === 'arrow') {
    return distancePointToSegment(point, { x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }) <= Math.max(HIT_PADDING, item.size + 4)
  }

  if (item.tool === 'text') {
    const bounds = getSketchItemBounds(item)
    return (
      point.x >= bounds.left - HIT_PADDING
      && point.x <= bounds.right + HIT_PADDING
      && point.y >= bounds.top - HIT_PADDING
      && point.y <= bounds.bottom + HIT_PADDING
    )
  }

  const bounds = getSketchItemBounds(item)
  if (!bounds) return false

  return (
    point.x >= bounds.left - HIT_PADDING
    && point.x <= bounds.right + HIT_PADDING
    && point.y >= bounds.top - HIT_PADDING
    && point.y <= bounds.bottom + HIT_PADDING
  )
}

export function moveSketchItem(item, deltaX, deltaY) {
  if (!item) return item

  if (item.tool === 'pen' || item.tool === 'eraser') {
    return {
      ...item,
      points: item.points.map((point) => ({
        x: point.x + deltaX,
        y: point.y + deltaY,
      })),
    }
  }

  if (item.tool === 'text') {
    return {
      ...item,
      x: item.x + deltaX,
      y: item.y + deltaY,
    }
  }

  if (item.tool === 'image') {
    return {
      ...item,
      x: item.x + deltaX,
      y: item.y + deltaY,
    }
  }

  return {
    ...item,
    x1: item.x1 + deltaX,
    y1: item.y1 + deltaY,
    x2: item.x2 + deltaX,
    y2: item.y2 + deltaY,
  }
}

export function getCombinedSketchBounds(items) {
  const validBounds = (Array.isArray(items) ? items : [])
    .map((item) => getSketchItemBounds(item))
    .filter(Boolean)

  if (!validBounds.length) return null

  return {
    left: Math.min(...validBounds.map((bounds) => bounds.left)),
    top: Math.min(...validBounds.map((bounds) => bounds.top)),
    right: Math.max(...validBounds.map((bounds) => bounds.right)),
    bottom: Math.max(...validBounds.map((bounds) => bounds.bottom)),
  }
}

export function scaleSketchItem(item, sourceBounds, targetBounds) {
  if (!item || !sourceBounds || !targetBounds) return item

  const sourceWidth = Math.max(1, sourceBounds.right - sourceBounds.left)
  const sourceHeight = Math.max(1, sourceBounds.bottom - sourceBounds.top)
  const targetWidth = Math.max(1, targetBounds.right - targetBounds.left)
  const targetHeight = Math.max(1, targetBounds.bottom - targetBounds.top)
  const scaleX = targetWidth / sourceWidth
  const scaleY = targetHeight / sourceHeight

  const projectX = (value) => targetBounds.left + ((value - sourceBounds.left) * scaleX)
  const projectY = (value) => targetBounds.top + ((value - sourceBounds.top) * scaleY)

  if (item.tool === 'pen' || item.tool === 'eraser') {
    return {
      ...item,
      points: item.points.map((point) => ({
        x: projectX(point.x),
        y: projectY(point.y),
      })),
      size: Math.max(1, item.size * ((scaleX + scaleY) / 2)),
    }
  }

  if (item.tool === 'text') {
    return {
      ...item,
      x: projectX(item.x),
      y: projectY(item.y),
      width: Math.max(40, (item.width || 180) * scaleX),
      height: Math.max(20, (item.height || item.fontSize || 24) * scaleY),
      fontSize: Math.max(12, (item.fontSize || 24) * ((scaleX + scaleY) / 2)),
    }
  }

  if (item.tool === 'image') {
    return {
      ...item,
      x: projectX(item.x),
      y: projectY(item.y),
      width: Math.max(24, (item.width || 240) * scaleX),
      height: Math.max(24, (item.height || 180) * scaleY),
    }
  }

  return {
    ...item,
    x1: projectX(item.x1),
    y1: projectY(item.y1),
    x2: projectX(item.x2),
    y2: projectY(item.y2),
    size: Math.max(1, item.size * ((scaleX + scaleY) / 2)),
  }
}

export function rotateSketchItem(item, angleDelta, center) {
  if (!item || !Number.isFinite(angleDelta) || !center) return item

  if (item.tool === 'pen' || item.tool === 'eraser') {
    return {
      ...item,
      points: item.points.map((point) => rotatePoint(point, center, angleDelta)),
    }
  }

  if (item.tool === 'line' || item.tool === 'arrow') {
    const start = rotatePoint({ x: item.x1, y: item.y1 }, center, angleDelta)
    const end = rotatePoint({ x: item.x2, y: item.y2 }, center, angleDelta)
    return {
      ...item,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    }
  }

  if (item.tool === 'text') {
    const width = item.width || 180
    const height = item.height || item.fontSize || 24
    const itemCenter = rotatePoint({ x: item.x + (width / 2), y: item.y + (height / 2) }, center, angleDelta)
    return {
      ...item,
      x: itemCenter.x - (width / 2),
      y: itemCenter.y - (height / 2),
      rotation: (item.rotation || 0) + angleDelta,
    }
  }

  if (item.tool === 'image') {
    const width = item.width || 240
    const height = item.height || 180
    const itemCenter = rotatePoint({ x: item.x + (width / 2), y: item.y + (height / 2) }, center, angleDelta)
    return {
      ...item,
      x: itemCenter.x - (width / 2),
      y: itemCenter.y - (height / 2),
      rotation: (item.rotation || 0) + angleDelta,
    }
  }

  if (item.tool === 'rect' || item.tool === 'ellipse') {
    const left = Math.min(item.x1, item.x2)
    const top = Math.min(item.y1, item.y2)
    const width = Math.abs(item.x2 - item.x1)
    const height = Math.abs(item.y2 - item.y1)
    const itemCenter = rotatePoint({ x: left + (width / 2), y: top + (height / 2) }, center, angleDelta)
    return {
      ...item,
      x1: itemCenter.x - (width / 2),
      y1: itemCenter.y - (height / 2),
      x2: itemCenter.x + (width / 2),
      y2: itemCenter.y + (height / 2),
      rotation: (item.rotation || 0) + angleDelta,
    }
  }

  return item
}

export function resizeSketchItem(item, nextRight, nextBottom) {
  if (!item) return item

  if (item.tool === 'text') {
    const bounds = getSketchItemBounds(item)
    const width = Math.max(60, nextRight - bounds.left)
    const height = Math.max(24, nextBottom - bounds.top)
    return {
      ...item,
      width,
      height,
      fontSize: Math.max(12, Math.round(height * 0.75)),
    }
  }

  if (item.tool === 'image') {
    const bounds = getSketchItemBounds(item)
    return {
      ...item,
      width: Math.max(24, nextRight - bounds.left),
      height: Math.max(24, nextBottom - bounds.top),
    }
  }

  if (item.tool === 'pen' || item.tool === 'eraser') {
    return item
  }

  return {
    ...item,
    x2: nextRight,
    y2: nextBottom,
  }
}

export function findTopSketchItemAtPoint(document, point) {
  const items = Array.isArray(document?.items) ? document.items : []
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (hitTestSketchItem(items[index], point)) {
      return { item: items[index], index }
    }
  }
  return null
}

function normalizeRect(rect) {
  if (!rect) return null
  const left = Math.min(Number(rect.x1) || 0, Number(rect.x2) || 0)
  const right = Math.max(Number(rect.x1) || 0, Number(rect.x2) || 0)
  const top = Math.min(Number(rect.y1) || 0, Number(rect.y2) || 0)
  const bottom = Math.max(Number(rect.y1) || 0, Number(rect.y2) || 0)
  return { left, right, top, bottom }
}

function rectIntersectsBounds(rect, bounds) {
  if (!rect || !bounds) return false
  return !(
    bounds.right < rect.left
    || bounds.left > rect.right
    || bounds.bottom < rect.top
    || bounds.top > rect.bottom
  )
}

function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < (((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9)) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

function getSelectionProbePoints(item) {
  if (!item) return []

  if (item.tool === 'pen' || item.tool === 'eraser') {
    if (item.points.length <= 8) return item.points
    const step = Math.max(1, Math.floor(item.points.length / 8))
    return item.points.filter((_, index) => index % step === 0 || index === item.points.length - 1)
  }

  if (item.tool === 'line' || item.tool === 'arrow') {
    return [
      { x: item.x1, y: item.y1 },
      { x: item.x2, y: item.y2 },
      { x: (item.x1 + item.x2) / 2, y: (item.y1 + item.y2) / 2 },
    ]
  }

  const bounds = getSketchItemBounds(item)
  if (!bounds) return []
  return [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.left, y: bounds.bottom },
    { x: bounds.right, y: bounds.bottom },
    { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
  ]
}

function isBoundsContainedInPolygon(bounds, polygon) {
  if (!bounds || !Array.isArray(polygon) || polygon.length < 3) return false
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.left, y: bounds.bottom },
    { x: bounds.right, y: bounds.bottom },
  ]
  return corners.every((point) => pointInPolygon(point, polygon))
}

function getPointContainmentRatio(points, polygon) {
  const safePoints = Array.isArray(points) ? points : []
  if (!safePoints.length || !Array.isArray(polygon) || polygon.length < 3) return 0
  const insideCount = safePoints.filter((point) => pointInPolygon(point, polygon)).length
  return insideCount / safePoints.length
}

export function findSketchItemsInRect(document, rect) {
  const normalizedRect = normalizeRect(rect)
  const items = Array.isArray(document?.items) ? document.items : []
  if (!normalizedRect) return []
  return items.filter((item) => !item?.locked && rectIntersectsBounds(normalizedRect, getSketchItemBounds(item)))
}

export function findSketchItemsInLasso(document, polygon) {
  const items = Array.isArray(document?.items) ? document.items : []
  if (!Array.isArray(polygon) || polygon.length < 3) return []
  return items.filter((item) => {
    if (!item) return false
    if (item.locked) return false

    if (item.tool === 'pen' || item.tool === 'eraser') {
      const containmentRatio = getPointContainmentRatio(item.points, polygon)
      return containmentRatio >= 0.85
    }

    if (item.tool === 'line' || item.tool === 'arrow') {
      const probePoints = getSelectionProbePoints(item)
      return probePoints.every((point) => pointInPolygon(point, polygon))
    }

    return isBoundsContainedInPolygon(getSketchItemBounds(item), polygon)
  })
}
