import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createNotebookPage,
  deleteNotebookBook,
  deleteNotebookPage,
  listNotebookBooks,
  saveNotebookBook,
  setActiveNotebookBookId,
  setActiveNotebookCollabPageId,
  setActiveNotebookPageId,
  updateNotebookPage,
} from './lib/notebookLibrary'
import {
  buildNotebookBookExportJson,
  buildNotebookPageExportJson,
  buildNotebookPageTemplateJson,
  materializeImportedNotebookPage,
  normalizeNotebookLibraryImportPayload,
} from './lib/notebookLibraryJson'
import {
  buildEmptyWhiteboardExercise,
  deleteWhiteboardExercise,
  listWhiteboardExercises,
  saveWhiteboardExercise,
  setActiveWhiteboardExerciseId,
  setActiveWhiteboardWorkspaceId,
} from './lib/whiteboardPrototype'
import {
  buildNotebookPageTitleFromExercise,
  buildWhiteboardNotebookFromExercise,
  downloadJsonFile,
  getNotebookPageKindLabel as getSharedNotebookPageKindLabel,
  getStoredWhiteboardNotebook,
  parseJsonFile,
  saveWhiteboardNotebook,
} from './lib/whiteboardNotebook'
import {
  createNotebookCollabPage,
  getNotebookCollabPageById,
  joinNotebookCollabPageByCode,
} from './data/notebookCollabRepo'

function buildDefaultBookTitle(count) {
  return `Cuaderno ${count + 1}`
}

function getNotebookPageKindLabel(page) {
  return getSharedNotebookPageKindLabel(page?.kind || 'sheet', 'es')
}

function handleNotebookCardKeyDown(event, onOpen) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onOpen()
}

function extractNotebookShareCode(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const directMatch = raw.match(/\bNP-[A-Z0-9-]+\b/i)
  if (directMatch?.[0]) {
    return directMatch[0].toUpperCase()
  }

  if (typeof window === 'undefined') return ''

  try {
    const parsed = new URL(raw, window.location.origin)
    const queryCode = parsed.searchParams.get('notebookShare') || parsed.searchParams.get('code') || ''
    const queryMatch = String(queryCode || '').trim().match(/\bNP-[A-Z0-9-]+\b/i)
    return queryMatch?.[0]?.toUpperCase?.() || ''
  } catch {
    return ''
  }
}

function buildNotebookShareLink(code) {
  const normalizedCode = extractNotebookShareCode(code)
  if (!normalizedCode || typeof window === 'undefined') return ''

  const url = new URL(window.location.href)
  url.searchParams.set('notebookShare', normalizedCode)
  return url.toString()
}

