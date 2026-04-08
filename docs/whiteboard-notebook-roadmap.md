# Whiteboard Notebook Roadmap

## Estado actual

El notebook ya existe como superficie funcional dentro del modulo `whiteboard`.

Ya implementado:

- nueva vista `WhiteboardNotebook` conectada al router y al hub de whiteboard,
- hoja central tipo cuaderno con `Enunciado`, objetos sembrados y `Solucion`,
- panel lateral con selector de ejercicio, referencia activa, tecnica enlazada y asistente,
- sembrado automatico de objetos en columnas `Datos`, `Condiciones`, `Aclaraciones`, `Consignas` y `Objetos derivados`,
- ocultado automatico de columnas vacias,
- numeracion de objetos referenciables con codigos como `D1`, `C1`, `A1`, `Q1`, `E1`,
- editor libre en `Solucion` usando `DescriptionEditor`,
- insercion en el editor de referencias activas y nombre de tecnica enlazada,
- captura de seleccion desde la solucion para crear objetos derivados reutilizables,
- persistencia local del notebook por ejercicio,
- endpoint backend `POST /api/whiteboard-notebook/block-assistant`,
- asistente con respuesta JSON estricta y reglas pedagogicas endurecidas,
- soporte de import/export para nueva nomenclatura JSON de ejercicios,
- hoja visual del notebook ajustada a fondo negro para coherencia con la escritura.

Pendiente principal:

- separar tambien en la UI del editor de ejercicios los campos `Datos`, `Condiciones`, `Aclaraciones` y `Consignas`,
- reducir aun mas el payload del asistente para operar solo con objetos referenciados,
- enriquecer los objetos con tipo matematico semantico como `ecuacion`, `integral`, `trinomio`, `sistema`,
- permitir referencias naturales del estilo `la ecuacion 3` o `la integral previa`,
- refinar el contrato del asistente para operar sobre transformaciones todavia mas locales.

## Objetivo

Crear una nueva superficie de trabajo tipo notebook minimalista, con aspecto de hoja estandar, enfocada en la redaccion de resoluciones matematicas por bloques.

Cada bloque debe representar:

- una tecnica elegida o detectada,
- una frase introductoria redactada para el cuaderno,
- la aplicacion concreta de esa tecnica sobre el ejercicio actual,
- enlaces navegables hacia la tecnica correspondiente de la coleccion.

## Base ya disponible en el proyecto

El proyecto ya tiene piezas reutilizables que vuelven esta idea factible:

- `WhiteboardExerciseEditor` ya guarda `statement`, `dataItems`, `officialResult` y `antiproblem`.
- `whiteboardJson` ya define un contrato JSON bastante cercano al notebook.
- `WhiteboardWorkspace` ya sabe sembrar nodos base desde un ejercicio.
- La coleccion `competitive_techniques` ya expone tecnicas con nombre, descripcion y ejemplo.
- El backend en `server/index.js` ya usa OpenAI de forma segura y obliga respuestas estructuradas JSON.
- `MathTokenToolbar` y `DescriptionEditor` ya cubren buena parte de la escritura matematica.

## Propuesta de producto

### 1. Nueva vista: Notebook

Agregar una nueva seccion, separada del whiteboard libre:

- `Whiteboard Notebook`

Esta vista debe mostrar:

- cabecera del ejercicio,
- panel lateral compacto con datos y consignas,
- hoja central estilo cuaderno,
- bloques apilados verticalmente,
- acceso rapido a la botonera matematica,
- acciones de IA por bloque.

### 2. Sembrado automatico desde el JSON del ejercicio

Al abrir el notebook con un ejercicio seleccionado, generar una estructura inicial:

- bloque `Enonce`
- bloque `Donnees`
- bloque `Consignes`
- bloque `Reponse officielle`
- bloque `Antiprobleme`

Estado actual:

- el notebook ya soporta arrays explicitos por categoria,
- si estos arrays no existen, mantiene compatibilidad con el esquema viejo y clasifica heuristcamente desde `dataItems`.

Nomenclatura canonica actual:

- `statement`
- `dataItems`
- `conditionItems`
- `clarificationItems`
- `taskItems`
- `officialResult`
- `antiproblem`

### 3. Bloques de resolucion

Debajo de los bloques semilla, el estudiante crea bloques de resolucion.

La version inicial basada en bloques evoluciono hacia una hoja con objetos sembrados y una zona libre de solucion.

Estado actual del notebook persistido:

- `exerciseId`
- `exerciseTitle`
- `statementHtml`
- `locale`
- `referenceColumns`
- `solutionHtml`
- `activeReferenceId`
- `draftCommand`
- `linkedTechniqueId`
- `assistantState`

Notas:

- la estructura `referenceColumns` contiene `data`, `conditions`, `clarifications`, `tasks` y `derived`,
- los bloques de resolucion como entidades separadas siguen siendo una posibilidad futura si mas adelante queremos historiales o pasos discretos independientes.

Modelo de bloque considerado a futuro:

- `id`
- `type`
- `title`
- `techniqueId`
- `promptText`
- `studentDraft`
- `aiDraft`
- `mathContent`
- `locale`
- `status`
- `references`

Tipos iniciales sugeridos:

- `seed`
- `technique_application`
- `free_note`
- `result`

### 4. Enlaces a tecnicas

Cuando un bloque tenga `techniqueId`, el notebook debe renderizar:

- nombre visible de la tecnica,
- enlace a la ficha de la tecnica,
- resumen corto opcional,
- ejemplo trabajado desplegable si existe.

Ejemplo:

- texto del bloque: `On applique le critere de colinearite sur les vecteurs AB et AC.`
- la porcion `critere de colinearite` enlaza a la tecnica guardada.

