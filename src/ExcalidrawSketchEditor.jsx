import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import '@excalidraw/excalidraw/index.css'

import { buildSketchSvgDataUrl, normalizeSketchDocument, SKETCH_HEIGHT, SKETCH_WIDTH } from './lib/editableSketch'

const Excalidraw = lazy(async () => {
  const mod = await import('@excalidraw/excalidraw')
  return { default: mod.Excalidraw }
})

function buildPreviewDataUrl(svgElement) {
  if (!svgElement || typeof XMLSerializer === 'undefined') return ''
  const markup = new XMLSerializer().serializeToString(svgElement)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

function buildInitialData(document) {
  if (document.engine === 'excalidraw') {
    return {
      elements: document.excalidrawElements || [],
      appState: {
        viewBackgroundColor: document.background || '#ffffff',
        ...(document.excalidrawAppState || {}),
      },
      files: document.excalidrawFiles || {},
      scrollToContent: true,
    }
  }

  return {
    elements: [],
    appState: {
      viewBackgroundColor: document.background || '#ffffff',
    },
    files: {},
    scrollToContent: true,
  }
}

export default function ExcalidrawSketchEditor({
  initialDocument,
  onApiChange,
}) {
  const safeDocument = useMemo(() => normalizeSketchDocument(initialDocument), [initialDocument])
  const apiRef = useRef(null)
  const latestSceneRef = useRef({
    elements: safeDocument.excalidrawElements || [],
    appState: safeDocument.excalidrawAppState || { viewBackgroundColor: safeDocument.background || '#ffffff' },
    files: safeDocument.excalidrawFiles || {},
  })

  useEffect(() => {
    latestSceneRef.current = {
      elements: safeDocument.excalidrawElements || [],
      appState: safeDocument.excalidrawAppState || { viewBackgroundColor: safeDocument.background || '#ffffff' },
      files: safeDocument.excalidrawFiles || {},
    }
  }, [safeDocument])

  const exportDocument = useCallback(async () => {
    const api = apiRef.current
    const elements = api?.getSceneElements?.() || latestSceneRef.current.elements || []
    const appState = api?.getAppState?.() || latestSceneRef.current.appState || {}
    const files = api?.getFiles?.() || latestSceneRef.current.files || {}

    let previewDataUrl = ''
    let width = safeDocument.width || SKETCH_WIDTH
    let height = safeDocument.height || SKETCH_HEIGHT

    if (elements.length) {
      const { exportToSvg } = await import('@excalidraw/excalidraw')
      const svg = await exportToSvg({
        elements,
        appState: {
          ...appState,
          exportBackground: true,
          viewBackgroundColor: appState.viewBackgroundColor || safeDocument.background || '#ffffff',
        },
        files,
      })
      previewDataUrl = buildPreviewDataUrl(svg)
      const svgBounds = svg?.viewBox?.baseVal
      if (svgBounds) {
        width = Math.max(1, Math.ceil(svgBounds.width || width))
        height = Math.max(1, Math.ceil(svgBounds.height || height))
      }
    }

    if (!previewDataUrl) {
      previewDataUrl = buildSketchSvgDataUrl({
        ...safeDocument,
        engine: 'excalidraw',
        previewDataUrl: '',
        excalidrawElements: [],
        excalidrawAppState: null,
        excalidrawFiles: null,
      })
    }

    return normalizeSketchDocument({
      ...safeDocument,
      engine: 'excalidraw',
      width,
      height,
      items: [],
      excalidrawElements: elements,
      excalidrawAppState: appState,
      excalidrawFiles: files,
      previewDataUrl,
    })
  }, [safeDocument])

  useEffect(() => {
    if (!onApiChange) return undefined
    onApiChange({ exportDocument })
    return () => onApiChange(null)
  }, [exportDocument, onApiChange])

  const initialData = useMemo(() => buildInitialData(safeDocument), [safeDocument])

  return (
    <div className="rt-excalidraw-shell">
      <Suspense fallback={<div className="rt-tldraw-shell rt-tldraw-loading">Loading Excalidraw...</div>}>
        <Excalidraw
          initialData={initialData}
          excalidrawAPI={(api) => {
            apiRef.current = api
          }}
          onChange={(elements, appState, files) => {
            latestSceneRef.current = { elements, appState, files }
          }}
          autoFocus={false}
          theme="light"
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              saveAsImage: false,
            },
          }}
        />
      </Suspense>
    </div>
  )
}
