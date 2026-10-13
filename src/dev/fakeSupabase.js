// Minimal in-memory stand-in for the parts of supabase-js the app uses.
const tables = { blocks: [], categories: [], api_tokens: [], share_links: [], workouts: [], workout_exercises: [], workout_sets: [], fitness_settings: [], competitions: [], competition_options: [], competition_projects: [], competition_groups: [], assignments: [], assignment_subjects: [], dashboard_links: [], amc_prep: [], amc_mocks: [], amc_errors: [] }
let clock = 0
const stamp = () => new Date(Date.UTC(2026, 0, 1) + ++clock).toISOString()

function parseCond(expr) {
  const [col, op, ...rest] = expr.split('.')
  return { col, op, val: rest.join('.') }
}
function test(row, { col, op, val }) {
  const v = row[col]
  if (v === null || v === undefined) return op === 'is' && val === 'null'
  switch (op) {
    case 'gte': return v >= val
    case 'lte': return v <= val
    case 'eq': return String(v) === String(val)
    default: return false
  }
}

class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select' }
  select(cols) { this.cols = cols ?? '*'; return this }
  order() { return this }
  limit() { return this }
  single() { this.one = true; return this }
  maybeSingle() { this.one = true; return this }
  gte(col, val) { this.filters.push((r) => r[col] != null && r[col] >= val); return this }
  lte(col, val) { this.filters.push((r) => r[col] != null && r[col] <= val); return this }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this }
  in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this }
  overlaps(col, vals) { this.filters.push((r) => vals.some((v) => (r[col] ?? []).includes(v))); return this }
  contains(col, vals) { this.filters.push((r) => vals.every((v) => (r[col] ?? []).includes(v))); return this }
  not(col) { this.filters.push((r) => r[col] !== null && r[col] !== undefined); return this }
  or(expr) {
    const groups = [...expr.matchAll(/and\(([^)]*)\)/g)].map((m) => m[1].split(',').map(parseCond))
    this.filters.push((r) => groups.some((g) => g.every((c) => test(r, c))))
    return this
  }
  insert(rows) { this.op = 'insert'; this.rows = [].concat(rows); return this }
  upsert(rows) { this.op = 'upsert'; this.rows = [].concat(rows); return this }
  update(patch) { this.op = 'update'; this.patch = patch; return this }
  delete() { this.op = 'delete'; return this }
  then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject) }
  run() {
    const t = tables[this.table]
    const match = (r) => this.filters.every((f) => f(r))
    if (this.op === 'insert') {
      const defaults = this.table === 'blocks'
        ? { parent_id: null, notes: '', status: 'planned', source: 'user', repeat: null, repeat_exdates: [], recurrence_id: null, recurrence_date: null, category_id: null, bookable: false, all_day: false }
        : this.table === 'share_links'
          ? { uses: 0, created_at: new Date().toISOString(), expires_at: null, revoked_at: null, group_ids: [], access: 'view' }
          : {}
      const rows = this.rows.map((r) => ({ id: crypto.randomUUID(), created_at: stamp(), ...defaults, ...r }))
      t.push(...rows)
      return { data: this.one ? rows[0] : rows, error: null }
    }
    if (this.op === 'upsert') {
      const key = (x) => x.id ?? x.user_id
      for (const r of this.rows) { const i = t.findIndex((x) => key(x) === key(r)); i >= 0 ? (t[i] = { ...t[i], ...r }) : t.push({ ...r }) }
      return { data: this.rows, error: null }
    }
    if (this.op === 'update') { t.filter(match).forEach((r) => Object.assign(r, this.patch)); return { data: null, error: null } }
    if (this.op === 'delete') {
      const doomed = new Set(t.filter(match).map((r) => r.id))
      let grew = true
      while (grew) { grew = false; for (const r of t) if (!doomed.has(r.id) && (doomed.has(r.parent_id) || doomed.has(r.recurrence_id))) { doomed.add(r.id); grew = true } }
      tables[this.table] = t.filter((r) => !doomed.has(r.id))
      if (this.table === 'workouts') tables.workout_exercises = tables.workout_exercises.filter((e) => !doomed.has(e.workout_id))
      if (this.table === 'workouts' || this.table === 'workout_exercises') {
        const ex = new Set(tables.workout_exercises.map((e) => e.id))
        tables.workout_sets = tables.workout_sets.filter((x) => ex.has(x.exercise_id))
      }
      if (this.table === 'competition_projects') for (const c of tables.competitions) if (doomed.has(c.project_id)) c.project_id = null
      if (this.table === 'competition_groups') {
        for (const c of tables.competitions) c.group_ids = (c.group_ids ?? []).filter((x) => !doomed.has(x))
        for (const l of tables.share_links) if (l.group_ids) l.group_ids = l.group_ids.filter((x) => !doomed.has(x))
        tables.share_links = tables.share_links.filter((l) => l.kind !== 'group' || l.group_ids?.length)
      }
      if (this.table === 'assignment_subjects') for (const a of tables.assignments) if (doomed.has(a.subject_id)) a.subject_id = null
      if (this.table === 'competition_options') for (const c of tables.competitions) c.submission_items = (c.submission_items ?? []).filter((x) => !doomed.has(x))
      return { data: null, error: null }
    }
    let data = t.filter(match).map((r) => ({ ...r }))
    // Minimal embedded-select support for the fitness query.
    if (this.table === 'workouts' && /workout_exercises\(/.test(this.cols ?? '')) {
      data = data.map((w) => ({
        ...w,
        workout_exercises: tables.workout_exercises
          .filter((e) => e.workout_id === w.id)
          .map((e) => ({ ...e, workout_sets: tables.workout_sets.filter((x) => x.exercise_id === e.id).map((x) => ({ ...x })) })),
      }))
    }
    return { data: this.one ? data[0] ?? null : data, error: null }
  }
}

const channel = { on() { return channel }, subscribe() { return channel } }

export const fakeSupabase = {
  tables,
  async rpc(name, { p_link }) {
    const link = tables.share_links.find((l) => l.id === p_link)
    if (name === 'claim_share_use') {
      if (!link || link.revoked_at || (link.max_uses && link.uses >= link.max_uses)) return { data: false, error: null }
      link.uses++
      return { data: true, error: null }
    }
    if (name === 'release_share_use' && link) link.uses = Math.max(link.uses - 1, 0)
    return { data: null, error: null }
  },
  from: (table) => new Query(table),
  channel: () => channel,
  removeChannel() {},
  auth: {
    admin: { getUserById: async () => ({ data: { user: { user_metadata: { full_name: 'Anthony Y' } } } }) },
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => {},
  },
}
