// Deprecated: Local Node API replaced by Supabase.
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import os from 'os'
import path from 'path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

import { requireAuth, signUserToken, verifyUserToken } from './auth.js'
import { getDb } from './db.js'
import { getPostgresPool, probePostgres } from './postgres.js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const db = getDb()
const postgresPool = getPostgresPool()
const port = Number(process.env.PORT || 4000)
const openAiApiKey = String(process.env.OPENAI_API_KEY || '').trim()
const openAiModel = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
const pythonBin = String(process.env.PYTHON_BIN || '').trim()
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const supabasePublishableKey = String(
  process.env.SUPABASE_ANON_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || ''
).trim()
const supabaseAuthClient = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null

const corsOrigin = process.env.CORS_ORIGIN
if (corsOrigin) {
  app.use(cors({ origin: corsOrigin.split(',').map((v) => v.trim()) }))
} else {
app.use(cors())
}

app.use(express.json({ limit: '10mb' }))

const notebookCollabSubscribers = new Map()
const notebookCollabPresence = new Map()
const whiteboardWorkspaceSubscribers = new Map()
const whiteboardWorkspacePresence = new Map()

function getBearerToken(req) {
  const authHeader = req.headers.authorization || ''
  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) return ''
  return token
}

async function resolveAuthUserFromAccessToken(accessToken) {
  const safeToken = String(accessToken || '').trim()
  if (!safeToken) {
    return { user: null, provider: '' }
  }

  try {
    const payload = verifyUserToken(safeToken)
    const localUser = await getPostgresAuthUserById(payload.id)

    if (localUser) {
      return {
        user: localUser,
        provider: 'local',
      }
    }
  } catch {
    // Ignore local JWT validation failures and continue with Supabase auth.
  }

  const supabaseUser = await resolveSupabaseUserFromAccessToken(safeToken)
  if (supabaseUser) {
    return {
      user: supabaseUser,
      provider: 'supabase',
    }
  }

  return { user: null, provider: '' }
}

async function requireSupabaseSession(req, res, next) {
  const accessToken = getBearerToken(req)
  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const resolved = await resolveAuthUserFromAccessToken(accessToken)
  if (!resolved.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  req.user = resolved.user
  req.authUser = resolved.user
  req.authProvider = resolved.provider
  return next()
}

function safeObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

async function getPostgresAuthUserById(userId) {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return null

  const { rows } = await postgresPool.query(
    `
      SELECT
        u.id,
        u.email,
        u.password_hash,
        u.email_confirmed_at,
        u.source,
        u.created_at,
        u.updated_at,
        p.username,
        p.role
      FROM public.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [normalizedUserId],
  )

  return toAuthUserResponse(rows[0] || null)
}

async function getPostgresAuthUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const { rows } = await postgresPool.query(
    `
      SELECT
        u.id,
        u.email,
        u.password_hash,
        u.email_confirmed_at,
        u.source,
        u.created_at,
        u.updated_at,
        p.username,
        p.role
      FROM public.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE lower(u.email) = lower($1)
      LIMIT 1
    `,
    [normalizedEmail],
  )

  return toAuthUserResponse(rows[0] || null)
}

function toAuthUserResponse(row) {
  if (!row) return null

  return {
    id: String(row.id || '').trim(),
    email: String(row.email || '').trim().toLowerCase(),
    username: String(row.username || '').trim() || normalizeUsername(row.email),
    role: String(row.role || '').trim() === 'teacher' ? 'teacher' : 'student',
    passwordHash: String(row.password_hash || '').trim(),
    emailConfirmedAt: row.email_confirmed_at || null,
    source: String(row.source || '').trim() || 'local',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizeProfileRole(value) {
  return String(value || '').trim().toLowerCase() === 'teacher' ? 'teacher' : 'student'
}

function sanitizeUsernameSeed(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'user'
}

function deriveSupabaseUsernameSeed(user) {
  const explicitUsername = String(
    user?.user_metadata?.username
    || user?.user_metadata?.name
    || ''
  ).trim()

  if (explicitUsername) {
    return sanitizeUsernameSeed(explicitUsername)
  }

  const email = normalizeEmail(user?.email)
  if (email.includes('@')) {
    return sanitizeUsernameSeed(email.split('@')[0])
  }

  return sanitizeUsernameSeed(String(user?.id || '').slice(0, 12))
}

async function createAvailableUsername(client, desiredUsername, userId) {
  const baseUsername = sanitizeUsernameSeed(desiredUsername)
  let candidate = baseUsername
  let attempt = 0

  while (attempt < 50) {
    const { rows } = await client.query(
      `
        SELECT id
        FROM public.profiles
        WHERE lower(username) = lower($1)
          AND id <> $2
        LIMIT 1
      `,
      [candidate, userId],
    )

    if (!rows.length) {
      return candidate
    }

    attempt += 1
    candidate = `${baseUsername}-${attempt + 1}`
  }

  return `${baseUsername}-${randomUUID().slice(0, 8)}`
}

async function ensurePostgresAuthUserForSupabase(supabaseUser) {
  const userId = String(supabaseUser?.id || '').trim()
  const email = normalizeEmail(supabaseUser?.email)

  if (!userId || !email) {
    return null
  }

  const existingById = await getPostgresAuthUserById(userId)
  if (existingById) {
    return existingById
  }

  const { rows: emailRows } = await postgresPool.query(
    `
      SELECT id
      FROM public.users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email],
  )

  if (emailRows.length) {
    throw new Error(`A local user with email ${email} already exists under a different id. Complete the auth migration before using Supabase auth for this account.`)
  }

  const client = await postgresPool.connect()

  try {
    await client.query('BEGIN')

    const username = await createAvailableUsername(
      client,
      deriveSupabaseUsernameSeed(supabaseUser),
      userId,
    )
    const role = normalizeProfileRole(
      supabaseUser?.app_metadata?.role
      || supabaseUser?.user_metadata?.role
    )
    const emailConfirmedAt = supabaseUser?.email_confirmed_at || null
    const createdAt = supabaseUser?.created_at || null
    const updatedAt = supabaseUser?.updated_at || null

    await client.query(
      `
        INSERT INTO public.users (
          id,
          email,
          password_hash,
          email_confirmed_at,
          source,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'supabase',
          COALESCE($5::timestamptz, timezone('utc', now())),
          COALESCE($6::timestamptz, timezone('utc', now()))
        )
      `,
      [
        userId,
        email,
        '!supabase-auth-managed!',
        emailConfirmedAt,
        createdAt,
        updatedAt || createdAt,
      ],
    )

    await client.query(
      `
        INSERT INTO public.profiles (
          id,
          username,
          role,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          timezone('utc', now()),
          timezone('utc', now())
        )
      `,
      [userId, username, role],
    )

    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback failures.
    }

    throw error
  } finally {
    client.release()
  }

  return getPostgresAuthUserById(userId)
}

async function resolveSupabaseUserFromAccessToken(accessToken) {
  if (!supabaseAuthClient) return null

  const { data, error } = await supabaseAuthClient.auth.getUser(accessToken)
  if (error || !data?.user?.id) {
    return null
  }

  return ensurePostgresAuthUserForSupabase(data.user)
}

function normalizeNotebookCollabVisibility(value) {
  return String(value || 'code').trim() === 'private' ? 'private' : 'code'
}

function generateNotebookCollabPageId() {
  return `nb-page-${randomUUID()}`
}

async function generateNotebookCollabShareCode() {
  while (true) {
    const candidate = `NP-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`
    const { rows } = await postgresPool.query(
      `
        SELECT id
        FROM public.notebook_collab_pages
        WHERE share_code = $1
        LIMIT 1
      `,
      [candidate],
    )

    if (!rows.length) {
      return candidate
    }
  }
}

function normalizeNotebookCollabPageRow(row) {
  if (!row) return null

  return {
    id: String(row.id || '').trim(),
    owner_user_id: String(row.owner_user_id || '').trim(),
    last_editor_user_id: String(row.last_editor_user_id || '').trim(),
    title: String(row.title || '').trim(),
    exercise_snapshot: safeObject(
      typeof row.exercise_snapshot === 'string'
        ? safeJsonParse(row.exercise_snapshot, {})
        : row.exercise_snapshot
    ),
    notebook_state: safeObject(
      typeof row.notebook_state === 'string'
        ? safeJsonParse(row.notebook_state, {})
        : row.notebook_state
    ),
    share_code: String(row.share_code || '').trim().toUpperCase(),
    visibility: normalizeNotebookCollabVisibility(row.visibility),
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
    member_role: String(row.member_role || '').trim(),
  }
}

async function listOwnedNotebookCollabPages(ownerUserId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        id,
        owner_user_id,
        last_editor_user_id,
        title,
        exercise_snapshot,
        notebook_state,
        share_code,
        visibility,
        created_at,
        updated_at,
        'owner'::text AS member_role
      FROM public.notebook_collab_pages
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC, created_at DESC
    `,
    [ownerUserId],
  )

  return rows.map(normalizeNotebookCollabPageRow).filter(Boolean)
}

async function listAccessibleNotebookCollabPages(userId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        p.id,
        p.owner_user_id,
        p.last_editor_user_id,
        p.title,
        p.exercise_snapshot,
        p.notebook_state,
        p.share_code,
        p.visibility,
        p.created_at,
        p.updated_at,
        CASE
          WHEN p.owner_user_id = $1 THEN 'owner'
          ELSE COALESCE(m.role, '')
        END AS member_role
      FROM public.notebook_collab_pages p
      LEFT JOIN public.notebook_collab_page_members m
        ON m.page_id = p.id
       AND m.user_id = $1
      WHERE p.owner_user_id = $1
         OR m.user_id = $1
      ORDER BY p.updated_at DESC, p.created_at DESC
    `,
    [userId],
  )

  return rows.map(normalizeNotebookCollabPageRow).filter(Boolean)
}

async function getAccessibleNotebookCollabPageById(pageId, viewerUserId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        p.id,
        p.owner_user_id,
        p.last_editor_user_id,
        p.title,
        p.exercise_snapshot,
        p.notebook_state,
        p.share_code,
        p.visibility,
        p.created_at,
        p.updated_at,
        CASE
          WHEN p.owner_user_id = $2 THEN 'owner'
          ELSE COALESCE(m.role, '')
        END AS member_role
      FROM public.notebook_collab_pages p
      LEFT JOIN public.notebook_collab_page_members m
        ON m.page_id = p.id
       AND m.user_id = $2
      WHERE p.id = $1
        AND (
          p.owner_user_id = $2
          OR m.user_id = $2
        )
      LIMIT 1
    `,
    [pageId, viewerUserId],
  )

  return normalizeNotebookCollabPageRow(rows[0] || null)
}

async function getNotebookCollabPageById(pageId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        id,
        owner_user_id,
        last_editor_user_id,
        title,
        exercise_snapshot,
        notebook_state,
        share_code,
        visibility,
        created_at,
        updated_at
      FROM public.notebook_collab_pages
      WHERE id = $1
      LIMIT 1
    `,
    [pageId],
  )

  return normalizeNotebookCollabPageRow(rows[0] || null)
}

