import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'

import MathInlineNode from './MathInlineNode'
import ResizableImageNode from './ResizableImageNode'

export default function DescriptionEditor({ value, onChange, baseFontFamily, baseFontSize }) {
  const [textColor, setTextColor] = useState('#b6fff0')
  const fileInputRef = useRef(null)

  const editor = useEditor({
    extensions: [StarterKit, Underline, TextStyle, Color, ResizableImageNode, MathInlineNode],
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

  const insertImageByUrl = () => {
    if (!editor) return
    const url = window.prompt('Pega la URL de la imagen:')
    if (!url) return
    editor.chain().focus().setImage({ src: url }).run()
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

  if (!editor) return null

  return (
    <div className="rt-wrap">
      <div className="rt-toolbar">
        <button
          type="button"
          className={`rt-btn ${editor.isActive('bold') ? 'is-on' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </button>

        <button
          type="button"
          className={`rt-btn ${editor.isActive('italic') ? 'is-on' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </button>

        <button
          type="button"
          className={`rt-btn ${editor.isActive('underline') ? 'is-on' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
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
          title="Quitar color"
        >
          Quitar color
        </button>

        <div className="rt-sep" />

        <button
          type="button"
          className="rt-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertImageByUrl}
          title="Insertar imagen por URL"
        >
          Img URL
        </button>

        <button
          type="button"
          className="rt-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          title="Subir imagen desde tu PC"
        >
          Subir Img
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

        <div className="rt-hint">Tip: click en imagen - marco + arrastrar esquina. Hasta 2 imagenes por linea.</div>
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
