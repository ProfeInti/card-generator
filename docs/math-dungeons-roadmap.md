# Math Dungeons Roadmap

## Estado Actual

Math Dungeons ya tiene una base funcional dividida en dos superficies:

- `teacher`: editor persistente de mazmorras.
- `student`: personajes por cuenta, runs persistentes y runtime jugable inicial.

El sistema actual incluye:

- Editor de mazmorras solo para `teacher`.
- Persistencia de mazmorras en Supabase.
- Persistencia de desafios y rewards por mazmorra.
- Contexto de mazmorra en texto y JSON.
- Desafios en formulario y JSON.
- Rewards en formulario y JSON.
- Visibilidad de mazmorra: `private` o `published`.
- Personajes por cuenta con clase, stats, nivel e inventario.
- Runs persistentes con sala actual y snapshot de personaje.
- Pantalla de run activa para abrir una run existente.
- Resolucion de sala actual desde `context_json`.
- Panel de personaje, inventario de run, loot de sala y desafio activo.
- Acciones base del runtime: inspeccionar, moverse, pedir pista, marcar exito o fallo, recoger rewards.
- Guardado incremental del progreso en `math_dungeon_runs`.
- Integracion inicial con backend seguro para OpenAI.
- Narracion estructurada por JSON con sugerencias limitadas de reglas.

## Archivos Clave

- `src/MathDungeonsHub.jsx`
- `src/MathDungeonsRun.jsx`
- `src/lib/mathDungeons.js`
- `src/lib/mathDungeonsRuntimeApi.js`
- `src/data/mathDungeonsRepo.js`
- `server/index.js`
- `supabase/migrations/20260324_create_math_dungeons.sql`
- `supabase/migrations/20260324_math_dungeons_phase3_runtime.sql`

## Modelo Ya Implementado

### Mazmorras

Tabla principal:

- `math_dungeons`

Campos relevantes:

- `created_by`
- `visibility`
- `title`
- `theme`
- `context_text`
- `context_json`
- `player_defaults`

Tablas hijas:

- `math_dungeon_challenges`
- `math_dungeon_rewards`

### Personajes

Tabla:

- `math_dungeon_characters`

Campos relevantes:

- `owner_user_id`
- `name`
- `class_id`
- `level`
- `experience`
- `base_stats`
- `current_stats`
- `inventory`

### Runs

Tabla:

- `math_dungeon_runs`

Campos relevantes:

- `player_user_id`
- `character_id`
- `dungeon_id`
- `status`
- `current_room_id`
- `character_snapshot`
- `state_json`

## Reglas de Producto Acordadas

- La IA no controla la verdad del juego.
- El motor del juego controla HP, pistas, inventario, sala actual, loot y progreso.
- La IA actua como narrador, interprete y operador del desafio bajo reglas estrictas.
- La IA no debe adelantarse ni resolver ejercicios sin que el estudiante lo pida.
- Cada desafio tiene 3 pistas maximo.
- Si se consumen las 3 pistas, el desafio falla.
- Los enemigos pueden lanzar preguntas de habilidad relacionadas con el ejercicio.
- Si el estudiante responde correctamente la prueba, evita o reduce dano.

## Fases Completadas

### Fase 1

- Contrato inicial del editor.
- Contexto, desafios, rewards y stats base.

### Fase 2

- Persistencia de mazmorras en Supabase.
- Persistencia de desafios y rewards.
- Editor solo para `teacher`.

### Fase 3

- Publicacion de mazmorras.
- Personajes por cuenta.
- Runs persistentes por cuenta.

### Fase 4: Runtime Jugable

- Pantalla de run activa.
- Carga de `math_dungeon_runs`.
- Render de sala actual.
- Panel de estado del personaje.
- Panel de inventario.
- Panel de desafio activo.
- Acciones basicas del jugador.
- Guardado incremental del progreso.

Estado minimo de runtime:

- `currentRoomId`
- `currentHealth`
- `currentFocus`
- `resolvedChallenges`
- `collectedRewards`
- `roomVisitLog`
- `hintsRemainingByChallenge`
- `activeChallengeId`

### Fase 5: Integracion OpenAI

- La API key debe vivir solo en backend seguro o edge function.
- La IA debe responder en JSON estructurado.
- La IA no modifica estado directamente.
- El frontend o backend aplica los cambios del motor.
- Endpoint seguro implementado en `server/index.js`.
- El frontend consulta el runtime seguro con el token de Supabase.
- La respuesta actual puede narrar y sugerir:
  - revelar loot
  - activar desafio
  - devolver feedback estructurado

## Trabajo Completado en Esta Iteracion

1. Se agrego `MathDungeonsRun.jsx` como runtime inicial jugable.
2. Se conecto la navegacion para abrir runs desde el hub.
3. Se agrego carga puntual de run y actualizacion de run en el repositorio.
4. Se resolvieron rooms, exits, challenges y rewards desde `context_json`.
5. Se implemento persistencia incremental del estado de run.
6. Se conecto un backend local seguro para OpenAI usando `OPENAI_API_KEY` solo en servidor.
7. Se agrego un panel "Dungeon Master" para consultar narracion estructurada desde la run activa.

## Riesgos Tecnicos

- Que el prompt de IA mezcle narracion con autoridad de reglas.
- Que el contexto JSON no sea lo bastante estable.
- Que el runtime no separe bien exploracion, acertijo y combate.
- Que los desafios no tengan criterios suficientes para evaluar acciones parciales.
- Que el backend local de runtime quede desalineado con el despliegue final si luego migramos a edge functions.

## Proximo Trabajo Recomendado

1. Reemplazar los botones manuales de "Mark Success" y "Mark Failure" por evaluacion mas fina basada en respuesta del estudiante.
2. Expandir `rulesSuggestion` para soportar movimiento sugerido, dano sugerido, gasto de focus y uso de objetos.
3. Agregar historial narrativo persistente por run.
4. Distinguir mejor modos `exploration`, `puzzle` y `combat` en el motor y en la UI.
5. Validar si la ruta segura de OpenAI debe quedarse en `server/` o migrarse a Supabase Edge Functions.
6. Crear pruebas manuales o automatizadas para contratos JSON del runtime.
7. Mejorar contenido de `context_json` para soportar condiciones de puertas, eventos especiales y estados intermedios de sala.
