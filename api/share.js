// Shared-editor API: lets someone holding an "edit" share link read and write
// the owner's calendar without logging in. Token: `Authorization: Bearer <token>`.
//
// Every write is forced onto the owner's user_id; the database trigger then
// checks that parents, categories and series belong to that same user.

import { db, findShareLink, ownerName } from './_lib/db.js'
import { bearer, httpError, jsonEndpoint } from './_lib/http.js'
import { rawRangeRows, unwrap } from './_lib/tools.js'
import { isValidDate } from '../src/lib/domain.js'

const BLOCK_FIELDS = [
  'id', 'parent_id', 'title', 'date', 'start_time', 'end_time', 'category_id', 'status', 'notes',
  'repeat', 'repeat_exdates', 'recurrence_id', 'recurrence_date', 'bookable', 'all_day',
]
const PATCH_FIELDS = BLOCK_FIELDS.filter((f) => f !== 'id')
const CATEGORY_FIELDS = ['id', 'name', 'color', 'position']

const pick = (obj, fields) => Object.fromEntries(fields.filter((f) => obj?.[f] !== undefined).map((f) => [f, obj[f]]))
const asArray = (v) => (Array.isArray(v) ? v : [])

export default jsonEndpoint(async (req, body) => {
  // Edit links and Notion widget links both grant full access to the calendar.
  const link = await findShareLink(bearer(req), ['edit', 'embed'])
  if (!link) throw httpError(401, 'This share link is invalid or has been turned off.')
  const owner = link.user_id
  const sb = db()
  const blocks = () => sb.from('blocks')
  // Which tools this link opens. Widget links are calendar-only by nature.
  const tools = link.kind === 'embed' ? ['calendar'] : (link.tools ?? ['calendar'])

  if (body.op === 'session') return { name: link.name, kind: link.kind, tools, owner: await ownerName(owner) }
  // Every other op below belongs to the calendar tool.
  if (!tools.includes('calendar')) throw httpError(403, 'This link doesn’t include the calendar.')

  switch (body.op) {

    case 'load': {
      const { from, to } = body
      if (!isValidDate(from) || !isValidDate(to) || from > to) throw httpError(400, 'Invalid range')
      const [{ rows }, categories] = await Promise.all([
        rawRangeRows(sb, owner, from, to),
        sb.from('categories').select('*').eq('user_id', owner).order('position').then(unwrap),
      ])
      return { blocks: rows, categories }
    }

    case 'insert': {
      // Parent-first order is the caller's job (one tree level per call).
      const rows = asArray(body.rows).map((r) => ({ ...pick(r, BLOCK_FIELDS), user_id: owner, source: 'shared' }))
      if (rows.length) unwrap(await blocks().insert(rows))
      return { count: rows.length }
    }

    case 'update': {
      const patch = pick(body.patch, PATCH_FIELDS)
      if (!Object.keys(patch).length) return { count: 0 }
      unwrap(await blocks().update(patch).eq('user_id', owner).eq('id', body.id))
      return { count: 1 }
    }

    case 'upsert': {
      const rows = asArray(body.rows).map((r) => ({ ...pick(r, BLOCK_FIELDS), user_id: owner }))
      if (!rows.length) return { count: 0 }
      // Never let an upsert take over someone else's row with a guessed id.
      const ids = rows.map((r) => r.id)
      const foreign = unwrap(await blocks().select('id, user_id').in('id', ids)).filter((r) => r.user_id !== owner)
      if (foreign.length) throw httpError(403, 'Not allowed')
      unwrap(await blocks().upsert(rows))
      return { count: rows.length }
    }

    case 'delete':
      unwrap(await blocks().delete().eq('user_id', owner).eq('id', body.id))
      return { count: 1 }

    case 'category.insert': {
      const rows = asArray(body.rows).map((r) => ({ ...pick(r, CATEGORY_FIELDS), user_id: owner }))
      if (rows.length) unwrap(await sb.from('categories').insert(rows))
      return { count: rows.length }
    }

    case 'category.update':
      unwrap(await sb.from('categories').update(pick(body.patch, CATEGORY_FIELDS.slice(1))).eq('user_id', owner).eq('id', body.id))
      return { count: 1 }

    case 'category.delete':
      unwrap(await sb.from('categories').delete().eq('user_id', owner).eq('id', body.id))
      return { count: 1 }

    default:
      throw httpError(400, `Unknown op "${body.op}"`)
  }
})
