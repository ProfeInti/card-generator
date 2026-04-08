const NOTEBOOK_BOOKS_KEY = 'inticore-notebook-books'
const ACTIVE_NOTEBOOK_BOOK_KEY = 'inticore-active-notebook-book'
const ACTIVE_NOTEBOOK_PAGE_KEY = 'inticore-active-notebook-page'
const ACTIVE_NOTEBOOK_COLLAB_PAGE_KEY = 'inticore-active-notebook-collab-page'

const EMPTY_BOOK = {
  id: '',
  ownerUserId: '',
  title: '',
  description: '',
  inviteCode: '',
  createdAt: '',
  updatedAt: '',
  pages: [],
}

const EMPTY_PAGE = {
  id: '',
  title: '',
  kind: 'sheet',
  linkedExerciseId: '',
  exerciseOwnership: 'linked',
  collabPageId: '',
  shareCode: '',
  createdAt: '',
  updatedAt: '',
}

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createInviteCode() {
  return `NB-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function normalizePageRecord(record) {
  if (!record || typeof record !== 'object') return null

  return {
    ...EMPTY_PAGE,
    ...record,
    id: String(record.id || '').trim(),
    title: String(record.title || '').trim(),
    kind: String(record.kind || 'sheet').trim() || 'sheet',
    linkedExerciseId: String(record.linkedExerciseId || '').trim(),
    exerciseOwnership: String(record.exerciseOwnership || 'linked').trim() || 'linked',
    collabPageId: String(record.collabPageId || '').trim(),
    shareCode: String(record.shareCode || '').trim().toUpperCase(),
    createdAt: String(record.createdAt || '').trim(),
    updatedAt: String(record.updatedAt || '').trim(),
  }
}

function normalizeBookRecord(record) {
  if (!record || typeof record !== 'object') return null

  return {
    ...EMPTY_BOOK,
    ...record,
    id: String(record.id || '').trim(),
    ownerUserId: String(record.ownerUserId || '').trim(),
    title: String(record.title || '').trim(),
    description: String(record.description || '').trim(),
    inviteCode: String(record.inviteCode || '').trim() || createInviteCode(),
    createdAt: String(record.createdAt || '').trim(),
    updatedAt: String(record.updatedAt || '').trim(),
    pages: (Array.isArray(record.pages) ? record.pages : []).map(normalizePageRecord).filter(Boolean),
  }
}

function listAllBooks() {
  const rows = readJson(NOTEBOOK_BOOKS_KEY, [])
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeBookRecord)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

function saveAllBooks(rows) {
  writeJson(NOTEBOOK_BOOKS_KEY, Array.isArray(rows) ? rows : [])
}

export function listNotebookBooks(ownerUserId = '') {
  const ownerId = String(ownerUserId || '').trim()
  if (!ownerId) return []
  return listAllBooks().filter((book) => book.ownerUserId === ownerId)
}

export function getNotebookBookById(bookId, ownerUserId = '') {
  const safeBookId = String(bookId || '').trim()
  if (!safeBookId) return null

  return listNotebookBooks(ownerUserId).find((book) => book.id === safeBookId) || null
}

export function saveNotebookBook(ownerUserId, values = {}) {
  const ownerId = String(ownerUserId || '').trim()
  if (!ownerId) {
    throw new Error('No se encontro un usuario valido para guardar el cuaderno.')
  }

  const rows = listAllBooks()
  const timestamp = new Date().toISOString()
  const record = normalizeBookRecord({
    ...EMPTY_BOOK,
    ...values,
    id: values.id || createId('nb-book'),
    ownerUserId: ownerId,
    title: String(values.title || '').trim() || 'Cuaderno sin titulo',
    description: String(values.description || '').trim(),
    inviteCode: String(values.inviteCode || '').trim() || createInviteCode(),
    pages: Array.isArray(values.pages) ? values.pages : (getNotebookBookById(values.id, ownerId)?.pages || []),
    createdAt: values.createdAt || getNotebookBookById(values.id, ownerId)?.createdAt || timestamp,
    updatedAt: timestamp,
  })

  const nextRows = rows.some((book) => book.id === record.id)
    ? rows.map((book) => (book.id === record.id ? record : book))
    : [record, ...rows]

  saveAllBooks(nextRows)
  setActiveNotebookBookId(record.id)
  return record
}

export function deleteNotebookBook(bookId, ownerUserId = '') {
  const safeBookId = String(bookId || '').trim()
  const ownerId = String(ownerUserId || '').trim()
  if (!safeBookId || !ownerId) return false

  const rows = listAllBooks()
  const nextRows = rows.filter((book) => !(book.id === safeBookId && book.ownerUserId === ownerId))
  saveAllBooks(nextRows)

  if (getActiveNotebookBookId() === safeBookId) {
    setActiveNotebookBookId('')
    setActiveNotebookPageId('')
  }

  return true
}

export function createNotebookPage(ownerUserId, bookId, values = {}) {
  const book = getNotebookBookById(bookId, ownerUserId)
  if (!book) {
    throw new Error('No se encontro el cuaderno donde se queria crear la hoja.')
  }

  const timestamp = new Date().toISOString()
  const page = normalizePageRecord({
    ...EMPTY_PAGE,
    ...values,
    id: values.id || createId('nb-page'),
    title: String(values.title || '').trim() || 'Hoja sin titulo',
    kind: String(values.kind || 'sheet').trim() || 'sheet',
    linkedExerciseId: String(values.linkedExerciseId || '').trim(),
    exerciseOwnership: String(values.exerciseOwnership || 'linked').trim() || 'linked',
    collabPageId: String(values.collabPageId || '').trim(),
    shareCode: String(values.shareCode || '').trim().toUpperCase(),
    createdAt: values.createdAt || timestamp,
    updatedAt: timestamp,
  })

  const nextBook = {
    ...book,
    pages: [...book.pages, page],
    updatedAt: timestamp,
  }

  saveNotebookBook(ownerUserId, nextBook)
  setActiveNotebookPageId(page.id)
  return page
}

export function updateNotebookPage(ownerUserId, bookId, pageId, values = {}) {
  const book = getNotebookBookById(bookId, ownerUserId)
  if (!book) {
    throw new Error('No se encontro el cuaderno donde se queria actualizar la hoja.')
  }

  const timestamp = new Date().toISOString()
  const currentPage = book.pages.find((page) => page.id === pageId)
  if (!currentPage) {
    throw new Error('No se encontro la hoja solicitada.')
  }

  const nextPage = normalizePageRecord({
    ...currentPage,
    ...values,
    id: currentPage.id,
    updatedAt: timestamp,
  })

  const nextBook = {
    ...book,
    pages: book.pages.map((page) => (page.id === pageId ? nextPage : page)),
    updatedAt: timestamp,
  }

  saveNotebookBook(ownerUserId, nextBook)
  return nextPage
}

export function deleteNotebookPage(ownerUserId, bookId, pageId) {
  const book = getNotebookBookById(bookId, ownerUserId)
  if (!book) return null

  const page = book.pages.find((entry) => entry.id === pageId) || null
  if (!page) return null

  const timestamp = new Date().toISOString()
  const nextBook = {
    ...book,
    pages: book.pages.filter((entry) => entry.id !== pageId),
    updatedAt: timestamp,
  }

  saveNotebookBook(ownerUserId, nextBook)

  if (getActiveNotebookPageId() === pageId) {
    setActiveNotebookPageId('')
  }

  return page
}

export function getNotebookPageById(ownerUserId, bookId, pageId) {
  const book = getNotebookBookById(bookId, ownerUserId)
  if (!book) return null
  return book.pages.find((page) => page.id === pageId) || null
}

export function getActiveNotebookBookId() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(ACTIVE_NOTEBOOK_BOOK_KEY) || ''
}

export function setActiveNotebookBookId(bookId) {
  if (typeof window === 'undefined') return
  if (!bookId) {
    window.localStorage.removeItem(ACTIVE_NOTEBOOK_BOOK_KEY)
    return
  }
  window.localStorage.setItem(ACTIVE_NOTEBOOK_BOOK_KEY, String(bookId))
}

export function getActiveNotebookPageId() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(ACTIVE_NOTEBOOK_PAGE_KEY) || ''
}

export function setActiveNotebookPageId(pageId) {
  if (typeof window === 'undefined') return
  if (!pageId) {
    window.localStorage.removeItem(ACTIVE_NOTEBOOK_PAGE_KEY)
    return
  }
  window.localStorage.setItem(ACTIVE_NOTEBOOK_PAGE_KEY, String(pageId))
}

export function getActiveNotebookCollabPageId() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(ACTIVE_NOTEBOOK_COLLAB_PAGE_KEY) || ''
}

export function setActiveNotebookCollabPageId(pageId) {
  if (typeof window === 'undefined') return
  if (!pageId) {
    window.localStorage.removeItem(ACTIVE_NOTEBOOK_COLLAB_PAGE_KEY)
    return
  }
  window.localStorage.setItem(ACTIVE_NOTEBOOK_COLLAB_PAGE_KEY, String(pageId))
}
