// MCP tools for the Competitions page: search, create, edit and delete
// competitions and the user's lists (submission items, projects, groups). All queries are scoped
// to `userId` (service-role client).

import {
  CATEGORIES,
  CATEGORY_IDS,
  buildIndex,
  categoryLabel,
  decisionOf,
  isDate,
  prestigeTier,
  searchCompetitions,
  sortCompetitions,
  timelineState,
} from '../../src/lib/competitions.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const must = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const unwrap = ({ data, error }) => {
  if (error) throw new Error(/relation|schema cache/.test(error.message) ? 'Competition tables missing: run supabase/migrations/0010_competitions.sql' : error.message)
  return data
}

const stageSchema = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'e.g. "Registration", "Stage 1 submission", "Finals"' },
    date: { type: 'string', description: 'YYYY-MM-DD (start of the stage, or the deadline)' },
    end: { type: 'string', description: 'Optional YYYY-MM-DD end date for multi-day stages.' },
  },
  required: ['label', 'date'],
}
const fieldProps = {
  name: { type: 'string' },
  url: { type: 'string', description: 'Official website.' },
  description: { type: 'string', description: 'What it is, eligibility, prizes, notes.' },
  prestige: { type: ['integer', 'null'], minimum: 1, maximum: 10, description: '1–10 (10 = most prestigious, e.g. ISEF). null to clear.' },
  category: { type: 'string', enum: CATEGORY_IDS },
  submission_items: {
    type: 'array',
    items: { type: 'string' },
    description: 'What must be submitted, by option name (e.g. ["Research paper", "Demo video"]). Unknown names are added to the user\'s option list. Replaces the current list.',
  },
  timeline: { type: 'array', items: stageSchema, description: 'All stages / important dates. Replaces the current timeline.' },
  groups: {
    type: 'array',
    items: { type: 'string' },
    description: 'Groups this competition is in, by name (e.g. ["Summer 2027"]). Unknown names are added to the user\'s group list. Replaces the current list.',
  },
  doing: {
    type: ['string', 'null'],
    description:
      '"Are we doing this?" Give a project name (yes — entering with that project; unknown names are added to their project list), ' +
      '"maybe", "no", or null to clear. Call list_projects first to reuse existing project names.',
  },
}

