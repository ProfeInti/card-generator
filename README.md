# Card Generator

Aplicacion React + Vite con autenticacion y persistencia en Supabase. El proyecto hoy funciona principalmente desde `src/` y las migraciones de `supabase/`.

## Flujo activo

- Frontend: `src/`
- Auth y datos: Supabase
- Migraciones: `supabase/migrations/`

## Configuracion

Define estas variables en tu entorno Vite:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Puedes partir de [`.env.example`](/C:/Users/Kory/generador-cartas/card-generator/.env.example).

## Estado del backend local

La carpeta `server/` es legado y no forma parte del flujo principal actual. Se conserva solo como referencia historica mientras saneamos el proyecto. Sus archivos SQLite locales no deben versionarse.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run preview
```
