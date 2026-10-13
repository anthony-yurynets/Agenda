// Shared competitions API: someone holding a competition link (/g/<token>) can
// view — or, with an edit link, change — the competitions in the link's groups
// without logging in. Token: `Authorization: Bearer <token>`.
//
// Guests only ever see the link's groups: other group ids are stripped from
// competitions, and every write is checked against (and confined to) them.

import { db, findShareLink, ownerName } from './_lib/db.js'
import { bearer, httpError, jsonEndpoint } from './_lib/http.js'

const COMP_FIELDS = 'id, name, url, description, prestige, category, submission_items, group_ids, timeline, decision, project_id, source, created_at'
// What an editor may set on a competition (group_ids is handled separately).
const WRITE_FIELDS = ['name', 'url', 'description', 'prestige', 'category', 'submission_items', 'timeline', 'decision', 'project_id']
const NAMED = { 'option.create': 'competition_options', 'project.create': 'competition_projects' }

const unwrap = ({ data, error }) => {
  if (error) throw httpError(500, error.message)
  return data
}
const pick = (obj, fields) => Object.fromEntries(fields.filter((f) => obj?.[f] !== undefined).map((f) => [f, obj[f]]))
const isId = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export default jsonEndpoint(async (req, body) => {
  const link = await findShareLink(bearer(req), 'group')
  const linkGroups = link?.group_ids?.length ? link.group_ids : link?.group_id ? [link.group_id] : []
  if (!linkGroups.length) throw httpError(401, 'This share link is invalid or has been turned off.')

  const sb = db()
  const owner = link.user_id
  const access = link.access === 'edit' ? 'edit' : 'view'
  const groups = unwrap(await sb.from('competition_groups').select('id, name, position').eq('user_id', owner).in('id', linkGroups))
  if (!groups.length) throw httpError(404, 'The groups in this link no longer exist.')
  const shared = new Set(groups.map((g) => g.id))
  const visible = (c) => (c.group_ids ?? []).some((id) => shared.has(id))
  // A competition as the guest sees it: only the shared groups.
  const redact = (c) => ({ ...c, group_ids: (c.group_ids ?? []).filter((id) => shared.has(id)) })

  /** The owner's competition, if this link can see it. */
  const findComp = async (id) => {
    if (!isId(id)) throw httpError(400, 'Invalid id')
    const c = unwrap(await sb.from('competitions').select(COMP_FIELDS).eq('user_id', owner).eq('id', id).maybeSingle())
    if (!c || !visible(c)) throw httpError(404, 'That competition isn’t in this link’s groups.')
    return c
  }
  /** Submission items must be the owner's options. */
  const cleanItems = async (ids) => {
    const list = (Array.isArray(ids) ? ids : []).filter(isId)
    if (!list.length) return []
    const own = unwrap(await sb.from('competition_options').select('id').eq('user_id', owner).in('id', list)).map((o) => o.id)
    return list.filter((id) => own.includes(id))
  }

  if (body.op === 'load') {
    const all = unwrap(await sb.from('competitions').select(COMP_FIELDS).eq('user_id', owner).overlaps('group_ids', [...shared]))
    const competitions = all.filter(visible).map(redact)
    let options
    let projects
    if (access === 'edit') {
      // Editors pick from the owner's full lists.
      ;[options, projects] = await Promise.all([
        sb.from('competition_options').select('id, name, position').eq('user_id', owner).then(unwrap),
        sb.from('competition_projects').select('id, name, position').eq('user_id', owner).then(unwrap),
      ])
    } else {
      // Viewers only get the names these competitions use.
      const optionIds = [...new Set(competitions.flatMap((c) => c.submission_items ?? []))]
      const projectIds = [...new Set(competitions.map((c) => c.project_id).filter(Boolean))]
      ;[options, projects] = await Promise.all([
        optionIds.length ? sb.from('competition_options').select('id, name, position').eq('user_id', owner).in('id', optionIds).then(unwrap) : [],
        projectIds.length ? sb.from('competition_projects').select('id, name, position').eq('user_id', owner).in('id', projectIds).then(unwrap) : [],
      ])
    }
    return {
      access,
      name: link.name,
      owner: await ownerName(owner),
      // Kept for older clients that show a single group.
      group: { name: groups.map((g) => g.name).join(', ') },
      groups: groups.sort((a, b) => a.position - b.position),
      competitions,
      options,
      projects,
    }
  }

  if (access !== 'edit') throw httpError(403, 'This link is view only.')

  switch (body.op) {
    case 'insert': {
      const row = body.row ?? {}
      if (!isId(row.id)) throw httpError(400, 'Invalid id')
      const groupIds = (row.group_ids ?? []).filter((id) => shared.has(id))
      if (!groupIds.length) throw httpError(400, 'Pick one of the shared groups for the new competition.')
      const insert = { ...pick(row, WRITE_FIELDS), id: row.id, group_ids: groupIds, user_id: owner, source: 'shared' }
      if (insert.submission_items) insert.submission_items = await cleanItems(insert.submission_items)
      unwrap(await sb.from('competitions').insert(insert))
      return { count: 1 }
    }

    case 'update': {
      const c = await findComp(body.id)
      const patch = pick(body.patch, WRITE_FIELDS)
      if (patch.submission_items) patch.submission_items = await cleanItems(patch.submission_items)
      if (Array.isArray(body.patch?.group_ids)) {
        // Guests can move it between shared groups; groups they can't see stay as they were.
        const hidden = (c.group_ids ?? []).filter((id) => !shared.has(id))
        patch.group_ids = [...hidden, ...body.patch.group_ids.filter((id) => shared.has(id))]
      }
      if (!Object.keys(patch).length) return { count: 0 }
      unwrap(await sb.from('competitions').update(patch).eq('user_id', owner).eq('id', c.id))
      return { count: 1 }
    }

    case 'delete': {
      const c = await findComp(body.id)
      const hidden = (c.group_ids ?? []).filter((id) => !shared.has(id))
      // Also in groups this link can't see: take it out of the shared ones instead of deleting it.
      if (hidden.length) {
        unwrap(await sb.from('competitions').update({ group_ids: hidden }).eq('user_id', owner).eq('id', c.id))
        return { removed: true }
      }
      unwrap(await sb.from('competitions').delete().eq('user_id', owner).eq('id', c.id))
      return { deleted: true }
    }

    case 'option.create':
    case 'project.create': {
      const row = body.row ?? {}
      const name = typeof row.name === 'string' ? row.name.trim().slice(0, 80) : ''
      if (!isId(row.id) || !name) throw httpError(400, 'Invalid name')
      const table = NAMED[body.op]
      const existing = unwrap(await sb.from(table).select('id, name').eq('user_id', owner))
      if (existing.some((o) => o.name.toLowerCase() === name.toLowerCase())) return { count: 0 }
      unwrap(await sb.from(table).insert({ id: row.id, name, position: Number.isInteger(row.position) ? row.position : existing.length, user_id: owner }))
      return { count: 1 }
    }

    default:
      throw httpError(400, `Unknown op "${body.op}"`)
  }
})