export const COMPETITION_TOOLS = [
  {
    name: 'list_competitions',
    title: 'List competitions',
    description:
      'The user\'s tracked competitions, with timeline (day numbers, next stage, days until it). Optional fuzzy `query` ' +
      '(same search as the app: supports "#research", ">7" prestige, "soon"). Sorted by next date unless a query ranks them.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        category: { type: 'string', enum: CATEGORY_IDS },
        upcoming_within_days: { type: 'integer', minimum: 0, description: 'Only competitions with a stage in the next N days.' },
        doing: { type: 'string', enum: ['doing', 'maybe', 'no', 'undecided'], description: 'Only competitions with this answer to "Are we doing this?".' },
        group: { type: 'string', description: 'Only competitions in this group (name or id).' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_competition',
    title: 'Get competition',
    description: 'One competition by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_competition',
    title: 'Create competition',
    description: 'Add a competition to the tracker. Call list_submission_options first to reuse the user\'s existing item names.',
    inputSchema: { type: 'object', properties: fieldProps, required: ['name', 'category'] },
  },
  {
    name: 'update_competition',
    title: 'Update competition',
    description: 'Edit any fields of a competition. submission_items and timeline replace the whole list.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...fieldProps }, required: ['id'] },
  },
  {
    name: 'delete_competition',
    title: 'Delete competition',
    description: 'Remove a competition from the tracker.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { destructiveHint: true },
  },
  {
    name: 'list_submission_options',
    title: 'List submission item options',
    description: 'The user\'s dropdown of submission item options (e.g. Research paper, Demo video), with how many competitions use each.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_projects',
    title: 'List projects',
    description: 'The user\'s projects (what they enter competitions with), with the competitions each is entered in.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'manage_projects',
    title: 'Manage projects',
    description: 'Add, rename or delete projects. Deleting a project sets its competitions back to undecided.',
    inputSchema: {
      type: 'object',
      properties: {
        add: { type: 'array', items: { type: 'string' } },
        rename: {
          type: 'array',
          items: { type: 'object', properties: { from: { type: 'string', description: 'Current name or id' }, to: { type: 'string' } }, required: ['from', 'to'] },
        },
        remove: { type: 'array', items: { type: 'string' }, description: 'Names or ids.' },
      },
    },
    annotations: { destructiveHint: true },
  },
  {
    name: 'list_groups',
    title: 'List competition groups',
    description: 'The user\'s competition groups (named collections; a competition can be in several), with the competitions in each.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'manage_groups',
    title: 'Manage competition groups',
    description: 'Add, rename or delete competition groups. Deleting a group removes it from its competitions and turns off its share links (the competitions stay).',
    inputSchema: {
      type: 'object',
      properties: {
        add: { type: 'array', items: { type: 'string' } },
        rename: {
          type: 'array',
          items: { type: 'object', properties: { from: { type: 'string', description: 'Current name or id' }, to: { type: 'string' } }, required: ['from', 'to'] },
        },
        remove: { type: 'array', items: { type: 'string' }, description: 'Names or ids.' },
      },
    },
    annotations: { destructiveHint: true },
  },
  {
    name: 'manage_submission_options',
    title: 'Manage submission item options',
    description: 'Add, rename or delete submission item options. Deleting an option removes it from every competition.',
    inputSchema: {
      type: 'object',
      properties: {
        add: { type: 'array', items: { type: 'string' } },
        rename: {
          type: 'array',
          items: { type: 'object', properties: { from: { type: 'string', description: 'Current name or id' }, to: { type: 'string' } }, required: ['from', 'to'] },
        },
        remove: { type: 'array', items: { type: 'string' }, description: 'Names or ids.' },
      },
    },
    annotations: { destructiveHint: true },
  },
]

// ─── helpers ────────────────────────────────────────────────────────────────

const localToday = () => new Date().toISOString().slice(0, 10)

async function todayFor(sb, userId) {
  // Fitness settings hold the user's time zone when they've opened the app.
  const { data } = await sb.from('fitness_settings').select('timezone').eq('user_id', userId).maybeSingle()
  try {
    return data?.timezone ? new Intl.DateTimeFormat('en-CA', { timeZone: data.timezone }).format(new Date()) : localToday()
  } catch {
    return localToday()
  }
}

const loadNamed = async (sb, userId, table) => unwrap(await sb.from(table).select('*').eq('user_id', userId)).sort((a, b) => a.position - b.position)
const loadOptions = (sb, userId) => loadNamed(sb, userId, 'competition_options')
const loadProjects = (sb, userId) => loadNamed(sb, userId, 'competition_projects')
const loadGroups = (sb, userId) => loadNamed(sb, userId, 'competition_groups')

function findOption(options, ref) {
  const key = String(ref ?? '').trim().toLowerCase()
  return options.find((o) => o.id === ref || o.name.toLowerCase() === key)
}

/** Resolve names in a user list to ids, creating missing ones. */
async function resolveNamed(sb, userId, table, names) {
  must(Array.isArray(names), 'expected an array of names')
  const options = await loadNamed(sb, userId, table)
  const ids = []
  let position = options.reduce((m, o) => Math.max(m, o.position), -1) + 1
  for (const raw of names) {
    const name = String(raw).trim().slice(0, 80)
    if (!name) continue
    let o = findOption(options, name)
    if (!o) {
      o = unwrap(await sb.from(table).insert({ user_id: userId, name, position: position++ }).select('*').single())
      options.push(o)
    }
    if (!ids.includes(o.id)) ids.push(o.id)
  }
  return ids
}
const resolveItems = (sb, userId, names) => resolveNamed(sb, userId, 'competition_options', names)

/** Add / rename / remove entries in a user list by name or id. */
async function manageNamed(sb, userId, table, { add = [], rename = [], remove = [] }) {
  if (add.length) await resolveNamed(sb, userId, table, add)
  let list = await loadNamed(sb, userId, table)
  for (const { from, to } of rename) {
    const o = findOption(list, from)
    must(o, `No entry named "${from}"`)
    const name = String(to ?? '').trim().slice(0, 80)
    must(name, 'rename.to cannot be empty')
    unwrap(await sb.from(table).update({ name }).eq('user_id', userId).eq('id', o.id))
  }
  list = await loadNamed(sb, userId, table)
  for (const ref of remove) {
    const o = findOption(list, ref)
    must(o, `No entry named "${ref}"`)
    // DB triggers / FKs clean up competitions that used it.
    unwrap(await sb.from(table).delete().eq('user_id', userId).eq('id', o.id))
  }
}

function cleanTimeline(list) {
  must(Array.isArray(list), 'timeline must be an array of {label, date, end?}')
  return list.map((s, i) => {
    must(isDate(s?.date), `timeline[${i}].date must be YYYY-MM-DD`)
    must(s.end === undefined || s.end === null || (isDate(s.end) && s.end >= s.date), `timeline[${i}].end must be YYYY-MM-DD on/after date`)
    const out = { label: String(s.label ?? '').slice(0, 80), date: s.date }
    if (s.end) out.end = s.end
    return out
  })
}

async function cleanFields(sb, userId, f) {
  const patch = {}
  if (f.name !== undefined) patch.name = String(f.name).slice(0, 200)
  if (f.url !== undefined) patch.url = String(f.url).trim().slice(0, 2000)
  if (f.description !== undefined) patch.description = String(f.description).slice(0, 4000)
  if (f.prestige !== undefined) {
    must(f.prestige === null || (Number.isInteger(f.prestige) && f.prestige >= 1 && f.prestige <= 10), 'prestige must be a whole number 1–10, or null')
    patch.prestige = f.prestige
  }
  if (f.category !== undefined) {
    must(CATEGORY_IDS.includes(f.category), `category must be one of ${CATEGORY_IDS.join(', ')}`)
    patch.category = f.category
  }
  if (f.timeline !== undefined) patch.timeline = cleanTimeline(f.timeline)
  if (f.submission_items !== undefined) patch.submission_items = await resolveItems(sb, userId, f.submission_items)
  if (f.groups !== undefined) patch.group_ids = await resolveNamed(sb, userId, 'competition_groups', f.groups)
  if (f.doing !== undefined) {
    const v = f.doing === null ? null : String(f.doing).trim()
    if (!v) Object.assign(patch, { decision: null, project_id: null })
    else if (/^(maybe|no)$/i.test(v)) Object.assign(patch, { decision: v.toLowerCase(), project_id: null })
    else {
      must(!/^(yes|doing)$/i.test(v), 'doing: give the project name to enter with (list_projects), not "yes"')
      const [id] = await resolveNamed(sb, userId, 'competition_projects', [v])
      Object.assign(patch, { decision: null, project_id: id })
    }
  }
  return patch
}

function shape(c, optionsById, projectsById, groupsById, today) {
  const tl = timelineState(c.timeline, today)
  return {
    id: c.id,
    name: c.name,
    url: c.url || undefined,
    description: c.description || undefined,
    category: categoryLabel(c.category),
    prestige: c.prestige,
    prestige_tier: prestigeTier(c.prestige)?.label,
    submission_items: (c.submission_items ?? []).map((id) => optionsById[id]?.name).filter(Boolean),
    doing: decisionOf(c),
    project: c.project_id ? projectsById[c.project_id]?.name : undefined,
    groups: (c.group_ids ?? []).map((id) => groupsById[id]?.name).filter(Boolean),
    timeline: tl.stages.map((s) => ({ label: s.label, date: s.date, end: s.end, day: s.day })),
    status: tl.state,
    next_stage: tl.next ? { label: tl.next.label, date: tl.next.date, days_until: tl.daysToNext } : null,
    source: c.source,
  }
}

async function loadOne(sb, userId, id) {
  must(UUID_RE.test(id ?? ''), 'id must be a competition UUID')
  const c = unwrap(await sb.from('competitions').select('*').eq('user_id', userId).eq('id', id).maybeSingle())
  must(c, `Competition ${id} not found`)
  return c
}

const byId = (rows) => Object.fromEntries(rows.map((o) => [o.id, o]))

async function shapeOne(sb, userId, c) {
  const [options, projects, groups, today] = await Promise.all([loadOptions(sb, userId), loadProjects(sb, userId), loadGroups(sb, userId), todayFor(sb, userId)])
  return shape(c, byId(options), byId(projects), byId(groups), today)
}

// ─── implementations ───────────────────────────────────────────────────────

export const competitionImpl = {
  async list_competitions(sb, userId, { query = '', category, upcoming_within_days, doing, group }) {
    must(category === undefined || CATEGORY_IDS.includes(category), `category must be one of ${CATEGORY_IDS.join(', ')}`)
    const [comps, options, projects, groups, today] = await Promise.all([
      sb.from('competitions').select('*').eq('user_id', userId).then(unwrap),
      loadOptions(sb, userId),
      loadProjects(sb, userId),
      loadGroups(sb, userId),
      todayFor(sb, userId),
    ])
    const optionsById = byId(options)
    const projectsById = byId(projects)
    const groupsById = byId(groups)
    const inGroup = group === undefined ? null : findOption(groups, group)
    must(group === undefined || inGroup, `No group named "${group}"`)
    let hits = searchCompetitions(buildIndex(comps, optionsById, projectsById), query, { today }).map((r) => r.comp)
    if (!String(query).trim()) hits = sortCompetitions(hits, 'deadline', today)
    if (category) hits = hits.filter((c) => c.category === category)
    if (doing) hits = hits.filter((c) => decisionOf(c) === doing)
    if (inGroup) hits = hits.filter((c) => c.group_ids?.includes(inGroup.id))
    let out = hits.map((c) => shape(c, optionsById, projectsById, groupsById, today))
    if (upcoming_within_days !== undefined) out = out.filter((c) => c.next_stage && c.next_stage.days_until <= upcoming_within_days)
    return { today, count: out.length, categories: CATEGORIES.map((c) => c.id), competitions: out }
  },

  async get_competition(sb, userId, { id }) {
    return shapeOne(sb, userId, await loadOne(sb, userId, id))
  },

  async create_competition(sb, userId, fields) {
    must(typeof fields.name === 'string' && fields.name.trim(), 'name is required')
    const patch = await cleanFields(sb, userId, { category: 'other', ...fields })
    const c = unwrap(await sb.from('competitions').insert({ user_id: userId, source: 'ai', ...patch }).select('*').single())
    return shapeOne(sb, userId, c)
  },

  async update_competition(sb, userId, { id, ...fields }) {
    const c = await loadOne(sb, userId, id)
    const patch = await cleanFields(sb, userId, fields)
    if (Object.keys(patch).length) unwrap(await sb.from('competitions').update(patch).eq('user_id', userId).eq('id', c.id))
    return shapeOne(sb, userId, await loadOne(sb, userId, c.id))
  },

  async delete_competition(sb, userId, { id }) {
    const c = await loadOne(sb, userId, id)
    unwrap(await sb.from('competitions').delete().eq('user_id', userId).eq('id', c.id))
    return { deleted: c.id, name: c.name }
  },

  async list_submission_options(sb, userId) {
    const [options, comps] = await Promise.all([loadOptions(sb, userId), sb.from('competitions').select('submission_items').eq('user_id', userId).then(unwrap)])
    const usage = {}
    for (const c of comps) for (const id of c.submission_items ?? []) usage[id] = (usage[id] ?? 0) + 1
    return options.map((o) => ({ id: o.id, name: o.name, used_by: usage[o.id] ?? 0 }))
  },

  async manage_submission_options(sb, userId, args) {
    await manageNamed(sb, userId, 'competition_options', args)
    return competitionImpl.list_submission_options(sb, userId)
  },

  async list_projects(sb, userId) {
    const [projects, comps] = await Promise.all([loadProjects(sb, userId), sb.from('competitions').select('name, project_id').eq('user_id', userId).then(unwrap)])
    return projects.map((p) => ({ id: p.id, name: p.name, competitions: comps.filter((c) => c.project_id === p.id).map((c) => c.name) }))
  },

  async manage_projects(sb, userId, args) {
    await manageNamed(sb, userId, 'competition_projects', args)
    return competitionImpl.list_projects(sb, userId)
  },

  async list_groups(sb, userId) {
    const [groups, comps] = await Promise.all([loadGroups(sb, userId), sb.from('competitions').select('name, group_ids').eq('user_id', userId).then(unwrap)])
    return groups.map((g) => ({ id: g.id, name: g.name, competitions: comps.filter((c) => c.group_ids?.includes(g.id)).map((c) => c.name) }))
  },

  async manage_groups(sb, userId, args) {
    await manageNamed(sb, userId, 'competition_groups', args)
    return competitionImpl.list_groups(sb, userId)
  },
}
