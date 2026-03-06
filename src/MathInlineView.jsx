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

  useEffect(() => {
    if (!hostRef.current) return
    hostRef.current.innerHTML = renderLatex(latex)
  }, [latex])

  const mfHostRef = useRef(null)
  const mfRef = useRef(null)

  useEffect(() => {
    if (!open || !mfHostRef.current) return

    const mf = new MathfieldElement()
    mfRef.current = mf

    mf.setOptions({
      virtualKeyboardMode: 'manual',
      smartFence: true,
      smartSuperscript: true,
    })

    mf.style.width = '100%'
    mf.style.fontSize = '22px'
    mf.value = latex

    mfHostRef.current.appendChild(mf)

    setTimeout(() => {
      try {
        mf.focus()
        mf.executeCommand('showVirtualKeyboard')
      } catch {
        // noop
      }
    }, 0)

    return () => {
      try {
        mf.executeCommand('hideVirtualKeyboard')
      } catch {
        // noop
      }
      try {
        mfHostRef.current?.removeChild(mf)
      } catch {
        // noop
      }
      mfRef.current = null
    }
  }, [open, latex])

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

    try {
      mf?.executeCommand('hideVirtualKeyboard')
    } catch {
      // noop
    }
    setOpen(false)
  }

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

      {open && (
        <div
          className="math-modal-backdrop"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <div
            className="math-modal"
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <button
              type="button"
              className="math-close"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                closeModal(false)
              }}
              aria-label="Close"
            >
              X
            </button>

            <div className="math-modal-title">Edit formula</div>

            <div
              ref={mfHostRef}
              className="mathfield-host"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
            />

            <div className="math-modal-actions">
              <button
                type="button"
                className="rt-btn"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  closeModal(true)
                }}
              >
                Save
              </button>

              <button
                type="button"
                className="rt-btn"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  closeModal(false)
                }}
              >
                Cancel
              </button>
            </div>

            <div className="math-hint">Tip: use the MathLive keypad. Escape closes the editor.</div>
          </div>
        </div>
      )}
    </>
  )
}

