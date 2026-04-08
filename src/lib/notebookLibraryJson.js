import {
  buildWhiteboardNotebookExportJson,
  buildWhiteboardNotebookFromExercise,
  buildWhiteboardNotebookTemplateJson,
  normalizeWhiteboardNotebookImportPayload,
} from './whiteboardNotebook'
import { buildEmptyWhiteboardExercise } from './whiteboardPrototype'

const NOTEBOOK_LIBRARY_FORMAT = 'inticore-notebook-book-v1'
const TEACHER_GENERATION_BUNDLE_ENTITY = 'notebook_teacher_generation_bundle'

function firstFilled(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    return value
  }
  return ''
}

function normalizeRichField(value) {
  return String(value || '').trim()
}

function buildNotebookPageImportEntry(entry, fallbackTitle = 'Hoja importada') {
  const safe = entry && typeof entry === 'object' ? entry : {}
  const notebookPayload = safe.notebook && typeof safe.notebook === 'object' ? safe.notebook : null
  const title = String(safe.title || fallbackTitle).trim() || fallbackTitle

  return {
    title,
    kind: String(safe.kind || 'sheet').trim() || 'sheet',
    exercise: normalizeExerciseSnapshot(
      safe.exercise || buildExerciseSnapshotFromNotebookPayload(notebookPayload, title),
      title
    ),
    notebookPayload,
  }
}

function normalizeExerciseSnapshot(exercise, fallbackTitle = 'Hoja sin titulo') {
  const safe = exercise && typeof exercise === 'object' ? exercise : {}

  return {
    ...buildEmptyWhiteboardExercise(),
    ...safe,
    id: '',
    title: String(safe.title || fallbackTitle).trim() || fallbackTitle,
    topic: String(safe.topic || '').trim(),
    sourceBook: String(safe.sourceBook || '').trim(),
    sourceAuthor: String(safe.sourceAuthor || '').trim(),
    sourcePage: String(safe.sourcePage || '').trim(),
    sourceSection: String(safe.sourceSection || '').trim(),
    sourceReference: String(safe.sourceReference || '').trim(),
    statement: normalizeRichField(safe.statement),
    statementFr: normalizeRichField(safe.statementFr || safe.statement_fr),
    officialResult: normalizeRichField(safe.officialResult),
    dataItems: Array.isArray(safe.dataItems) ? safe.dataItems : [],
    dataItemsFr: Array.isArray(safe.dataItemsFr || safe.data_items_fr) ? (safe.dataItemsFr || safe.data_items_fr) : [],
    conditionItems: Array.isArray(safe.conditionItems) ? safe.conditionItems : [],
    conditionItemsFr: Array.isArray(safe.conditionItemsFr || safe.condition_items_fr) ? (safe.conditionItemsFr || safe.condition_items_fr) : [],
    clarificationItems: Array.isArray(safe.clarificationItems) ? safe.clarificationItems : [],
    clarificationItemsFr: Array.isArray(safe.clarificationItemsFr || safe.clarification_items_fr) ? (safe.clarificationItemsFr || safe.clarification_items_fr) : [],
    taskItems: Array.isArray(safe.taskItems) ? safe.taskItems : [],
    taskItemsFr: Array.isArray(safe.taskItemsFr || safe.task_items_fr) ? (safe.taskItemsFr || safe.task_items_fr) : [],
    antiproblem: normalizeRichField(safe.antiproblem),
  }
}

function extractNotebookSource(payload) {
  if (!payload || typeof payload !== 'object') return null
  return payload.notebook || payload.whiteboardNotebook || payload.whiteboard_notebook || payload
}

