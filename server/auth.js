import jwt from 'jsonwebtoken'

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-only-secret-change-me'
}

export function signUserToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, getJwtSecret(), {
    expiresIn: '30d',
  })
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const [scheme, token] = authHeader.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const payload = jwt.verify(token, getJwtSecret())
    req.user = { id: payload.id, username: payload.username }
    return next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}
