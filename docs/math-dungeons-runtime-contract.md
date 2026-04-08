# Math Dungeons Runtime Contract

## Objetivo

Definir el contrato de datos entre:

- mazmorra persistida
- run activa
- motor de juego
- capa OpenAI

## Entradas Estructurales

### Dungeon Context

Fuente:

- `math_dungeons.context_json`

Debe incluir:

- salas
- conexiones
- room ids
- descripcion de cada sala
- ubicacion de desafios
- tipo de desafio por sala
- ubicacion y condicion de loot
- eventos especiales
- `startingRoomId`

### Challenge JSON

Fuente:

- `math_dungeon_challenges.challenge_json`

Debe incluir:

- `id`
- `type`
- `mathTopic`
- `exercisePrompt`
- `hints`
- `successOutcome`
- `failureOutcome`
- `enemyProfile` cuando aplique

### Reward JSON

Fuente:

- `math_dungeon_rewards.reward_json`

Debe incluir:

- `id`
- `name`
- `rewardType`
- `rarity`
- `effect`
- `description`

## Estado de Run

Fuente:

- `math_dungeon_runs.state_json`

Campos base:

- `currentHealth`
- `currentFocus`
- `currentRoomId`
- `resolvedChallenges`
- `collectedRewards`
- `revealedRewardIds`
- `roomVisitLog`
- `hintsRemainingByChallenge`
- `activeChallengeId`

## Estado de Personaje

Fuente:

- `math_dungeon_runs.character_snapshot`

Campos base:

- `id`
- `name`
- `classId`
- `level`
- `stats`
- `inventory`

## Modos de Interaccion

### Exploracion

La IA:

- narra
- interpreta la intencion del jugador
- propone respuesta contextual

El motor:

- valida si la accion existe
- mueve de sala
- revela loot
- activa desafio

### Acertijo

La IA:

- ejecuta solo la accion pedida
- evalua pasos parciales
- da pista solo si el jugador la pide

El motor:

- consume pistas
- marca fallo al llegar a 3
- marca exito o fallo final

### Combate

La IA:

- narra al enemigo
- formula prueba de habilidad
- evalua la respuesta puntual

El motor:

- aplica dano
- evita dano si la prueba se supera
- actualiza HP y estado del enemigo

## Payload Recomendado a OpenAI

```json
{
  "mode": "exploration",
  "dungeon": {
    "id": "dungeon-id",
    "title": "Vault of Broken Signs",
    "theme": "Ancient calculus temple",
    "currentRoomId": "entrance",
    "setting": "Ancient underground calculus temple",
    "tone": "Mysterious and scholarly"
  },
  "currentRoom": {
    "id": "entrance",
    "name": "Atrium of Echoing Symbols",
    "description": "A cold chamber with glowing inscriptions.",
    "exits": [],
    "visibleLoot": []
  },
  "activeChallenge": null,
  "character": {
    "id": "player-id",
    "name": "Adventurer",
    "classId": "scribe",
    "level": 1,
    "stats": {},
    "inventoryCount": 0
  },
  "runState": {
    "currentHealth": 18,
    "currentFocus": 3,
    "currentRoomId": "entrance",
    "activeChallengeId": null,
    "resolvedChallenges": [],
    "revealedRewardIds": [],
    "collectedRewards": [],
    "hintsRemainingByChallenge": {},
    "recentHistory": []
  },
  "interactionContext": {
    "challengePhase": "exploration",
    "commandPolicy": "narrate-world",
    "hintRequested": false,
    "allowFullSolution": false,
    "maxHints": 3,
    "remainingHints": 3,
    "uiIntentLabel": "free exploration"
  },
  "playerAction": "inspect the statue"
}
```

## Regla de Costo

- No enviar la mazmorra completa en cada turno.
- Enviar solo el contexto minimo del cuarto actual, el desafio activo, el estado resumido del jugador y un historial reciente corto.
- Mantener respuestas breves por defecto y solo renderizar el paso matematico solicitado.

## Respuesta Recomendada de OpenAI

```json
{
  "mode": "exploration",
  "playerIntent": "inspect",
  "narration": "The statue is worn and one stone plate seems loose.",
  "rulesSuggestion": {
    "shouldRevealLoot": true,
    "rewardIds": ["rusted-key"],
    "shouldActivateChallenge": false,
    "challengeId": null
  },
  "evaluation": null
}
```

## Implementacion Actual

La version actual ya usa este contrato de forma inicial:

- El frontend envia el payload del runtime desde `MathDungeonsRun.jsx`.
- El backend seguro vive en `server/index.js`.
- La autenticacion se valida con el access token de Supabase.
- La API key de OpenAI no vive en el frontend.

La respuesta actual del modelo se usa solo para:

- narracion
- inferir intencion del jugador
- sugerir si debe revelarse loot
- sugerir si debe activarse un desafio
- devolver feedback estructurado opcional

La respuesta actual no aplica automaticamente:

- movimiento de sala
- dano
- cambios de inventario
- consumo de focus
- resolucion final de combate

Esos cambios siguen bajo control del motor local de la run.

## Restricciones de Prompt

- No resolver el ejercicio completo sin permiso.
- No dar pistas espontaneamente.
- No inventar habitaciones, loot ni desafios fuera del contexto.
- No alterar HP, pistas o inventario por su cuenta.
- No declarar victoria o derrota final sin que el motor lo confirme.

## Siguiente Implementacion

1. Agregar mas campos a `rulesSuggestion` para soportar progreso de combate y exploracion.
2. Definir contrato de evaluacion parcial para respuestas matematicas del estudiante.
3. Persistir historial de mensajes narrativos por run.
4. Separar mejor los contratos para `exploration`, `puzzle` y `combat`.
5. Revisar si el endpoint final debe vivir en backend local o en Supabase Edge Functions.