### 5. Ayuda de OpenAI para escribir y ejecutar tecnicas

La IA no deberia resolver todo de golpe. Debe operar por bloque.

Capacidades deseadas:

- reformular lo que el estudiante quiere hacer en estilo matematico limpio,
- traducir o normalizar al idioma del cuaderno,
- detectar la tecnica mencionada,
- insertar una frase de apertura correcta,
- proponer la aplicacion concreta de la tecnica usando el ejercicio actual,
- abreviar o expandir la redaccion segun pedido,
- mantener el foco en el paso actual.

Ejemplo de flujo:

1. El estudiante escribe: `Voy a aplicar el criterio de colinealidad para los vectores AB y AC`.
2. El frontend envia:
   - ejercicio actual,
   - bloque actual,
   - tecnica candidata,
   - idioma objetivo,
   - instruccion del estudiante.
3. OpenAI devuelve JSON estructurado en modo:
   - `clarify`
   - `execute`

Reglas endurecidas ya aplicadas:

- no resolver todo el ejercicio,
- no decidir el siguiente paso por el estudiante,
- no ejecutar dos transformaciones si solo se pidio una,
- no concluir una demostracion o un calculo sin orden explicita,
- no elegir entre interpretaciones plausibles si hay ambiguedad,
- hacer exactamente una pregunta precisa cuando falten detalles,
- operar con alcance local y preferir transformaciones minimas.

## Arquitectura recomendada

### Frontend

Nuevos modulos sugeridos:

- `src/WhiteboardNotebook.jsx`
- `src/lib/whiteboardNotebook.js`
- `src/lib/whiteboardNotebookApi.js`

Estado actual:

- estos modulos ya existen y estan integrados en la app.

Responsabilidades:

- construir el notebook inicial desde el ejercicio,
- editar, reordenar y persistir bloques,
- invocar ayuda de IA por bloque,
- renderizar texto enriquecido con matematica y enlaces a tecnicas.

### Persistencia

Opcion futura recomendada:

- nueva tabla `whiteboard_notebooks`
- nueva tabla `whiteboard_notebook_blocks`

Campos sugeridos:

- notebook: `id`, `exercise_local_id`, `owner_user_id`, `title`, `locale`, `state_json`, `created_at`, `updated_at`
- blocks: `id`, `notebook_id`, `sort_order`, `block_type`, `technique_id`, `content_json`, `created_at`, `updated_at`

Ventaja:

- permite versionar el cuaderno aparte del whiteboard espacial,
- no rompe el flujo actual de workspaces,
- deja abierta colaboracion futura.

### OpenAI

Ruta ya implementada:

- `POST /api/whiteboard-notebook/block-assistant`

Reglas actuales del prompt:

- usar solo el contexto local realmente necesario,
- responder JSON estricto,
- no inventar datos ausentes,
- no avanzar mas alla del paso pedido,
- privilegiar frases cortas y notacion matematica clara,
- diferenciar `redaction help` de `math execution`.

Optimizacion pendiente recomendada:

- dejar de enviar el enunciado por defecto,
- enviar solo `student_command`, `resolved_objects`, tecnica enlazada y una cola corta de solucion reciente,
- activar contexto global solo cuando la orden sea realmente global.

## Contrato JSON actual para IA

```json
{
  "mode": "clarify",
  "clarificationQuestion": "Que expresion exacta quieres completar cuadrados?"
}
```

```json
{
  "mode": "execute",
  "draftedIntroduction": "Aplicando factorizacion por trinomio cuadrado perfecto al trinomio de la ecuacion 3:",
  "draftedBodyHtml": "<p>...</p>",
  "referenceTailSuggestion": "sobre el trinomio de E3"
}
```

## Riesgos reales

### 1. Mezcla entre categorias del ejercicio

Mitigacion actual:

- existe una nomenclatura canonica con arrays explicitos por categoria.

Riesgo residual:

- el editor visual todavia no obliga ni facilita esa separacion de forma nativa.

### 2. Identificacion de tecnica

La IA puede confundir tecnicas cercanas si la taxonomia no esta bien normalizada.

Mitigacion:

- primero buscar coincidencias locales por nombre y alias,
- luego usar OpenAI solo para desambiguar.

### 3. Exceso de autonomia

Si la IA escribe demasiados pasos, deja de ser cuaderno del estudiante y pasa a ser solucionador.

Mitigacion:

- una accion de IA por bloque,
- limite de expansion,
- modo `reformular`, `abreviar`, `aplicar`, `continuar un paso`.

## Fases sugeridas

### Fase 1

- crear vista `Notebook`,
- sembrar hoja base desde el ejercicio,
- persistir notebook en local state,
- mostrar referencias activas y tecnica enlazada.

Estado:

- completada.

### Fase 2

- agregar objetos derivados creados desde la solucion,
- selector de tecnica conectado al catalogo,
- render de enlaces clicables dentro del texto.

Estado:

- completada en su base funcional.

### Fase 3

- ruta segura OpenAI para ayuda local,
- modo `clarify` y modo `execute`,
- generacion controlada de frases y pasos.

Estado:

- completada en version inicial endurecida.

### Fase 4

- separar formalmente categorias del ejercicio en el esquema JSON,
- mejorar clasificacion y referencias futuras,
- optimizar payload para bajar costo.

Estado:

- parcialmente completada.

## Conclusion

Si, es factible y ya existe una primera version funcional bastante avanzada.

La forma mas sana de construirlo es:

- notebook separado del whiteboard espacial,
- objetos matematicos referenciables sembrados y derivados,
- OpenAI limitado a asistencia puntual y local,
- tecnicas enlazadas a la coleccion ya existente,
- sembrado automatico desde el JSON canonico del ejercicio.
