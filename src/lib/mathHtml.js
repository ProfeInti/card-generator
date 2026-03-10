import katex from 'katex'

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
    return /<(img|table)\b|data-type="math-inline"/i.test(raw)
  }

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  return Boolean(doc.body.querySelector('img, table, [data-type="math-inline"]'))
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
