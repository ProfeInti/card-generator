import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'

import MathInlineNode from './MathInlineNode'
import ResizableImageNode from './ResizableImageNode'
import { MathfieldElement } from 'mathlive'
import 'mathlive/static.css'

const SKETCH_WIDTH = 900
const SKETCH_HEIGHT = 420
const SKETCH_COLORS = ['#111827', '#0f766e', '#2563eb', '#7c3aed', '#dc2626', '#ea580c', '#ca8a04', '#ffffff']

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

function drawStroke(ctx, stroke) {
  if (!ctx || !stroke?.points?.length) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = stroke.size
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  ctx.strokeStyle = stroke.color
  ctx.beginPath()
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y)

  if (stroke.points.length === 1) {
    ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01)
  } else {
    stroke.points.slice(1).forEach((point) => {
      ctx.lineTo(point.x, point.y)
    })
  }

  ctx.stroke()
  ctx.restore()
}

function redrawSketchCanvas(canvas, strokes) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ;(Array.isArray(strokes) ? strokes : []).forEach((stroke) => drawStroke(ctx, stroke))
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

export default function DescriptionEditor({ value, onChange, baseFontFamily, baseFontSize, readOnly = false }) {
  const [textColor, setTextColor] = useState('#b6fff0')
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [isSketchOpen, setIsSketchOpen] = useState(false)
  const [sketchColor, setSketchColor] = useState(SKETCH_COLORS[0])
  const [sketchSize, setSketchSize] = useState(4)
  const [sketchTool, setSketchTool] = useState('pen')
  const [sketchStrokes, setSketchStrokes] = useState([])
  const [isMathDialogOpen, setIsMathDialogOpen] = useState(false)
  const fileInputRef = useRef(null)
  const sketchCanvasRef = useRef(null)
  const sketchStrokeRef = useRef(null)
  const mathFieldHostRef = useRef(null)
  const mathFieldRef = useRef(null)
  const mathDraftRef = useRef('\\sin(t)')

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      ResizableImageNode,
      MathInlineNode,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (readOnly || typeof onChange !== 'function') return
      onChange(editor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== value) editor.commands.setContent(value, false)
  }, [value, editor])

  useEffect(() => {
    if (!isSketchOpen) return
    const canvas = sketchCanvasRef.current
    if (!canvas) return
    canvas.width = SKETCH_WIDTH
    canvas.height = SKETCH_HEIGHT
    redrawSketchCanvas(canvas, sketchStrokes)
  }, [isSketchOpen, sketchStrokes])

  const insertMath = (latex) => {
    if (!editor) return
    editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex } }).run()
  }

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
  }, [closeMathDialog, editor])

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

  const insertSketchImage = () => {
    if (!editor || !sketchCanvasRef.current) return
    const src = sketchCanvasRef.current.toDataURL('image/png')
    editor.chain().focus().setImage({ src }).run()
    setIsSketchOpen(false)
    setSketchStrokes([])
    sketchStrokeRef.current = null
  }

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

  const startSketchStroke = (event) => {
    const canvas = sketchCanvasRef.current
    if (!canvas) return
    const firstPoint = buildPoint(event, canvas)
    const nextStroke = {
      tool: sketchTool,
      color: sketchColor,
      size: sketchSize,
      points: [firstPoint],
    }

    sketchStrokeRef.current = nextStroke
    setSketchStrokes((prev) => [...prev, nextStroke])
  }

  const extendSketchStroke = (event) => {
    const canvas = sketchCanvasRef.current
    const activeStroke = sketchStrokeRef.current
    if (!canvas || !activeStroke) return

    const point = buildPoint(event, canvas)
    const nextStroke = {
      ...activeStroke,
      points: [...activeStroke.points, point],
    }

    sketchStrokeRef.current = nextStroke
    setSketchStrokes((prev) => [...prev.slice(0, -1), nextStroke])
  }

  const endSketchStroke = () => {
    sketchStrokeRef.current = null
  }

  const hasSelection = Boolean(editor && !editor.state.selection.empty)

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

  if (!editor) return null

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

          <label className="rt-color">
            <span>Color</span>
            <input
              type="color"
              value={textColor}
              onChange={(e) => {
                const c = e.target.value
                setTextColor(c)
                editor.chain().focus().setColor(c).run()
              }}
            />
          </label>

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
            onClick={() => setIsSketchOpen(true)}
            title="Open sketch pad"
          >
            Sketch
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

          <div className="rt-hint">Tip: use image URL, sketches, uploads, and tables for graph statements and structured data.</div>
        </div>
        )}

        <div
          className={`rt-editor ${readOnly ? 'is-readonly' : ''}`}
          style={{
            fontFamily: baseFontFamily,
            fontSize: `${baseFontSize}px`,
          }}
        >
          <EditorContent editor={editor} />
        </div>

        {!readOnly && isSketchOpen && (
          <div className="rt-sketch-overlay" onClick={() => setIsSketchOpen(false)}>
            <div className="rt-sketch-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="rt-sketch-top">
              <div className="saved-title">Sketch Pad</div>
              <div className="menu-actions wb-inline-actions">
                <button type="button" className="btn" onClick={() => setSketchStrokes((prev) => prev.slice(0, -1))} disabled={!sketchStrokes.length}>
                  Undo Stroke
                </button>
                <button type="button" className="btn" onClick={() => setSketchStrokes([])} disabled={!sketchStrokes.length}>
                  Clear
                </button>
                <button type="button" className="btn" onClick={() => setIsSketchOpen(false)}>
                  Close
                </button>
                <button type="button" className="btn" onClick={insertSketchImage} disabled={!sketchStrokes.length}>
                  Insert Sketch
                </button>
              </div>
            </div>

            <div className="rt-sketch-toolbar">
              <div className="rt-sketch-tool-group">
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
            </div>

            <div className="rt-sketch-stage">
              <canvas
                ref={sketchCanvasRef}
                className="rt-sketch-canvas"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  startSketchStroke(event)
                }}
                onPointerMove={(event) => {
                  if ((event.buttons & 1) !== 1) return
                  extendSketchStroke(event)
                }}
                onPointerUp={(event) => {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                  endSketchStroke()
                }}
                onPointerLeave={() => endSketchStroke()}
              />
            </div>
          </div>
          </div>
        )}
      </div>

      {typeof document !== 'undefined' ? createPortal(mathDialog, document.body) : mathDialog}
    </>
  )
}