async function getEditableNotebookCollabPageById(pageId, viewerUserId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        p.id,
        p.owner_user_id,
        p.last_editor_user_id,
        p.title,
        p.exercise_snapshot,
        p.notebook_state,
        p.share_code,
        p.visibility,
        p.created_at,
        p.updated_at,
        CASE
          WHEN p.owner_user_id = $2 THEN 'owner'
          ELSE COALESCE(m.role, '')
        END AS member_role
      FROM public.notebook_collab_pages p
      LEFT JOIN public.notebook_collab_page_members m
        ON m.page_id = p.id
       AND m.user_id = $2
      WHERE p.id = $1
        AND (
          p.owner_user_id = $2
          OR (m.user_id = $2 AND m.role = 'editor')
        )
      LIMIT 1
    `,
    [pageId, viewerUserId],
  )

  return normalizeNotebookCollabPageRow(rows[0] || null)
}

async function createNotebookCollabPageRecord({
  ownerUserId,
  title,
  exerciseSnapshot,
  notebookState,
  visibility,
  lastEditorUserId,
}) {
  const pageId = generateNotebookCollabPageId()
  const shareCode = await generateNotebookCollabShareCode()
  const { rows } = await postgresPool.query(
    `
      INSERT INTO public.notebook_collab_pages (
        id,
        owner_user_id,
        last_editor_user_id,
        title,
        exercise_snapshot,
        notebook_state,
        share_code,
        visibility
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
      RETURNING
        id,
        owner_user_id,
        last_editor_user_id,
        title,
        exercise_snapshot,
        notebook_state,
        share_code,
        visibility,
        created_at,
        updated_at,
        'owner'::text AS member_role
    `,
    [
      pageId,
      ownerUserId,
      lastEditorUserId || ownerUserId,
      title,
      JSON.stringify(exerciseSnapshot),
      JSON.stringify(notebookState),
      shareCode,
      visibility,
    ],
  )

  return normalizeNotebookCollabPageRow(rows[0] || null)
}

async function updateNotebookCollabPageRecord(pageId, viewerUserId, payload) {
  const { rows } = await postgresPool.query(
    `
      UPDATE public.notebook_collab_pages p
      SET last_editor_user_id = $3,
          title = $4,
          exercise_snapshot = $5::jsonb,
          notebook_state = $6::jsonb,
          visibility = $7
      WHERE p.id = $1
        AND (
          p.owner_user_id = $2
          OR EXISTS (
            SELECT 1
            FROM public.notebook_collab_page_members m
            WHERE m.page_id = p.id
              AND m.user_id = $2
              AND m.role = 'editor'
          )
        )
      RETURNING
        p.id,
        p.owner_user_id,
        p.last_editor_user_id,
        p.title,
        p.exercise_snapshot,
        p.notebook_state,
        p.share_code,
        p.visibility,
        p.created_at,
        p.updated_at,
        CASE
          WHEN p.owner_user_id = $2 THEN 'owner'
          ELSE COALESCE((
            SELECT m.role
            FROM public.notebook_collab_page_members m
            WHERE m.page_id = p.id
              AND m.user_id = $2
            LIMIT 1
          ), '')
        END AS member_role
    `,
    [
      pageId,
      viewerUserId,
      payload.lastEditorUserId,
      payload.title,
      JSON.stringify(payload.exerciseSnapshot),
      JSON.stringify(payload.notebookState),
      payload.visibility,
    ],
  )

  return normalizeNotebookCollabPageRow(rows[0] || null)
}

async function joinNotebookCollabPageByCode(inputCode, userId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        id,
        owner_user_id,
        last_editor_user_id,
        title,
        exercise_snapshot,
        notebook_state,
        share_code,
        visibility,
        created_at,
        updated_at
      FROM public.notebook_collab_pages
      WHERE share_code = $1
        AND visibility = 'code'
      LIMIT 1
    `,
    [inputCode],
  )

  const page = normalizeNotebookCollabPageRow(rows[0] || null)
  if (!page) return null

  if (page.owner_user_id !== userId) {
    await postgresPool.query(
      `
        INSERT INTO public.notebook_collab_page_members (
          page_id,
          user_id,
          role
        ) VALUES ($1, $2, 'editor')
        ON CONFLICT (page_id, user_id)
        DO NOTHING
      `,
      [page.id, userId],
    )
  }

  return getAccessibleNotebookCollabPageById(page.id, userId)
}

function sendSseEvent(res, event, payload) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function getNotebookCollabPresenceEntries(pageId) {
  const pagePresence = notebookCollabPresence.get(pageId)
  if (!pagePresence) return []

  const now = Date.now()
  const entries = []

  for (const [clientId, value] of pagePresence.entries()) {
    if ((now - Number(value?.updatedAtMs || 0)) > 60000) {
      pagePresence.delete(clientId)
      continue
    }
    entries.push({
      clientId,
      userId: String(value?.userId || '').trim(),
      username: String(value?.username || '').trim() || 'Colaborador',
      color: String(value?.color || '').trim(),
      activity: String(value?.activity || '').trim() || 'viendo',
      editingType: String(value?.editingType || '').trim() || 'notebook',
      targetId: String(value?.targetId || '').trim(),
      updatedAt: new Date(Number(value?.updatedAtMs || now)).toISOString(),
    })
  }

  if (!pagePresence.size) {
    notebookCollabPresence.delete(pageId)
  }

  return entries.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function broadcastNotebookCollabPresence(pageId) {
  const collaborators = getNotebookCollabPresenceEntries(pageId)
  const subscribers = notebookCollabSubscribers.get(pageId)
  if (!subscribers?.size) return

  for (const response of subscribers.values()) {
    sendSseEvent(response, 'presence', { collaborators })
  }
}

function upsertNotebookCollabPresence(pageId, payload = {}) {
  const safePageId = String(pageId || '').trim()
  const clientId = String(payload.clientId || '').trim()
  if (!safePageId || !clientId) return

  const pagePresence = notebookCollabPresence.get(safePageId) || new Map()
  notebookCollabPresence.set(safePageId, pagePresence)
  pagePresence.set(clientId, {
    userId: String(payload.userId || '').trim(),
    username: String(payload.username || '').trim() || 'Colaborador',
    color: String(payload.color || '').trim(),
    activity: String(payload.activity || '').trim() || 'viendo',
    editingType: String(payload.editingType || '').trim() || 'notebook',
    targetId: String(payload.targetId || '').trim(),
    updatedAtMs: Date.now(),
  })
  broadcastNotebookCollabPresence(safePageId)
}

function removeNotebookCollabPresence(pageId, clientId) {
  const safePageId = String(pageId || '').trim()
  const safeClientId = String(clientId || '').trim()
  if (!safePageId || !safeClientId) return

  const pagePresence = notebookCollabPresence.get(safePageId)
  if (!pagePresence) return

  pagePresence.delete(safeClientId)
  if (!pagePresence.size) {
    notebookCollabPresence.delete(safePageId)
  }
  broadcastNotebookCollabPresence(safePageId)
}

function registerNotebookCollabSubscriber(pageId, clientId, res) {
  const subscribers = notebookCollabSubscribers.get(pageId) || new Map()
  notebookCollabSubscribers.set(pageId, subscribers)
  subscribers.set(clientId, res)
}

function unregisterNotebookCollabSubscriber(pageId, clientId) {
  const subscribers = notebookCollabSubscribers.get(pageId)
  if (!subscribers) return
  subscribers.delete(clientId)
  if (!subscribers.size) {
    notebookCollabSubscribers.delete(pageId)
  }
}

async function broadcastNotebookCollabSnapshot(pageId, payload = {}) {
  const safePageId = String(pageId || '').trim()
  if (!safePageId) return

  const page = await getNotebookCollabPageById(safePageId)
  const subscribers = notebookCollabSubscribers.get(safePageId)
  if (!page || !subscribers?.size) return

  const eventPayload = {
    page,
    sourceClientId: String(payload.sourceClientId || '').trim(),
    sentAt: new Date().toISOString(),
  }

  for (const response of subscribers.values()) {
    sendSseEvent(response, 'snapshot', eventPayload)
  }
}

function getWhiteboardWorkspacePresenceEntries(workspaceId) {
  const workspacePresence = whiteboardWorkspacePresence.get(workspaceId)
  if (!workspacePresence) return []

  const now = Date.now()
  const entries = []

  for (const [clientId, value] of workspacePresence.entries()) {
    if ((now - Number(value?.updatedAtMs || 0)) > 60000) {
      workspacePresence.delete(clientId)
      continue
    }

    entries.push({
      clientId,
      userId: String(value?.userId || '').trim(),
      username: String(value?.username || '').trim() || 'Colaborador',
      color: String(value?.color || '').trim(),
      activity: String(value?.activity || '').trim() || 'browsing',
      editingType: String(value?.editingType || '').trim() || 'board',
      targetId: String(value?.targetId || '').trim(),
      updatedAt: new Date(Number(value?.updatedAtMs || now)).toISOString(),
    })
  }

  if (!workspacePresence.size) {
    whiteboardWorkspacePresence.delete(workspaceId)
  }

  return entries.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function broadcastWhiteboardWorkspacePresence(workspaceId) {
  const collaborators = getWhiteboardWorkspacePresenceEntries(workspaceId)
  const subscribers = whiteboardWorkspaceSubscribers.get(workspaceId)
  if (!subscribers?.size) return

  for (const response of subscribers.values()) {
    sendSseEvent(response, 'presence', { collaborators })
  }
}

function upsertWhiteboardWorkspacePresence(workspaceId, payload = {}) {
  const safeWorkspaceId = String(workspaceId || '').trim()
  const clientId = String(payload.clientId || '').trim()
  if (!safeWorkspaceId || !clientId) return

  const workspacePresence = whiteboardWorkspacePresence.get(safeWorkspaceId) || new Map()
  whiteboardWorkspacePresence.set(safeWorkspaceId, workspacePresence)
  workspacePresence.set(clientId, {
    userId: String(payload.userId || '').trim(),
    username: String(payload.username || '').trim() || 'Colaborador',
    color: String(payload.color || '').trim(),
    activity: String(payload.activity || '').trim() || 'browsing',
    editingType: String(payload.editingType || '').trim() || 'board',
    targetId: String(payload.targetId || '').trim(),
    updatedAtMs: Date.now(),
  })
  broadcastWhiteboardWorkspacePresence(safeWorkspaceId)
}

function removeWhiteboardWorkspacePresence(workspaceId, clientId) {
  const safeWorkspaceId = String(workspaceId || '').trim()
  const safeClientId = String(clientId || '').trim()
  if (!safeWorkspaceId || !safeClientId) return

  const workspacePresence = whiteboardWorkspacePresence.get(safeWorkspaceId)
  if (!workspacePresence) return

  workspacePresence.delete(safeClientId)
  if (!workspacePresence.size) {
    whiteboardWorkspacePresence.delete(safeWorkspaceId)
  }
  broadcastWhiteboardWorkspacePresence(safeWorkspaceId)
}

function registerWhiteboardWorkspaceSubscriber(workspaceId, clientId, res) {
  const subscribers = whiteboardWorkspaceSubscribers.get(workspaceId) || new Map()
  whiteboardWorkspaceSubscribers.set(workspaceId, subscribers)
  subscribers.set(clientId, res)
}

function unregisterWhiteboardWorkspaceSubscriber(workspaceId, clientId) {
  const subscribers = whiteboardWorkspaceSubscribers.get(workspaceId)
  if (!subscribers) return

  subscribers.delete(clientId)
  if (!subscribers.size) {
    whiteboardWorkspaceSubscribers.delete(workspaceId)
  }
}

async function broadcastWhiteboardWorkspaceSnapshot(workspaceId, payload = {}) {
  const safeWorkspaceId = String(workspaceId || '').trim()
  if (!safeWorkspaceId) return

  const workspace = await getAccessibleWhiteboardWorkspaceById(
    safeWorkspaceId,
    String(payload.viewerUserId || payload.userId || '').trim(),
  )
  const subscribers = whiteboardWorkspaceSubscribers.get(safeWorkspaceId)
  if (!workspace || !subscribers?.size) return

  const eventPayload = {
    workspace,
    sourceClientId: String(payload.sourceClientId || '').trim(),
    sentAt: new Date().toISOString(),
  }

  for (const response of subscribers.values()) {
    sendSseEvent(response, 'snapshot', eventPayload)
  }
}

function broadcastWhiteboardWorkspaceBoardSync(workspaceId, payload = {}) {
  const safeWorkspaceId = String(workspaceId || '').trim()
  const subscribers = whiteboardWorkspaceSubscribers.get(safeWorkspaceId)
  if (!safeWorkspaceId || !subscribers?.size) return

  const eventPayload = {
    sourceClientId: String(payload.sourceClientId || payload.clientId || '').trim(),
    clientId: String(payload.clientId || '').trim(),
    userId: String(payload.userId || '').trim(),
    username: String(payload.username || '').trim(),
    workspaceId: safeWorkspaceId,
    exerciseSnapshot: safeObject(payload.exerciseSnapshot),
    nodes: safeArray(payload.nodes),
    links: safeArray(payload.links),
    sentAt: new Date().toISOString(),
  }

  for (const response of subscribers.values()) {
    sendSseEvent(response, 'board-sync', eventPayload)
  }
}

function broadcastWhiteboardWorkspaceNotebookSync(workspaceId, payload = {}) {
  const safeWorkspaceId = String(workspaceId || '').trim()
  const subscribers = whiteboardWorkspaceSubscribers.get(safeWorkspaceId)
  if (!safeWorkspaceId || !subscribers?.size) return

  const eventPayload = {
    sourceClientId: String(payload.sourceClientId || payload.clientId || '').trim(),
    clientId: String(payload.clientId || '').trim(),
    userId: String(payload.userId || '').trim(),
    username: String(payload.username || '').trim(),
    workspaceId: safeWorkspaceId,
    exerciseSnapshot: safeObject(payload.exerciseSnapshot),
    notebook: safeObject(payload.notebook),
    sentAt: new Date().toISOString(),
  }

  for (const response of subscribers.values()) {
    sendSseEvent(response, 'notebook-sync', eventPayload)
  }
}

function sanitizeRuntimePayload(body) {
  const interactionContext = safeObject(body?.interactionContext)
  const activeChallenge = body?.activeChallenge && typeof body.activeChallenge === 'object' ? body.activeChallenge : null
  const challengeJson = safeObject(activeChallenge?.challenge_json)

  return {
    mode: String(body?.mode || 'exploration').trim() || 'exploration',
    dungeon: safeObject(body?.dungeon),
    currentRoom: safeObject(body?.currentRoom),
    activeChallenge: activeChallenge
      ? {
          ...activeChallenge,
          challenge_json: {
            ...challengeJson,
            mathFacts: safeArray(challengeJson.mathFacts),
            hintSteps: safeArray(challengeJson.hintSteps),
            relatedQuestions: safeArray(challengeJson.relatedQuestions),
          },
        }
      : null,
    character: safeObject(body?.character),
    runState: safeObject(body?.runState),
    playerAction: String(body?.playerAction || '').trim(),
    interactionContext: {
      challengePhase: String(interactionContext?.challengePhase || '').trim() || null,
      commandPolicy: String(interactionContext?.commandPolicy || '').trim() || null,
      hintRequested: Boolean(interactionContext?.hintRequested),
      allowFullSolution: Boolean(interactionContext?.allowFullSolution),
      maxHints: Number(interactionContext?.maxHints || 3),
      remainingHints: Number(interactionContext?.remainingHints || 0),
      uiIntentLabel: String(interactionContext?.uiIntentLabel || '').trim() || null,
    },
  }
}

function sanitizeNotebookAssistantPayload(body) {
  const notebook = safeObject(body?.notebook)

  return {
    notebook: {
      locale: String(notebook?.locale || 'es').trim() || 'es',
      assistantContextHtml: String(notebook?.assistantContextHtml || '').trim(),
    },
    studentCommand: String(body?.studentCommand || '').trim(),
  }
}

function sanitizeNotebookTechniquePayload(body) {
  const technique = safeObject(body?.technique)
  return {
    locale: String(body?.locale || 'es').trim() || 'es',
    selectedText: String(body?.selectedText || '').trim(),
    selectedHtml: String(body?.selectedHtml || '').trim(),
    technique: {
      id: String(technique?.id || '').trim(),
      name: String(technique?.name || '').trim(),
      sympyTransformation: String(technique?.sympyTransformation || technique?.sympy_transformation || '').trim(),
    },
    options: safeObject(body?.options),
  }
}

function resolvePythonBinary() {
  if (pythonBin) return pythonBin

  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe')
  }

  return 'python3'
}

function executeSympyTransformation(payload) {
  return new Promise((resolve, reject) => {
    const pythonExecutable = resolvePythonBinary()
    const runnerPath = path.join(__dirname, 'sympy_runner.py')
    const child = spawn(pythonExecutable, [runnerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (handler) => {
      if (settled) return
      settled = true
      handler()
    }

    const timeoutId = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error('SymPy transformation timed out.')))
    }, 8000)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '')
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '')
    })

    child.on('error', (error) => {
      clearTimeout(timeoutId)
      finish(() => reject(error))
    })

    child.on('close', () => {
      clearTimeout(timeoutId)
      finish(() => {
        let body = {}
        try {
          body = JSON.parse(stdout || '{}')
        } catch {
          body = {}
        }

        if (!body?.ok) {
          reject(new Error(body?.error || stderr || 'The SymPy runner returned an invalid response.'))
          return
        }

        resolve(body)
      })
    })

    child.stdin.write(JSON.stringify({
      mode: 'transform',
      locale: payload.locale,
      selectedText: payload.selectedText,
      selectedHtml: payload.selectedHtml,
      sympyTransformation: payload.technique.sympyTransformation,
      options: payload.options,
    }))
    child.stdin.end()
  })
}

