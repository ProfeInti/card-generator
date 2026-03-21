import { useMemo, useState } from 'react'
import {
  TECHNIQUE_TEMPLATES,
  buildEmptyWhiteboardTechnique,
  listWhiteboardTechniques,
  saveWhiteboardTechnique,
} from './lib/whiteboardPrototype'

export default function WhiteboardTechniqueEditor({ onBackToWhiteboard }) {
  const [records, setRecords] = useState(() => listWhiteboardTechniques())
  const [form, setForm] = useState(buildEmptyWhiteboardTechnique)
  const [notice, setNotice] = useState('')

  const selectedTemplate = useMemo(
    () => TECHNIQUE_TEMPLATES.find((item) => item.id === form.templateId) || TECHNIQUE_TEMPLATES[0],
    [form.templateId]
  )

  const canSave = useMemo(() => {
    return Boolean(String(form.name || '').trim() && String(form.summary || '').trim())
  }, [form])

  const handleTemplateChange = (templateId) => {
    const template = TECHNIQUE_TEMPLATES.find((item) => item.id === templateId) || TECHNIQUE_TEMPLATES[0]
    setForm((prev) => ({
      ...prev,
      templateId: template.id,
      effectKind: template.effectKind,
      inputMode: template.inputMode,
      summary: prev.summary || template.summary,
    }))
  }

  const handleSave = () => {
    const saved = saveWhiteboardTechnique(form)
    setForm(saved)
    setRecords(listWhiteboardTechniques())
    setNotice('Tecnica guardada en el modulo alterno.')
  }

  return (
    <div className="page wb-page">
      <div className="wb-screen-header">
        <div>
          <h1 className="page-title">Editor de tecnicas del whiteboard</h1>
          <div className="saved-empty">Tecnicas minimas, breves y centradas en el comportamiento didactico.</div>
        </div>
        <div className="wb-header-actions">
          <button type="button" className="btn" onClick={() => setForm(buildEmptyWhiteboardTechnique())}>Nueva tecnica</button>
          <button type="button" className="btn" onClick={onBackToWhiteboard}>Volver al modulo</button>
        </div>
      </div>

      <div className="wb-two-column">
        <div className="panel wb-panel">
          <div className="saved-title">Definicion minima</div>

          <label className="field">
            <span>Nombre</span>
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </label>

          <label className="field">
            <span>Plantilla de funcionamiento</span>
            <select value={form.templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
              {TECHNIQUE_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>{template.label}</option>
              ))}
            </select>
          </label>

          <div className="wb-template-summary">
            <div className="saved-item-tags">Tipo de efecto: {selectedTemplate.effectKind}</div>
            <div className="saved-item-tags">Modo de entrada: {selectedTemplate.inputMode}</div>
            <div className="saved-empty">{selectedTemplate.summary}</div>
          </div>

          <label className="field">
            <span>Descripcion breve</span>
            <textarea rows={5} value={form.summary} onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))} />
          </label>

          {notice && <div className="saved-empty">{notice}</div>}

          <div className="menu-actions wb-inline-actions">
            <button type="button" className="btn" onClick={handleSave} disabled={!canSave}>Guardar tecnica</button>
          </div>
        </div>

        <div className="panel wb-panel">
          <div className="saved-title">Tecnicas guardadas</div>
          {records.length === 0 ? (
            <div className="saved-empty">Todavia no hay tecnicas del modulo alterno.</div>
          ) : (
            <div className="saved-list">
              {records.map((record) => (
                <button key={record.id} type="button" className="saved-item wb-record-card" onClick={() => setForm(record)}>
                  <div className="saved-item-title">{record.name || 'Tecnica sin nombre'}</div>
                  <div className="saved-item-meta">{record.effectKind} | {record.inputMode}</div>
                  <div className="saved-item-tags">{record.summary || 'Sin descripcion'}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