function buildExerciseSnapshotFromNotebookPayload(notebookPayload, fallbackTitle = 'Hoja importada') {
  const source = extractNotebookSource(notebookPayload)
  if (!source || typeof source !== 'object') {
    return normalizeExerciseSnapshot({ title: fallbackTitle }, fallbackTitle)
  }

  const notebook = source.notebook && typeof source.notebook === 'object' ? source.notebook : source
  const references = Array.isArray(notebook.references) ? notebook.references : []

  const dataItems = []
  const dataItemsFr = []
  const conditionItems = []
  const conditionItemsFr = []
  const clarificationItems = []
  const clarificationItemsFr = []
  const taskItems = []
  const taskItemsFr = []

  references.forEach((reference) => {
    const safe = reference && typeof reference === 'object' ? reference : {}
    const type = String(firstFilled(safe.type, safe.kind) || 'data').trim().toLowerCase()
    const content = normalizeRichField(firstFilled(safe.content, safe.html, safe.text))
    const contentFr = normalizeRichField(firstFilled(safe.contentFr, safe.content_fr, safe.htmlFr, safe.html_fr, safe.textFr, safe.text_fr))
    if (!content && !contentFr) return

    if (type === 'task') {
      taskItems.push(content)
      taskItemsFr.push(contentFr)
      return
    }

    if (type === 'condition') {
      conditionItems.push(content)
      conditionItemsFr.push(contentFr)
      return
    }

    if (type === 'clarification') {
      clarificationItems.push(content)
      clarificationItemsFr.push(contentFr)
      return
    }

    if (type === 'derived') {
      return
    }

    dataItems.push(content)
    dataItemsFr.push(contentFr)
  })

  return normalizeExerciseSnapshot({
    title: String(firstFilled(notebook.exerciseTitle, source.exerciseTitle) || fallbackTitle).trim() || fallbackTitle,
    topic: String(firstFilled(source.topic, notebook.topic) || '').trim(),
    statement: normalizeRichField(firstFilled(notebook.statement, notebook.statementHtml, source.statement)),
    statementFr: normalizeRichField(firstFilled(notebook.statementFr, notebook.statement_fr, notebook.statementHtmlFr, source.statementFr)),
    dataItems,
    dataItemsFr,
    conditionItems,
    conditionItemsFr,
    clarificationItems,
    clarificationItemsFr,
    taskItems,
    taskItemsFr,
  }, fallbackTitle)
}

export function buildNotebookPageTemplateJson() {
  return {
    format: NOTEBOOK_LIBRARY_FORMAT,
    entity: 'notebook_page',
    version: 1,
    notes: [
      'Importa esta plantilla dentro de un cuaderno desde la biblioteca de Notebooks.',
      'La hoja usa el formato interno del notebook, con referencias, sembrado de enunciado, datos y consignas.',
      'Los campos ricos aceptan HTML del editor o texto con ecuaciones entre $...$.',
      'La forma preferida para ecuaciones es HTML con <span data-type="math-inline" data-latex="..."></span>.',
      'Por defecto genera solo la hoja sembrada: enunciado, datos y consignas. No redactes la resolucion salvo que la instruccion la pida explicitamente.',
      'Las referencias deben ser atomicas y citables. Si la instruccion pide resolucion, usa [D1] y [Q1] para citar el sembrado existente.',
      'El enunciado, los datos y las consignas pueden venir en espanol y frances. Si falta un campo frances, se permite dejarlo vacio.',
      'No inventes datos fuera del enunciado. En Datos solo deben aparecer afirmaciones textuales o reformulaciones literales del enunciado; no agregues interpretaciones, avances, ni conclusiones intermedias.',
    ].join(' '),
    generationGuide: {
      audience: 'student_or_teacher',
      objective: 'Producir una hoja sembrada compatible con el notebook de IntiCore.',
      pedagogicalStyle: [
        'Redactar como cuaderno escolar ordenado.',
        'Sembrar primero el enunciado y sus elementos explicitos.',
        'Usar pasos cortos y locales solo si la instruccion pide resolucion.',
        'Citar referencias explicitamente cuando ayuden a seguir la resolucion.',
      ],
      outputChecklist: [
        'La hoja tiene enunciado.',
        'La hoja tiene datos y consignas claramente separadas.',
        'La resolucion queda vacia salvo pedido explicito.',
        'Si hay resolucion, usa el sistema de referencias del notebook.',
        'Las ecuaciones respetan el formato interno del editor o $...$.',
      ],
    },
    page: {
      title: 'Hoja sembrada - Ejemplo',
      kind: 'exercise',
      exercise: {
        title: 'Hoja sembrada - Ejemplo',
        topic: 'Tema',
        statement: 'Resuelve $x^2+5x+6=0$.',
        statementFr: 'Resous $x^2+5x+6=0$.',
        dataItems: ['La ecuacion dada es $x^2+5x+6=0$.'],
        dataItemsFr: ['L equation donnee est $x^2+5x+6=0$.'],
        taskItems: ['Resolver la ecuacion.'],
        taskItemsFr: ['Resoudre l equation.'],
      },
      notebook: {
        ...buildWhiteboardNotebookTemplateJson(),
        notes: [
          'Rellena el objeto notebook con sembrado minimo compatible con el editor rico.',
          'Deja la solucion vacia salvo que la instruccion pida explicitamente una hoja resuelta.',
          'Usa solo referencias visibles del tipo data y task para sembrar la hoja.',
          'No generes referencias derived en la plantilla; si la resolucion necesita un intermedio, redactalo dentro de la solucion.',
        ].join(' '),
      },
    },
  }
}

