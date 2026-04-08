export function canUseLocalStore() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function readLocalJson(key, fallback) {
  if (!canUseLocalStore()) return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeLocalJson(key, value) {
  if (!canUseLocalStore()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function removeLocalJson(key) {
  if (!canUseLocalStore()) return
  window.localStorage.removeItem(key)
}

export function createLocalId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function sortByUpdatedAtDesc(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) =>
    String(right?.updated_at || right?.updatedAt || '').localeCompare(
      String(left?.updated_at || left?.updatedAt || '')
    )
  )
}
