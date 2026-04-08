import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildSketchSvgDataUrl, deserializeSketchDocument, serializeSketchDocument } from './lib/editableSketch'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function EditableSketchView(props) {
  const { node, updateAttributes, selected, editor, getPos, deleteNode } = props
  const wrapperRef = useRef(null)
  const imageRef = useRef(null)
  const [isResizing, setIsResizing] = useState(false)

  const width = node.attrs.width ?? null
  const align = node.attrs.align ?? 'center'
  const document = useMemo(() => deserializeSketchDocument(node.attrs.sketch), [node.attrs.sketch])
  const imageSrc = useMemo(() => buildSketchSvgDataUrl(document), [document])
  const justify = useMemo(() => {
    if (align === 'left') return 'flex-start'
    if (align === 'right') return 'flex-end'
    return 'center'
  }, [align])

  useEffect(() => {
    const image = imageRef.current
    if (!image) return
    const onLoad = () => {
      if (node.attrs.width == null) {
        updateAttributes({ width: clamp(image.naturalWidth || 360, 180, 720) })
      }
    }
    image.addEventListener('load', onLoad)
    return () => image.removeEventListener('load', onLoad)
  }, [imageSrc, node.attrs.width, updateAttributes])

  const startResize = (event) => {
    event.preventDefault()
    event.stopPropagation()
    editor?.commands?.focus()

    const startX = event.clientX
    const startWidth = imageRef.current?.getBoundingClientRect().width || 320
    setIsResizing(true)

    const onMove = (moveEvent) => {
      moveEvent.preventDefault()
      updateAttributes({ width: clamp(Math.round(startWidth + (moveEvent.clientX - startX)), 180, 720) })
    }

    const onUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const selectCurrentNode = (event) => {
    if (typeof getPos !== 'function' || !editor?.view) return
    const pos = getPos()
    if (!Number.isInteger(pos)) return
    event.preventDefault()
    event.stopPropagation()
    const { state, dispatch } = editor.view
    dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
    editor.commands.focus()
  }

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={[
        'rt-img-wrap',
        'rt-sketch-node-wrap',
        selected ? 'is-selected' : '',
        isResizing ? 'is-resizing' : '',
      ].join(' ')}
      data-align={align}
      style={{ justifyContent: justify }}
      onMouseDown={selectCurrentNode}
    >
      <div className="rt-img-inner rt-sketch-node-inner" style={{ width: width ? `${width}px` : 'auto' }}>
        <img
          ref={imageRef}
          className="rt-img rt-sketch-node-image"
          src={imageSrc}
          alt=""
          draggable={false}
          onClick={selectCurrentNode}
        />
        {selected && (
          <button
            type="button"
            className="rt-btn"
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              zIndex: 3,
            }}
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              deleteNode?.()
            }}
            aria-label="Delete sketch"
            title="Delete sketch"
          >
            Delete
          </button>
        )}
        {(selected || isResizing) && (
          <button
            type="button"
            className="rt-img-handle br"
            onMouseDown={startResize}
            aria-label="Resize sketch"
            tabIndex={-1}
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}

const EditableSketchNode = Node.create({
  name: 'editableSketch',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      sketch: {
        default: serializeSketchDocument(null),
        parseHTML: (element) => element.getAttribute('data-sketch') || serializeSketchDocument(null),
        renderHTML: (attributes) => ({ 'data-sketch': attributes.sketch || serializeSketchDocument(null) }),
      },
      width: {
        default: 360,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-width')
          const value = Number(raw)
          return Number.isFinite(value) ? value : 360
        },
        renderHTML: (attributes) => ({ 'data-width': attributes.width || 360 }),
      },
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes) => ({ 'data-align': attributes.align || 'center' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="editable-sketch"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'editable-sketch' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditableSketchView)
  },
})

export default EditableSketchNode
