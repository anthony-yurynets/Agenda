export function send(res, status, body, headers = {}) {
  res.statusCode = status
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  if (body === undefined) return res.end()
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : null
}

export const bearer = (req) => /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1] ?? null

/** Minimal JSON POST endpoint: `{ op, ...args }` in, `{ data }` or `{ error }` out. */
export function jsonEndpoint(handle) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' })
    let body
    try {
      body = (await readBody(req)) ?? {}
    } catch {
      return send(res, 400, { error: 'Invalid JSON' })
    }
    try {
      const data = await handle(req, body)
      return send(res, 200, { data })
    } catch (err) {
      return send(res, err.status ?? 400, { error: err.message ?? 'Something went wrong' })
    }
  }
}

export function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}
