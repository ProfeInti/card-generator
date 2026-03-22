import { NodeViewWrapper } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  if (!mf) return fallback

  try {
    const v = String(mf.value || '').trim()
    if (v) return v
  } catch {
    // noop
  }

  try {
    const v = String(mf.getValue?.('latex') || '').trim()
    if (v) return v
  } catch {
    // noop
  }

  return String(fallback || '').trim()
}

export default function MathInlineView({ node, updateAttributes }) {
  const latex = node.attrs.latex || '\\sqrt{x}'
  const [open, setOpen] = useState(false)
  const hostRef = useRef(null)
  const latestLatexRef = useRef(latex)
  const draftLatexRef = useRef(latex)

  useEffect(() => {
    latestLatexRef.current = latex
    if (!open) {
      draftLatexRef.current = latex
    }
    if (!hostRef.current) return
    hostRef.current.innerHTML = renderLatex(latex)
  }, [latex, open])

  const mfHostRef = useRef(null)
  const mfRef = useRef(null)

  useEffect(() => {
    const hostEl = mfHostRef.current
    if (!open || !hostEl) return

    const mf = new MathfieldElement()
    mfRef.current = mf
    mf.mathVirtualKeyboardPolicy = 'manual'
    mf.smartFence = true
    mf.smartSuperscript = true

    mf.style.width = '100%'
    mf.style.fontSize = '22px'
    mf.value = latestLatexRef.current || ''
    draftLatexRef.current = readLatexSafely(mf, latestLatexRef.current || '')

    const onInput = () => {
      draftLatexRef.current = readLatexSafely(mf, draftLatexRef.current)
    }

    mf.addEventListener('input', onInput)
    hostEl.appendChild(mf)

    setTimeout(() => {
      try {
        mf.focus()
        mf.executeCommand('showVirtualKeyboard')
      } catch {
        // noop
      }
    }, 0)

    return () => {
      hideVirtualKeyboardSafely(mf)
      try {
        mf.removeEventListener('input', onInput)
      } catch {
        // noop
      }
      try {
        hostEl.removeChild(mf)
      } catch {
        // noop
      }
      mfRef.current = null
    }
  }, [open])

  const closeModal = useCallback(() => {
    const mf = mfRef.current

    try {
      hideVirtualKeyboardSafely(mf)
    } finally {
      setOpen(false)
    }
  }, [])

  const handleModalAction = useCallback((event, shouldSave) => {
    event.preventDefault()
    event.stopPropagation()

    if (shouldSave) {
      const mf = mfRef.current
      const fallback = draftLatexRef.current || latestLatexRef.current || latex
      const valueToSave = readLatexSafely(mf, fallback) || fallback

      try {
        updateAttributes({ latex: valueToSave })
        latestLatexRef.current = valueToSave
        draftLatexRef.current = valueToSave
      } catch (error) {
        console.error('Could not save math expression:', error)
        return
      }
    }

    closeModal()
  }, [closeModal, latex, updateAttributes])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeModal()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeModal])

  const modal = open ? (
    <div
      className="math-modal-backdrop"
      onMouseDown={(e) => {
        e.stopPropagation()
      }}
      onClick={(e) => {
        e.stopPropagation()
      }}
    >
      <div
        className="math-modal"
        onMouseDown={(e) => {
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <button
          type="button"
          className="math-close"
          onClick={(e) => handleModalAction(e, false)}
          aria-label="Close"
        >
          X
        </button>

        <div className="math-modal-title">Edit formula</div>

        <div className="math-modal-actions math-modal-actions-top">
          <button
            type="button"
            className="rt-btn"
            onClick={(e) => handleModalAction(e, true)}
          >
            Save
          </button>

          <button
            type="button"
            className="rt-btn"
            onClick={(e) => handleModalAction(e, false)}
          >
            Cancel
          </button>
        </div>

        <div
          ref={mfHostRef}
          className="mathfield-host"
          onMouseDown={(e) => {
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.stopPropagation()
          }}
        />

        <div className="math-hint">Tip: use the MathLive keypad. Escape closes the editor.</div>
      </div>
    </div>
  ) : null

  return (
    <>
      <NodeViewWrapper
        as="span"
        className="math-inline-node"
        title="Click to edit formula"
        onMouseDown={(e) => {
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

      {typeof document !== 'undefined' ? createPortal(modal, document.body) : modal}
    </>
  )
}