export function buildNotebookTeacherGenerationTemplateJson(exercise) {
  const sourceExercise = normalizeExerciseSnapshot(exercise, 'Ejercicio base')
  const seededOriginalNotebook = buildWhiteboardNotebookFromExercise(sourceExercise)
  const originalPagePayload = buildWhiteboardNotebookExportJson(seededOriginalNotebook)

  return {
    format: NOTEBOOK_LIBRARY_FORMAT,
    entity: TEACHER_GENERATION_BUNDLE_ENTITY,
    version: 1,
    notes: [
      'Esta plantilla esta pensada para que una IA docente genere un paquete completo de trabajo a partir de un ejercicio base.',
      'La salida debe crear exactamente un ejemplo resuelto parecido y exactamente tres hojas de ejercicios.',
      'Una de las tres hojas debe ser el ejercicio original, preservando fielmente su enunciado y su sembrado de datos y consignas.',
      'Las otras dos hojas deben ser variantes parecidas, del mismo tema y dificultad comparable, pero no copias triviales.',
      'El ejemplo resuelto debe ser didactico, paso a paso, con referencias explicitas como [D1] y [Q1] cuando sean utiles.',
      'Cada hoja y ejemplo debe respetar el formato matematico del notebook: HTML del editor o texto con ecuaciones entre $...$; la forma preferida es <span data-type="math-inline" data-latex="..."></span>.',
      'Las hojas de practica deben venir solo sembradas por defecto; la resolucion completa se reserva para el ejemplo resuelto o para pedidos explicitos.',
      'Cuando haya resolucion, debe sonar como cuaderno escolar ordenado: pasos cortos, citas locales, sin inventar datos fuera del ejercicio ni convertir interpretaciones en datos sembrados.',
      'La salida debe poder importarse directamente en Notebooks como un cuaderno nuevo.',
      'Para cada hoja, la IA debe devolver el ejercicio sembrado y el notebook correspondiente; solo el ejemplo resuelto requiere solucion por defecto.',
    ].join(' '),
    generationSpec: {
      audience: 'teacher',
      objective: 'Generar un cuaderno didactico reusable para clase a partir de un ejercicio base.',
      pedagogicalStyle: {
        workedExample: [
          'Resolver paso a paso con tono explicativo.',
          'Citar referencias [D*] y [Q*] cuando aclaren el razonamiento.',
          'Si aparece un resultado intermedio, redactarlo dentro de la resolucion sin convertirlo en una referencia nueva.',
        ],
        practiceSheets: [
          'Mantener dificultad comparable al ejercicio base.',
          'No hacer copias triviales del enunciado salvo la hoja original.',
          'Sembrar datos y consignas de forma limpia para facilitar el inicio.',
          'Mantener los datos sembrados literales al enunciado, sin adelantar inferencias.',
        ],
      },
      requiredOutputs: {
        workedExampleCount: 1,
        practiceSheetCount: 3,
        includeOriginalExercise: true,
      },
      qualityChecklist: [
        'El ejemplo resuelto es similar al ejercicio base, pero no identico.',
        'Las tres hojas conservan compatibilidad con el sembrado de datos y consignas.',
        'La hoja original preserva el enunciado fuente.',
        'Las variantes no introducen tecnicas fuera del nivel del ejercicio base sin explicacion.',
        'Las referencias son atomicas, reutilizables y citables dentro de la solucion.',
        'Los datos sembrados no agregan interpretaciones ni resultados que no aparezcan textualmente en el enunciado.',
        'Las ecuaciones usan el formato interno del notebook o $...$ para importacion segura.',
      ],
      teacherChecks: [
        'El ejemplo resuelto y las variantes son matematicamente coherentes.',
        'Las variantes son utiles para practicar la misma idea, no otra distinta.',
        'La hoja original se mantiene fiel al ejercicio de partida.',
      ],
    },
    book: {
      title: `Secuencia didactica - ${sourceExercise.title || 'Ejercicio base'}`,
      description: 'Cuaderno generado para docente con un ejemplo resuelto parecido y tres hojas de ejercicios.',
    },
    sourceExercise,
    outputs: {
      workedExample: {
        title: `Ejemplo resuelto parecido - ${sourceExercise.title || 'Ejercicio base'}`,
        kind: 'worked_example',
        role: 'worked_example',
        pedagogicalGoal: 'Modelar una resolucion cercana al ejercicio base usando el sistema de referencias del notebook.',
        exercise: {
          title: '',
          topic: sourceExercise.topic,
          statement: '',
          statementFr: '',
          dataItems: [],
          dataItemsFr: [],
          taskItems: [],
          taskItemsFr: [],
        },
        notebook: buildWhiteboardNotebookTemplateJson(),
      },
      practiceSheets: [
        {
          title: `Hoja 1 - Ejercicio original - ${sourceExercise.title || 'Ejercicio base'}`,
          kind: 'exercise',
          role: 'original',
          pedagogicalGoal: 'Conservar el ejercicio fuente como una de las hojas del paquete.',
          exercise: sourceExercise,
          notebook: originalPagePayload,
        },
        {
          title: `Hoja 2 - Variante guiada - ${sourceExercise.title || 'Ejercicio base'}`,
          kind: 'practice',
          role: 'variant_a',
          pedagogicalGoal: 'Practicar la misma idea central con una variante cercana.',
          exercise: {
            title: '',
            topic: sourceExercise.topic,
            statement: '',
            statementFr: '',
            dataItems: [],
            dataItemsFr: [],
            taskItems: [],
            taskItemsFr: [],
          },
          notebook: buildWhiteboardNotebookTemplateJson(),
        },
        {
          title: `Hoja 3 - Variante de consolidacion - ${sourceExercise.title || 'Ejercicio base'}`,
          kind: 'practice',
          role: 'variant_b',
          pedagogicalGoal: 'Consolidar la tecnica con otra variante compatible en dificultad.',
          exercise: {
            title: '',
            topic: sourceExercise.topic,
            statement: '',
            statementFr: '',
            dataItems: [],
            dataItemsFr: [],
            taskItems: [],
            taskItemsFr: [],
          },
          notebook: buildWhiteboardNotebookTemplateJson(),
        },
      ],
    },
  }
}

