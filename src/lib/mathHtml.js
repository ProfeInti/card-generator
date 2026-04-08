import katex from 'katex'
import { buildSketchSvgDataUrl, deserializeSketchDocument } from './editableSketch'

export function renderMathInHtml(html) {
  const raw = typeof html === 'string' ? html : ''

  if (typeof window === 'undefined') return raw

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')

  const nodes = doc.querySelectorAll('span[data-type="math-inline"]')
  nodes.forEach((el) => {
    const latex = el.getAttribute('data-latex') || ''
    try {
      el.innerHTML = katex.renderToString(latex, { throwOnError: false })
    } catch {
      el.textContent = latex
    }
  })

  const sketchNodes = doc.querySelectorAll('div[data-type="editable-sketch"]')
  sketchNodes.forEach((el) => {
    const sketch = el.getAttribute('data-sketch') || ''
    const width = Number(el.getAttribute('data-width') || 360)
    const documentModel = deserializeSketchDocument(sketch)
    const img = doc.createElement('img')
    img.setAttribute('src', buildSketchSvgDataUrl(documentModel))
    img.setAttribute('alt', 'Editable sketch')
    img.setAttribute('style', `width:${Number.isFinite(width) ? width : 360}px;height:auto;display:block;max-width:100%;background:#ffffff;border:1px solid #2a2a2a;border-radius:10px;`)
    el.innerHTML = ''
    el.appendChild(img)
  })

  return doc.body.innerHTML
}

export function extractTextFromHtml(html) {
  const raw = typeof html === 'string' ? html : ''

  if (typeof window === 'undefined') {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

export function hasMeaningfulHtmlContent(html) {
  const raw = typeof html === 'string' ? html : ''
  if (!raw.trim()) return false

  if (extractTextFromHtml(raw)) return true

  if (typeof window === 'undefined') {
    return /<(img|table)\b|data-type="math-inline"|data-type="editable-sketch"/i.test(raw)
  }

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  return Boolean(doc.body.querySelector('img, table, [data-type="math-inline"], [data-type="editable-sketch"]'))
}

export function isLikelyHtml(value) {
  if (typeof value !== 'string') return false
  return /<[^>]+>/.test(value)
}

export function normalizeMathHtmlInput(value) {
  if (!value) return ''
  const raw = String(value)
  if (isLikelyHtml(raw)) return raw

  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`
}
