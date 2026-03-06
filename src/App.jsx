import { useMemo, useRef, useState } from 'react'
import './App.css'

import frameCommon from './assets/frame-common.png'
import frameRare from './assets/frame-rare.png'
import frameEpic from './assets/frame-epic.png'
import frameLegendary from './assets/frame-legendary.png'
import frameMythic from './assets/frame-mythic.png'

import DescriptionEditor from './DescriptionEditor'

import 'katex/dist/katex.min.css'
import katex from 'katex'

import * as htmlToImage from 'html-to-image'
import jsPDF from 'jspdf'

const FONT_OPTIONS = [
  {
    value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
    label: 'Monospace',
  },
  { value: '"Trebuchet MS", "Segoe UI", sans-serif', label: 'Trebuchet' },
  { value: '"Georgia", "Times New Roman", serif', label: 'Serif' },
  { value: '"Verdana", "Geneva", sans-serif', label: 'Verdana' },
  { value: '"Tahoma", "Geneva", sans-serif', label: 'Tahoma' },
]

const DEFAULTS = {
  titleFontSize: 34,
  descFontSize: 20,
  artTop: 140,
  artLeft: 70,
  artWidth: 466,
  artHeight: 320,
  titleTop: 60,
  descTop: 690,
}

function toNumber(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function decodeUnicodeEscapes(text) {
  if (typeof text !== 'string') return text
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
}

function renderDescriptionMath(html) {
  if (typeof window === 'undefined') return html

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

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

function App() {
  const frames = [
    { id: 'common', label: 'Com\u00fan', src: frameCommon },
    { id: 'rare', label: 'Rara', src: frameRare },
    { id: 'epic', label: '\u00c9pica', src: frameEpic },
    { id: 'legendary', label: 'Legendaria', src: frameLegendary },
    { id: 'mythic', label: 'M\u00edtica', src: frameMythic },
  ]

  const [title, setTitle] = useState('Nombre de la Carta')
  const [titleColor, setTitleColor] = useState('#00ff88')
  const [titleFontFamily, setTitleFontFamily] = useState(FONT_OPTIONS[0].value)
  const [titleFontSize, setTitleFontSize] = useState(DEFAULTS.titleFontSize)

  const [description, setDescription] = useState(
    '<p><span style="color:#b6fff0">Esta es la descripci\u00f3n de la carta.</span></p>'
  )
  const [descFontFamily, setDescFontFamily] = useState(FONT_OPTIONS[0].value)
  const [descFontSize, setDescFontSize] = useState(DEFAULTS.descFontSize)

  const [imageUrl, setImageUrl] = useState('https://via.placeholder.com/300x200')

  const [frameId, setFrameId] = useState('common')
  const frame = frames.find((f) => f.id === frameId)?.src ?? frameCommon

  const [artTop, setArtTop] = useState(DEFAULTS.artTop)
  const [artLeft, setArtLeft] = useState(DEFAULTS.artLeft)
  const [artWidth, setArtWidth] = useState(DEFAULTS.artWidth)
  const [artHeight, setArtHeight] = useState(DEFAULTS.artHeight)

  const [titleTop, setTitleTop] = useState(DEFAULTS.titleTop)
  const [descTop, setDescTop] = useState(DEFAULTS.descTop)

  const cardRef = useRef(null)
  const importRef = useRef(null)

  const renderedDescription = useMemo(() => renderDescriptionMath(description), [description])

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const getCardState = () => ({
    version: 1,
    title,
    titleColor,
    titleFontFamily,
    titleFontSize,
    description,
    descFontFamily,
    descFontSize,
    imageUrl,
    frameId,
    artTop,
    artLeft,
    artWidth,
    artHeight,
    titleTop,
    descTop,
  })

  const applyCardState = (data) => {
    if (typeof data !== 'object' || !data) return

    if (typeof data.title === 'string') setTitle(decodeUnicodeEscapes(data.title))
    if (typeof data.titleColor === 'string') setTitleColor(data.titleColor)
    if (typeof data.titleFontFamily === 'string') setTitleFontFamily(data.titleFontFamily)
    setTitleFontSize(toNumber(data.titleFontSize, DEFAULTS.titleFontSize))

    if (typeof data.description === 'string') {
      setDescription(decodeUnicodeEscapes(data.description))
    }
    if (typeof data.descFontFamily === 'string') setDescFontFamily(data.descFontFamily)
    setDescFontSize(toNumber(data.descFontSize, DEFAULTS.descFontSize))

    if (typeof data.imageUrl === 'string') setImageUrl(decodeUnicodeEscapes(data.imageUrl))

    if (typeof data.frameId === 'string' && frames.some((f) => f.id === data.frameId)) {
      setFrameId(data.frameId)
    }

    setArtTop(toNumber(data.artTop, DEFAULTS.artTop))
    setArtLeft(toNumber(data.artLeft, DEFAULTS.artLeft))
    setArtWidth(toNumber(data.artWidth, DEFAULTS.artWidth))
    setArtHeight(toNumber(data.artHeight, DEFAULTS.artHeight))
    setTitleTop(toNumber(data.titleTop, DEFAULTS.titleTop))
    setDescTop(toNumber(data.descTop, DEFAULTS.descTop))
  }

  const exportJSON = () => {
    const data = getCardState()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    downloadBlob(blob, 'carta.json')
  }

  const triggerImport = () => importRef.current?.click()

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      applyCardState(data)
    } catch (err) {
      alert('JSON inv\u00e1lido o archivo da\u00f1ado.')
      console.error(err)
    }
  }

  const exportPNG = async () => {
    const el = cardRef.current
    if (!el) return

    const prevTransform = el.style.transform
    const prevOrigin = el.style.transformOrigin

    try {
      el.style.transform = 'none'
      el.style.transformOrigin = 'top left'

      const dataUrl = await htmlToImage.toPng(el, {
        pixelRatio: 2,
        cacheBust: true,
      })

      const res = await fetch(dataUrl)
      const blob = await res.blob()
      downloadBlob(blob, 'carta.png')
    } catch (err) {
      console.error(err)
      alert('No se pudo exportar PNG. Revisa la consola.')
    } finally {
      el.style.transform = prevTransform
      el.style.transformOrigin = prevOrigin
    }
  }

  const exportPDF = async () => {
    const el = cardRef.current
    if (!el) return

    const prevTransform = el.style.transform
    const prevOrigin = el.style.transformOrigin

    try {
      el.style.transform = 'none'
      el.style.transformOrigin = 'top left'

      const dataUrl = await htmlToImage.toPng(el, {
        pixelRatio: 2,
        cacheBust: true,
      })

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [606, 1039],
      })

      pdf.addImage(dataUrl, 'PNG', 0, 0, 606, 1039)
      pdf.save('carta.pdf')
    } catch (err) {
      console.error(err)
      alert('No se pudo exportar PDF. Revisa la consola.')
    } finally {
      el.style.transform = prevTransform
      el.style.transformOrigin = prevOrigin
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Generador de Cartas - Profe Inti</h1>

      <div className="layout">
        <div className="panel">
          <label className="field">
            <span>{'Nombre (T\u00edtulo)'}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Teorema del Valor Medio"
            />
          </label>

          <label className="field">
            <span>{'Color del t\u00edtulo'}</span>
            <input
              type="color"
              value={titleColor}
              onChange={(e) => setTitleColor(e.target.value)}
            />
          </label>

          <label className="field">
            <span>{'Fuente del t\u00edtulo'}</span>
            <select value={titleFontFamily} onChange={(e) => setTitleFontFamily(e.target.value)}>
              {FONT_OPTIONS.map((font) => (
                <option key={font.label} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{'Tama\u00f1o del t\u00edtulo (px)'}</span>
            <input
              type="number"
              min="16"
              max="72"
              value={titleFontSize}
              onChange={(e) => setTitleFontSize(toNumber(e.target.value, DEFAULTS.titleFontSize))}
            />
          </label>

          <label className="field">
            <span>{'Fuente de la descripci\u00f3n'}</span>
            <select value={descFontFamily} onChange={(e) => setDescFontFamily(e.target.value)}>
              {FONT_OPTIONS.map((font) => (
                <option key={font.label} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{'Tama\u00f1o de la descripci\u00f3n (px)'}</span>
            <input
              type="number"
              min="12"
              max="48"
              value={descFontSize}
              onChange={(e) => setDescFontSize(toNumber(e.target.value, DEFAULTS.descFontSize))}
            />
          </label>

          <label className="field">
            <span>{'Descripci\u00f3n (enriquecida)'}</span>
            <DescriptionEditor
              value={description}
              onChange={setDescription}
              baseFontFamily={descFontFamily}
              baseFontSize={descFontSize}
            />
          </label>
        </div>

        <div className="sliders-panel">
          <div className="sliders">
            <div className="slider">
              <span>Arte top: {artTop}px</span>
              <input
                type="range"
                min="0"
                max="500"
                value={artTop}
                onChange={(e) => setArtTop(Number(e.target.value))}
              />
            </div>

            <div className="slider">
              <span>Arte left: {artLeft}px</span>
              <input
                type="range"
                min="0"
                max="200"
                value={artLeft}
                onChange={(e) => setArtLeft(Number(e.target.value))}
              />
            </div>

            <div className="slider">
              <span>Arte width: {artWidth}px</span>
              <input
                type="range"
                min="200"
                max="606"
                value={artWidth}
                onChange={(e) => setArtWidth(Number(e.target.value))}
              />
            </div>

            <div className="slider">
              <span>Arte height: {artHeight}px</span>
              <input
                type="range"
                min="150"
                max="600"
                value={artHeight}
                onChange={(e) => setArtHeight(Number(e.target.value))}
              />
            </div>

            <div className="slider">
              <span>{`T\u00edtulo top: ${titleTop}px`}</span>
              <input
                type="range"
                min="0"
                max="300"
                value={titleTop}
                onChange={(e) => setTitleTop(Number(e.target.value))}
              />
            </div>

            <div className="slider">
              <span>{`Descripci\u00f3n top: ${descTop}px`}</span>
              <input
                type="range"
                min="350"
                max="980"
                value={descTop}
                onChange={(e) => setDescTop(Number(e.target.value))}
              />
            </div>

            <button
              type="button"
              className="btn"
              onClick={() => {
                setTitleTop(DEFAULTS.titleTop)
                setDescTop(DEFAULTS.descTop)
                setArtTop(DEFAULTS.artTop)
                setArtLeft(DEFAULTS.artLeft)
                setArtWidth(DEFAULTS.artWidth)
                setArtHeight(DEFAULTS.artHeight)
              }}
            >
              Reset posiciones
            </button>
          </div>
        </div>

        <div className="assets-panel">
          <div className="assets-title">Assets</div>

          <label className="field">
            <span>Arte (imagen principal)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return

                const reader = new FileReader()
                reader.onloadend = () => setImageUrl(reader.result)
                reader.readAsDataURL(file)
              }}
            />
          </label>

          <div className="rarity-selector">
            <div className="rarity-title">Rareza (Marco)</div>

            <div className="rarity-options">
              {frames.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`rarity-item ${frameId === f.id ? 'active' : ''}`}
                  onClick={() => setFrameId(f.id)}
                  title={f.label}
                >
                  <img src={f.src} alt={f.label} className="rarity-thumb" />
                  <div className="rarity-label">{f.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="export-row">
            <button type="button" className="btn" onClick={exportPNG}>
              Export PNG
            </button>
            <button type="button" className="btn" onClick={exportPDF}>
              Export PDF
            </button>
            <button type="button" className="btn" onClick={exportJSON}>
              Export JSON
            </button>

            <button type="button" className="btn" onClick={triggerImport}>
              Import JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={onImportFile}
            />
          </div>
        </div>

        <div className="preview-wrap">
          <div className="card" ref={cardRef}>
            <div
              className="art"
              style={{
                top: artTop,
                left: artLeft,
                width: artWidth,
                height: artHeight,
                right: 'auto',
              }}
            >
              <img src={imageUrl} alt="Arte" />
            </div>

            <img className="frame" src={frame} alt="Marco" />

            <div className="title-box" style={{ top: titleTop }}>
              <h2
                className="card-title"
                style={{
                  color: titleColor,
                  fontFamily: titleFontFamily,
                  fontSize: `${titleFontSize}px`,
                }}
              >
                {title}
              </h2>
            </div>

            <div className="desc-box" style={{ top: descTop }}>
              <div
                className="card-description"
                style={{
                  fontFamily: descFontFamily,
                  fontSize: `${descFontSize}px`,
                }}
                dangerouslySetInnerHTML={{ __html: renderedDescription }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
