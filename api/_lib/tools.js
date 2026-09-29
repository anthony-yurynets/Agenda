// MCP tool definitions + implementations. All queries are scoped to `userId`
// because the service-role client bypasses row level security.
//
// Repeats: a block with a `repeat` rule is a series. list_blocks returns each
// occurrence with an id like "<series id>::<YYYY-MM-DD>". Passing such an id to
// update_block / delete_block affects only that date; passing the series id
// affects every occurrence.

import {
  STATUS_IDS,
  CATEGORY_PALETTE,
  REPEAT_FREQS,
  WEEKDAYS,
  toMinutes,
  fromMinutes,
  isValidDate,
  divideRange,
  normalizeRepeat,
  occurrenceDates,
  describeRepeat,
  isOccurrenceId,
  splitOccurrenceId,
  occurrenceId,
} from '../../src/lib/domain.js'

const timeProp = (desc) => ({ type: 'string', pattern: '^\\d{1,2}:\\d{2}$', description: desc })
const statusProp = {
  type: 'string',
  enum: STATUS_IDS,
  description: 'Block status. Use "none" for fixed commitments that need no tracking (sleep, school, commute).',
}
const categoryProp = {
  type: 'string',
  description: 'Category name (case-insensitive) or id. Use list_categories to see options.',
}
const idProp = {
  type: 'string',
  description: 'Block id. For one occurrence of a repeating block use its occurrence id ("<series id>::YYYY-MM-DD").',
}
const repeatProp = {
  type: 'object',
  description:
    'Repeat rule for a top-level block. Examples: {"freq":"daily"}, {"freq":"weekends"}, {"freq":"weekly","days":["mon","wed","fri"]}, ' +
    '{"freq":"monthly","week":-1,"weekday":"fri"} (last Friday), {"freq":"daily","count":10}. ' +
    'Use {"freq":"none"} to stop repeating.',
  properties: {
    freq: {
      type: 'string',
      enum: [...REPEAT_FREQS, 'weekdays', 'weekends', 'none'],
      description: '"weekdays" = Mon–Fri, "weekends" = Sat–Sun (shorthands for weekly).',
    },
    interval: { type: 'integer', minimum: 1, maximum: 99, description: 'Every N days/weeks/months/years (default 1).' },
    days: { type: 'array', items: { type: 'string', enum: WEEKDAYS }, description: 'Weekly only.' },
    week: {
      type: 'integer',
      enum: [1, 2, 3, 4, -1],
      description: 'Monthly only: repeat on the Nth weekday (e.g. 2 = 2nd, -1 = last) instead of the same date.',
    },
    weekday: { type: 'string', enum: WEEKDAYS, description: 'Weekday for `week` (defaults to the start date\'s).' },
    until: { type: 'string', description: 'End date, YYYY-MM-DD.' },
    count: { type: 'integer', minimum: 1, maximum: 999, description: 'End after N occurrences (instead of until).' },
  },
  required: ['freq'],
}

const subBlockSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    start_time: timeProp('Start (HH:MM) within the parent range. Omit to divide evenly.'),
    end_time: timeProp('End (HH:MM) within the parent range.'),
    category: categoryProp,
    status: statusProp,
    notes: { type: 'string' },
    sub_blocks: { type: 'array', items: { type: 'object' }, description: 'Nested sub-blocks (same shape).' },
  },
  required: ['title'],
}