export function buildNotebookPageExportJson({ page, exercise, notebook }) {
  const notebookPayload = notebook
    ? buildWhiteboardNotebookExportJson(notebook)
    : buildWhiteboardNotebookTemplateJson()

  return {
    format: NOTEBOOK_LIBRARY_FORMAT,
    entity: 'notebook_page',
    version: 1,
    exportedAt: new Date().toISOString(),
    page: {
      title: String(page?.title || exercise?.title || notebook?.exerciseTitle || 'Hoja sin titulo').trim() || 'Hoja sin titulo',
      kind: String(page?.kind || 'sheet').trim() || 'sheet',
      exercise: normalizeExerciseSnapshot(exercise, page?.title || 'Hoja sin titulo'),
      notebook: notebookPayload,
    },
  }
}

export function buildNotebookBookExportJson({ book, pages = [] }) {
  return {
    format: NOTEBOOK_LIBRARY_FORMAT,
    entity: 'notebook_book',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: 'Cada pagina exporta internamente un notebook completo compatible con el sistema de sembrado, referencias y ecuaciones del editor.',
    book: {
      title: String(book?.title || 'Cuaderno sin titulo').trim() || 'Cuaderno sin titulo',
      description: String(book?.description || '').trim(),
      inviteCode: String(book?.inviteCode || '').trim(),
      pages: (Array.isArray(pages) ? pages : []).map((entry) => buildNotebookPageExportJson(entry).page),
    },
  }
}

export function normalizeNotebookLibraryImportPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const entity = String(payload.entity || '').trim().toLowerCase()

  if (entity === TEACHER_GENERATION_BUNDLE_ENTITY) {
    const book = payload.book && typeof payload.book === 'object' ? payload.book : {}
    const sourceExercise = normalizeExerciseSnapshot(payload.sourceExercise, 'Ejercicio base')
    const outputs = payload.outputs && typeof payload.outputs === 'object' ? payload.outputs : {}
    const workedExample = buildNotebookPageImportEntry(
      outputs.workedExample,
      `Ejemplo resuelto parecido - ${sourceExercise.title || 'Ejercicio base'}`
    )
    const practiceSheetsRaw = Array.isArray(outputs.practiceSheets) ? outputs.practiceSheets : []
    const practiceSheets = practiceSheetsRaw.map((entry, index) =>
      buildNotebookPageImportEntry(entry, `Hoja ${index + 1} - ${sourceExercise.title || 'Ejercicio base'}`)
    )

    const hasOriginalExercise = practiceSheets.some((page) => String(page?.role || page?.sourceRole || '').trim().toLowerCase() === 'original'
      || page.exercise?.statement === sourceExercise.statement)

    const normalizedPracticeSheets = hasOriginalExercise
      ? practiceSheets
      : [
          buildNotebookPageImportEntry({
            title: `Hoja 1 - Ejercicio original - ${sourceExercise.title || 'Ejercicio base'}`,
            kind: 'exercise',
            exercise: sourceExercise,
            notebook: buildWhiteboardNotebookExportJson(buildWhiteboardNotebookFromExercise(sourceExercise)),
          }, `Hoja 1 - Ejercicio original - ${sourceExercise.title || 'Ejercicio base'}`),
          ...practiceSheets,
        ]

    while (normalizedPracticeSheets.length < 3) {
      const nextIndex = normalizedPracticeSheets.length + 1
      normalizedPracticeSheets.push(buildNotebookPageImportEntry({
        title: `Hoja ${nextIndex} - Variante pendiente - ${sourceExercise.title || 'Ejercicio base'}`,
        kind: 'practice',
        exercise: {
          title: `Hoja ${nextIndex} - Variante pendiente`,
          topic: sourceExercise.topic,
          statement: '',
          statementFr: '',
          dataItems: [],
          dataItemsFr: [],
          taskItems: [],
          taskItemsFr: [],
        },
        notebook: buildWhiteboardNotebookTemplateJson(),
      }, `Hoja ${nextIndex} - Variante pendiente - ${sourceExercise.title || 'Ejercicio base'}`))
    }

    const finalPracticeSheets = normalizedPracticeSheets.slice(0, 3)

    return {
      kind: 'book',
      title: String(book.title || `Secuencia didactica - ${sourceExercise.title || 'Ejercicio base'}`).trim() || `Secuencia didactica - ${sourceExercise.title || 'Ejercicio base'}`,
      description: String(book.description || 'Cuaderno generado para docente con ejemplo resuelto y hojas de practica.').trim(),
      pages: [workedExample, ...finalPracticeSheets].filter(Boolean),
    }
  }

  if (entity === 'notebook_book') {
    const book = payload.book && typeof payload.book === 'object' ? payload.book : {}
    return {
      kind: 'book',
      title: String(book.title || 'Cuaderno importado').trim() || 'Cuaderno importado',
      description: String(book.description || '').trim(),
      pages: (Array.isArray(book.pages) ? book.pages : []).map((entry, index) =>
        buildNotebookPageImportEntry(entry, `Hoja ${index + 1}`)
      ),
    }
  }

  if (entity === 'notebook_page') {
    const page = payload.page && typeof payload.page === 'object' ? payload.page : {}
    const title = String(page.title || 'Hoja importada').trim() || 'Hoja importada'
    return {
      kind: 'page',
      title,
      pages: [buildNotebookPageImportEntry(page, title)],
    }
  }

  if (String(payload.entity || '').trim().toLowerCase() === 'whiteboard_notebook' || String(payload.format || '').trim() === 'inticore-whiteboard-notebook-v1') {
    const exercise = buildExerciseSnapshotFromNotebookPayload(payload, 'Hoja importada')
    return {
      kind: 'page',
      title: exercise.title || 'Hoja importada',
      pages: [{
        title: exercise.title || 'Hoja importada',
        kind: 'exercise',
        exercise,
        notebookPayload: payload,
      }],
    }
  }

  return null
}

export function materializeImportedNotebookPage(importedPage, savedExercise) {
  const notebookPayload = importedPage?.notebookPayload
  if (!notebookPayload || !savedExercise?.id) {
    return buildWhiteboardNotebookFromExercise(savedExercise)
  }

  return normalizeWhiteboardNotebookImportPayload(savedExercise, notebookPayload) || buildWhiteboardNotebookFromExercise(savedExercise)
}
