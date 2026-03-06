import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'

import { requireAuth, signUserToken } from './auth.js'
import { getDb } from './db.js'

const app = express()
const db = getDb()
const port = Number(process.env.PORT || 4000)

const corsOrigin = process.env.CORS_ORIGIN
if (corsOrigin) {
  app.use(cors({ origin: corsOrigin.split(',').map((v) => v.trim()) }))
} else {
  app.use(cors())
}

app.use(express.json({ limit: '10mb' }))

function normalizeUsername(input) {
  return String(input || '').trim().toLowerCase()
}

function toCardResponse(row) {
  let state = {}

  try {
    state = JSON.parse(row.state_json)
  } catch {
    state = {}
  }

  return {
    id: row.id,
    name: row.name,
    state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/register', async (req, res) => {
  const username = normalizeUsername(req.body?.username)
  const password = String(req.body?.password || '')

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    return res.status(409).json({ error: 'Username already exists.' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const createdAt = new Date().toISOString()

  const result = db
    .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, passwordHash, createdAt)

  const user = { id: result.lastInsertRowid, username }
  const token = signUserToken(user)

  return res.status(201).json({ token, user })
})

app.post('/api/auth/login', async (req, res) => {
  const username = normalizeUsername(req.body?.username)
  const password = String(req.body?.password || '')

  const user = db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(username)

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password.' })
  }

  const token = signUserToken({ id: user.id, username: user.username })
  return res.json({ token, user: { id: user.id, username: user.username } })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.user.id)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  return res.json({ user })
})

app.get('/api/cards', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY datetime(updated_at) DESC')
    .all(req.user.id)

  return res.json({ cards: rows.map(toCardResponse) })
})

app.post('/api/cards/upsert', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim()
  const state = req.body?.state

  if (!name) {
    return res.status(400).json({ error: 'Card name is required.' })
  }

  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'Card state is required.' })
  }

  const now = new Date().toISOString()
  const existing = db
    .prepare('SELECT id FROM cards WHERE user_id = ? AND name = ?')
    .get(req.user.id, name)

  if (existing) {
    db.prepare('UPDATE cards SET state_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(state),
      now,
      existing.id
    )

    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(existing.id)
    return res.json({ card: toCardResponse(updated) })
  }

  const result = db
    .prepare(
      'INSERT INTO cards (user_id, name, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(req.user.id, name, JSON.stringify(state), now, now)

  const created = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid)
  return res.status(201).json({ card: toCardResponse(created) })
})

app.delete('/api/cards/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid card id.' })
  }

  const card = db.prepare('SELECT id FROM cards WHERE id = ? AND user_id = ?').get(id, req.user.id)
  if (!card) {
    return res.status(404).json({ error: 'Card not found.' })
  }

  db.prepare('DELETE FROM cards WHERE id = ?').run(id)
  return res.status(204).send()
})

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`)
})
