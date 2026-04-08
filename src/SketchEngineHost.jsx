import { lazy, Suspense } from 'react'

import LegacySketchCanvas from './LegacySketchCanvas'

const ExcalidrawSketchEditor = lazy(() => import('./ExcalidrawSketchEditor'))
const KonvaSketchEditor = lazy(() => import('./KonvaSketchEditor'))
const TldrawSketchEditor = lazy(() => import('./TldrawSketchEditor'))

export default function SketchEngineHost({
  excalidrawProps = null,
  engine = 'legacy',
  legacyProps = null,
  konvaProps = null,
  tldrawProps = null,
}) {
  if (engine === 'excalidraw') {
    return (
      <Suspense fallback={<div className="rt-tldraw-shell rt-tldraw-loading">Loading Excalidraw...</div>}>
        <ExcalidrawSketchEditor {...excalidrawProps} />
      </Suspense>
    )
  }

  if (engine === 'konva') {
    return (
      <Suspense fallback={<div className="rt-tldraw-shell rt-tldraw-loading">Loading sketch tools...</div>}>
        <KonvaSketchEditor {...konvaProps} />
      </Suspense>
    )
  }

  if (engine === 'tldraw') {
    return (
      <Suspense fallback={<div className="rt-tldraw-shell rt-tldraw-loading">Loading tldraw...</div>}>
        <TldrawSketchEditor {...tldrawProps} />
      </Suspense>
    )
  }

  return <LegacySketchCanvas {...legacyProps} />
}
