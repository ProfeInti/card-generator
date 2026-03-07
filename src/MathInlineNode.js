import { mergeAttributes, Node } from '@tiptap/core'
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
      latex: {
        default: '\\frac{a}{b}',
        parseHTML: (el) => el.getAttribute('data-latex') || '\\frac{a}{b}',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex || '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' }), '']
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView)
  },
})

export default MathInlineNode
