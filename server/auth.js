// Deprecated: Local JWT auth replaced by Supabase Auth.
import jwt from 'jsonwebtoken'

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-only-secret-change-me'
}

export function signUserToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role === 'teacher' ? 'teacher' : 'student',
    },
    getJwtSecret(),
    {
      expiresIn: '30d',
    },
  )
}

export function verifyUserToken(token) {
  return jwt.verify(token, getJwtSecret())
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const [scheme, token] = authHeader.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const payload = verifyUserToken(token)
    req.user = {
      id: payload.id,
      email: payload.email,
      username: payload.username,
      role: payload.role === 'teacher' ? 'teacher' : 'student',
    }
    return next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}
