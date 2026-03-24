import { extractTextFromHtml } from './mathHtml'
import { getTechniqueTaxonomy, getTechniqueTranslation } from './competitiveTechniqueLocale'
import { getTechniqueTaxonomySelection } from './competitiveTechniqueTaxonomy'

const UNCATEGORIZED_BOOK_ID = '__uncategorized__'
const UNCATEGORIZED_BOOK_TITLE = 'Sin tema'
const UNCATEGORIZED_BOOK_TITLE_FR = 'Sans theme'

function normalizeValue(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeValue(value).toLowerCase()
}

export function getTechniqueBookMeta(source, language = 'es') {
  if (source && typeof source === 'object') {
    const taxonomySelection = getTechniqueTaxonomySelection(source)
    const taxonomy = getTechniqueTaxonomy(source, language)
    const title = normalizeValue(taxonomy.topic)

    return {
      id: taxonomySelection.topicId || UNCATEGORIZED_BOOK_ID,
      title: title || (language === 'fr' ? UNCATEGORIZED_BOOK_TITLE_FR : UNCATEGORIZED_BOOK_TITLE),
    }
  }

  const normalizedTopic = normalizeValue(source)
  if (!normalizedTopic) {
    return {
      id: UNCATEGORIZED_BOOK_ID,
      title: language === 'fr' ? UNCATEGORIZED_BOOK_TITLE_FR : UNCATEGORIZED_BOOK_TITLE,
    }
  }

  return {
    id: normalizeKey(normalizedTopic),
    title: normalizedTopic,
  }
}

export function buildTechniquePreview(item, language = 'es', maxLength = 180) {
  const translation = getTechniqueTranslation(item, language)
  const previewText = extractTextFromHtml(translation.effectDescription) || extractTextFromHtml(translation.workedExample)

  if (!previewText) return 'Sin preview disponible.'
  if (previewText.length <= maxLength) return previewText
  return `${previewText.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
}

export function buildTechniqueCompendium(items = [], language = 'es') {
  const booksMap = new Map()

  items.forEach((item) => {
    const taxonomy = getTechniqueTaxonomy(item, language)
    const bookMeta = getTechniqueBookMeta(item, language)
    const subtopic = normalizeValue(taxonomy.subtopic)

    if (!booksMap.has(bookMeta.id)) {
      booksMap.set(bookMeta.id, {
        id: bookMeta.id,
        title: bookMeta.title,
        items: [],
        subtopics: new Set(),
        latestUpdate: '',
      })
    }

    const book = booksMap.get(bookMeta.id)
    book.items.push(item)
    if (subtopic) book.subtopics.add(subtopic)

    const candidateUpdatedAt = String(item?.updated_at || item?.collected_at || item?.created_at || '')
    if (candidateUpdatedAt > book.latestUpdate) {
      book.latestUpdate = candidateUpdatedAt
    }
  })

  return [...booksMap.values()]
    .map((book) => ({
      ...book,
      count: book.items.length,
      subtopics: [...book.subtopics].sort((a, b) => a.localeCompare(b)),
      items: [...book.items].sort((a, b) => {
        const aName = normalizeValue(a?.name || a?.name_fr)
        const bName = normalizeValue(b?.name || b?.name_fr)
        return aName.localeCompare(bName)
      }),
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export function ensureTechniqueCompendiumSelection(books, selectedBookId, selectedTechniqueId) {
  const fallbackBookId = books[0]?.id ?? null
  const nextBookId = books.some((book) => book.id === selectedBookId) ? selectedBookId : fallbackBookId
  const selectedBook = books.find((book) => book.id === nextBookId) || null
  const nextTechniqueId = selectedBook?.items.some((item) => item.id === selectedTechniqueId)
    ? selectedTechniqueId
    : selectedBook?.items[0]?.id ?? null

  return {
    selectedBookId: nextBookId,
    selectedTechniqueId: nextTechniqueId,
    selectedBook,
  }
}
