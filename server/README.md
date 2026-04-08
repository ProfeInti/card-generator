# Local Runtime Backend

Esta carpeta conserva parte del backend antiguo, pero el objetivo actual es operar con Supabase Auth para la sesion y PostgreSQL propio para whiteboards, perfiles y notebooks colaborativos puntuales. La ruta segura de runtime para `Math Dungeons` sigue viviendo aqui.

Ruta nueva:

- `POST /api/math-dungeons/runtime-response`

Responsabilidad:

- validar al usuario con el token activo de la sesion enviado por el frontend
- mantener `OPENAI_API_KEY` solo en backend
- pedir una respuesta JSON estructurada a OpenAI
- devolver narracion y sugerencias de reglas sin permitir que la IA modifique el estado directamente

Variables recomendadas:

```env
PORT=4000
CORS_ORIGIN=http://localhost:5173
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=card_generator
POSTGRES_USER=postgres
POSTGRES_PASSWORD=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Notas:
- `card-generator.db`, `card-generator.db-shm` y `card-generator.db-wal` son artefactos locales y no deben versionarse.
- La colaboracion de `Notebooks` ya debe apoyarse en `public.notebook_collab_pages` y `public.notebook_collab_page_members` del PostgreSQL propio. Aplica [008_notebook_collab_foundation.sql](/C:/Users/Kory/generador-cartas/card-generator/server/sql/008_notebook_collab_foundation.sql) antes de usarla.
- Si en el futuro se elimina SQLite por completo, conviene hacerlo en una fase aparte y verificada porque aun quedan endpoints legacy que lo usan.
