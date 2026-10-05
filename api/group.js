// Shared competition group API: someone holding a group link can view (not
// edit) the competitions in that group without logging in.
// Token: `Authorization: Bearer <token>`.

import { db, findShareLink, ownerName } from './_lib/db.js'
import { bearer, httpError, jsonEndpoint } from './_lib/http.js'

const COMP_FIELDS = 'id, name, url, description, prestige, category, submission_items, timeline, decision, project_id, created_at'

const unwrap = ({ data, error }) => {
  if (error) throw httpError(500, error.message)
  return data
}

export default jsonEndpoint(async (req, body) => {
  const link = await findShareLink(bearer(req), 'group')
  if (!link?.group_id) throw httpError(401, 'This share link is invalid or has been turned off.')
  if (body.op !== 'load') throw httpError(400, `Unknown op "${body.op}"`)

  const sb = db()
  const owner = link.user_id
  const group = unwrap(await sb.from('competition_groups').select('id, name').eq('user_id', owner).eq('id', link.group_id).maybeSingle())
  if (!group) throw httpError(404, 'This group no longer exists.')

  const competitions = unwrap(await sb.from('competitions').select(COMP_FIELDS).eq('user_id', owner).contains('group_ids', [group.id]))
  // Only the names these competitions use.
  const optionIds = [...new Set(competitions.flatMap((c) => c.submission_items ?? []))]
  const projectIds = [...new Set(competitions.map((c) => c.project_id).filter(Boolean))]
  const [options, projects, name] = await Promise.all([
    optionIds.length ? sb.from('competition_options').select('id, name, position').eq('user_id', owner).in('id', optionIds).then(unwrap) : [],
    projectIds.length ? sb.from('competition_projects').select('id, name, position').eq('user_id', owner).in('id', projectIds).then(unwrap) : [],
    ownerName(owner),
  ])
  return { group: { name: group.name }, owner: name, competitions, options, projects }
})
