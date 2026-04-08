import { Pool } from 'pg'

let poolInstance = null

function asTrimmedString(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function asPort(value, fallback = 5432) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getPostgresConfig() {
  return {
    host: asTrimmedString(process.env.POSTGRES_HOST || process.env.PGHOST, 'localhost'),
    port: asPort(process.env.POSTGRES_PORT || process.env.PGPORT, 5432),
    database: asTrimmedString(
      process.env.POSTGRES_DATABASE || process.env.PGDATABASE,
      'card_generator',
    ),
    user: asTrimmedString(process.env.POSTGRES_USER || process.env.PGUSER, 'postgres'),
    password: asTrimmedString(process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD),
    ssl: asTrimmedString(process.env.POSTGRES_SSLMODE || process.env.PGSSLMODE).toLowerCase() ===
      'require',
  }
}

export function isPostgresConfigured() {
  const config = getPostgresConfig()
  return Boolean(config.host && config.port && config.database && config.user && config.password)
}

export function getPostgresPool() {
  if (!poolInstance) {
    const config = getPostgresConfig()

    if (!isPostgresConfigured()) {
      throw new Error('PostgreSQL is not configured. Set POSTGRES_PASSWORD or PGPASSWORD.')
    }

    poolInstance = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 10,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
    })
  }

  return poolInstance
}

export async function probePostgres() {
  if (!isPostgresConfigured()) {
    return {
      configured: false,
      ok: false,
      error: 'PostgreSQL is not configured.',
    }
  }

  try {
    const pool = getPostgresPool()
    const { rows } = await pool.query(`
      SELECT
        current_database() AS database_name,
        current_user AS user_name,
        version() AS server_version
    `)
    const row = rows[0] || {}

    return {
      configured: true,
      ok: true,
      database: row.database_name || '',
      user: row.user_name || '',
      version: row.server_version || '',
    }
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown PostgreSQL connection error.',
    }
  }
}