function clearNotebookShareQueryParam() {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  if (!url.searchParams.has('notebookShare')) return
  url.searchParams.delete('notebookShare')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

export default function NotebookLibraryHub({ session, onBackToMenu, onOpenNotebookPage, onLogout }) {
  const [books, setBooks] = useState([])
  const [exercises, setExercises] = useState(() => listWhiteboardExercises())
  const [activeBookId, setActiveBookIdState] = useState('')
  const [bookDraft, setBookDraft] = useState({ title: '', description: '' })
  const [selectedExerciseId, setSelectedExerciseId] = useState('')
  const [openBookMenuId, setOpenBookMenuId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const importBookFileRef = useRef(null)
  const importPageFileRef = useRef(null)
  const handledSharedLinkRef = useRef('')

  const refreshBooks = useCallback(() => {
    const nextBooks = listNotebookBooks(session?.userId)
    setBooks(nextBooks)
    setExercises(listWhiteboardExercises())
    setActiveBookIdState((prev) => (prev && nextBooks.some((book) => book.id === prev) ? prev : ''))
  }, [session?.userId])

  useEffect(() => {
    refreshBooks()
  }, [refreshBooks])

  const selectedBook = useMemo(
    () => books.find((book) => book.id === activeBookId) || null,
    [activeBookId, books]
  )
  const openBookInEditor = useCallback((book) => {
    if (!book) return

    const firstPage = Array.isArray(book.pages) ? book.pages[0] || null : null
    setActiveNotebookBookId(book.id)
    setActiveNotebookPageId(firstPage?.id || '')
    setActiveNotebookCollabPageId(firstPage?.collabPageId || '')
    setActiveWhiteboardExerciseId(firstPage?.linkedExerciseId || '')
    setActiveWhiteboardWorkspaceId('')
    onOpenNotebookPage()
  }, [onOpenNotebookPage])

  useEffect(() => {
    if (!selectedBook) {
      setBookDraft({ title: '', description: '' })
      return
    }

    setBookDraft({
      title: selectedBook.title || '',
      description: selectedBook.description || '',
    })
  }, [selectedBook])

  useEffect(() => {
    if (!openBookMenuId || typeof window === 'undefined') return undefined

    const handleWindowPointerDown = () => setOpenBookMenuId('')
    window.addEventListener('pointerdown', handleWindowPointerDown)
    return () => window.removeEventListener('pointerdown', handleWindowPointerDown)
  }, [openBookMenuId])

  const handleCreateBook = useCallback(() => {
    if (!session?.userId) {
      setError('Necesitas una cuenta activa para crear cuadernos.')
      return
    }

    try {
      setError('')
      const created = saveNotebookBook(session.userId, {
        title: buildDefaultBookTitle(books.length),
        description: '',
      })
      setNotice(`Se creo el cuaderno ${created.title}.`)
      refreshBooks()
      setActiveBookIdState(created.id)
      openBookInEditor(created)
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo crear el cuaderno.')
    }
  }, [books.length, openBookInEditor, refreshBooks, session?.userId])

  const handleSaveBook = () => {
    if (!session?.userId || !selectedBook) return

    try {
      setError('')
      const saved = saveNotebookBook(session.userId, {
        ...selectedBook,
        title: bookDraft.title,
        description: bookDraft.description,
      })
      setNotice(`Se actualizo ${saved.title}.`)
      refreshBooks()
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo guardar el cuaderno.')
    }
  }

  const handleDeleteBook = (book) => {
    if (!session?.userId || !book) return
    if (!window.confirm(`Eliminar el cuaderno "${book.title || 'Sin titulo'}"?`)) return

    try {
      setError('')
      book.pages.forEach((page) => {
        if (page.exerciseOwnership === 'managed' && page.linkedExerciseId) {
          deleteWhiteboardExercise(page.linkedExerciseId)
        }
      })
      deleteNotebookBook(book.id, session.userId)
      setNotice(`Se elimino el cuaderno ${book.title || 'sin titulo'}.`)
      refreshBooks()
      setActiveBookIdState('')
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo eliminar el cuaderno.')
    }
  }

  const handleCreateBlankPage = () => {
    if (!session?.userId || !selectedBook) return

    try {
      setError('')
      const pageTitle = buildNotebookPageTitleFromExercise(null, {
        kind: 'sheet',
        pageIndex: selectedBook.pages.length,
      })
      const createdExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        title: pageTitle,
        topic: selectedBook.title || '',
      })
      const createdPage = createNotebookPage(session.userId, selectedBook.id, {
        title: createdExercise.title,
        kind: 'sheet',
        linkedExerciseId: createdExercise.id,
        exerciseOwnership: 'managed',
      })
      setNotice(`Se creo la hoja ${createdPage.title}.`)
      refreshBooks()
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo crear la hoja libre.')
    }
  }

  const handleCreateExercisePage = () => {
    if (!session?.userId || !selectedBook) return
    if (!selectedExerciseId) {
      setError('Selecciona primero un ejercicio para vincularlo al cuaderno.')
      return
    }

    const exercise = exercises.find((item) => item.id === selectedExerciseId) || null
    if (!exercise) {
      setError('No se encontro el ejercicio seleccionado.')
      return
    }

    try {
      setError('')
      const pageTitle = buildNotebookPageTitleFromExercise(exercise, {
        kind: 'exercise',
        pageIndex: selectedBook.pages.length,
      })
      const createdPage = createNotebookPage(session.userId, selectedBook.id, {
        title: pageTitle,
        kind: 'exercise',
        linkedExerciseId: exercise.id,
        exerciseOwnership: 'linked',
      })
      setNotice(`Se vinculo ${createdPage.title} dentro del cuaderno.`)
      setSelectedExerciseId('')
      refreshBooks()
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo vincular el ejercicio.')
    }
  }

  const handleRenamePage = (page) => {
    if (!session?.userId || !selectedBook || !page) return

    const nextTitle = window.prompt('Nuevo titulo para la hoja:', page.title || '')
    if (nextTitle == null) return

    try {
      setError('')
      const updatedPage = updateNotebookPage(session.userId, selectedBook.id, page.id, {
        title: nextTitle,
      })
      if (page.exerciseOwnership === 'managed' && page.linkedExerciseId) {
        saveWhiteboardExercise({
          ...buildEmptyWhiteboardExercise(),
          ...(exercises.find((item) => item.id === page.linkedExerciseId) || {}),
          id: page.linkedExerciseId,
          title: updatedPage.title,
          topic: selectedBook.title || '',
        })
      }
      setNotice(`Se actualizo ${updatedPage.title}.`)
      refreshBooks()
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo renombrar la hoja.')
    }
  }

  const handleDeletePage = (page) => {
    if (!session?.userId || !selectedBook || !page) return
    if (!window.confirm(`Eliminar la hoja "${page.title || 'Sin titulo'}"?`)) return

    try {
      setError('')
      const removed = deleteNotebookPage(session.userId, selectedBook.id, page.id)
      if (removed?.exerciseOwnership === 'managed' && removed.linkedExerciseId) {
        deleteWhiteboardExercise(removed.linkedExerciseId)
      }
      setNotice(`Se elimino la hoja ${page.title || 'sin titulo'}.`)
      refreshBooks()
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo eliminar la hoja.')
    }
  }

  const handleOpenPage = (page) => {
    if (!selectedBook || !page?.linkedExerciseId) {
      setError('La hoja no tiene un ejercicio asociado todavia.')
      return
    }

    setError('')
    setNotice('')
    setActiveNotebookBookId(selectedBook.id)
    setActiveNotebookPageId(page.id)
    setActiveNotebookCollabPageId(page.collabPageId || '')
    setActiveWhiteboardExerciseId(page.linkedExerciseId)
    setActiveWhiteboardWorkspaceId('')
    onOpenNotebookPage()
  }

  const handleDownloadPageTemplate = () => {
    setError('')
    downloadJsonFile('inticore-notebook-page-template.json', buildNotebookPageTemplateJson())
    setNotice('Plantilla de hoja sembrada descargada.')
  }

  const handleExportBook = () => {
    if (!selectedBook) return

    const exportPages = selectedBook.pages.map((page) => {
      const exercise = exercises.find((item) => item.id === page.linkedExerciseId) || null
      const notebook = page.linkedExerciseId
        ? (getStoredWhiteboardNotebook(page.linkedExerciseId) || (exercise ? buildWhiteboardNotebookFromExercise(exercise) : null))
        : null

      return {
        page,
        exercise,
        notebook,
      }
    })

    const filenameSafeTitle = String(selectedBook.title || 'cuaderno')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'cuaderno'

    downloadJsonFile(
      `inticore-notebook-book-${filenameSafeTitle}.json`,
      buildNotebookBookExportJson({
        book: selectedBook,
        pages: exportPages,
      })
    )
    setError('')
    setNotice(`Se exporto el cuaderno ${selectedBook.title || 'sin titulo'}.`)
  }

  const handleExportPage = (page) => {
    const exercise = exercises.find((item) => item.id === page.linkedExerciseId) || null
    const notebook = page.linkedExerciseId
      ? (getStoredWhiteboardNotebook(page.linkedExerciseId) || (exercise ? buildWhiteboardNotebookFromExercise(exercise) : null))
      : null
    const filenameSafeTitle = String(page?.title || 'hoja')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'hoja'

    downloadJsonFile(
      `inticore-notebook-page-${filenameSafeTitle}.json`,
      buildNotebookPageExportJson({ page, exercise, notebook })
    )
    setError('')
    setNotice(`Se exporto la hoja ${page.title || 'sin titulo'}.`)
  }

  const importPagesIntoBook = (bookId, importedPages = []) => {
    if (!session?.userId || !bookId) {
      throw new Error('No hay un cuaderno disponible para importar hojas.')
    }

    importedPages.forEach((entry, index) => {
      const title = String(entry?.title || buildNotebookPageTitleFromExercise(entry?.exercise, {
        kind: entry?.kind || 'sheet',
        pageIndex: index,
      })).trim() || buildNotebookPageTitleFromExercise(entry?.exercise, {
        kind: entry?.kind || 'sheet',
        pageIndex: index,
      })
      const savedExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        ...(entry?.exercise || {}),
        id: null,
        title,
        topic: String(entry?.exercise?.topic || selectedBook?.title || '').trim(),
      })
      const importedNotebook = materializeImportedNotebookPage(entry, savedExercise)
      saveWhiteboardNotebook(savedExercise.id, importedNotebook)
      createNotebookPage(session.userId, bookId, {
        title,
        kind: String(entry?.kind || 'sheet').trim() || 'sheet',
        linkedExerciseId: savedExercise.id,
        exerciseOwnership: 'managed',
      })
    })
  }

  const handleImportBookFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !session?.userId) return

    try {
      setError('')
      const payload = await parseJsonFile(file)
      const imported = normalizeNotebookLibraryImportPayload(payload)
      if (!imported || imported.kind !== 'book') {
        throw new Error('El archivo no contiene un cuaderno importable.')
      }

      const createdBook = saveNotebookBook(session.userId, {
        title: imported.title,
        description: imported.description,
      })
      importPagesIntoBook(createdBook.id, imported.pages)
      refreshBooks()
      setActiveBookIdState(createdBook.id)
      setActiveNotebookBookId(createdBook.id)
      setNotice(`Se importo el cuaderno ${createdBook.title}.`)
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo importar el cuaderno.')
    }
  }

  const handleImportPageFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !session?.userId || !selectedBook) return

    try {
      setError('')
      const payload = await parseJsonFile(file)
      const imported = normalizeNotebookLibraryImportPayload(payload)
      if (!imported || !Array.isArray(imported.pages) || !imported.pages.length) {
        throw new Error('El archivo no contiene una hoja importable.')
      }

      importPagesIntoBook(selectedBook.id, imported.pages)
      refreshBooks()
      setNotice(imported.kind === 'book'
        ? 'Se importaron las hojas del cuaderno dentro del cuaderno actual.'
        : 'Se importo la hoja dentro del cuaderno actual.')
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo importar la hoja.')
    }
  }

  const ensureRemotePageForShare = useCallback(async (page) => {
    if (!session?.userId || !selectedBook || !page?.linkedExerciseId) return

    const exercise = exercises.find((item) => item.id === page.linkedExerciseId) || null
    const notebook = getStoredWhiteboardNotebook(page.linkedExerciseId)
      || (exercise ? buildWhiteboardNotebookFromExercise(exercise) : null)
    if (!exercise || !notebook) {
      throw new Error('No se encontro el contenido base de la hoja para compartirla.')
    }

    const remotePage = page.collabPageId
      ? await getNotebookCollabPageById(page.collabPageId)
      : await createNotebookCollabPage({
        ownerUserId: session.userId,
        title: page.title || exercise.title || 'Hoja colaborativa',
        exerciseSnapshot: exercise,
        notebookState: notebook,
        visibility: 'code',
        lastEditorUserId: session.userId,
      })

    updateNotebookPage(session.userId, selectedBook.id, page.id, {
      collabPageId: remotePage.id,
      shareCode: remotePage.share_code,
    })
    refreshBooks()
    return remotePage
  }, [exercises, refreshBooks, selectedBook, session?.userId])

  const handleCopyShareCode = useCallback(async (page) => {
    if (!page) return

    try {
      setError('')
      const remotePage = await ensureRemotePageForShare(page)
      if (!remotePage) return

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(remotePage.share_code)
        setNotice(`Codigo ${remotePage.share_code} copiado. La hoja sigue siendo privada y solo abre por codigo o enlace.`)
        return
      }

      setNotice(`Codigo de colaboracion: ${remotePage.share_code}.`)
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo activar el codigo de colaboracion de la hoja.')
    }
  }, [ensureRemotePageForShare])

  const handleCopyShareLink = useCallback(async (page) => {
    if (!page) return

    try {
      setError('')
      const remotePage = await ensureRemotePageForShare(page)
      if (!remotePage) return

      const shareLink = buildNotebookShareLink(remotePage.share_code)
      if (!shareLink) {
        setNotice(`Enlace no disponible. Usa el codigo ${remotePage.share_code}.`)
        return
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
        setNotice(`Enlace privado copiado. Tambien puedes compartir el codigo ${remotePage.share_code}.`)
        return
      }

      setNotice(`Enlace privado: ${shareLink}`)
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo generar el enlace de colaboracion de la hoja.')
    }
  }, [ensureRemotePageForShare])

  const handleJoinByCode = useCallback(async (rawInput = '', options = {}) => {
    if (!session?.userId) return false

    const {
      openAfterJoin = false,
      suppressSuccessNotice = false,
    } = options

    const initialInput = String(rawInput || '').trim()
    const promptedInput = initialInput || window.prompt('Introduce el codigo o pega el enlace de la hoja compartida:') || ''
    if (!String(promptedInput || '').trim()) return false

    const shareCode = extractNotebookShareCode(promptedInput)
    if (!shareCode) {
      setError('No se encontro un codigo de hoja valido en ese texto o enlace.')
      return false
    }

    try {
      setError('')
      const remotePage = await joinNotebookCollabPageByCode(shareCode, {
        userId: session.userId,
        username: session.username || session.userId,
      })
      if (!remotePage) {
        throw new Error('No se encontro la hoja colaborativa.')
      }

      const existingLink = books
        .flatMap((book) => book.pages.map((page) => ({ book, page })))
        .find((entry) => entry.page.collabPageId && entry.page.collabPageId === remotePage.id)

      if (existingLink) {
        setActiveBookIdState(existingLink.book.id)
        setActiveNotebookBookId(existingLink.book.id)
        setActiveNotebookPageId(existingLink.page.id)
        setActiveNotebookCollabPageId(existingLink.page.collabPageId || remotePage.id)
        if (!suppressSuccessNotice) {
          setNotice(`La hoja ya estaba en tu biblioteca privada con el codigo ${remotePage.share_code}.`)
        }
        if (openAfterJoin && existingLink.page.linkedExerciseId) {
          setActiveWhiteboardExerciseId(existingLink.page.linkedExerciseId)
          setActiveWhiteboardWorkspaceId('')
          onOpenNotebookPage()
        }
        return true
      }

      const targetBook = selectedBook || saveNotebookBook(session.userId, {
        title: `Colaboracion - ${remotePage.title || remotePage.exercise_snapshot?.title || 'Hoja privada'}`,
        description: 'Cuaderno privado vinculado a una hoja colaborativa por codigo o enlace.',
      })
      const savedExercise = saveWhiteboardExercise({
        ...buildEmptyWhiteboardExercise(),
        ...(remotePage.exercise_snapshot || {}),
        id: null,
        title: remotePage.title || remotePage.exercise_snapshot?.title || 'Hoja compartida',
      })
      const importedNotebook = materializeImportedNotebookPage({
        title: remotePage.title || savedExercise.title,
        kind: 'exercise',
        exercise: remotePage.exercise_snapshot || {},
        notebookPayload: {
          entity: 'whiteboard_notebook',
          notebook: remotePage.notebook_state,
        },
      }, savedExercise)
      saveWhiteboardNotebook(savedExercise.id, importedNotebook)
      const createdPage = createNotebookPage(session.userId, targetBook.id, {
        title: remotePage.title || savedExercise.title,
        kind: 'exercise',
        linkedExerciseId: savedExercise.id,
        exerciseOwnership: 'managed',
        collabPageId: remotePage.id,
        shareCode: remotePage.share_code,
      })
      refreshBooks()
      setActiveBookIdState(targetBook.id)
      setActiveNotebookBookId(targetBook.id)
      setActiveNotebookPageId(createdPage.id)
      setActiveNotebookCollabPageId(remotePage.id)
      if (!suppressSuccessNotice) {
        setNotice(`Te uniste a la hoja colaborativa ${remotePage.title || 'sin titulo'} dentro de tu biblioteca privada.`)
      }
      if (openAfterJoin) {
        setActiveWhiteboardExerciseId(savedExercise.id)
        setActiveWhiteboardWorkspaceId('')
        onOpenNotebookPage()
      }
      return true
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo unir la hoja por codigo.')
      return false
    }
  }, [books, onOpenNotebookPage, refreshBooks, selectedBook, session?.userId])

  useEffect(() => {
    if (!session?.userId || handledSharedLinkRef.current) return
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const sharedInput = url.searchParams.get('notebookShare') || ''
    const shareCode = extractNotebookShareCode(sharedInput)
    if (!shareCode) return

    handledSharedLinkRef.current = shareCode
    handleJoinByCode(shareCode, { openAfterJoin: true, suppressSuccessNotice: true })
      .finally(() => {
        clearNotebookShareQueryParam()
      })
  }, [handleJoinByCode, session?.userId])

  return (
    <div className="page wb-page">
      <div className="menu-shell">
        <div className="menu-card">
          <div className="menu-top">
            <h1 className="menu-title">Mis cuadernos</h1>
            {selectedBook ? <span className="session-user">User: {session.username}</span> : null}
          </div>
          {selectedBook ? (
            <p className="menu-subtitle">
              Crea compendios privados y comparte solo las hojas que decidas mediante codigo o enlace.
            </p>
          ) : null}

          {!selectedBook ? (
            <div className="competitive-menu-group">
              <div className="nb-library-header">
                <div>
                  <div className="saved-title">Estanteria de cuadernos</div>
                </div>
                <div className="nb-library-actions">
                  <button type="button" className="btn" onClick={handleCreateBook}>Nuevo cuaderno</button>
                </div>
              </div>

              {books.length === 0 ? (
                <div className="saved-empty">Todavia no hay cuadernos en esta cuenta.</div>
              ) : (
                <div className="compendium-book-grid nb-bookshelf">
                  {books.map((book, index) => (
                    <div
                      key={book.id}
                      className="nb-book-card-shell"
                    >
                      <div
                        className="nb-book-menu"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="nb-book-menu-trigger"
                          aria-label={`Opciones para ${book.title || 'cuaderno'}`}
                          aria-expanded={openBookMenuId === book.id}
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenBookMenuId((prev) => (prev === book.id ? '' : book.id))
                          }}
                        >
                          ...
                        </button>
                        {openBookMenuId === book.id ? (
                          <div className="nb-book-menu-popover">
                            <button
                              type="button"
                              className="btn danger"
                              onClick={(event) => {
                                event.stopPropagation()
                                setOpenBookMenuId('')
                                handleDeleteBook(book)
                              }}
                            >
                              Eliminar
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        className="compendium-book-card nb-book-card"
                        onClick={() => {
                          setOpenBookMenuId('')
                          setNotice('')
                          setError('')
                          openBookInEditor(book)
                        }}
                        onKeyDown={(event) => handleNotebookCardKeyDown(event, () => {
                          setOpenBookMenuId('')
                          setNotice('')
                          setError('')
                          openBookInEditor(book)
                        })}
                      >
                        <div className="compendium-book-cover nb-book-cover">
                          <div className="nb-book-spine" aria-hidden="true" />
                          <div className="compendium-book-kicker">Cuaderno {index + 1}</div>
                          <div className="compendium-book-title">{book.title || 'Cuaderno sin titulo'}</div>
                          <div className="compendium-book-summary">{book.description || 'Sin descripcion todavia.'}</div>
                          <div className="compendium-book-footer">
                            <div className="compendium-book-stats">
                              <div className="compendium-book-stat">Hojas: {book.pages.length}</div>
                            </div>
                            <div className="nb-book-open-label">Abrir</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="competitive-menu-group nb-book-detail">
              <div className="collection-toolbar">
                <div>
                  <div className="saved-title">{selectedBook.title || 'Cuaderno sin titulo'}</div>
                  <div className="saved-empty">Pantalla privada del cuaderno. Desde aqui gestionas solo sus hojas.</div>
                </div>
                <div className="nb-page-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setActiveBookIdState('')
                      setNotice('')
                      setError('')
                    }}
                  >
                    Volver a cuadernos
                  </button>
                  <button type="button" className="btn" onClick={handleDownloadPageTemplate}>Plantilla de hoja</button>
                  <button type="button" className="btn" onClick={() => handleJoinByCode()}>Unirse por codigo o enlace</button>
                  <button type="button" className="btn" onClick={() => importPageFileRef.current?.click()}>Importar hoja</button>
                  <button type="button" className="btn" onClick={handleExportBook}>Exportar cuaderno</button>
                  <button type="button" className="btn" onClick={handleSaveBook}>Guardar</button>
                  <button type="button" className="btn danger" onClick={() => handleDeleteBook(selectedBook)}>Eliminar</button>
                </div>
              </div>

              <label className="field">
                <span>Titulo del cuaderno</span>
                <input
                  type="text"
                  value={bookDraft.title}
                  onChange={(event) => setBookDraft((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Titulo del cuaderno"
                />
              </label>

              <label className="field">
                <span>Descripcion</span>
                <textarea
                  rows={3}
                  value={bookDraft.description}
                  onChange={(event) => setBookDraft((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Descripcion breve del compendio"
                />
              </label>

              <div className="collection-toolbar">
                <div className="saved-title">Hojas</div>
                <button type="button" className="btn" onClick={handleCreateBlankPage}>Nueva hoja libre</button>
              </div>

              <div className="nb-page-create-row">
                <select value={selectedExerciseId} onChange={(event) => setSelectedExerciseId(event.target.value)}>
                  <option value="">Vincular ejercicio existente</option>
                  {exercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.title || 'Ejercicio sin titulo'}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn" onClick={handleCreateExercisePage}>Agregar ejercicio</button>
              </div>

              {selectedBook.pages.length === 0 ? (
                <div className="saved-empty">Este cuaderno todavia no tiene hojas.</div>
              ) : (
                <div className="saved-list">
                  {selectedBook.pages.map((page, index) => (
                    <div key={page.id} className="saved-item nb-page-card">
                      <div className="saved-item-title">Hoja {index + 1}: {page.title || 'Hoja sin titulo'}</div>
                      <div className="saved-item-meta">
                        {getNotebookPageKindLabel(page)} | {page.exerciseOwnership === 'managed' ? 'Gestionada por el cuaderno' : 'Apunta a un ejercicio existente'}
                      </div>
                      {page.shareCode && <div className="saved-item-tags">Colaboracion activa por codigo: {page.shareCode}</div>}
                      <div className="nb-page-actions">
                        <button type="button" className="btn" onClick={() => handleOpenPage(page)}>Abrir hoja</button>
                        <button type="button" className="btn" onClick={() => handleCopyShareCode(page)}>
                          {page.shareCode ? 'Copiar codigo' : 'Activar codigo'}
                        </button>
                        <button type="button" className="btn" onClick={() => handleCopyShareLink(page)}>
                          {page.shareCode ? 'Copiar enlace' : 'Activar enlace'}
                        </button>
                        <button type="button" className="btn" onClick={() => handleExportPage(page)}>Exportar</button>
                        <button type="button" className="btn" onClick={() => handleRenamePage(page)}>Renombrar</button>
                        <button type="button" className="btn danger" onClick={() => handleDeletePage(page)}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {notice && <div className="saved-empty" style={{ marginTop: 14 }}>{notice}</div>}
          {error && <div className="auth-error" style={{ marginTop: 14 }}>{error}</div>}

          <input
            ref={importBookFileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportBookFile}
          />
          <input
            ref={importPageFileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportPageFile}
          />

          <div className="menu-actions competitive-menu-footer">
            <button type="button" className="btn menu-btn" onClick={onBackToMenu}>Back to Modes</button>
            <button type="button" className="btn menu-btn" onClick={onLogout}>Log out</button>
          </div>
        </div>
      </div>
    </div>
  )
}
