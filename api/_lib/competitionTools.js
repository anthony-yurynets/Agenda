// MCP tools for the Competitions page: search, create, edit and delete
// competitions and the user's submission-item options. All queries are scoped
// to `userId` (service-role client).

import {
  CATEGORIES,
  CATEGORY_IDS,
  buildIndex,
  categoryLabel,
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

const loadOptions = async (sb, userId) =>
  unwrap(await sb.from('competition_options').select('*').eq('user_id', userId)).sort((a, b) => a.position - b.position)

function findOption(options, ref) {
  const key = String(ref ?? '').trim().toLowerCase()
  return options.find((o) => o.id === ref || o.name.toLowerCase() === key)
}

/** Resolve option names to ids, creating missing ones. */
async function resolveItems(sb, userId, names) {
  must(Array.isArray(names), 'submission_items must be an array of names')
  const options = await loadOptions(sb, userId)
  const ids = []
  let position = options.reduce((m, o) => Math.max(m, o.position), -1) + 1
  for (const raw of names) {
    const name = String(raw).trim().slice(0, 80)
    if (!name) continue
    let o = findOption(options, name)
    if (!o) {
      o = unwrap(await sb.from('competition_options').insert({ user_id: userId, name, position: position++ }).select('*').single())
      options.push(o)
    }
    if (!ids.includes(o.id)) ids.push(o.id)
  }
  return ids
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
  return patch
}

function shape(c, optionsById, today) {
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

async function shapeOne(sb, userId, c) {
  const options = await loadOptions(sb, userId)
  return shape(c, Object.fromEntries(options.map((o) => [o.id, o])), await todayFor(sb, userId))
}

// ─── implementations ───────────────────────────────────────────────────────

export const competitionImpl = {
  async list_competitions(sb, userId, { query = '', category, upcoming_within_days }) {
    must(category === undefined || CATEGORY_IDS.includes(category), `category must be one of ${CATEGORY_IDS.join(', ')}`)
    const [comps, options, today] = await Promise.all([
      sb.from('competitions').select('*').eq('user_id', userId).then(unwrap),
      loadOptions(sb, userId),
      todayFor(sb, userId),
    ])
    const byId = Object.fromEntries(options.map((o) => [o.id, o]))
    let hits = searchCompetitions(buildIndex(comps, byId), query, { today }).map((r) => r.comp)
    if (!String(query).trim()) hits = sortCompetitions(hits, 'deadline', today)
    if (category) hits = hits.filter((c) => c.category === category)
    let out = hits.map((c) => shape(c, byId, today))
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

  async manage_submission_options(sb, userId, { add = [], rename = [], remove = [] }) {
    if (add.length) await resolveItems(sb, userId, add)
    let options = await loadOptions(sb, userId)
    for (const { from, to } of rename) {
      const o = findOption(options, from)
      must(o, `No option named "${from}"`)
      const name = String(to ?? '').trim().slice(0, 80)
      must(name, 'rename.to cannot be empty')
      unwrap(await sb.from('competition_options').update({ name }).eq('user_id', userId).eq('id', o.id))
    }
    options = await loadOptions(sb, userId)
    for (const ref of remove) {
      const o = findOption(options, ref)
      must(o, `No option named "${ref}"`)
      // The DB trigger strips it from competitions.
      unwrap(await sb.from('competition_options').delete().eq('user_id', userId).eq('id', o.id))
    }
    return competitionImpl.list_submission_options(sb, userId)
  },
}
