// Minimal in-memory stand-in for the parts of supabase-js the app uses.
const tables = { blocks: [], categories: [], api_tokens: [], share_links: [] }
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
  select() { return this }
  order() { return this }
  limit() { return this }
  single() { this.one = true; return this }
  maybeSingle() { this.one = true; return this }
  gte(col, val) { this.filters.push((r) => r[col] != null && r[col] >= val); return this }
  lte(col, val) { this.filters.push((r) => r[col] != null && r[col] <= val); return this }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this }
  in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this }
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
        ? { parent_id: null, notes: '', status: 'planned', source: 'user', repeat: null, repeat_exdates: [], recurrence_id: null, recurrence_date: null, category_id: null, bookable: false }
        : this.table === 'share_links'
          ? { uses: 0, created_at: new Date().toISOString(), expires_at: null, revoked_at: null }
          : {}
      const rows = this.rows.map((r) => ({ id: crypto.randomUUID(), created_at: stamp(), ...defaults, ...r }))
      t.push(...rows)
      return { data: this.one ? rows[0] : rows, error: null }
    }
    if (this.op === 'upsert') {
      for (const r of this.rows) { const i = t.findIndex((x) => x.id === r.id); i >= 0 ? (t[i] = { ...t[i], ...r }) : t.push({ ...r }) }
      return { data: this.rows, error: null }
    }
    if (this.op === 'update') { t.filter(match).forEach((r) => Object.assign(r, this.patch)); return { data: null, error: null } }
    if (this.op === 'delete') {
      const doomed = new Set(t.filter(match).map((r) => r.id))
      let grew = true
      while (grew) { grew = false; for (const r of t) if (!doomed.has(r.id) && (doomed.has(r.parent_id) || doomed.has(r.recurrence_id))) { doomed.add(r.id); grew = true } }
      tables[this.table] = t.filter((r) => !doomed.has(r.id))
      return { data: null, error: null }
    }
    const data = t.filter(match).map((r) => ({ ...r }))
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
