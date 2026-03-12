import frameCommon from '../assets/frame-common.png'
import frameRare from '../assets/frame-rare.png'
import frameEpic from '../assets/frame-epic.png'
import frameLegendary from '../assets/frame-legendary.png'
import frameMythic from '../assets/frame-mythic.png'

export const FONT_OPTIONS = [
  {
    value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
    label: 'Monospace',
  },
  { value: '"Trebuchet MS", "Segoe UI", sans-serif', label: 'Trebuchet' },
  { value: '"Georgia", "Times New Roman", serif', label: 'Serif' },
  { value: '"Verdana", "Geneva", sans-serif', label: 'Verdana' },
  { value: '"Tahoma", "Geneva", sans-serif', label: 'Tahoma' },
]

export const DEFAULT_ART_DATA_URL = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='606' height='320' viewBox='0 0 606 320'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23131f2b'/%3E%3Cstop offset='100%25' stop-color='%232a3f56'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='606' height='320' fill='url(%23g)'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23b6fff0' font-family='Verdana, sans-serif' font-size='24'%3EUpload or paste an image%3C/text%3E%3C/svg%3E`

export const DEFAULTS = {
  title: 'Card Name',
  titleColor: '#00ff88',
  titleFontFamily: FONT_OPTIONS[0].value,
  titleFontSize: 34,
  description: '<p><span style="color:#b6fff0">This is the card description.</span></p>',
  descTextAlign: 'left',
  descFontFamily: FONT_OPTIONS[0].value,
  descFontSize: 20,
  imageUrl: DEFAULT_ART_DATA_URL,
  frameId: 'common',
  artTop: 140,
  artLeft: 70,
  artWidth: 466,
  artHeight: 320,
  titleTop: 60,
  descTop: 690,
}

export const FRAMES = [
  { id: 'common', label: 'Common', src: frameCommon },
  { id: 'rare', label: 'Rare', src: frameRare },
  { id: 'epic', label: 'Epic', src: frameEpic },
  { id: 'legendary', label: 'Legendary', src: frameLegendary },
  { id: 'mythic', label: 'Mythic', src: frameMythic },
]

export const THEME_SUGGESTIONS = [
  'Algebra',
  'Arithmetic',
  'Fractions',
  'Geometry',
  'Trigonometry',
  'Functions',
  'Statistics',
]

export const SUBTHEME_SUGGESTIONS = [
  'Factorization',
  'Equations',
  'Powers',
  'Radicals',
  'Linear Functions',
  'Proportionality',
  'Area',
  'Angles',
  'Simplification',
]

export const EFFECT_TYPE_SUGGESTIONS = [
  'transform',
  'simplify',
  'solve',
  'verify',
  'hint',
  'support',
  'correct_error',
]

export const DIFFICULTY_SUGGESTIONS = ['Beginner', 'Intermediate', 'Advanced', 'Olympiad']
export const RARITY_SUGGESTIONS = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic']
export const DESCRIPTION_ALIGN_OPTIONS = ['left', 'center', 'right', 'justify']

export function toNumber(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function decodeUnicodeEscapes(text) {
  if (typeof text !== 'string') return text
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

export function sanitizeMetaText(value) {
  if (typeof value !== 'string') return ''
  return decodeUnicodeEscapes(value).trim()
}

export function parseTags(value) {
  if (Array.isArray(value)) {
    return value
      .map((tag) => sanitizeMetaText(tag))
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => sanitizeMetaText(tag))
      .filter(Boolean)
  }

  return []
}

export function tagsToInputValue(tags) {
  return parseTags(tags).join(', ')
}

export function normalizeMetaForDb(value) {
  const normalized = sanitizeMetaText(value)
  return normalized || null
}

export function normalizeTagsForDb(tagsInput) {
  const tags = parseTags(tagsInput)
  return tags.length ? tags : null
}

export function toCardResponse(row) {
  let state

  if (row && Object.prototype.hasOwnProperty.call(row, 'state_json')) {
    if (row?.state_json && typeof row.state_json === 'object') {
      state = row.state_json
    } else if (typeof row?.state_json === 'string') {
      try {
        state = JSON.parse(row.state_json)
      } catch {
        state = undefined
      }
    }
  }

  return {
    id: row.id,
    name: row.name,
    cardKey: row.card_key || '',
    quantity: toNumber(row.quantity, 1),
    state,
    theme: sanitizeMetaText(row.theme),
    subtheme: sanitizeMetaText(row.subtheme),
    effectType: sanitizeMetaText(row.effect_type),
    difficulty: sanitizeMetaText(row.difficulty),
    rarity: sanitizeMetaText(row.rarity),
    isFavorite: Boolean(row.is_favorite),
    tags: parseTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
