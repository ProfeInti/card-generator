export const TECHNIQUE_LANGUAGE_OPTIONS = [
  { id: 'es', label: 'ES' },
  { id: 'fr', label: 'FR' },
]

export function getTechniqueTranslation(row, language = 'es') {
  if (!row || typeof row !== 'object') {
    return {
      name: '',
      effectDescription: '',
      workedExample: '',
    }
  }

  if (language === 'fr') {
    return {
      name: row.name_fr || row.name || '',
      effectDescription: row.effect_description_fr || row.effect_description || '',
      workedExample: row.worked_example_fr || row.worked_example || '',
    }
  }

  return {
    name: row.name || '',
    effectDescription: row.effect_description || '',
    workedExample: row.worked_example || '',
  }
}

export function getTechniqueDisplayName(row, options = {}) {
  const {
    includeBoth = true,
    fallback = 'Untitled technique',
  } = options

  if (!row || typeof row !== 'object') return fallback

  const nameEs = String(row.name || '').trim()
  const nameFr = String(row.name_fr || '').trim()

  if (includeBoth && nameEs && nameFr && nameEs !== nameFr) {
    return `${nameEs} / ${nameFr}`
  }

  return nameEs || nameFr || fallback
}
