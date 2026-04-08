# Card Generator

Aplicacion React + Vite en migracion hacia backend propio con PostgreSQL. El proyecto hoy combina frontend en `src/`, backend Node en `server/` y migraciones historicas en `supabase/`.

## Flujo activo

- Frontend: `src/`
- Auth: Supabase Auth como proveedor principal de sesion
- Notebooks y hojas: almacenamiento local + importacion/exportacion JSON
- Cartas, ejercicios, constructs y Math Dungeons: almacenamiento local
- Backend Node + PostgreSQL propio para APIs seguras y modulos colaborativos puntuales
- Multiplayer: desactivado temporalmente mientras se retira su dependencia de Supabase
- Migraciones: `supabase/migrations/`

## Configuracion

Define estas variables en tu entorno Vite:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Puedes partir de [`.env.example`](/C:/Users/Kory/generador-cartas/card-generator/.env.example).

## Runtime OpenAI para Math Dungeons

La experiencia jugable de `Math Dungeons` ya puede consultar un backend local seguro para narracion y sugerencias estructuradas.

Variables necesarias:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:4000/api

SUPABASE_URL=
SUPABASE_ANON_KEY=
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=card_generator
POSTGRES_USER=postgres
POSTGRES_PASSWORD=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Levantar el flujo local:

```bash
npm install
npm run server
npm run dev
```

La `OPENAI_API_KEY` vive solo en el proceso Node de `server/`. El frontend envia el token de la sesion activa al backend y este valida al usuario antes de llamar a OpenAI.

## Estado actual del notebook

La seccion `notebook` ya quedo orientada a reducir dependencia externa:

- Cada notebook sembrado se guarda localmente
- La biblioteca de cuadernos y hojas vive localmente
- Las hojas pesadas se mueven por importacion/exportacion JSON
- Supabase deja de ser necesario para persistir notebooks y hojas

Lo que si sigue siendo util mantener en Supabase es `auth`. El backend local ahora puede aceptar ese token y espejar el usuario minimo en PostgreSQL propio cuando una ruta protegida lo necesita.

## Cuaderno colaborativo con PostgreSQL propio

Flujo recomendado:

- Frontend desplegado en `Vercel`
- Backend Node corriendo en tu infraestructura con `npm run server`
- Persistencia de cuadernos colaborativos en PostgreSQL propio
- URL publica del backend expuesta con `Cloudflare Tunnel`
- `VITE_API_URL` apuntando a `https://TU-BACKEND/api`

Variables tipicas para desarrollo local:

```env
VITE_API_URL=http://localhost:4000/api
# CORS_ORIGIN=http://localhost:5173
```

Variables tipicas para Vercel:

```env
VITE_API_URL=https://tu-backend-publico.example.com/api
```

Variables tipicas para el backend en tu PC cuando el frontend vive en Vercel:

```env
PORT=4000
CORS_ORIGIN=https://tu-frontend.vercel.app
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=card_generator
POSTGRES_USER=postgres
POSTGRES_PASSWORD=
```

Antes de usar colaboracion de notebooks en el backend propio, aplica tambien:

```bash
psql -h localhost -p 5432 -U postgres -d card_generator -f server/sql/001_postgres_auth_foundation.sql
psql -h localhost -p 5432 -U postgres -d card_generator -f server/sql/004_whiteboard_workspaces_foundation.sql
psql -h localhost -p 5432 -U postgres -d card_generator -f server/sql/008_notebook_collab_foundation.sql
```

Instalacion minima para esta ruta:

1. `Node.js` para correr `npm run server`
2. `cloudflared` para exponer el backend local sin abrir puertos manualmente

Prueba local:

```bash
npm run server
npm run dev
```

Prueba con frontend remoto:

1. Levanta el backend local con `npm run server`
2. Expone `http://localhost:4000` con `cloudflared tunnel`
3. Configura `VITE_API_URL` en Vercel con la URL publica del tunnel
4. Redeploy del frontend

Verificacion local de PostgreSQL:

1. Crea la base `card_generator`
2. Define las variables `POSTGRES_*` en tu entorno local
3. Levanta `npm run server`
4. Abre [http://localhost:4000/api/postgres-health](http://localhost:4000/api/postgres-health)

## Migracion inicial desde Supabase

La migracion recomendada empieza por usuarios y perfiles en tu PostgreSQL propio.

Archivos de apoyo:

- [server/sql/001_postgres_auth_foundation.sql](/C:/Users/Kory/generador-cartas/card-generator/server/sql/001_postgres_auth_foundation.sql)
- [server/sql/002_import_supabase_auth_users.sql](/C:/Users/Kory/generador-cartas/card-generator/server/sql/002_import_supabase_auth_users.sql)

Flujo:

1. Exporta `auth.users` desde Supabase a `exports/supabase/supabase-auth-users.csv`
2. Ejecuta la fundacion:

```bash
psql -h localhost -p 5432 -U postgres -d card_generator -f server/sql/001_postgres_auth_foundation.sql
```

3. Ejecuta la importacion:

```bash
psql -h localhost -p 5432 -U postgres -d card_generator -c "\copy legacy_import.supabase_auth_users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at) from 'C:/ruta/a/supabase-auth-users.csv' csv header"
psql -h localhost -p 5432 -U postgres -d card_generator -f server/sql/002_import_supabase_auth_users.sql
```

Esto crea `public.users`, `public.profiles` y una zona `legacy_import` para staging.

Si tambien exportas `public.profiles` desde Supabase, puedes sincronizar roles reales asi:

```bash
psql -h localhost -p 5432 -U postgres -d card_generator -c "\copy legacy_import.supabase_profiles (id, username, created_at, role) from 'C:/ruta/a/supabase-profiles.csv' csv header"
psql -h localhost -p 5432 -U postgres -d card_generator -f server/sql/003_import_supabase_profiles.sql
```

## Estado del backend local

La carpeta `server/` sigue siendo legado para los endpoints antiguos, pero ahora tambien hospeda la ruta segura de runtime para `Math Dungeons`. Sus archivos SQLite locales no deben versionarse.

## Scripts

```bash
npm run dev
npm run server
npm run lint
npm run build
npm run preview
```
