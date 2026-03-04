import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState } from 'react'

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function ResizableImageView(props) {
  const { node, updateAttributes, selected, editor } = props

  const wrapperRef = useRef(null)
  const imgRef = useRef(null)

  const src = node.attrs.src || ''
  const width = node.attrs.width ?? null // px
  const align = node.attrs.align ?? 'center' // left|center|right

  const [isResizing, setIsResizing] = useState(false)

  const justify = useMemo(() => {
    if (align === 'left') return 'flex-start'
    if (align === 'right') return 'flex-end'
    return 'center'
  }, [align])

  // Si no hay width guardado, toma el ancho real cuando cargue (solo una vez)
  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const onLoad = () => {
      if (node.attrs.width == null) {
        // ancho inicial razonable, limitado
        const w = clamp(img.naturalWidth || 320, 120, 520)
        updateAttributes({ width: w })
      }
    }
    img.addEventListener('load', onLoad)
    return () => img.removeEventListener('load', onLoad)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const startResize = (e) => {
    e.preventDefault()
    e.stopPropagation()

    // Importante: mantener selección en el editor
    editor?.commands?.focus()

    const startX = e.clientX
    const startWidth = imgRef.current?.getBoundingClientRect().width || 240

    setIsResizing(true)

    const onMove = (ev) => {
      ev.preventDefault()

      const dx = ev.clientX - startX
      // resize desde esquina derecha: ancho crece con dx
      const next = clamp(Math.round(startWidth + dx), 120, 520)
      updateAttributes({ width: next })
    }

    const onUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={[
        'rt-img-wrap',
        selected ? 'is-selected' : '',
        isResizing ? 'is-resizing' : '',
      ].join(' ')}
      data-align={align}
      style={{ justifyContent: justify }}
    >
      <div className="rt-img-inner" style={{ width: width ? `${width}px` : 'auto' }}>
        <img ref={imgRef} className="rt-img" src={src} alt="" draggable={false} />
        {(selected || isResizing) && (
          <>
            {/* Handle esquina derecha-abajo (suficiente para UX pro) */}
            <button
              type="button"
              className="rt-img-handle br"
              onMouseDown={startResize}
              aria-label="Resize"
              tabIndex={-1}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}

const ResizableImageNode = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null, // px
        parseHTML: (el) => {
          const w = el.getAttribute('data-width') || el.style.width
          if (!w) return null
          const num = parseInt(String(w).replace('px', ''), 10)
          return Number.isFinite(num) ? num : null
        },
        renderHTML: (attrs) => {
          const out = {}
          if (attrs.width) {
            out['data-width'] = String(attrs.width)
            out['style'] = `width:${attrs.width}px;height:auto;`
          }
          return out
        },
      },
      align: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-align') || 'center',
        renderHTML: (attrs) => {
          return { 'data-align': attrs.align || 'center' }
        },
      },
    }
  },

  // Bloque, no inline (mejor para tu carta)
  addOptions() {
    return {
      ...this.parent?.(),
      inline: false,
      allowBase64: true,
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

export default ResizableImageNode