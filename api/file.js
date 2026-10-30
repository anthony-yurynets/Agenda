// Shared-file API: someone holding a file link (/f/<token>) gets the file's
// details and short-lived signed URLs for it, without logging in.
// Token: `Authorization: Bearer <token>`.

import { db } from './_lib/db.js'
import { bearer, httpError, jsonEndpoint } from './_lib/http.js'
import { FILES_BUCKET } from '../src/lib/files.js'

// Long enough to read a big PDF; the page asks again when it's reopened.
const URL_TTL = 60 * 60

export default jsonEndpoint(async (req, body) => {
  if (body.op !== 'open') throw httpError(400, `Unknown op "${body.op}"`)
  const token = bearer(req)
  if (typeof token !== 'string' || token.length < 24) throw httpError(401, 'This file link is invalid.')

  const sb = db()
  const { data: file, error } = await sb.from('shared_files').select('name, path, mime, size, created_at').eq('token', token).maybeSingle()
  if (error) throw httpError(500, error.message)
  if (!file) throw httpError(404, 'This file was removed or its link was turned off.')

  const bucket = sb.storage.from(FILES_BUCKET)
  const [view, download] = await Promise.all([
    bucket.createSignedUrl(file.path, URL_TTL),
    bucket.createSignedUrl(file.path, URL_TTL, { download: file.name }),
  ])
  if (view.error || download.error) throw httpError(500, (view.error ?? download.error).message)

  return {
    name: file.name,
    mime: file.mime,
    size: file.size,
    created_at: file.created_at,
    url: view.data.signedUrl,
    downloadUrl: download.data.signedUrl,
  }
})
