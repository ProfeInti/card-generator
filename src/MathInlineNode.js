import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import MathInlineView from './MathInlineView'

const MathInlineNode = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: '\\frac{a}{b}' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Guardamos el LaTeX en data-latex para poder renderizar también en la “carta”
    return [
      'span',
      {
        'data-type': 'math-inline',
        'data-latex': HTMLAttributes.latex || '',
      },
      '' // el contenido visible lo renderiza el NodeView (MathLive) en el editor
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView)
  },
})

export default MathInlineNode