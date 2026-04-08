export function emailToUsername(email) {
  if (!email || typeof email !== 'string') return 'User'
  return email.split('@')[0] || 'User'
}

export async function ensureProfile(user) {
  return {
    username: String(user?.username || emailToUsername(user?.email)).trim() || 'User',
    role: user?.role === 'teacher' ? 'teacher' : 'student',
    provider: 'local',
  }
}
