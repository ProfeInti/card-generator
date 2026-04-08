# Supabase Usage Audit

Fecha de auditoria: 2026-04-07

## Resultado ejecutivo

En el estado actual del proyecto, Supabase queda reducido a `auth`.

No se encontraron usos activos de:

- `supabase.from(...)`
- `supabase.rpc(...)`
- `supabase.channel(...)`
- `postgres_changes`

fuera del flujo de autenticacion.

## Puntos de uso activos en runtime

### Frontend

- [src/lib/supabase.js](/C:/Users/Kory/generador-cartas/card-generator/src/lib/supabase.js)
  Crea el cliente de Supabase solo para auth cuando hay variables `VITE_SUPABASE_*`.
- [src/lib/authClient.js](/C:/Users/Kory/generador-cartas/card-generator/src/lib/authClient.js)
  Usa:
  - `auth.getSession()`
  - `auth.signUp()`
  - `auth.signInWithPassword()`
  - `auth.getUser()`
  - `auth.signOut()`

### Backend

- [server/index.js](/C:/Users/Kory/generador-cartas/card-generator/server/index.js)
  Usa `supabase.auth.getUser(accessToken)` para validar el token de sesion y luego espejar el usuario minimo en PostgreSQL propio si hace falta.

## Puntos que ya no consumen cuota de Supabase

- [src/CardWorkspace.jsx](/C:/Users/Kory/generador-cartas/card-generator/src/CardWorkspace.jsx)
  Persistencia local de cartas.
- [src/data/competitiveExercisesRepo.js](/C:/Users/Kory/generador-cartas/card-generator/src/data/competitiveExercisesRepo.js)
  Persistencia local de ejercicios competitivos.
- [src/data/competitiveConstructsRepo.js](/C:/Users/Kory/generador-cartas/card-generator/src/data/competitiveConstructsRepo.js)
  Persistencia local de constructs y pasos.
- [src/data/mathDungeonsRepo.js](/C:/Users/Kory/generador-cartas/card-generator/src/data/mathDungeonsRepo.js)
  Persistencia local de dungeons, personajes y runs.
- [src/data/multiplayerDeckRepo.js](/C:/Users/Kory/generador-cartas/card-generator/src/data/multiplayerDeckRepo.js)
  Persistencia local de mazos.
- [src/data/multiplayerLobbyRepo.js](/C:/Users/Kory/generador-cartas/card-generator/src/data/multiplayerLobbyRepo.js)
  Multijugador desactivado temporalmente.
- [src/lib/whiteboardNotebook.js](/C:/Users/Kory/generador-cartas/card-generator/src/lib/whiteboardNotebook.js)
  Notebook local con importacion/exportacion JSON.
- [src/lib/notebookLibrary.js](/C:/Users/Kory/generador-cartas/card-generator/src/lib/notebookLibrary.js)
  Biblioteca local de cuadernos y hojas.

## Referencias que no implican consumo de cuota

- `README.md`
- `docs/`
- `server/sql/`
- `supabase/migrations/`
- `package.json`
- `package-lock.json`

Estas referencias son historicas, documentales o de dependencias, no llamadas runtime.

## Riesgos operativos fuera del repo

Aunque este codigo ya no use Supabase para datos, todavia podrias ver consumo si ocurre alguna de estas condiciones:

- Hay una build vieja del frontend desplegada y todavia en uso.
- Hay usuarios con una pestaña vieja abierta usando JS cacheado.
- Existe otro proyecto, script o entorno apuntando al mismo proyecto de Supabase.
- El backend desplegado no coincide con esta version y todavia ejecuta flujos antiguos.

## Checklist para riesgo minimo este mes

1. Desplegar esta version nueva de frontend.
2. Desplegar esta version nueva de backend.
3. Confirmar que no exista otra app externa conectada al mismo proyecto de Supabase.
4. Invalidar cache del frontend si el hosting lo permite.
5. Pedir a los usuarios recargar sesion para salir de bundles viejos.
6. Mantener solo `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` y `SUPABASE_ANON_KEY` para auth.
7. No reactivar multiplayer hasta tener backend/local replacement fuera de Supabase.

## Comando de auditoria recomendado

Ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\audit-supabase-runtime.ps1
```

Si ese script solo reporta `auth` y no reporta `from`, `rpc`, `channel` ni `postgres_changes`, el repo sigue en el estado esperado.
