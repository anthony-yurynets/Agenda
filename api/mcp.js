// Vapor MCP server — Streamable HTTP transport, stateless, JSON responses.
// Deployed as a Vercel serverless function at /api/mcp.
// Auth: `Authorization: Bearer vpr_...` (personal token created in the app).

import { createHash } from 'node:crypto'
import { TOOLS, runTool } from './_lib/tools.js'
import { db } from './_lib/db.js'
import { send, readBody, bearer } from './_lib/http.js'

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_INFO = { name: 'vapor', title: 'Vapor Calendar', version: '1.0.0' }
const INSTRUCTIONS =
  'Vapor is a time-block calendar. Blocks have a title, date (YYYY-MM-DD), start/end time ' +
  '(HH:MM, 24h, local time), a category and a status (planned, in_progress, done, canceled, or none for ' +
  'fixed commitments like sleep or school). ' +
  'Any block can be divided into sub-blocks, which must fall on the same date and inside the ' +
  "parent's time range. Call list_categories before creating blocks if you don't know the categories."

async function authenticate(req) {
  const token = bearer(req)
  if (!token) return null
  const hash = createHash('sha256').update(token).digest('hex')
  const { data, error } = await db()
    .from('api_tokens')
    .select('id, user_id')
    .eq('token_hash', hash)
    .maybeSingle()
  if (error || !data) return null
  // Fire-and-forget usage stamp.
  db().from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {})
  return data.user_id
}

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result })

async function handleMessage(msg, userId) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg?.id, -32600, 'Invalid request')
  }
  const isNotification = msg.id === undefined || msg.id === null
  if (isNotification) return null

  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return rpcResult(msg.id, {})
    case 'tools/list':
      return rpcResult(msg.id, { tools: TOOLS })
    case 'tools/call': {
      const name = msg.params?.name
      if (!TOOLS.some((t) => t.name === name)) return rpcError(msg.id, -32602, `Unknown tool: ${name}`)
      try {
        const data = await runTool(db(), userId, name, msg.params?.arguments ?? {})
        return rpcResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: Array.isArray(data) ? { items: data } : data,
        })
      } catch (err) {
        return rpcResult(msg.id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        })
      }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}

export default async function handler(req, res) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  }
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v)

  if (req.method === 'OPTIONS') return send(res, 204)
  if (req.method !== 'POST') {
    // Stateless server: no standalone SSE stream and no sessions to delete.
    return send(res, 405, rpcError(null, -32000, 'Method not allowed'), { Allow: 'POST, OPTIONS' })
  }

  let userId
  try {
    userId = await authenticate(req)
  } catch (err) {
    return send(res, 500, rpcError(null, -32603, err.message))
  }
  if (!userId) {
    return send(res, 401, rpcError(null, -32001, 'Missing or invalid API token'), {
      'WWW-Authenticate': 'Bearer realm="vapor"',
    })
  }

  let body
  try {
    body = await readBody(req)
  } catch {
    return send(res, 400, rpcError(null, -32700, 'Parse error'))
  }

  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => handleMessage(m, userId)))).filter(Boolean)
    return replies.length ? send(res, 200, replies) : send(res, 202)
  }
  const reply = await handleMessage(body, userId)
  return reply ? send(res, 200, reply) : send(res, 202)
}
