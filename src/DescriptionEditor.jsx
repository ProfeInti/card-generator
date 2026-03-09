import { useEffect, useRef, useState } from 'react'
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

function toPositiveInt(value, fallback) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return fallback
  return n
}

export default function DescriptionEditor({ value, onChange, baseFontFamily, baseFontSize }) {
  const [textColor, setTextColor] = useState('#b6fff0')
  const [imageUrlInput, setImageUrlInput] = useState('')
  const fileInputRef = useRef(null)

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
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== value) editor.commands.setContent(value, false)
  }, [value, editor])

  const insertMath = (latex) => {
    if (!editor) return
    editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex } }).run()
  }

  const insertImageByUrl = (rawUrl) => {
    if (!editor) return
    const url = String(rawUrl || '').trim()
    if (!url) return
    editor.chain().focus().setImage({ src: url }).run()
    setImageUrlInput('')
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

  const hasSelection = Boolean(editor && !editor.state.selection.empty)

  const toggleInlineMark = (mark) => {
    if (!editor || !hasSelection) return

    if (mark === 'bold') editor.chain().focus().toggleBold().run()
    if (mark === 'italic') editor.chain().focus().toggleItalic().run()
    if (mark === 'underline') editor.chain().focus().toggleUnderline().run()
  }

  if (!editor) return null

  return (
    <div className="rt-wrap">
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
          onClick={() => insertMath('\\sqrt{x}')}
        >
          &radic;
        </button>
        <button
          type="button"
          className="rt-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertMath('\\frac{a}{b}')}
        >
          a/b
        </button>
        <button
          type="button"
          className="rt-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertMath('x^{n}')}
        >
          x^n
        </button>
        <button
          type="button"
          className="rt-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertMath('\\sum_{i=1}^{n} i')}
        >
          &Sigma;
        </button>
        <button
          type="button"
          className="rt-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertMath('\\int_{a}^{b} f(x)\\,dx')}
        >
          &int;
        </button>

        <div className="rt-hint">Tip: use image URL/upload and tables for graph statements and structured data.</div>
      </div>

      <div
        className="rt-editor"
        style={{
          fontFamily: baseFontFamily,
          fontSize: `${baseFontSize}px`,
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}