function describeSympyTechnique(payload) {
  return new Promise((resolve, reject) => {
    const pythonExecutable = resolvePythonBinary()
    const runnerPath = path.join(__dirname, 'sympy_runner.py')
    const child = spawn(pythonExecutable, [runnerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (handler) => {
      if (settled) return
      settled = true
      handler()
    }

    const timeoutId = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error('SymPy technique description timed out.')))
    }, 8000)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '')
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '')
    })

    child.on('error', (error) => {
      clearTimeout(timeoutId)
      finish(() => reject(error))
    })

    child.on('close', () => {
      clearTimeout(timeoutId)
      finish(() => {
        let body = {}
        try {
          body = JSON.parse(stdout || '{}')
        } catch {
          body = {}
        }

        if (!body?.ok) {
          reject(new Error(body?.error || stderr || 'The SymPy runner returned an invalid description response.'))
          return
        }

        resolve(body)
      })
    })

    child.stdin.write(JSON.stringify({
      mode: 'describe',
      locale: payload.locale,
      selectedText: payload.selectedText,
      selectedHtml: payload.selectedHtml,
      sympyTransformation: payload.technique.sympyTransformation,
      options: payload.options,
    }))
    child.stdin.end()
  })
}

function buildRuntimeInstructions(mode) {
  const baseRules = [
    'You are the Math Dungeons runtime narrator.',
    'You are not the game rules authority.',
    'You must only use facts explicitly present in the provided dungeon, room, challenge, character, runState, and interactionContext JSON.',
    'Never invent rooms, exits, rewards, enemies, solved states, hidden math facts, or new exercise data.',
    'Never declare HP, focus, inventory, hints, victory, defeat, movement changes, or damage as final truth. Only suggest them in structured form when appropriate.',
    'If the student is vague, do not guess the missing mathematical step. Ask for a more specific action in-world.',
    'Never give hints unless interactionContext.hintRequested is true.',
    'Never solve the full exercise unless interactionContext.allowFullSolution is true.',
    'Keep narration concise. Prefer 1-3 short sentences, not long paragraphs.',
    'Keep mathInterpretation.renderedSteps minimal and only include the exact requested step or answer fragment.',
    'Return JSON only and follow the schema exactly.',
  ]

  if (mode === 'puzzle') {
    return [
      ...baseRules,
      'In puzzle mode, you are a strict mathematical scribe and challenge operator.',
      'Execute only the exact mathematical action requested by the student.',
      'Do not skip steps, compress derivations, or continue beyond the requested transformation.',
      'Use only the given exercisePrompt, officialAnswer, mathFacts, and hintSteps to interpret the command.',
      'If the student refers to a fact like "equation 1" or "that relation", map it only if the reference is supported by the provided mathFacts.',
      'When the action is clear, narrate briefly and produce rendered math blocks for only that requested step.',
      'When a hint is requested, provide one concise next-step hint and no additional derivation.',
    ].join('\n')
  }

  if (mode === 'combat') {
    return [
      ...baseRules,
      'In combat mode, you remain a strict mathematical operator inside an enemy encounter.',
      'You may narrate the enemy pressure, but only from provided enemyProfile and relatedQuestions.',
      'Use relatedQuestions only when they are already present in the challenge JSON.',
      'If the student answers a related question, evaluate only that answer and do not extend into unrelated math.',
      'If the student requests a step on the main exercise, behave like puzzle mode and execute only that exact requested step.',
    ].join('\n')
  }

  return [
    ...baseRules,
    'In exploration mode, narrate the environment conservatively and ground every sentence in the current room and dungeon facts.',
    'You may suggest revealing loot or activating a challenge only when the action strongly supports it.',
    'Do not transform exploration into puzzle-solving before the challenge is engaged.',
  ].join('\n')
}

function buildRuntimeInput(payload) {
  return JSON.stringify(payload)
}

function buildRuntimeSchema() {
  return {
    name: 'math_dungeons_runtime_response',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { type: 'string' },
        playerIntent: { type: 'string' },
        narration: { type: 'string' },
        clarificationNeeded: { type: 'boolean' },
        clarificationPrompt: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
        mathInterpretation: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                actionSummary: {
                  anyOf: [{ type: 'string' }, { type: 'null' }],
                },
                renderedSteps: {
                  type: 'array',
                  items: { type: 'string' },
                },
                referencedFacts: {
                  type: 'array',
                  items: { type: 'string' },
                },
                nextExpectedInput: {
                  anyOf: [{ type: 'string' }, { type: 'null' }],
                },
              },
              required: ['actionSummary', 'renderedSteps', 'referencedFacts', 'nextExpectedInput'],
            },
          ],
        },
        rulesSuggestion: {
          type: 'object',
          additionalProperties: false,
          properties: {
            shouldRevealLoot: { type: 'boolean' },
            rewardIds: {
              type: 'array',
              items: { type: 'string' },
            },
            shouldActivateChallenge: { type: 'boolean' },
            challengeId: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
            },
            shouldConsumeHint: { type: 'boolean' },
          },
          required: ['shouldRevealLoot', 'rewardIds', 'shouldActivateChallenge', 'challengeId', 'shouldConsumeHint'],
        },
        evaluation: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                outcome: {
                  anyOf: [{ type: 'string' }, { type: 'null' }],
                },
                feedback: {
                  anyOf: [{ type: 'string' }, { type: 'null' }],
                },
                shouldAskRelatedQuestion: { type: 'boolean' },
                relatedQuestionPrompt: {
                  anyOf: [{ type: 'string' }, { type: 'null' }],
                },
              },
              required: ['outcome', 'feedback', 'shouldAskRelatedQuestion', 'relatedQuestionPrompt'],
            },
          ],
        },
      },
      required: [
        'mode',
        'playerIntent',
        'narration',
        'clarificationNeeded',
        'clarificationPrompt',
        'mathInterpretation',
        'rulesSuggestion',
        'evaluation',
      ],
    },
  }
}

function buildNotebookAssistantInstructions() {
  return [
    'You are a notebook math-writing assistant.',
    'The student writes a free-form command. Your job is to execute only the requested writing action, not to solve the whole exercise.',
    'You are a strict mathematical execution engine and scribe, not a solver, tutor, explainer, or planner.',
    'Use only two inputs: studentCommand and notebook.assistantContextHtml.',
    'Do not use exercise context, notebook history, linked techniques, active references, or current solution context.',
    'Never decide the next step on behalf of the student.',
    'Never continue beyond the exact requested action.',
    'Never perform two mathematical transformations when only one was requested.',
    'Never close a proof, derivation, argument, or result unless the student explicitly asked for that closure.',
    'Never simplify, factor, expand, substitute, conclude, justify, or rearrange unless the student explicitly requested that exact operation or it is strictly necessary to write the exact requested line.',
    'When the command is ambiguous, incomplete, or underspecified, choose the single most plausible local interpretation from notebook.assistantContextHtml and execute it.',
    'Never ask for clarification. You must execute according to the most plausible interpretation.',
    'Treat notebook.assistantContextHtml as the only mathematical target to operate on.',
    'Never invent mathematical data, labels, steps, motives, or conclusions not justified by the student command and provided context.',
    'Never introduce a theorem, criterion, or technique unless the student explicitly named it in studentCommand.',
    'If the student asks to apply a technique, write only the immediate notebook phrasing and the exact local execution fragment requested.',
    'If the student requests writing help, prefer rewriting their intent into clean notebook prose without adding extra mathematics.',
    'If the student requests mathematical execution, produce only the requested local line or fragment, not a full derivation.',
    'Execution must always be step-by-step. Never jump from the initial expression to a later result while omitting intermediate requested algebraic moves.',
    'Default to exactly one explicit step.',
    'If the student explicitly asks for several steps, still write them as separate consecutive rendered lines, each one being a real intermediate step.',
    'Do not compress several equalities, implications, or proof moves into one response unless the student explicitly asked for a compact rewrite.',
    'If the requested action depends on a hidden choice, such as which quantity to add, subtract, isolate, compare, or substitute, ask for that choice explicitly.',
    'If the technique is known but its concrete instantiation is missing, ask for the concrete instantiation instead of inventing it.',
    'When executing, stay as close as possible to the student wording while making the notebook sentence cleaner.',
    'Return the execution already written as rendered notebook HTML that can be copied and pasted directly into the rich editor.',
    'Prefer short, clean notebook prose.',
    'Do not explain pedagogy, strategy, or theory unless explicitly requested.',
    'Keep the classroom language consistent with the notebook locale whenever possible.',
    'Return JSON only and follow the schema exactly.',
  ].join('\n')
}

function buildNotebookAssistantSchema() {
  return {
    name: 'whiteboard_notebook_block_assistant',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: {
          type: 'string',
          enum: ['execute'],
        },
        normalizedCommand: { type: 'string' },
        assistantMessage: { type: 'string' },
        clarificationQuestion: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
        draftedIntroduction: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
        draftedBodyHtml: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
        referenceTailSuggestion: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
      },
      required: [
        'status',
        'normalizedCommand',
        'assistantMessage',
        'clarificationQuestion',
        'draftedIntroduction',
        'draftedBodyHtml',
        'referenceTailSuggestion',
      ],
    },
  }
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim()
  }

  const outputs = Array.isArray(data?.output) ? data.output : []
  for (const outputItem of outputs) {
    const contentItems = Array.isArray(outputItem?.content) ? outputItem.content : []
    for (const contentItem of contentItems) {
      if (typeof contentItem?.text === 'string' && contentItem.text.trim()) {
        return contentItem.text.trim()
      }

      if (typeof contentItem?.json === 'object' && contentItem.json) {
        return JSON.stringify(contentItem.json)
      }
    }
  }

  return ''
}

async function createOpenAiRuntimeResponse(payload) {
  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server.')
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: openAiModel,
      max_output_tokens: 220,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: buildRuntimeInstructions(payload.mode) }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildRuntimeInput(payload),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          ...buildRuntimeSchema(),
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI request failed: ${errorText}`)
  }

  const data = await response.json()
  const outputText = extractResponseText(data)
  if (typeof outputText !== 'string' || !outputText.trim()) {
    throw new Error('OpenAI returned an empty runtime response.')
  }
  return JSON.parse(outputText)
}

async function createOpenAiNotebookAssistantResponse(payload) {
  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server.')
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: openAiModel,
      max_output_tokens: 480,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: buildNotebookAssistantInstructions() }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: JSON.stringify(payload) }],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          ...buildNotebookAssistantSchema(),
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI request failed: ${errorText}`)
  }

  const data = await response.json()
  const outputText = extractResponseText(data)
  if (typeof outputText !== 'string' || !outputText.trim()) {
    throw new Error('OpenAI returned an empty notebook assistant response.')
  }
  return JSON.parse(outputText)
}