export const TOOLS = [
  {
    name: 'list_categories',
    title: 'List categories',
    description: "List the user's block categories (name + color).",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_category',
    title: 'Create category',
    description: 'Create a new category.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Hex color, e.g. #3b82f6.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_blocks',
    title: 'List blocks',
    description:
      'List blocks between two dates (inclusive, max 366 days), as trees with nested sub_blocks. Repeating blocks ' +
      'are expanded into one entry per occurrence (with series_id). Optionally filter top-level blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD.' },
        to: { type: 'string', description: 'End date YYYY-MM-DD (defaults to `from`).' },
        status: statusProp,
        category: categoryProp,
        query: { type: 'string', description: 'Case-insensitive title search.' },
      },
      required: ['from'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_block',
    title: 'Get block',
    description: 'Get one block (or one occurrence, or a series by its id) with its full sub-block tree.',
    inputSchema: { type: 'object', properties: { id: idProp }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_block',
    title: 'Create block',
    description:
      'Create a time block. Pass parent_id to create a sub-block inside an existing block ' +
      "(date is inherited; times default to the parent's range). sub_blocks can create a whole tree at once. " +
      'Pass repeat to make a top-level block recur.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD (first occurrence for repeats). Required unless parent_id is given.' },
        start_time: timeProp('Start time HH:MM (24h).'),
        end_time: timeProp('End time HH:MM (24h). 24:00 means midnight.'),
        category: categoryProp,
        status: { ...statusProp, description: 'Defaults to planned.' },
        notes: { type: 'string' },
        parent_id: { ...idProp, description: 'Create as a sub-block of this block (or occurrence).' },
        bookable: { type: 'boolean', description: 'Top-level only: let people with a booking link book time inside this block.' },
        repeat: repeatProp,
        sub_blocks: { type: 'array', items: subBlockSchema },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_block',
    title: 'Update block',
    description:
      'Update a block. Moving it (date or start_time) moves its sub-blocks too. With an occurrence id only that ' +
      'date changes; with a series id every occurrence changes (and `repeat` edits the rule).',
    inputSchema: {
      type: 'object',
      properties: {
        id: idProp,
        title: { type: 'string' },
        date: { type: 'string' },
        start_time: timeProp('New start HH:MM.'),
        end_time: timeProp('New end HH:MM.'),
        category: { ...categoryProp, description: 'Category name or id; empty string clears it.' },
        status: statusProp,
        notes: { type: 'string' },
        repeat: repeatProp,
        bookable: { type: 'boolean', description: 'Top-level only: let people with a booking link book time inside this block.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'divide_block',
    title: 'Divide block',
    description: 'Divide a block (or one occurrence) evenly into N sub-blocks (2–12). Optionally name each part.',
    inputSchema: {
      type: 'object',
      properties: {
        id: idProp,
        parts: { type: 'integer', minimum: 2, maximum: 12 },
        titles: { type: 'array', items: { type: 'string' } },
      },
      required: ['id', 'parts'],
    },
  },
  {
    name: 'delete_block',
    title: 'Delete block',
    description:
      'Delete a block and its sub-blocks. An occurrence id removes just that date from its series; a series id ' +
      'deletes the whole series.',
    inputSchema: { type: 'object', properties: { id: idProp }, required: ['id'] },
    annotations: { destructiveHint: true },
  },
]

// ─── helpers ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COPY_FIELDS = ['title', 'start_time', 'end_time', 'category_id', 'status', 'notes', 'source', 'bookable']

function must(cond, message) {
  if (!cond) throw new Error(message)
}

export function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

function parseTime(value, label) {
  const mins = toMinutes(value)
  must(mins !== null, `${label} must be HH:MM (24h), got "${value}"`)
  return mins
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000)

async function loadCategories(sb, userId) {
  return unwrap(
    await sb.from('categories').select('id, name, color').eq('user_id', userId).order('position'),
  )
}

async function resolveCategory(sb, userId, ref, cache) {
  if (ref === undefined || ref === null) return undefined
  if (ref === '') return null
  const cats = cache.categories ?? (cache.categories = await loadCategories(sb, userId))
  const found =
    cats.find((c) => c.id === ref) ?? cats.find((c) => c.name.toLowerCase() === String(ref).toLowerCase())
  must(found, `Unknown category "${ref}". Available: ${cats.map((c) => c.name).join(', ') || 'none'}`)
  return found.id
}

async function loadBlock(sb, userId, id) {
  must(UUID_RE.test(id ?? ''), 'id must be a block UUID or an occurrence id')
  const row = unwrap(await sb.from('blocks').select('*').eq('user_id', userId).eq('id', id).maybeSingle())
  must(row, `Block ${id} not found`)
  return row
}

/** All descendants of `rootIds` (breadth-first), same user. */
async function loadDescendants(sb, userId, rootIds) {
  const out = []
  let frontier = rootIds
  while (frontier.length) {
    const rows = unwrap(await sb.from('blocks').select('*').eq('user_id', userId).in('parent_id', frontier))
    out.push(...rows)
    frontier = rows.map((r) => r.id)
  }
  return out
}

async function rootOf(sb, userId, row) {
  let cur = row
  while (cur.parent_id) cur = await loadBlock(sb, userId, cur.parent_id)
  return cur
}

async function findException(sb, userId, templateId, date) {
  return unwrap(
    await sb
      .from('blocks')
      .select('*')
      .eq('user_id', userId)
      .eq('recurrence_id', templateId)
      .eq('recurrence_date', date)
      .maybeSingle(),
  )
}

/** Copy a series template tree onto `date` as virtual rows (occurrence ids). */
function virtualTree(root, descendants, date) {
  const out = []
  const walk = (src, parentId) => {
    const id = occurrenceId(src.id, date)
    out.push({ ...src, id, parent_id: parentId, date, repeat: null, series_id: root.id, series_rule: root.repeat, series_start: root.date })
    for (const c of descendants.filter((d) => d.parent_id === src.id)) walk(c, id)
  }
  walk(root, null)
  return out
}

/** Raw rows the owner's calendar needs for [from, to]: range rows + series templates + their sub-blocks. */
export async function rawRangeRows(sb, userId, from, to) {
  const [rangeRows, seriesRows] = await Promise.all([
    sb
      .from('blocks')
      .select('*')
      .eq('user_id', userId)
      .or(`and(date.gte.${from},date.lte.${to}),and(recurrence_date.gte.${from},recurrence_date.lte.${to})`)
      .limit(3000)
      .then(unwrap),
    sb.from('blocks').select('*').eq('user_id', userId).not('repeat', 'is', null).lte('date', to).then(unwrap),
  ])
  const seriesDesc = await loadDescendants(sb, userId, seriesRows.map((r) => r.id))
  const byId = new Map([...rangeRows, ...seriesRows, ...seriesDesc].map((r) => [r.id, r]))
  return { rows: [...byId.values()], rangeRows, seriesRows, seriesDesc }
}

/** Every block shown in [from, to]: real rows plus virtual occurrences (with occurrence ids). */
export async function expandedRows(sb, userId, from, to) {
  const { rangeRows, seriesRows, seriesDesc } = await rawRangeRows(sb, userId, from, to)
  const templateIds = new Set([...seriesRows, ...seriesDesc].map((r) => r.id))
  const edited = new Set(rangeRows.filter((r) => r.recurrence_id).map((r) => occurrenceId(r.recurrence_id, r.recurrence_date)))
  const rows = rangeRows.filter((r) => !templateIds.has(r.id) && r.date >= from && r.date <= to)
  for (const s of seriesRows) {
    for (const date of occurrenceDates(s.date, s.repeat, from, to, s.repeat_exdates)) {
      if (!edited.has(occurrenceId(s.id, date))) rows.push(...virtualTree(s, seriesDesc, date))
    }
  }
  return rows
}

/** Make one occurrence real (copying its tree) so it can be edited alone. Returns the row for `occId`. */
export async function materialize(sb, userId, occId) {
  const { templateId, date } = splitOccurrenceId(occId)
  must(UUID_RE.test(templateId) && isValidDate(date), `Invalid occurrence id "${occId}"`)
  const existing = await findException(sb, userId, templateId, date)
  if (existing) return existing

  const root = await rootOf(sb, userId, await loadBlock(sb, userId, templateId))
  must(root.repeat, `Block ${root.id} does not repeat`)
  must(
    occurrenceDates(root.date, root.repeat, date, date, root.repeat_exdates).length === 1,
    `The series has no occurrence on ${date}`,
  )
  const descendants = await loadDescendants(sb, userId, [root.id])
  let target = null
  const copy = async (src, parentId) => {
    const row = { user_id: userId, parent_id: parentId, date, recurrence_id: src.id, recurrence_date: date }
    for (const f of COPY_FIELDS) row[f] = src[f]
    const inserted = unwrap(await sb.from('blocks').insert(row).select('*').single())
    if (src.id === templateId) target = inserted
    for (const c of descendants.filter((d) => d.parent_id === src.id)) await copy(c, inserted.id)
  }
  await copy(root, null)
  return target
}

const realId = async (sb, userId, id) => (isOccurrenceId(id) ? (await materialize(sb, userId, id)).id : id)

async function addExdate(sb, userId, templateId, date) {
  const tpl = await loadBlock(sb, userId, templateId)
  const exdates = [...new Set([...(tpl.repeat_exdates ?? []), date])]
  unwrap(await sb.from('blocks').update({ repeat_exdates: exdates }).eq('user_id', userId).eq('id', templateId))
}

function shape(row, catsById) {
  const cat = row.category_id ? catsById.get(row.category_id) : null
  const out = {
    id: row.id,
    title: row.title,
    date: row.date,
    start_time: fromMinutes(toMinutes(row.start_time)),
    end_time: fromMinutes(toMinutes(row.end_time)),
    status: row.status,
    category: cat ? { id: cat.id, name: cat.name, color: cat.color } : null,
    notes: row.notes || undefined,
    source: row.source,
    parent_id: row.parent_id,
  }
  if (row.bookable) out.bookable = true
  if (row.repeat) out.repeat = { ...row.repeat, summary: describeRepeat(row.repeat, row.date) }
  if (row.series_id && !row.parent_id) out.series = { id: row.series_id, repeat: describeRepeat(row.series_rule, row.series_start) }
  if (row.recurrence_id && !row.parent_id) out.series = { id: row.recurrence_id, edited_occurrence: true }
  out.sub_blocks = []
  return out
}

function buildTrees(rows, cats, isRoot = (r) => !r.parent_id) {
  const catsById = new Map(cats.map((c) => [c.id, c]))
  const nodes = new Map(rows.map((r) => [r.id, shape(r, catsById)]))
  const roots = []
  for (const r of rows) {
    const node = nodes.get(r.id)
    if (isRoot(r)) roots.push(node)
    else nodes.get(r.parent_id)?.sub_blocks.push(node)
  }
  const sort = (list) => {
    list.sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
    list.forEach((n) => sort(n.sub_blocks))
  }
  sort(roots)
  return roots
}

async function insertTree(sb, userId, spec, ctx, cache) {
  const { date, start, end, parentId, categoryId, repeat } = ctx
  const row = {
    user_id: userId,
    parent_id: parentId ?? null,
    title: String(spec.title ?? '').slice(0, 200),
    date,
    start_time: fromMinutes(start),
    end_time: fromMinutes(end),
    category_id: categoryId ?? null,
    status: spec.status ?? 'planned',
    notes: spec.notes ?? '',
    source: 'ai',
    repeat: repeat ?? null,
    bookable: !parentId && Boolean(spec.bookable),
  }
  must(STATUS_IDS.includes(row.status), `status must be one of ${STATUS_IDS.join(', ')}`)
  const inserted = unwrap(await sb.from('blocks').insert(row).select('*').single())

  const children = Array.isArray(spec.sub_blocks) ? spec.sub_blocks : []
  if (children.length) {
    const untimed = children.filter((c) => !c.start_time)
    const slots = divideRange(start, end, Math.max(untimed.length, 1))
    let slot = 0
    for (const child of children) {
      let cs, ce
      if (child.start_time) {
        cs = parseTime(child.start_time, 'sub_block start_time')
        ce = child.end_time ? parseTime(child.end_time, 'sub_block end_time') : end
      } else {
        ;({ start: cs, end: ce } = slots[slot++] ?? { start, end })
      }
      must(cs >= start && ce <= end && ce > cs, `Sub-block "${child.title}" must fit inside ${fromMinutes(start)}–${fromMinutes(end)}`)
      const childCat = (await resolveCategory(sb, userId, child.category, cache)) ?? categoryId
      await insertTree(sb, userId, child, { date, start: cs, end: ce, parentId: inserted.id, categoryId: childCat }, cache)
    }
  }
  return inserted
}

async function treeFor(sb, userId, id) {
  const cats = await loadCategories(sb, userId)
  if (isOccurrenceId(id)) {
    const { templateId, date } = splitOccurrenceId(id)
    const exception = await findException(sb, userId, templateId, date)
    if (exception) return treeFor(sb, userId, exception.id)
    const tpl = await loadBlock(sb, userId, templateId)
    const root = await rootOf(sb, userId, tpl)
    must(root.repeat, `Block ${root.id} does not repeat`)
    const rows = virtualTree(root, await loadDescendants(sb, userId, [root.id]), date)
    return buildTrees(rows, cats, (r) => r.id === id)[0]
  }
  const root = await loadBlock(sb, userId, id)
  const rows = [root, ...(await loadDescendants(sb, userId, [root.id]))]
  return buildTrees(rows, cats, (r) => r.id === root.id)[0]
}

// ─── implementations ───────────────────────────────────────────────────────

const impl = {
  async list_categories(sb, userId) {
    return loadCategories(sb, userId)
  },

  async create_category(sb, userId, { name, color }) {
    must(typeof name === 'string' && name.trim(), 'name is required')
    const cats = await loadCategories(sb, userId)
    must(!cats.some((c) => c.name.toLowerCase() === name.trim().toLowerCase()), `Category "${name}" already exists`)
    return unwrap(
      await sb
        .from('categories')
        .insert({
          user_id: userId,
          name: name.trim().slice(0, 60),
          color: color ?? CATEGORY_PALETTE[cats.length % CATEGORY_PALETTE.length],
          position: cats.length,
        })
        .select('id, name, color')
        .single(),
    )
  },

  async list_blocks(sb, userId, { from, to, status, category, query }) {
    to = to ?? from
    must(isValidDate(from) && isValidDate(to), 'from/to must be YYYY-MM-DD')
    must(from <= to, '`from` must be on or before `to`')
    must(daysBetween(from, to) <= 366, 'Range is limited to 366 days')
    const cache = {}
    const categoryId = await resolveCategory(sb, userId, category, cache)

    const rows = await expandedRows(sb, userId, from, to)
    let trees = buildTrees(rows, cache.categories ?? (await loadCategories(sb, userId)))
    if (status) trees = trees.filter((t) => t.status === status)
    if (categoryId) trees = trees.filter((t) => t.category?.id === categoryId)
    if (query) trees = trees.filter((t) => t.title.toLowerCase().includes(String(query).toLowerCase()))
    return trees
  },

  async get_block(sb, userId, { id }) {
    return treeFor(sb, userId, id)
  },

  async create_block(sb, userId, args) {
    const cache = {}
    must(typeof args.title === 'string', 'title is required')
    let date, start, end, parentId, inheritedCat
    if (args.parent_id) {
      must(!args.repeat, 'Only top-level blocks can repeat')
      const parent = await loadBlock(sb, userId, await realId(sb, userId, args.parent_id))
      const ps = toMinutes(parent.start_time)
      const pe = toMinutes(parent.end_time)
      date = parent.date
      start = args.start_time ? parseTime(args.start_time, 'start_time') : ps
      end = args.end_time ? parseTime(args.end_time, 'end_time') : pe
      must(start >= ps && end <= pe, `Sub-block must fit inside the parent (${fromMinutes(ps)}–${fromMinutes(pe)})`)
      parentId = parent.id
      inheritedCat = parent.category_id
    } else {
      must(isValidDate(args.date), 'date (YYYY-MM-DD) is required for top-level blocks')
      date = args.date
      start = parseTime(args.start_time, 'start_time')
      end = args.end_time ? parseTime(args.end_time, 'end_time') : Math.min(start + 60, 1440)
    }
    must(end > start, 'end_time must be after start_time')
    const repeat = args.repeat ? normalizeRepeat(args.repeat, date) : null
    const categoryId = (await resolveCategory(sb, userId, args.category, cache)) ?? inheritedCat
    const row = await insertTree(sb, userId, args, { date, start, end, parentId, categoryId, repeat }, cache)
    return treeFor(sb, userId, row.id)
  },

  async update_block(sb, userId, args) {
    const block = await loadBlock(sb, userId, await realId(sb, userId, args.id))
    const cache = {}
    const patch = {}
    if (args.title !== undefined) patch.title = String(args.title).slice(0, 200)
    if (args.notes !== undefined) patch.notes = String(args.notes)
    if (args.status !== undefined) {
      must(STATUS_IDS.includes(args.status), `status must be one of ${STATUS_IDS.join(', ')}`)
      patch.status = args.status
    }
    const cat = await resolveCategory(sb, userId, args.category, cache)
    if (cat !== undefined) patch.category_id = cat

    const oldStart = toMinutes(block.start_time)
    const oldEnd = toMinutes(block.end_time)
    const newStart = args.start_time ? parseTime(args.start_time, 'start_time') : oldStart
    const newEnd = args.end_time
      ? parseTime(args.end_time, 'end_time')
      : args.start_time
        ? Math.min(newStart + (oldEnd - oldStart), 1440)
        : oldEnd
    must(newEnd > newStart, 'end_time must be after start_time')

    if (args.date !== undefined) {
      must(isValidDate(args.date), 'date must be YYYY-MM-DD')
      must(!block.parent_id, 'Sub-blocks share their parent’s date; move the parent instead')
      patch.date = args.date
    }
    if (args.bookable !== undefined) {
      must(!block.parent_id, 'Only top-level blocks can be opened for booking')
      patch.bookable = Boolean(args.bookable)
    }
    if (args.repeat !== undefined) {
      must(!block.parent_id, 'Only top-level blocks can repeat')
      must(!block.recurrence_id, `This is one occurrence of series ${block.recurrence_id}; update the series id to change the rule`)
      patch.repeat = normalizeRepeat(args.repeat, patch.date ?? block.date)
    }
    if (block.parent_id && (newStart !== oldStart || newEnd !== oldEnd)) {
      const parent = await loadBlock(sb, userId, block.parent_id)
      must(
        newStart >= toMinutes(parent.start_time) && newEnd <= toMinutes(parent.end_time),
        'Sub-block must stay inside its parent',
      )
    }
    patch.start_time = fromMinutes(newStart)
    patch.end_time = fromMinutes(newEnd)
    unwrap(await sb.from('blocks').update(patch).eq('user_id', userId).eq('id', block.id))

    // Carry sub-blocks along (shift by delta, clamp into the new range).
    const delta = newStart - oldStart
    if (delta !== 0 || patch.date || newEnd !== oldEnd) {
      const desc = await loadDescendants(sb, userId, [block.id])
      for (const d of desc) {
        let s = toMinutes(d.start_time) + delta
        let e = toMinutes(d.end_time) + delta
        s = Math.max(newStart, Math.min(s, newEnd - 5))
        e = Math.min(newEnd, Math.max(e, s + 5))
        unwrap(
          await sb
            .from('blocks')
            .update({ start_time: fromMinutes(s), end_time: fromMinutes(e), date: patch.date ?? block.date })
            .eq('user_id', userId)
            .eq('id', d.id),
        )
      }
    }
    return treeFor(sb, userId, block.id)
  },

  async divide_block(sb, userId, { id, parts, titles = [] }) {
    must(Number.isInteger(parts) && parts >= 2 && parts <= 12, 'parts must be an integer 2–12')
    const block = await loadBlock(sb, userId, await realId(sb, userId, id))
    const slots = divideRange(toMinutes(block.start_time), toMinutes(block.end_time), parts)
    const rows = slots.map((s, i) => ({
      user_id: userId,
      parent_id: block.id,
      title: titles[i] ?? `${block.title || 'Part'} · ${i + 1}`,
      date: block.date,
      start_time: fromMinutes(s.start),
      end_time: fromMinutes(s.end),
      category_id: block.category_id,
      status: 'planned',
      source: 'ai',
    }))
    unwrap(await sb.from('blocks').insert(rows))
    return treeFor(sb, userId, block.id)
  },

  async delete_block(sb, userId, { id }) {
    if (isOccurrenceId(id)) {
      const { templateId, date } = splitOccurrenceId(id)
      const exception = await findException(sb, userId, templateId, date)
      if (!exception) {
        const tpl = await loadBlock(sb, userId, templateId)
        if (!tpl.parent_id) {
          await addExdate(sb, userId, templateId, date)
          return { deleted_occurrence: id, title: tpl.title }
        }
      }
      id = exception ? exception.id : await realId(sb, userId, id)
    }
    const block = await loadBlock(sb, userId, id)
    if (block.recurrence_id && !block.parent_id) await addExdate(sb, userId, block.recurrence_id, block.recurrence_date)
    unwrap(await sb.from('blocks').delete().eq('user_id', userId).eq('id', block.id))
    return { deleted: block.id, title: block.title, whole_series: Boolean(block.repeat) }
  },
}

export function runTool(sb, userId, name, args) {
  return impl[name](sb, userId, args ?? {})
}

