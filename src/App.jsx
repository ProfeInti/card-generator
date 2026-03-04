import { useState, useEffect, useRef } from 'react'
import './App.css'

// ✅ 5 marcos (rareza) — pon estos archivos en /src/assets/
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

function App() {
  const frames = [
    { id: 'common', label: 'Común', src: frameCommon },
    { id: 'rare', label: 'Rara', src: frameRare },
    { id: 'epic', label: 'Épica', src: frameEpic },
    { id: 'legendary', label: 'Legendaria', src: frameLegendary },
    { id: 'mythic', label: 'Mítica', src: frameMythic },
  ]

  const [title, setTitle] = useState('Nombre de la Carta')
  const [titleColor, setTitleColor] = useState('#00ff88')

  // description es HTML
  const [description, setDescription] = useState(
    '<p><span style="color:#b6fff0">Esta es la descripción de la carta.</span></p>'
  )

  const [imageUrl, setImageUrl] = useState('https://via.placeholder.com/300x200')

  // ✅ Marco (rareza)
  const [frameId, setFrameId] = useState('common')
  const frame = frames.find((f) => f.id === frameId)?.src ?? frameCommon

  // Zona del arte (hueco del marco)
  const [artTop, setArtTop] = useState(140)
  const [artLeft, setArtLeft] = useState(70)
  const [artWidth, setArtWidth] = useState(466)
  const [artHeight, setArtHeight] = useState(320)

  // Zonas separadas: título arriba, descripción abajo
  const [titleTop, setTitleTop] = useState(60)
  const [descTop, setDescTop] = useState(690)

  // Ref para render KaTeX en la vista previa
  const descRenderRef = useRef(null)

  // Ref para exportar captura de la carta
  const cardRef = useRef(null)

  // input oculto para Import JSON
  const importRef = useRef(null)

  // Renderiza KaTeX en la carta para spans de ecuación guardados como data-latex
  useEffect(() => {
    const root = descRenderRef.current
    if (!root) return

    const nodes = root.querySelectorAll('span[data-type="math-inline"]')
    nodes.forEach((el) => {
      const latex = el.getAttribute('data-latex') || ''
      try {
        el.innerHTML = katex.renderToString(latex, { throwOnError: false })
      } catch {
        el.textContent = latex
      }
    })
  }, [description])

  // =========================
  // Export / Import helpers
  // =========================
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
    description,
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
    // tolerante por si faltan keys
    if (typeof data !== 'object' || !data) return

    if (typeof data.title === 'string') setTitle(data.title)
    if (typeof data.titleColor === 'string') setTitleColor(data.titleColor)
    if (typeof data.description === 'string') setDescription(data.description)
    if (typeof data.imageUrl === 'string') setImageUrl(data.imageUrl)

    if (typeof data.frameId === 'string' && frames.some(f => f.id === data.frameId)) {
      setFrameId(data.frameId)
    }

    const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

    setArtTop(num(data.artTop, 140))
    setArtLeft(num(data.artLeft, 70))
    setArtWidth(num(data.artWidth, 466))
    setArtHeight(num(data.artHeight, 320))
    setTitleTop(num(data.titleTop, 60))
    setDescTop(num(data.descTop, 690))
  }

  // =========================
  // Export JSON
  // =========================
  const exportJSON = () => {
    const data = getCardState()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    downloadBlob(blob, 'carta.json')
  }

  // =========================
  // Import JSON
  // =========================
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
      alert('JSON inválido o archivo dañado.')
      console.error(err)
    }
  }

  // =========================
  // Export PNG (captura exacta)
  // =========================
  const exportPNG = async () => {
    const el = cardRef.current
    if (!el) return

    // la carta tiene transform: scale(...) por CSS
    // para export, la quitamos temporalmente
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

  // =========================
  // Export PDF
  // =========================
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

      // La carta “real” es 606x1039 px (tu diseño)
      // La metemos en una hoja tamaño ajustado
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
      <h1 className="page-title">Generador de Cartas — Profe Inti</h1>

      <div className="layout">
        {/* =======================
            PANEL TEXTO
        ======================= */}
        <div className="panel">
          <label className="field">
            <span>Nombre (Título)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Teorema del Valor Medio"
            />
          </label>

          <label className="field">
            <span>Color del título</span>
            <input
              type="color"
              value={titleColor}
              onChange={(e) => setTitleColor(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Descripción (enriquecida)</span>
            <DescriptionEditor value={description} onChange={setDescription} />
          </label>
        </div>

        {/* =======================
            SLIDERS
        ======================= */}
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
              <span>Título top: {titleTop}px</span>
              <input
                type="range"
                min="0"
                max="300"
                value={titleTop}
                onChange={(e) => setTitleTop(Number(e.target.value))}
              />
            </div>

            <div className="slider">
              <span>Descripción top: {descTop}px</span>
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
                setTitleTop(60)
                setDescTop(690)
                setArtTop(140)
                setArtLeft(70)
                setArtWidth(466)
                setArtHeight(320)
              }}
            >
              Reset posiciones
            </button>
          </div>
        </div>

        {/* =======================
            ASSETS (Arte + Rareza + Export/Import)
        ======================= */}
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

          {/* EXPORT / IMPORT */}
          <div className="export-row">
            <button type="button" className="btn" onClick={exportPNG}>Export PNG</button>
            <button type="button" className="btn" onClick={exportPDF}>Export PDF</button>
            <button type="button" className="btn" onClick={exportJSON}>Export JSON</button>

            <button type="button" className="btn" onClick={triggerImport}>Import JSON</button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={onImportFile}
            />
          </div>
        </div>

        {/* =======================
            PREVIEW
        ======================= */}
        <div className="preview-wrap">
          <div className="card" ref={cardRef}>
            {/* ARTE en el hueco */}
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

            {/* MARCO dinámico */}
            <img className="frame" src={frame} alt="Marco" />

            {/* TÍTULO */}
            <div className="title-box" style={{ top: titleTop }}>
              <h2 className="card-title" style={{ color: titleColor }}>
                {title}
              </h2>
            </div>

            {/* DESCRIPCIÓN */}
            <div className="desc-box" style={{ top: descTop }}>
              <div
                className="card-description"
                ref={descRenderRef}
                dangerouslySetInnerHTML={{ __html: description }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App