function normalizeUsername(input) {
  return String(input || '').trim().toLowerCase()
}

function normalizeEmail(input) {
  return String(input || '').trim().toLowerCase()
}

function normalizeWhiteboardWorkspaceVisibility(value) {
  return String(value || 'public').trim() === 'private' ? 'private' : 'public'
}

function normalizeWhiteboardWorkspaceRow(row) {
  if (!row) return null

  return {
    id: String(row.id || '').trim(),
    owner_user_id: String(row.owner_user_id || '').trim(),
    visibility: normalizeWhiteboardWorkspaceVisibility(row.visibility),
    source_workspace_id: String(row.source_workspace_id || '').trim() || null,
    exercise_local_id: String(row.exercise_local_id || '').trim(),
    exercise_title: String(row.exercise_title || '').trim(),
    exercise_snapshot: safeObject(row.exercise_snapshot),
    notebook_state: safeObject(row.notebook_state),
    nodes: safeArray(row.nodes),
    links: safeArray(row.links),
    last_editor_user_id: String(row.last_editor_user_id || '').trim() || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

function normalizeWhiteboardWorkspacePayload(body, ownerUserId) {
  return {
    visibility: normalizeWhiteboardWorkspaceVisibility(body?.visibility),
    sourceWorkspaceId: String(body?.sourceWorkspaceId || body?.source_workspace_id || '').trim() || null,
    exerciseLocalId: String(body?.exerciseLocalId || body?.exercise_local_id || '').trim(),
    exerciseTitle: String(body?.exerciseTitle || body?.exercise_title || '').trim() || 'Math Whiteboard',
    exerciseSnapshot: safeObject(body?.exerciseSnapshot || body?.exercise_snapshot),
    notebookState: safeObject(body?.notebookState || body?.notebook_state),
    nodes: safeArray(body?.nodes),
    links: safeArray(body?.links),
    lastEditorUserId:
      String(body?.lastEditorUserId || body?.last_editor_user_id || ownerUserId || '').trim() || ownerUserId,
  }
}

async function listOwnerWhiteboardWorkspaces(ownerUserId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        id,
        owner_user_id,
        visibility,
        source_workspace_id,
        exercise_local_id,
        exercise_title,
        exercise_snapshot,
        notebook_state,
        nodes,
        links,
        last_editor_user_id,
        created_at,
        updated_at
      FROM public.whiteboard_workspaces
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC, created_at DESC
    `,
    [ownerUserId],
  )

  return rows.map(normalizeWhiteboardWorkspaceRow).filter(Boolean)
}

async function listVisibleRootWhiteboardWorkspaces() {
  const { rows } = await postgresPool.query(`
    SELECT
      id,
      owner_user_id,
      visibility,
      source_workspace_id,
      exercise_local_id,
      exercise_title,
      exercise_snapshot,
      notebook_state,
      nodes,
      links,
      last_editor_user_id,
      created_at,
      updated_at
    FROM public.whiteboard_workspaces
    WHERE visibility = 'public'
      AND source_workspace_id IS NULL
    ORDER BY updated_at DESC, created_at DESC
  `)

  return rows.map(normalizeWhiteboardWorkspaceRow).filter(Boolean)
}

async function getAccessibleWhiteboardWorkspaceById(workspaceId, viewerUserId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        id,
        owner_user_id,
        visibility,
        source_workspace_id,
        exercise_local_id,
        exercise_title,
        exercise_snapshot,
        notebook_state,
        nodes,
        links,
        last_editor_user_id,
        created_at,
        updated_at
      FROM public.whiteboard_workspaces
      WHERE id = $1
        AND (
          owner_user_id = $2
          OR visibility = 'public'
        )
      LIMIT 1
    `,
    [workspaceId, viewerUserId],
  )

  return normalizeWhiteboardWorkspaceRow(rows[0] || null)
}

async function getOwnerWhiteboardWorkspaceByExercise(ownerUserId, exerciseLocalId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        id,
        owner_user_id,
        visibility,
        source_workspace_id,
        exercise_local_id,
        exercise_title,
        exercise_snapshot,
        notebook_state,
        nodes,
        links,
        last_editor_user_id,
        created_at,
        updated_at
      FROM public.whiteboard_workspaces
      WHERE owner_user_id = $1
        AND exercise_local_id = $2
      LIMIT 1
    `,
    [ownerUserId, exerciseLocalId],
  )

  return normalizeWhiteboardWorkspaceRow(rows[0] || null)
}

async function getRootWhiteboardWorkspaceByExerciseId(exerciseLocalId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        id,
        owner_user_id,
        visibility,
        source_workspace_id,
        exercise_local_id,
        exercise_title,
        exercise_snapshot,
        notebook_state,
        nodes,
        links,
        last_editor_user_id,
        created_at,
        updated_at
      FROM public.whiteboard_workspaces
      WHERE exercise_local_id = $1
        AND source_workspace_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [exerciseLocalId],
  )

  return normalizeWhiteboardWorkspaceRow(rows[0] || null)
}

async function insertWhiteboardWorkspace({
  ownerUserId,
  visibility,
  sourceWorkspaceId,
  exerciseLocalId,
  exerciseTitle,
  exerciseSnapshot,
  notebookState,
  nodes,
  links,
  lastEditorUserId,
}) {
  const { rows } = await postgresPool.query(
    `
      INSERT INTO public.whiteboard_workspaces (
        owner_user_id,
        visibility,
        source_workspace_id,
        exercise_local_id,
        exercise_title,
        exercise_snapshot,
        notebook_state,
        nodes,
        links,
        last_editor_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10)
      RETURNING
        id,
        owner_user_id,
        visibility,
        source_workspace_id,
        exercise_local_id,
        exercise_title,
        exercise_snapshot,
        notebook_state,
        nodes,
        links,
        last_editor_user_id,
        created_at,
        updated_at
    `,
    [
      ownerUserId,
      visibility,
      sourceWorkspaceId,
      exerciseLocalId,
      exerciseTitle,
      JSON.stringify(exerciseSnapshot),
      JSON.stringify(notebookState),
      JSON.stringify(nodes),
      JSON.stringify(links),
      lastEditorUserId,
    ],
  )

  return normalizeWhiteboardWorkspaceRow(rows[0] || null)
}

async function updateOwnedWhiteboardWorkspaceRecord(workspaceId, ownerUserId, payload) {
  const { rows } = await postgresPool.query(
    `
      UPDATE public.whiteboard_workspaces
      SET visibility = $3,
          exercise_title = $4,
          exercise_snapshot = $5::jsonb,
          notebook_state = $6::jsonb,
          nodes = $7::jsonb,
          links = $8::jsonb,
          last_editor_user_id = $9
      WHERE id = $1
        AND owner_user_id = $2
      RETURNING
        id,
        owner_user_id,
        visibility,
        source_workspace_id,
        exercise_local_id,
        exercise_title,
        exercise_snapshot,
        notebook_state,
        nodes,
        links,
        last_editor_user_id,
        created_at,
        updated_at
    `,
    [
      workspaceId,
      ownerUserId,
      payload.visibility,
      payload.exerciseTitle,
      JSON.stringify(payload.exerciseSnapshot),
      JSON.stringify(payload.notebookState),
      JSON.stringify(payload.nodes),
      JSON.stringify(payload.links),
      payload.lastEditorUserId,
    ],
  )

  return normalizeWhiteboardWorkspaceRow(rows[0] || null)
}

function normalizeTechniqueStructuredSpec(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function normalizeTechniqueEntityRow(row) {
  if (!row) return null

  return {
    ...row,
    structured_technique_spec: normalizeTechniqueStructuredSpec(row.structured_technique_spec),
  }
}

function normalizeTechniqueKeyPart(value) {
  return String(value || '').trim().toLowerCase()
}

function buildTechniqueCatalogMatchKey(row) {
  return [
    row?.created_by,
    row?.name,
    row?.topic,
    row?.subtopic,
    row?.effect_type,
    row?.effect_description,
  ]
    .map(normalizeTechniqueKeyPart)
    .join('||')
}

function normalizeTechniqueProposalStatus(value, role = 'student') {
  const normalized = String(value || '').trim().toLowerCase()
  if (role === 'teacher') {
    return ['draft', 'proposed', 'approved', 'rejected'].includes(normalized) ? normalized : 'draft'
  }
  return ['draft', 'proposed'].includes(normalized) ? normalized : 'draft'
}

function normalizeCatalogStatus(value) {
  return String(value || '').trim().toLowerCase() === 'archived' ? 'archived' : 'approved'
}

function toNullableTrimmedText(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function toTechniquePayload(input, actorUser) {
  const role = actorUser?.role === 'teacher' ? 'teacher' : 'student'
  const status = normalizeTechniqueProposalStatus(input?.status, role)
  const reviewedBy = role === 'teacher' && (status === 'approved' || status === 'rejected') ? actorUser.id : null
  const approvedAt = role === 'teacher' && status === 'approved' ? String(input?.approved_at || new Date().toISOString()) : null

  return {
    status,
    reviewed_by: reviewedBy,
    approved_at: approvedAt,
    name: String(input?.name || '').trim(),
    name_fr: toNullableTrimmedText(input?.name_fr),
    topic: toNullableTrimmedText(input?.topic),
    topic_fr: toNullableTrimmedText(input?.topic_fr),
    subtopic: toNullableTrimmedText(input?.subtopic),
    subtopic_fr: toNullableTrimmedText(input?.subtopic_fr),
    effect_type: toNullableTrimmedText(input?.effect_type),
    effect_type_fr: toNullableTrimmedText(input?.effect_type_fr),
    effect_description: String(input?.effect_description || '').trim(),
    effect_description_fr: toNullableTrimmedText(input?.effect_description_fr),
    worked_example: toNullableTrimmedText(input?.worked_example),
    worked_example_fr: toNullableTrimmedText(input?.worked_example_fr),
    application_structure: toNullableTrimmedText(input?.application_structure),
    application_structure_fr: toNullableTrimmedText(input?.application_structure_fr),
    sympy_transformation: toNullableTrimmedText(input?.sympy_transformation),
    sympy_transformation_es: toNullableTrimmedText(input?.sympy_transformation_es),
    sympy_transformation_fr: toNullableTrimmedText(input?.sympy_transformation_fr),
    sympy_input_schema: toNullableTrimmedText(input?.sympy_input_schema),
    structured_technique_spec: normalizeTechniqueStructuredSpec(input?.structured_technique_spec),
  }
}

function assertTechniquePayload(payload) {
  if (!String(payload?.name || '').trim()) {
    throw new Error('Technique name is required.')
  }

  if (!String(payload?.effect_description || '').trim()) {
    throw new Error('Technique effect description is required.')
  }
}

async function listProfileRowsByIds(userIds = []) {
  const ids = [...new Set((userIds || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))]
  if (!ids.length) return []

  const { rows } = await postgresPool.query(
    `
      SELECT id, username
      FROM public.profiles
      WHERE id = ANY($1::uuid[])
    `,
    [ids],
  )

  return rows.map((row) => ({
    id: String(row.id || '').trim(),
    username: String(row.username || '').trim(),
  }))
}

async function listStudentTechniqueCollectionEntriesFromPostgres(studentUserId) {
  const { rows } = await postgresPool.query(
    `
      SELECT
        c.id AS collection_entry_id,
        c.source AS collection_source,
        c.created_at AS collected_at,
        cat.*
      FROM public.competitive_technique_student_collection c
      JOIN public.competitive_technique_catalog cat ON cat.id = c.catalog_technique_id
      WHERE c.student_user_id = $1
      ORDER BY c.created_at DESC, cat.updated_at DESC
    `,
    [studentUserId],
  )

  return rows.map((row) => normalizeTechniqueEntityRow(row)).filter(Boolean)
}

async function listOwnCompetitiveTechniqueProposalsFromPostgres(userId) {
  const { rows } = await postgresPool.query(
    `
      SELECT *
      FROM public.competitive_technique_proposals
      WHERE created_by = $1
      ORDER BY updated_at DESC, created_at DESC
    `,
    [userId],
  )

  return rows.map((row) => normalizeTechniqueEntityRow(row)).filter(Boolean)
}

async function listReviewableCompetitiveTechniqueProposalsFromPostgres() {
  const { rows } = await postgresPool.query(
    `
      SELECT *
      FROM public.competitive_technique_proposals
      WHERE status = 'proposed'
      ORDER BY updated_at DESC, created_at DESC
    `,
  )

  return rows.map((row) => normalizeTechniqueEntityRow(row)).filter(Boolean)
}

async function listApprovedTechniqueCatalogEntriesFromPostgres() {
  const [catalogResult, proposalResult] = await Promise.all([
    postgresPool.query(
      `
        SELECT *
        FROM public.competitive_technique_catalog
        WHERE status = 'approved'
        ORDER BY updated_at DESC, created_at DESC
      `,
    ),
    postgresPool.query(
      `
        SELECT *
        FROM public.competitive_technique_proposals
        WHERE status = 'approved'
        ORDER BY updated_at DESC, created_at DESC
      `,
    ),
  ])

  const approvedCatalogRows = catalogResult.rows.map((row) => normalizeTechniqueEntityRow(row)).filter(Boolean)
  const approvedProposalRows = proposalResult.rows.map((row) => normalizeTechniqueEntityRow(row)).filter(Boolean)

  const items = approvedCatalogRows.map((row) => ({
    ...row,
    catalog_id: row.id,
    has_catalog_entry: true,
  }))

  const catalogIds = new Set(approvedCatalogRows.map((row) => row.id).filter(Boolean))
  const legacyIds = new Set(approvedCatalogRows.map((row) => row.legacy_technique_id).filter(Boolean))
  const contentKeys = new Set(approvedCatalogRows.map((row) => buildTechniqueCatalogMatchKey(row)).filter(Boolean))

  approvedProposalRows.forEach((row) => {
    const hasCatalogMatch =
      (row.published_catalog_id && catalogIds.has(row.published_catalog_id)) ||
      (row.legacy_technique_id && legacyIds.has(row.legacy_technique_id)) ||
      contentKeys.has(buildTechniqueCatalogMatchKey(row))

    if (hasCatalogMatch) return

    items.push({
      id: `proposal:${row.id}`,
      catalog_id: null,
      has_catalog_entry: false,
      legacy_technique_id: row.legacy_technique_id,
      created_by: row.created_by,
      reviewed_by: row.reviewed_by,
      status: 'approved',
      published_at: row.approved_at,
      archived_at: null,
      name: row.name,
      name_fr: row.name_fr,
      topic: row.topic,
      topic_fr: row.topic_fr,
      subtopic: row.subtopic,
      subtopic_fr: row.subtopic_fr,
      effect_type: row.effect_type,
      effect_type_fr: row.effect_type_fr,
      effect_description: row.effect_description,
      effect_description_fr: row.effect_description_fr,
      worked_example: row.worked_example,
      worked_example_fr: row.worked_example_fr,
      application_structure: row.application_structure,
      application_structure_fr: row.application_structure_fr,
      sympy_transformation: row.sympy_transformation,
      sympy_transformation_es: row.sympy_transformation_es,
      sympy_transformation_fr: row.sympy_transformation_fr,
      sympy_input_schema: row.sympy_input_schema,
      structured_technique_spec: row.structured_technique_spec,
      created_at: row.created_at,
      updated_at: row.updated_at,
      orphaned_proposal_id: row.id,
    })
  })

  items.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  return items
}

async function listPrivateApprovedCompetitiveTechniquesFromPostgres(userId) {
  const [collectionRows, approvedProposalResult] = await Promise.all([
    listStudentTechniqueCollectionEntriesFromPostgres(userId),
    postgresPool.query(
      `
        SELECT *
        FROM public.competitive_technique_proposals
        WHERE created_by = $1
          AND status = 'approved'
        ORDER BY updated_at DESC, created_at DESC
      `,
      [userId],
    ),
  ])

  const approvedProposalRows = approvedProposalResult.rows.map((row) => normalizeTechniqueEntityRow(row)).filter(Boolean)
  const items = []
  const seenKeys = new Set()

  const pushUnique = (key, value) => {
    if (!key || seenKeys.has(key)) return
    seenKeys.add(key)
    items.push(value)
  }

  collectionRows.forEach((row) => {
    const sourceKey = row.id || row.source_catalog_id || row.legacy_technique_id
    pushUnique(`catalog:${sourceKey}`, {
      ...row,
      scope: 'private_collection',
      is_owner_copy: row.created_by === userId,
    })
  })

  approvedProposalRows.forEach((row) => {
    const sourceKey = row.published_catalog_id || row.legacy_technique_id || row.id
    pushUnique(`catalog:${sourceKey}`, {
      ...row,
      scope: 'private_collection',
      collection_source: row.published_catalog_id ? 'published_proposal' : 'approved_proposal',
      collected_at: row.approved_at || row.updated_at || row.created_at,
      is_owner_copy: true,
    })
  })

  items.sort((a, b) =>
    String(b.collected_at || b.updated_at || '').localeCompare(String(a.collected_at || a.updated_at || '')),
  )

  return items
}

async function getTechniqueProposalByIdWithClient(client, proposalId) {
  const { rows } = await client.query(
    `
      SELECT *
      FROM public.competitive_technique_proposals
      WHERE id = $1
      LIMIT 1
    `,
    [proposalId],
  )

  return normalizeTechniqueEntityRow(rows[0] || null)
}

async function getTechniqueCatalogByIdWithClient(client, catalogId) {
  const { rows } = await client.query(
    `
      SELECT *
      FROM public.competitive_technique_catalog
      WHERE id = $1
      LIMIT 1
    `,
    [catalogId],
  )

  return normalizeTechniqueEntityRow(rows[0] || null)
}

async function addTechniqueCatalogEntryToStudentCollectionWithClient(client, studentUserId, catalogTechniqueId, source = 'copied') {
  await client.query(
    `
      INSERT INTO public.competitive_technique_student_collection (
        student_user_id,
        catalog_technique_id,
        source
      ) VALUES ($1, $2, $3)
      ON CONFLICT (student_user_id, catalog_technique_id) DO NOTHING
    `,
    [studentUserId, catalogTechniqueId, source === 'seeded_from_legacy_approved' ? source : 'copied'],
  )
}

async function publishTechniqueProposalRecordWithClient(client, proposal, teacherUserId) {
  const nowIso = new Date().toISOString()
  let legacyTechniqueId = proposal.legacy_technique_id || null
  let catalogId = proposal.published_catalog_id || null

  const publishValues = [
    proposal.created_by,
    teacherUserId,
    nowIso,
    proposal.name,
    proposal.name_fr,
    proposal.topic,
    proposal.topic_fr,
    proposal.subtopic,
    proposal.subtopic_fr,
    proposal.effect_type,
    proposal.effect_type_fr,
    proposal.effect_description,
    proposal.effect_description_fr,
    proposal.worked_example,
    proposal.worked_example_fr,
    proposal.application_structure,
    proposal.application_structure_fr,
    proposal.sympy_transformation,
    proposal.sympy_transformation_es,
    proposal.sympy_transformation_fr,
    proposal.sympy_input_schema,
    JSON.stringify(proposal.structured_technique_spec || null),
  ]

  if (legacyTechniqueId) {
    await client.query(
      `
        UPDATE public.competitive_techniques
        SET created_by = $1,
            reviewed_by = $2,
            approved_at = $3,
            status = 'approved',
            name = $4,
            name_fr = $5,
            topic = $6,
            topic_fr = $7,
            subtopic = $8,
            subtopic_fr = $9,
            effect_type = $10,
            effect_type_fr = $11,
            effect_description = $12,
            effect_description_fr = $13,
            worked_example = $14,
            worked_example_fr = $15,
            application_structure = $16,
            application_structure_fr = $17,
            sympy_transformation = $18,
            sympy_transformation_es = $19,
            sympy_transformation_fr = $20,
            sympy_input_schema = $21,
            structured_technique_spec = $22::jsonb
        WHERE id = $23
      `,
      [...publishValues, legacyTechniqueId],
    )
  } else {
    const legacyInsert = await client.query(
      `
        INSERT INTO public.competitive_techniques (
          created_by,
          reviewed_by,
          approved_at,
          status,
          name,
          name_fr,
          topic,
          topic_fr,
          subtopic,
          subtopic_fr,
          effect_type,
          effect_type_fr,
          effect_description,
          effect_description_fr,
          worked_example,
          worked_example_fr,
          application_structure,
          application_structure_fr,
          sympy_transformation,
          sympy_transformation_es,
          sympy_transformation_fr,
          sympy_input_schema,
          structured_technique_spec,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, 'approved', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb, $23, $24
        )
        RETURNING id
      `,
      [...publishValues, proposal.created_at || nowIso, proposal.updated_at || nowIso],
    )

    legacyTechniqueId = legacyInsert.rows[0]?.id || null
  }

  if (catalogId) {
    await client.query(
      `
        UPDATE public.competitive_technique_catalog
        SET legacy_technique_id = $1,
            reviewed_by = $2,
            status = 'approved',
            archived_at = null,
            published_at = $3,
            name = $4,
            name_fr = $5,
            topic = $6,
            topic_fr = $7,
            subtopic = $8,
            subtopic_fr = $9,
            effect_type = $10,
            effect_type_fr = $11,
            effect_description = $12,
            effect_description_fr = $13,
            worked_example = $14,
            worked_example_fr = $15,
            application_structure = $16,
            application_structure_fr = $17,
            sympy_transformation = $18,
            sympy_transformation_es = $19,
            sympy_transformation_fr = $20,
            sympy_input_schema = $21,
            structured_technique_spec = $22::jsonb
        WHERE id = $23
      `,
      [legacyTechniqueId, teacherUserId, nowIso, ...publishValues.slice(3), catalogId],
    )
  } else {
    const catalogInsert = await client.query(
      `
        INSERT INTO public.competitive_technique_catalog (
          legacy_technique_id,
          created_by,
          reviewed_by,
          status,
          published_at,
          name,
          name_fr,
          topic,
          topic_fr,
          subtopic,
          subtopic_fr,
          effect_type,
          effect_type_fr,
          effect_description,
          effect_description_fr,
          worked_example,
          worked_example_fr,
          application_structure,
          application_structure_fr,
          sympy_transformation,
          sympy_transformation_es,
          sympy_transformation_fr,
          sympy_input_schema,
          structured_technique_spec,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, 'approved', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb, $24, $25
        )
        RETURNING id
      `,
      [
        legacyTechniqueId,
        proposal.created_by,
        teacherUserId,
        nowIso,
        proposal.name,
        proposal.name_fr,
        proposal.topic,
        proposal.topic_fr,
        proposal.subtopic,
        proposal.subtopic_fr,
        proposal.effect_type,
        proposal.effect_type_fr,
        proposal.effect_description,
        proposal.effect_description_fr,
        proposal.worked_example,
        proposal.worked_example_fr,
        proposal.application_structure,
        proposal.application_structure_fr,
        proposal.sympy_transformation,
        proposal.sympy_transformation_es,
        proposal.sympy_transformation_fr,
        proposal.sympy_input_schema,
        JSON.stringify(proposal.structured_technique_spec || null),
        proposal.created_at || nowIso,
        proposal.updated_at || nowIso,
      ],
    )

    catalogId = catalogInsert.rows[0]?.id || null
  }

  await client.query(
    `
      UPDATE public.competitive_technique_proposals
      SET legacy_technique_id = $2,
          status = 'approved',
          reviewed_by = $3,
          approved_at = $4,
          published_catalog_id = $5
      WHERE id = $1
    `,
    [proposal.id, legacyTechniqueId, teacherUserId, nowIso, catalogId],
  )

  await addTechniqueCatalogEntryToStudentCollectionWithClient(
    client,
    proposal.created_by,
    catalogId,
    'seeded_from_legacy_approved',
  )

  return getTechniqueProposalByIdWithClient(client, proposal.id)
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

app.get('/api/postgres-health', async (_req, res) => {
  const status = await probePostgres()

  if (!status.configured) {
    return res.status(200).json(status)
  }

  if (!status.ok) {
    return res.status(503).json(status)
  }

  return res.json(status)
})

app.get('/api/whiteboard-workspaces', requireSupabaseSession, async (req, res) => {
  try {
    const workspaces = await listOwnerWhiteboardWorkspaces(req.authUser.id)
    return res.json({ workspaces })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load whiteboard workspaces.' })
  }
})

app.get('/api/whiteboard-workspaces/public', requireSupabaseSession, async (_req, res) => {
  try {
    const workspaces = await listVisibleRootWhiteboardWorkspaces()
    return res.json({ workspaces })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load public whiteboards.' })
  }
})

app.get('/api/whiteboard-workspaces/by-exercise/:exerciseLocalId', requireSupabaseSession, async (req, res) => {
  const exerciseLocalId = String(req.params.exerciseLocalId || '').trim()
  if (!exerciseLocalId) {
    return res.status(400).json({ error: 'exerciseLocalId is required.' })
  }

  try {
    const workspace = await getOwnerWhiteboardWorkspaceByExercise(req.authUser.id, exerciseLocalId)
    return res.json({ workspace })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load the whiteboard workspace.' })
  }
})

app.get('/api/whiteboard-workspaces/root/:exerciseLocalId', requireSupabaseSession, async (req, res) => {
  const exerciseLocalId = String(req.params.exerciseLocalId || '').trim()
  if (!exerciseLocalId) {
    return res.status(400).json({ error: 'exerciseLocalId is required.' })
  }

  try {
    const workspace = await getRootWhiteboardWorkspaceByExerciseId(exerciseLocalId)
    return res.json({ workspace })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load the root whiteboard.' })
  }
})

app.post('/api/whiteboard-workspaces/ensure-root', requireSupabaseSession, async (req, res) => {
  const payload = normalizeWhiteboardWorkspacePayload(req.body, req.authUser.id)
  if (!payload.exerciseLocalId) {
    return res.status(400).json({ error: 'exerciseLocalId is required.' })
  }

  try {
    const existing = await getRootWhiteboardWorkspaceByExerciseId(payload.exerciseLocalId)
    if (existing) {
      return res.json({ workspace: existing })
    }

    const workspace = await insertWhiteboardWorkspace({
      ownerUserId: req.authUser.id,
      visibility: payload.visibility,
      sourceWorkspaceId: null,
      exerciseLocalId: payload.exerciseLocalId,
      exerciseTitle: payload.exerciseTitle,
      exerciseSnapshot: payload.exerciseSnapshot,
      notebookState: payload.notebookState,
      nodes: payload.nodes,
      links: payload.links,
      lastEditorUserId: req.authUser.id,
    })

    return res.status(201).json({ workspace })
  } catch (error) {
    if (error?.code === '23505') {
      const fallback = await getRootWhiteboardWorkspaceByExerciseId(payload.exerciseLocalId)
      if (fallback) {
        return res.json({ workspace: fallback })
      }
    }
    return res.status(500).json({ error: error?.message || 'Could not create the root whiteboard.' })
  }
})

app.post('/api/whiteboard-workspaces/ensure', requireSupabaseSession, async (req, res) => {
  const payload = normalizeWhiteboardWorkspacePayload(req.body, req.authUser.id)
  if (!payload.exerciseLocalId) {
    return res.status(400).json({ error: 'exerciseLocalId is required.' })
  }

  try {
    const { rows } = await postgresPool.query(
      `
        INSERT INTO public.whiteboard_workspaces (
          owner_user_id,
          visibility,
          source_workspace_id,
          exercise_local_id,
          exercise_title,
          exercise_snapshot,
          notebook_state,
          nodes,
          links,
          last_editor_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10)
        ON CONFLICT (owner_user_id, exercise_local_id)
        DO UPDATE SET
          visibility = EXCLUDED.visibility,
          source_workspace_id = EXCLUDED.source_workspace_id,
          exercise_title = EXCLUDED.exercise_title,
          exercise_snapshot = EXCLUDED.exercise_snapshot,
          notebook_state = EXCLUDED.notebook_state,
          nodes = EXCLUDED.nodes,
          links = EXCLUDED.links,
          last_editor_user_id = EXCLUDED.last_editor_user_id
        RETURNING
          id,
          owner_user_id,
          visibility,
          source_workspace_id,
          exercise_local_id,
          exercise_title,
          exercise_snapshot,
          notebook_state,
          nodes,
          links,
          last_editor_user_id,
          created_at,
          updated_at
      `,
      [
        req.authUser.id,
        payload.visibility,
        payload.sourceWorkspaceId,
        payload.exerciseLocalId,
        payload.exerciseTitle,
        JSON.stringify(payload.exerciseSnapshot),
        JSON.stringify(payload.notebookState),
        JSON.stringify(payload.nodes),
        JSON.stringify(payload.links),
        req.authUser.id,
      ],
    )

    return res.json({ workspace: normalizeWhiteboardWorkspaceRow(rows[0] || null) })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not create or recover the whiteboard.' })
  }
})

app.post('/api/whiteboard-workspaces/clone', requireSupabaseSession, async (req, res) => {
  const payload = normalizeWhiteboardWorkspacePayload(req.body, req.authUser.id)
  if (!payload.exerciseLocalId) {
    return res.status(400).json({ error: 'exerciseLocalId is required.' })
  }

  try {
    const workspace = await insertWhiteboardWorkspace({
      ownerUserId: req.authUser.id,
      visibility: payload.visibility,
      sourceWorkspaceId: payload.sourceWorkspaceId,
      exerciseLocalId: payload.exerciseLocalId,
      exerciseTitle: payload.exerciseTitle,
      exerciseSnapshot: payload.exerciseSnapshot,
      notebookState: payload.notebookState,
      nodes: payload.nodes,
      links: payload.links,
      lastEditorUserId: req.authUser.id,
    })

    return res.status(201).json({ workspace })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not clone the whiteboard.' })
  }
})

app.get('/api/whiteboard-workspaces/:workspaceId', requireSupabaseSession, async (req, res) => {
  const workspaceId = String(req.params.workspaceId || '').trim()
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required.' })
  }

  try {
    const workspace = await getAccessibleWhiteboardWorkspaceById(workspaceId, req.authUser.id)
    if (!workspace) {
      return res.status(404).json({ error: 'Whiteboard workspace not found.' })
    }
    return res.json({ workspace })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load the whiteboard workspace.' })
  }
})

app.get('/api/whiteboard-workspaces/:workspaceId/events', async (req, res) => {
  const workspaceId = String(req.params.workspaceId || '').trim()
  const clientId = String(req.query?.clientId || '').trim()
  const accessToken = String(req.query?.accessToken || '').trim()

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required.' })
  }

  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required.' })
  }

  const resolved = await resolveAuthUserFromAccessToken(accessToken)
  if (!resolved.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const workspace = await getAccessibleWhiteboardWorkspaceById(workspaceId, resolved.user.id)
  if (!workspace) {
    return res.status(404).json({ error: 'Whiteboard workspace not found.' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  registerWhiteboardWorkspaceSubscriber(workspaceId, clientId, res)
  upsertWhiteboardWorkspacePresence(workspaceId, {
    clientId,
    userId: String(req.query?.userId || resolved.user.id || '').trim(),
    username: String(req.query?.username || resolved.user.username || '').trim(),
    color: String(req.query?.color || '').trim(),
    activity: String(req.query?.activity || '').trim() || 'browsing',
    editingType: String(req.query?.editingType || '').trim() || 'board',
    targetId: String(req.query?.targetId || '').trim(),
  })

  sendSseEvent(res, 'snapshot', { workspace, sourceClientId: '', sentAt: new Date().toISOString() })
  sendSseEvent(res, 'presence', { collaborators: getWhiteboardWorkspacePresenceEntries(workspaceId) })

  const keepAliveId = setInterval(() => {
    res.write(': keepalive\n\n')
  }, 20000)

  req.on('close', () => {
    clearInterval(keepAliveId)
    unregisterWhiteboardWorkspaceSubscriber(workspaceId, clientId)
    removeWhiteboardWorkspacePresence(workspaceId, clientId)
    res.end()
  })
})

app.post('/api/whiteboard-workspaces/:workspaceId/presence', requireSupabaseSession, async (req, res) => {
  const workspaceId = String(req.params.workspaceId || '').trim()
  const clientId = String(req.body?.clientId || '').trim()

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required.' })
  }

  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required.' })
  }

  const workspace = await getAccessibleWhiteboardWorkspaceById(workspaceId, req.authUser.id)
  if (!workspace) {
    return res.status(404).json({ error: 'Whiteboard workspace not found.' })
  }

  upsertWhiteboardWorkspacePresence(workspaceId, {
    clientId,
    userId: String(req.body?.userId || req.authUser.id || '').trim(),
    username: String(req.body?.username || req.authUser.username || '').trim(),
    color: String(req.body?.color || '').trim(),
    activity: String(req.body?.activity || '').trim(),
    editingType: String(req.body?.editingType || '').trim(),
    targetId: String(req.body?.targetId || '').trim(),
  })

  return res.json({ ok: true, collaborators: getWhiteboardWorkspacePresenceEntries(workspaceId) })
})

app.post('/api/whiteboard-workspaces/:workspaceId/broadcast', requireSupabaseSession, async (req, res) => {
  const workspaceId = String(req.params.workspaceId || '').trim()
  const clientId = String(req.body?.clientId || '').trim()
  const eventName = String(req.body?.event || 'board-sync').trim()

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required.' })
  }

  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required.' })
  }

  const workspace = await getAccessibleWhiteboardWorkspaceById(workspaceId, req.authUser.id)
  if (!workspace) {
    return res.status(404).json({ error: 'Whiteboard workspace not found.' })
  }

  if (eventName === 'notebook-sync') {
    broadcastWhiteboardWorkspaceNotebookSync(workspaceId, {
      sourceClientId: clientId,
      clientId,
      userId: req.authUser.id,
      username: req.authUser.username || req.authUser.id,
      exerciseSnapshot: req.body?.exerciseSnapshot,
      notebook: req.body?.notebook,
    })
  } else {
    broadcastWhiteboardWorkspaceBoardSync(workspaceId, {
      sourceClientId: clientId,
      clientId,
      userId: req.authUser.id,
      username: req.authUser.username || req.authUser.id,
      exerciseSnapshot: req.body?.exerciseSnapshot,
      nodes: req.body?.nodes,
      links: req.body?.links,
    })
  }

  return res.json({ ok: true })
})

app.patch('/api/whiteboard-workspaces/:workspaceId', requireSupabaseSession, async (req, res) => {
  const workspaceId = String(req.params.workspaceId || '').trim()
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required.' })
  }

  const current = await getAccessibleWhiteboardWorkspaceById(workspaceId, req.authUser.id)
  if (!current || current.owner_user_id !== req.authUser.id) {
    return res.status(404).json({ error: 'Whiteboard workspace not found.' })
  }

  const incoming = normalizeWhiteboardWorkspacePayload(req.body, req.authUser.id)
  const hasExerciseSnapshot = Object.prototype.hasOwnProperty.call(req.body || {}, 'exerciseSnapshot')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'exercise_snapshot')
  const hasNotebookState = Object.prototype.hasOwnProperty.call(req.body || {}, 'notebookState')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'notebook_state')
  const hasNodes = Object.prototype.hasOwnProperty.call(req.body || {}, 'nodes')
  const hasLinks = Object.prototype.hasOwnProperty.call(req.body || {}, 'links')
  const payload = {
    visibility: incoming.visibility,
    exerciseTitle: incoming.exerciseTitle || current.exercise_title || 'Math Whiteboard',
    exerciseSnapshot: hasExerciseSnapshot ? incoming.exerciseSnapshot : current.exercise_snapshot,
    notebookState: hasNotebookState ? incoming.notebookState : current.notebook_state,
    nodes: hasNodes ? incoming.nodes : current.nodes,
    links: hasLinks ? incoming.links : current.links,
    lastEditorUserId: req.authUser.id,
  }

  try {
    const workspace = await updateOwnedWhiteboardWorkspaceRecord(workspaceId, req.authUser.id, payload)
    if (!workspace) {
      return res.status(404).json({ error: 'Whiteboard workspace not found.' })
    }
    await broadcastWhiteboardWorkspaceSnapshot(workspaceId, {
      sourceClientId: String(req.body?.clientId || '').trim(),
      viewerUserId: req.authUser.id,
    })
    return res.json({ workspace })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not update the whiteboard workspace.' })
  }
})

app.delete('/api/whiteboard-workspaces/by-exercise/:exerciseLocalId', requireSupabaseSession, async (req, res) => {
  const exerciseLocalId = String(req.params.exerciseLocalId || '').trim()
  if (!exerciseLocalId) {
    return res.status(400).json({ error: 'exerciseLocalId is required.' })
  }

  try {
    await postgresPool.query(
      `
        DELETE FROM public.whiteboard_workspaces
        WHERE owner_user_id = $1
          AND exercise_local_id = $2
      `,
      [req.authUser.id, exerciseLocalId],
    )

    return res.status(204).send()
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not delete the whiteboard workspace.' })
  }
})

app.delete('/api/whiteboard-workspaces/:workspaceId', requireSupabaseSession, async (req, res) => {
  const workspaceId = String(req.params.workspaceId || '').trim()
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required.' })
  }

  try {
    const result = await postgresPool.query(
      `
        DELETE FROM public.whiteboard_workspaces
        WHERE id = $1
          AND owner_user_id = $2
      `,
      [workspaceId, req.authUser.id],
    )

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Whiteboard workspace not found.' })
    }

    return res.status(204).send()
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not delete the whiteboard workspace.' })
  }
})

app.post('/api/math-dungeons/runtime-response', requireSupabaseSession, async (req, res) => {
  const payload = sanitizeRuntimePayload(req.body)

  if (!payload.playerAction) {
    return res.status(400).json({ error: 'playerAction is required.' })
  }

  try {
    const runtime = await createOpenAiRuntimeResponse(payload)
    return res.json({
      runtime,
      model: openAiModel,
      userId: req.authUser.id,
    })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not create runtime response.' })
  }
})

app.post('/api/whiteboard-notebook/block-assistant', requireSupabaseSession, async (req, res) => {
  const payload = sanitizeNotebookAssistantPayload(req.body)

  if (!payload.studentCommand) {
    return res.status(400).json({ error: 'studentCommand is required.' })
  }

  try {
    const assistant = await createOpenAiNotebookAssistantResponse(payload)
    return res.json({
      assistant,
      model: openAiModel,
      userId: req.authUser.id,
    })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not create notebook assistant response.' })
  }
})

app.post('/api/whiteboard-notebook/apply-technique', requireSupabaseSession, async (req, res) => {
  const payload = sanitizeNotebookTechniquePayload(req.body)

  if (!payload.selectedText) {
    return res.status(400).json({ error: 'selectedText is required.' })
  }

  if (!payload.technique.sympyTransformation) {
    return res.status(400).json({ error: 'technique.sympyTransformation is required.' })
  }

  try {
    const execution = await executeSympyTransformation(payload)
    return res.json({
      execution,
      userId: req.authUser.id,
      techniqueId: payload.technique.id || null,
      techniqueName: payload.technique.name || null,
    })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not apply the SymPy transformation.' })
  }
})

app.post('/api/whiteboard-notebook/describe-technique', requireSupabaseSession, async (req, res) => {
  const payload = sanitizeNotebookTechniquePayload(req.body)

  if (!payload.technique.sympyTransformation) {
    return res.status(400).json({ error: 'technique.sympyTransformation is required.' })
  }

  try {
    const behavior = await describeSympyTechnique(payload)
    return res.json({
      behavior: safeObject(behavior?.behavior),
      userId: req.authUser.id,
      techniqueId: payload.technique.id || null,
      techniqueName: payload.technique.name || null,
    })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not describe the SymPy technique.' })
  }
})

app.post('/api/notebook-collab/pages', requireSupabaseSession, async (req, res) => {
  try {
    const ownerUserId = String(req.body?.ownerUserId || '').trim()
    const pages = ownerUserId && ownerUserId === req.authUser.id
      ? await listOwnedNotebookCollabPages(req.authUser.id)
      : await listAccessibleNotebookCollabPages(req.authUser.id)
    return res.json({ pages })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'No se pudieron listar las hojas colaborativas.' })
  }
})

app.put('/api/notebook-collab/pages', requireSupabaseSession, async (req, res) => {
  const ownerUserId = String(req.authUser?.id || req.body?.ownerUserId || '').trim()
  const title = String(req.body?.title || '').trim() || 'Hoja colaborativa'
  const visibility = normalizeNotebookCollabVisibility(req.body?.visibility)
  const lastEditorUserId = String(req.authUser?.id || req.body?.lastEditorUserId || ownerUserId).trim()
  const exerciseSnapshot = safeObject(req.body?.exerciseSnapshot)
  const notebookState = safeObject(req.body?.notebookState)

  if (!ownerUserId) {
    return res.status(400).json({ error: 'ownerUserId is required.' })
  }

  try {
    const page = await createNotebookCollabPageRecord({
      ownerUserId,
      title,
      exerciseSnapshot,
      notebookState,
      visibility,
      lastEditorUserId,
    })
    return res.status(201).json({ page })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'No se pudo crear la hoja colaborativa.' })
  }
})

app.get('/api/notebook-collab/pages/:pageId', requireSupabaseSession, async (req, res) => {
  const pageId = String(req.params.pageId || '').trim()
  try {
    const page = await getAccessibleNotebookCollabPageById(pageId, req.authUser.id)
    if (!page) {
      return res.status(404).json({ error: 'Notebook page not found.' })
    }
    return res.json({ page })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'No se pudo cargar la hoja colaborativa.' })
  }
})

app.patch('/api/notebook-collab/pages/:pageId', requireSupabaseSession, async (req, res) => {
  const pageId = String(req.params.pageId || '').trim()
  const current = await getEditableNotebookCollabPageById(pageId, req.authUser.id)

  if (!current) {
    return res.status(404).json({ error: 'Notebook page not found.' })
  }

  const title = String(req.body?.title || current.title || '').trim() || 'Hoja colaborativa'
  const visibility = normalizeNotebookCollabVisibility(req.body?.visibility || current.visibility)
  const exerciseSnapshot = safeObject(req.body?.exerciseSnapshot, current.exercise_snapshot)
  const notebookState = safeObject(req.body?.notebookState, current.notebook_state)
  const lastEditorUserId = String(req.authUser?.id || req.body?.lastEditorUserId || req.body?.userId || current.last_editor_user_id || current.owner_user_id).trim()
  const sourceClientId = String(req.body?.clientId || '').trim()

  try {
    const page = await updateNotebookCollabPageRecord(pageId, req.authUser.id, {
      title,
      visibility,
      exerciseSnapshot,
      notebookState,
      lastEditorUserId,
    })
    if (!page) {
      return res.status(404).json({ error: 'Notebook page not found.' })
    }
    await broadcastNotebookCollabSnapshot(pageId, { sourceClientId, viewerUserId: req.authUser.id })
    return res.json({ page })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'No se pudo actualizar la hoja colaborativa.' })
  }
})

app.post('/api/notebook-collab/pages/:pageId/broadcast', requireSupabaseSession, async (req, res) => {
  const pageId = String(req.params.pageId || '').trim()
  const page = await getAccessibleNotebookCollabPageById(pageId, req.authUser.id)
  if (!page) {
    return res.status(404).json({ error: 'Notebook page not found.' })
  }

  const clientId = String(req.body?.clientId || '').trim()
  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required.' })
  }

  const subscribers = notebookCollabSubscribers.get(pageId)
  if (subscribers?.size) {
      const payload = {
        sourceClientId: clientId,
        clientId,
        userId: String(req.authUser?.id || req.body?.userId || '').trim(),
        username: String(req.authUser?.username || req.body?.username || '').trim(),
        collabPageId: pageId,
        exerciseSnapshot: safeObject(req.body?.exerciseSnapshot),
        notebook: safeObject(req.body?.notebook),
      sentAt: new Date().toISOString(),
    }

    for (const response of subscribers.values()) {
      sendSseEvent(response, 'notebook-sync', payload)
    }
  }

  return res.json({ ok: true })
})

app.post('/api/notebook-collab/join', requireSupabaseSession, async (req, res) => {
  const inputCode = String(req.body?.inputCode || '').trim().toUpperCase()
  if (!inputCode) {
    return res.status(400).json({ error: 'inputCode is required.' })
  }

  try {
    const page = await joinNotebookCollabPageByCode(inputCode, req.authUser.id)
    if (!page) {
      return res.status(404).json({ error: 'Notebook page code not found.' })
    }
    return res.json({ page })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'No se pudo unir la hoja colaborativa.' })
  }
})

app.get('/api/notebook-collab/pages/:pageId/events', async (req, res) => {
  const pageId = String(req.params.pageId || '').trim()
  const clientId = String(req.query?.clientId || '').trim()
  const accessToken = String(req.query?.accessToken || '').trim()

  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required.' })
  }

  const resolved = await resolveAuthUserFromAccessToken(accessToken)
  if (!resolved.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const page = await getAccessibleNotebookCollabPageById(pageId, resolved.user.id)
  if (!page) {
    return res.status(404).json({ error: 'Notebook page not found.' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  registerNotebookCollabSubscriber(pageId, clientId, res)
  upsertNotebookCollabPresence(pageId, {
    clientId,
    userId: String(req.query?.userId || resolved.user.id || '').trim(),
    username: String(req.query?.username || resolved.user.username || '').trim(),
    color: String(req.query?.color || '').trim(),
    activity: String(req.query?.activity || '').trim() || 'viendo',
    editingType: String(req.query?.editingType || '').trim() || 'notebook',
    targetId: String(req.query?.targetId || '').trim(),
  })

  sendSseEvent(res, 'snapshot', { page, sourceClientId: '', sentAt: new Date().toISOString() })
  sendSseEvent(res, 'presence', { collaborators: getNotebookCollabPresenceEntries(pageId) })

  const keepAliveId = setInterval(() => {
    res.write(': keepalive\n\n')
  }, 20000)

  req.on('close', () => {
    clearInterval(keepAliveId)
    unregisterNotebookCollabSubscriber(pageId, clientId)
    removeNotebookCollabPresence(pageId, clientId)
    res.end()
  })
})

app.post('/api/notebook-collab/pages/:pageId/presence', requireSupabaseSession, async (req, res) => {
  const pageId = String(req.params.pageId || '').trim()
  const page = await getAccessibleNotebookCollabPageById(pageId, req.authUser.id)

  if (!page) {
    return res.status(404).json({ error: 'Notebook page not found.' })
  }

  const clientId = String(req.body?.clientId || '').trim()
  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required.' })
  }

  upsertNotebookCollabPresence(pageId, {
    clientId,
    userId: String(req.authUser?.id || req.body?.userId || '').trim(),
    username: String(req.authUser?.username || req.body?.username || '').trim(),
    color: String(req.body?.color || '').trim(),
    activity: String(req.body?.activity || '').trim(),
    editingType: String(req.body?.editingType || '').trim(),
    targetId: String(req.body?.targetId || '').trim(),
  })

  return res.json({ ok: true, collaborators: getNotebookCollabPresenceEntries(pageId) })
})

app.post('/api/auth/register', async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const username = normalizeUsername(req.body?.username)
  const password = String(req.body?.password || '')

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required.' })
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  }

  const client = await postgresPool.connect()

  try {
    await client.query('BEGIN')

    const existingEmail = await client.query(
      'SELECT id FROM public.users WHERE lower(email) = lower($1) LIMIT 1',
      [email],
    )
    if (existingEmail.rows.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Email already exists.' })
    }

    const existingUsername = await client.query(
      'SELECT id FROM public.profiles WHERE lower(username) = lower($1) LIMIT 1',
      [username],
    )
    if (existingUsername.rows.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Username already exists.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const userResult = await client.query(
      `
        INSERT INTO public.users (email, password_hash, email_confirmed_at, source)
        VALUES ($1, $2, timezone('utc', now()), 'local')
        RETURNING id, email
      `,
      [email, passwordHash],
    )
    const createdUser = userResult.rows[0]
    const profileResult = await client.query(
      `
        INSERT INTO public.profiles (id, username, role)
        VALUES ($1, $2, 'student')
        RETURNING username, role
      `,
      [createdUser.id, username],
    )

    await client.query('COMMIT')

    const user = {
      id: createdUser.id,
      email: createdUser.email,
      username: profileResult.rows[0]?.username || username,
      role: profileResult.rows[0]?.role === 'teacher' ? 'teacher' : 'student',
    }
    const token = signUserToken(user)

    return res.status(201).json({ token, user })
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback failures.
    }

    console.error('Local register failed:', error)
    return res.status(500).json({ error: 'Could not create the account.' })
  } finally {
    client.release()
  }
})

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required.' })
  }

  const user = await getPostgresAuthUserByEmail(email)

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' })
  }

  const token = signUserToken(user)
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
  })
})

app.get('/api/auth/me', requireSupabaseSession, (req, res) => {
  return res.json({ user: req.authUser })
})

app.post('/api/auth/logout', requireSupabaseSession, (_req, res) => {
  return res.json({ ok: true })
})

app.get('/api/profiles/usernames', requireSupabaseSession, async (req, res) => {
  const ids = String(req.query?.ids || '')
    .split(',')
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  if (!ids.length) {
    return res.json({ profiles: [] })
  }

  try {
    const profiles = await listProfileRowsByIds(ids)
    return res.json({ profiles })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load usernames.' })
  }
})

app.get('/api/competitive-techniques/catalog', requireSupabaseSession, async (_req, res) => {
  try {
    const items = await listApprovedTechniqueCatalogEntriesFromPostgres()
    return res.json({ items })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load the approved techniques catalog.' })
  }
})

app.get('/api/competitive-techniques/collection', requireSupabaseSession, async (req, res) => {
  try {
    const items = await listStudentTechniqueCollectionEntriesFromPostgres(req.authUser.id)
    return res.json({ items })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load the private techniques collection.' })
  }
})

app.get('/api/competitive-techniques/private-inventory', requireSupabaseSession, async (req, res) => {
  try {
    const items = await listPrivateApprovedCompetitiveTechniquesFromPostgres(req.authUser.id)
    return res.json({ items })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load the private techniques inventory.' })
  }
})

app.get('/api/competitive-techniques/proposals/mine', requireSupabaseSession, async (req, res) => {
  try {
    const items = await listOwnCompetitiveTechniqueProposalsFromPostgres(req.authUser.id)
    return res.json({ items })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load competitive technique proposals.' })
  }
})

app.get('/api/competitive-techniques/proposals/review', requireSupabaseSession, async (req, res) => {
  if (req.authUser.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can review technique proposals.' })
  }

  try {
    const items = await listReviewableCompetitiveTechniqueProposalsFromPostgres()
    return res.json({ items })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not load proposed techniques.' })
  }
})

app.post('/api/competitive-techniques/proposals', requireSupabaseSession, async (req, res) => {
  const payload = toTechniquePayload(req.body, req.authUser)

  try {
    assertTechniquePayload(payload)
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Invalid technique payload.' })
  }

  const client = await postgresPool.connect()

  try {
    await client.query('BEGIN')

    const insertResult = await client.query(
      `
        INSERT INTO public.competitive_technique_proposals (
          created_by,
          reviewed_by,
          published_catalog_id,
          status,
          approved_at,
          name,
          name_fr,
          topic,
          topic_fr,
          subtopic,
          subtopic_fr,
          effect_type,
          effect_type_fr,
          effect_description,
          effect_description_fr,
          worked_example,
          worked_example_fr,
          application_structure,
          application_structure_fr,
          sympy_transformation,
          sympy_transformation_es,
          sympy_transformation_fr,
          sympy_input_schema,
          structured_technique_spec
        ) VALUES (
          $1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb
        )
        RETURNING *
      `,
      [
        req.authUser.id,
        payload.reviewed_by,
        payload.status,
        payload.approved_at,
        payload.name,
        payload.name_fr,
        payload.topic,
        payload.topic_fr,
        payload.subtopic,
        payload.subtopic_fr,
        payload.effect_type,
        payload.effect_type_fr,
        payload.effect_description,
        payload.effect_description_fr,
        payload.worked_example,
        payload.worked_example_fr,
        payload.application_structure,
        payload.application_structure_fr,
        payload.sympy_transformation,
        payload.sympy_transformation_es,
        payload.sympy_transformation_fr,
        payload.sympy_input_schema,
        JSON.stringify(payload.structured_technique_spec || null),
      ],
    )

    let item = normalizeTechniqueEntityRow(insertResult.rows[0] || null)
    if (item?.status === 'approved' && item?.reviewed_by) {
      item = await publishTechniqueProposalRecordWithClient(client, item, item.reviewed_by)
    }

    await client.query('COMMIT')
    return res.status(201).json({ item })
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback failures.
    }
    return res.status(500).json({ error: error?.message || 'Could not create the competitive technique proposal.' })
  } finally {
    client.release()
  }
})

app.patch('/api/competitive-techniques/proposals/:proposalId', requireSupabaseSession, async (req, res) => {
  const proposalId = String(req.params.proposalId || '').trim()
  if (!proposalId) {
    return res.status(400).json({ error: 'proposalId is required.' })
  }

  const payload = toTechniquePayload(req.body, req.authUser)
  try {
    assertTechniquePayload(payload)
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Invalid technique payload.' })
  }

  const client = await postgresPool.connect()

  try {
    await client.query('BEGIN')

    const proposal = await getTechniqueProposalByIdWithClient(client, proposalId)
    if (!proposal) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Competitive technique proposal not found.' })
    }

    const isOwner = proposal.created_by === req.authUser.id
    const isTeacher = req.authUser.role === 'teacher'
    if (!isOwner && !isTeacher) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'You cannot edit this proposal.' })
    }

    if (!isTeacher && proposal.status === 'approved') {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Approved proposals can only be edited by teachers.' })
    }

    const updateResult = await client.query(
      `
        UPDATE public.competitive_technique_proposals
        SET reviewed_by = $2,
            status = $3,
            approved_at = $4,
            name = $5,
            name_fr = $6,
            topic = $7,
            topic_fr = $8,
            subtopic = $9,
            subtopic_fr = $10,
            effect_type = $11,
            effect_type_fr = $12,
            effect_description = $13,
            effect_description_fr = $14,
            worked_example = $15,
            worked_example_fr = $16,
            application_structure = $17,
            application_structure_fr = $18,
            sympy_transformation = $19,
            sympy_transformation_es = $20,
            sympy_transformation_fr = $21,
            sympy_input_schema = $22,
            structured_technique_spec = $23::jsonb
        WHERE id = $1
        RETURNING *
      `,
      [
        proposalId,
        payload.reviewed_by,
        payload.status,
        payload.approved_at,
        payload.name,
        payload.name_fr,
        payload.topic,
        payload.topic_fr,
        payload.subtopic,
        payload.subtopic_fr,
        payload.effect_type,
        payload.effect_type_fr,
        payload.effect_description,
        payload.effect_description_fr,
        payload.worked_example,
        payload.worked_example_fr,
        payload.application_structure,
        payload.application_structure_fr,
        payload.sympy_transformation,
        payload.sympy_transformation_es,
        payload.sympy_transformation_fr,
        payload.sympy_input_schema,
        JSON.stringify(payload.structured_technique_spec || null),
      ],
    )

    let item = normalizeTechniqueEntityRow(updateResult.rows[0] || null)
    if (item?.status === 'approved' && item?.reviewed_by) {
      item = await publishTechniqueProposalRecordWithClient(client, item, item.reviewed_by)
    }

    await client.query('COMMIT')
    return res.json({ item })
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback failures.
    }
    return res.status(500).json({ error: error?.message || 'Could not update the competitive technique proposal.' })
  } finally {
    client.release()
  }
})

app.delete('/api/competitive-techniques/proposals/:proposalId', requireSupabaseSession, async (req, res) => {
  const proposalId = String(req.params.proposalId || '').trim()
  if (!proposalId) {
    return res.status(400).json({ error: 'proposalId is required.' })
  }

  try {
    const proposalResult = await postgresPool.query(
      `
        DELETE FROM public.competitive_technique_proposals
        WHERE id = $1
          AND (
            created_by = $2
            OR $3 = 'teacher'
          )
        RETURNING id
      `,
      [proposalId, req.authUser.id, req.authUser.role],
    )

    if (!proposalResult.rows.length) {
      return res.status(404).json({ error: 'Competitive technique proposal not found.' })
    }

    return res.status(204).end()
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not delete the competitive technique proposal.' })
  }
})

app.post('/api/competitive-techniques/proposals/:proposalId/review', requireSupabaseSession, async (req, res) => {
  const proposalId = String(req.params.proposalId || '').trim()
  const decision = String(req.body?.decision || '').trim().toLowerCase()

  if (!proposalId) {
    return res.status(400).json({ error: 'proposalId is required.' })
  }

  if (req.authUser.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can review technique proposals.' })
  }

  const client = await postgresPool.connect()

  try {
    await client.query('BEGIN')

    const proposal = await getTechniqueProposalByIdWithClient(client, proposalId)
    if (!proposal || proposal.status !== 'proposed') {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Competitive technique proposal not found.' })
    }

    let item = null

    if (decision !== 'approve') {
      const rejectResult = await client.query(
        `
          UPDATE public.competitive_technique_proposals
          SET status = 'rejected',
              reviewed_by = $2,
              approved_at = NULL
          WHERE id = $1
          RETURNING *
        `,
        [proposalId, req.authUser.id],
      )
      item = normalizeTechniqueEntityRow(rejectResult.rows[0] || null)
    } else {
      item = await publishTechniqueProposalRecordWithClient(client, proposal, req.authUser.id)
    }

    await client.query('COMMIT')
    return res.json({ item })
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback failures.
    }
    return res.status(500).json({ error: error?.message || 'Could not apply the review decision.' })
  } finally {
    client.release()
  }
})

app.post('/api/competitive-techniques/catalog/:catalogId/collect', requireSupabaseSession, async (req, res) => {
  const catalogId = String(req.params.catalogId || '').trim()
  const source = String(req.body?.source || '').trim() || 'copied'

  if (!catalogId) {
    return res.status(400).json({ error: 'catalogId is required.' })
  }

  const client = await postgresPool.connect()

  try {
    await client.query('BEGIN')
    const catalogItem = await getTechniqueCatalogByIdWithClient(client, catalogId)
    if (!catalogItem) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Catalog technique not found.' })
    }

    await addTechniqueCatalogEntryToStudentCollectionWithClient(client, req.authUser.id, catalogId, source)
    await client.query('COMMIT')
    return res.status(201).json({ item: catalogItem })
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback failures.
    }
    return res.status(500).json({ error: error?.message || 'Could not add the technique to the private collection.' })
  } finally {
    client.release()
  }
})

app.patch('/api/competitive-techniques/catalog/:catalogId/archive', requireSupabaseSession, async (req, res) => {
  const catalogId = String(req.params.catalogId || '').trim()
  if (!catalogId) {
    return res.status(400).json({ error: 'catalogId is required.' })
  }

  if (req.authUser.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can archive approved techniques.' })
  }

  try {
    const result = await postgresPool.query(
      `
        UPDATE public.competitive_technique_catalog
        SET status = 'archived',
            archived_at = timezone('utc', now())
        WHERE id = $1
        RETURNING *
      `,
      [catalogId],
    )

    const item = normalizeTechniqueEntityRow(result.rows[0] || null)
    if (!item) {
      return res.status(404).json({ error: 'Catalog technique not found.' })
    }

    return res.json({ item })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not archive the approved technique.' })
  }
})

app.patch('/api/competitive-techniques/catalog/:catalogId', requireSupabaseSession, async (req, res) => {
  const catalogId = String(req.params.catalogId || '').trim()
  if (!catalogId) {
    return res.status(400).json({ error: 'catalogId is required.' })
  }

  if (req.authUser.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can update approved techniques.' })
  }

  const payload = toTechniquePayload({ ...req.body, status: normalizeCatalogStatus(req.body?.status) === 'archived' ? 'rejected' : 'approved' }, req.authUser)

  try {
    assertTechniquePayload(payload)
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Invalid technique payload.' })
  }

  try {
    const result = await postgresPool.query(
      `
        UPDATE public.competitive_technique_catalog
        SET reviewed_by = $2,
            status = $3,
            archived_at = CASE WHEN $3 = 'archived' THEN timezone('utc', now()) ELSE NULL END,
            name = $4,
            name_fr = $5,
            topic = $6,
            topic_fr = $7,
            subtopic = $8,
            subtopic_fr = $9,
            effect_type = $10,
            effect_type_fr = $11,
            effect_description = $12,
            effect_description_fr = $13,
            worked_example = $14,
            worked_example_fr = $15,
            application_structure = $16,
            application_structure_fr = $17,
            sympy_transformation = $18,
            sympy_transformation_es = $19,
            sympy_transformation_fr = $20,
            sympy_input_schema = $21,
            structured_technique_spec = $22::jsonb
        WHERE id = $1
        RETURNING *
      `,
      [
        catalogId,
        req.authUser.id,
        normalizeCatalogStatus(req.body?.status),
        payload.name,
        payload.name_fr,
        payload.topic,
        payload.topic_fr,
        payload.subtopic,
        payload.subtopic_fr,
        payload.effect_type,
        payload.effect_type_fr,
        payload.effect_description,
        payload.effect_description_fr,
        payload.worked_example,
        payload.worked_example_fr,
        payload.application_structure,
        payload.application_structure_fr,
        payload.sympy_transformation,
        payload.sympy_transformation_es,
        payload.sympy_transformation_fr,
        payload.sympy_input_schema,
        JSON.stringify(payload.structured_technique_spec || null),
      ],
    )

    const item = normalizeTechniqueEntityRow(result.rows[0] || null)
    if (!item) {
      return res.status(404).json({ error: 'Catalog technique not found.' })
    }

    return res.json({ item })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not update the approved technique.' })
  }
})

app.delete('/api/competitive-techniques/catalog/:catalogId', requireSupabaseSession, async (req, res) => {
  const catalogId = String(req.params.catalogId || '').trim()
  if (!catalogId) {
    return res.status(400).json({ error: 'catalogId is required.' })
  }

  if (req.authUser.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can delete approved techniques.' })
  }

  try {
    const result = await postgresPool.query(
      `
        DELETE FROM public.competitive_technique_catalog
        WHERE id = $1
        RETURNING id
      `,
      [catalogId],
    )

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Catalog technique not found.' })
    }

    return res.status(204).end()
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Could not delete the approved technique.' })
  }
})

app.post('/api/competitive-techniques/catalog/remove-global', requireSupabaseSession, async (req, res) => {
  if (req.authUser.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can remove approved techniques from the global catalog.' })
  }

  const catalogId = String(req.body?.catalogId || '').trim() || null
  const orphanedProposalId = String(req.body?.orphanedProposalId || '').trim() || null
  const legacyTechniqueId = String(req.body?.legacyTechniqueId || '').trim() || null

  const client = await postgresPool.connect()

  try {
    await client.query('BEGIN')

    const proposalIds = new Set()
    if (orphanedProposalId) {
      proposalIds.add(orphanedProposalId)
    }

    if (catalogId) {
      const linkedByCatalog = await client.query(
        `
          SELECT id
          FROM public.competitive_technique_proposals
          WHERE status = 'approved'
            AND published_catalog_id = $1
        `,
        [catalogId],
      )
      linkedByCatalog.rows.forEach((row) => proposalIds.add(String(row.id || '').trim()))
    }

    if (legacyTechniqueId) {
      const linkedByLegacy = await client.query(
        `
          SELECT id
          FROM public.competitive_technique_proposals
          WHERE status = 'approved'
            AND legacy_technique_id = $1
        `,
        [legacyTechniqueId],
      )
      linkedByLegacy.rows.forEach((row) => proposalIds.add(String(row.id || '').trim()))
    }

    if (proposalIds.size) {
      await client.query(
        `
          DELETE FROM public.competitive_technique_proposals
          WHERE id = ANY($1::uuid[])
        `,
        [[...proposalIds]],
      )
    }

    if (catalogId) {
      await client.query(
        `
          DELETE FROM public.competitive_technique_catalog
          WHERE id = $1
        `,
        [catalogId],
      )
    }

    if (legacyTechniqueId) {
      await client.query(
        `
          UPDATE public.competitive_techniques
          SET status = 'rejected',
              reviewed_by = $2,
              approved_at = NULL
          WHERE id = $1
        `,
        [legacyTechniqueId, req.authUser.id],
      )
    }

    await client.query('COMMIT')
    return res.json({ ok: true })
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback failures.
    }
    return res.status(500).json({ error: error?.message || 'Could not remove the approved technique from the global catalog.' })
  } finally {
    client.release()
  }
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
