import { NodeViewWrapper } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

import { MathfieldElement } from 'mathlive'
import 'mathlive/static.css'

function renderLatex(latex) {
  try {
    return katex.renderToString(latex || '', { throwOnError: false })
  } catch {
    return latex || ''
  }
}

export default function MathInlineView({ node, updateAttributes }) {
  const latex = node.attrs.latex || '\\sqrt{x}'
  const [open, setOpen] = useState(false)
  const hostRef = useRef(null)

  // Render KaTeX dentro del chip
  useEffect(() => {
    if (!hostRef.current) return
    hostRef.current.innerHTML = renderLatex(latex)
  }, [latex])

  // Modal MathLive
  const mfHostRef = useRef(null)
  const mfRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (!mfHostRef.current) return

    const mf = new MathfieldElement()
    mfRef.current = mf

    // Teclado manual = más estable en modales
    mf.setOptions({
      virtualKeyboardMode: 'manual',
      smartFence: true,
      smartSuperscript: true,
    })

    mf.style.width = '100%'
    mf.style.fontSize = '22px'
    mf.value = latex

    mfHostRef.current.appendChild(mf)

    // Enfoca y muestra teclado
    setTimeout(() => {
      try {
        mf.focus()
        mf.executeCommand('showVirtualKeyboard')
      } catch {}
    }, 0)

    return () => {
      try { mf.executeCommand('hideVirtualKeyboard') } catch {}
      try { mfHostRef.current?.removeChild(mf) } catch {}
      mfRef.current = null
    }
  }, [open, latex])

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeModal(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const closeModal = (save) => {
    const mf = mfRef.current

    if (save && mf) {
      const nextLatex = (mf.getValue('latex') || '').trim()
      updateAttributes({ latex: nextLatex || latex })
    }

    // Ocultar teclado siempre al cerrar
    try { mf?.executeCommand('hideVirtualKeyboard') } catch {}
    setOpen(false)
  }

  return (
    <>
      <NodeViewWrapper
        as="span"
        className="math-inline-node"
        title="Click para editar fórmula"
        onMouseDown={(e) => {
          // evita que Tiptap/ProseMirror robe el foco
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        style={{ display: 'inline-block' }}
      >
        <span ref={hostRef} />
      </NodeViewWrapper>

      {open && (
        <div
          className="math-modal-backdrop"
          // IMPORTANTÍSIMO: no dejar que el backdrop capture mousedown/click y afecte foco
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          <div
            className="math-modal"
            // Bloquea eventos para que no se “propaguen” al backdrop
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          >
            {/* Botón X */}
            <button
              type="button"
              className="math-close"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); closeModal(false) }}
              aria-label="Cerrar"
            >
              ✕
            </button>

            <div className="math-modal-title">Editar fórmula</div>

            <div
              ref={mfHostRef}
              className="mathfield-host"
              // evita que clicks en el host se propaguen
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
            />

            <div className="math-modal-actions">
              <button
                type="button"
                className="rt-btn"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); closeModal(true) }}
              >
                Guardar
              </button>

              <button
                type="button"
                className="rt-btn"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); closeModal(false) }}
              >
                Cancelar
              </button>
            </div>

            <div className="math-hint">
              Tip: usa la botonera MathLive. Escape cierra el editor.
            </div>
          </div>
        </div>
      )}
    </>
  )
}