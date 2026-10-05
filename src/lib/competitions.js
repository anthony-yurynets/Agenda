// Competition tracker domain logic, shared by the page and the MCP server.
// Keep dependency-free.
//
// A competition has a name, link, description, prestige (1–10), category,
// submission items (ids of the user's own option list) and a timeline of
// stages: [{ label, date: 'YYYY-MM-DD', end?: 'YYYY-MM-DD' }].

export const CATEGORIES = [
  { id: 'research', label: 'Research' },
  { id: 'software', label: 'Software' },
  { id: 'innovation', label: 'Innovation' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'other', label: 'Other' },
]
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id)
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Other'

export const PRESTIGE_TIERS = [
  { min: 9, label: 'Elite' },
  { min: 7, label: 'High' },
  { min: 4, label: 'Solid' },
  { min: 1, label: 'Entry' },
]
export const prestigeTier = (p) => (p ? PRESTIGE_TIERS.find((t) => p >= t.min) : null)

// "Are we doing this?": doing (with a project), maybe, no, or undecided.
export const DECISIONS = [
  { id: 'doing', label: 'Doing' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'no', label: 'No' },
  { id: 'undecided', label: 'Undecided' },
]
export const decisionOf = (c) => (c.project_id ? 'doing' : c.decision === 'maybe' || c.decision === 'no' ? c.decision : 'undecided')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const isDate = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())
const dayNum = (iso) => Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000)
/** Whole days from a to b (b − a). */
export const daysBetween = (a, b) => dayNum(b) - dayNum(a)
export const addDays = (iso, n) => new Date((dayNum(iso) + n) * 86_400_000).toISOString().slice(0, 10)

export const hostOf = (url) => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
export const normalizeUrl = (url) => {
  const u = String(url ?? '').trim()
  return !u || /^https?:\/\//i.test(u) ? u : `https://${u}`
}

// ─── Timeline ───────────────────────────────────────────────────────────────

/** Valid stages, sorted by date, each tagged with its day number (Day 1 = first stage). */
export function stages(timeline) {
  const list = (Array.isArray(timeline) ? timeline : []).filter((s) => s && isDate(s.date)).sort((a, b) => a.date.localeCompare(b.date))
  const first = list[0]?.date
  return list.map((s, i) => ({ ...s, index: i, day: daysBetween(first, s.date) + 1 }))
}

/**
 * Where a competition stands on `today`: the stage in progress (if any), the
 * next upcoming stage, and how far along the whole timeline we are (0–1).
 */
export function timelineState(timeline, today) {
  const st = stages(timeline)
  if (!st.length) return { stages: st, next: null, current: null, progress: null, state: 'none', daysToNext: null }
  const start = st[0].date
  const end = st.reduce((m, s) => (s.end && s.end > m ? s.end : s.date > m ? s.date : m), start)
  const next = st.find((s) => s.date >= today) ?? null
  const current = [...st].reverse().find((s) => s.date <= today && (s.end ?? s.date) >= today) ?? null
  const span = Math.max(daysBetween(start, end), 1)
  const progress = Math.min(Math.max(daysBetween(start, today) / span, 0), 1)
  const state = today < start ? 'upcoming' : today > end ? 'finished' : 'active'
  return { stages: st, next, current, progress, start, end, state, daysToNext: next ? daysBetween(today, next.date) : null }
}

export function countdownLabel(days) {
  if (days === null || days === undefined) return ''
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 0) return `${-days}d ago`
  if (days < 14) return `in ${days}d`
  if (days < 60) return `in ${Math.round(days / 7)}w`
  return `in ${Math.round(days / 30)}mo`
}
export const fmtDate = (iso, opts = { month: 'short', day: 'numeric' }) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString([], opts) : '')
export const urgency = (days) => (days === null || days === undefined ? 'none' : days <= 3 ? 'hot' : days <= 14 ? 'warm' : 'cool')

// ─── Search ─────────────────────────────────────────────────────────────────
//
// Instant, typo-tolerant search. The query splits into terms; every term has
// to match somewhere (AND). Each term scores against each field and keeps its
// best: whole word 1.0 › word prefix 0.85 › substring 0.65 › one typo 0.5 ›
// in-order letters within the name/link ("cngrs" → "Congress") 0.2–0.45;
// initials ("isef", "cac") count like a word prefix on the name.
// Fields are weighted (name ×3, category/items ×1.5, the rest ×1).
// Filters: "#research" or "cat:soft" (category), ">7" / "p>=8" / "p:9"
// (prestige), "soon" (a stage within 14 days).

const FIELD_WEIGHTS = { name: 3, category: 1.5, items: 1.5, project: 1.5, stages: 1, description: 1, host: 1 }
const fold = (s) => String(s ?? '').toLowerCase()
const splitWords = (s) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Precompute normalized text per competition (memoize on the list). */
export function buildIndex(comps, optionsById = {}, projectsById = {}) {
  return comps.map((c) => {
    const fields = {
      name: fold(c.name),
      category: fold(categoryLabel(c.category)),
      items: fold((c.submission_items ?? []).map((id) => optionsById[id]?.name ?? '').join(' · ')),
      project: fold(projectsById[c.project_id]?.name),
      stages: fold(stages(c.timeline).map((s) => s.label).join(' · ')),
      description: fold(c.description),
      host: fold(hostOf(c.url ?? '')),
    }
    const words = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, splitWords(v)]))
    // Initials of the name ("International Science and Engineering Fair" → "isaef", without small words → "isef").
    const nameWords = splitWords(fields.name)
    const acronyms = [nameWords.map((w) => w[0]).join(''), nameWords.filter((w) => !STOP.has(w)).map((w) => w[0]).join('')]
    return { comp: c, fields, words, acronyms }
  })
}
const STOP = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'a', 'an', 'to', '&'])

function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    // Adjacent swap ("tehcnology")
    if (a[i] === b[j + 1] && a[i + 1] === b[j]) {
      i += 2
      j += 2
    } else if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/** Indices of `term` as an in-order subsequence of `text`, or null. Prefers matches at word starts. */
function subsequence(term, text) {
  const idx = []
  let from = 0
  for (const ch of term) {
    // Prefer the next word-start occurrence, else any occurrence.
    let at = -1
    for (let k = from; k < text.length; k++) {
      if (text[k] === ch && (k === 0 || /[^\p{L}\p{N}]/u.test(text[k - 1]))) {
        at = k
        break
      }
    }
    if (at < 0) at = text.indexOf(ch, from)
    if (at < 0) return null
    idx.push(at)
    from = at + 1
  }
  return idx
}

function scoreTerm(term, text, words, loose) {
  if (!text) return 0
  if (words.includes(term)) return 1
  if (words.some((w) => w.startsWith(term))) return 0.85
  if (text.includes(term)) return 0.65
  // One typo, against the whole word or its start ("enginering", "sofware", "hackat").
  if (term.length >= 4 && words.some((w) => withinOneEdit(term, w) || (w.length > term.length && withinOneEdit(term, w.slice(0, term.length))))) return 0.5
  if (loose && term.length >= 3) {
    const idx = subsequence(term, text)
    const span = idx ? idx[idx.length - 1] - idx[0] + 1 : Infinity
    if (span <= term.length * 4) {
      return 0.2 + 0.25 * (term.length / span)
    }
  }
  return 0
}

export function parseQuery(q) {
  const out = { terms: [], categories: [], prestige: null, soon: false }
  for (const raw of fold(q).split(/\s+/).filter(Boolean)) {
    const cat = /^(?:#|cat:|c:)(.+)$/.exec(raw)
    if (cat) {
      const hit = CATEGORIES.filter((c) => c.id.startsWith(cat[1]) || fold(c.label).startsWith(cat[1]))
      if (hit.length) out.categories.push(...hit.map((c) => c.id))
      continue
    }
    const p = /^(?:p|prestige)?(:|>=|<=|>|<|=)(\d{1,2})(\+)?$/.exec(raw)
    if (p && (raw.startsWith('p') || /^[<>]/.test(raw))) {
      const n = Number(p[2])
      const op = p[3] ? '>=' : p[1] === ':' ? '=' : p[1]
      out.prestige = { op, n }
      continue
    }
    if (raw === 'soon') {
      out.soon = true
      continue
    }
    out.terms.push(raw)
  }
  return out
}

const cmp = { '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '=': (a, b) => a === b }

/**
 * Search an index from buildIndex. Returns [{ comp, score, highlight }] for
 * matches, best first (or in input order when the query has no text terms).
 * `highlight` is a sorted list of name character indices to emphasize.
 */
export function searchCompetitions(index, query, { today } = {}) {
  const q = parseQuery(query)
  const results = []
  for (const entry of index) {
    const c = entry.comp
    if (q.categories.length && !q.categories.includes(c.category)) continue
    if (q.prestige && !(c.prestige && cmp[q.prestige.op](c.prestige, q.prestige.n))) continue
    if (q.soon) {
      const d = timelineState(c.timeline, today).daysToNext
      if (d === null || d > 14) continue
    }
    let total = 0
    let ok = true
    const hl = new Set()
    for (const term of q.terms) {
      let best = 0
      for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
        const s = scoreTerm(term, entry.fields[field], entry.words[field], field === 'name' || field === 'host') * weight
        if (s > best) best = s
      }
      // Acronym match on the name ("isef", "ieee").
      if (term.length >= 2 && entry.acronyms.some((a) => a.startsWith(term))) best = Math.max(best, 0.9 * FIELD_WEIGHTS.name)
      if (!best) {
        ok = false
        break
      }
      total += best
      for (const i of nameHighlight(term, entry.fields.name)) hl.add(i)
    }
    if (!ok) continue
    // Tiny prestige tiebreak so equally good matches favor bigger competitions.
    results.push({ comp: c, score: total + (c.prestige ?? 0) * 0.01, highlight: [...hl].sort((a, b) => a - b) })
  }
  if (q.terms.length) results.sort((a, b) => b.score - a.score)
  return results
}

function nameHighlight(term, name) {
  const at = name.indexOf(term)
  if (at >= 0) return Array.from({ length: term.length }, (_, k) => at + k)
  // Word-prefix of a near match: highlight the word starts that spell the term.
  return subsequence(term, name) ?? []
}

/** Split text into [{ text, hit }] runs for rendering highlights. */
export function highlightRuns(text, indices) {
  if (!indices?.length) return [{ text, hit: false }]
  const set = new Set(indices)
  const runs = []
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i)
    const last = runs[runs.length - 1]
    if (last && last.hit === hit) last.text += text[i]
    else runs.push({ text: text[i], hit })
  }
  return runs
}

// ─── Sorting ────────────────────────────────────────────────────────────────

export const SORTS = [
  { id: 'deadline', label: 'Next date' },
  { id: 'prestige', label: 'Prestige' },
  { id: 'decision', label: 'Doing' },
  { id: 'name', label: 'Name' },
  { id: 'recent', label: 'Newest' },
]

const DECISION_RANK = { doing: 0, maybe: 1, undecided: 2, no: 3 }

/** Competitions we're entering that aren't over yet — pinned to the top of every sort. */
export const isPinned = (c, today) => decisionOf(c) === 'doing' && timelineState(c.timeline, today).state !== 'finished'

export function sortCompetitions(list, sort, today, get = (x) => x) {
  const next = (c) => timelineState(c.timeline, today).daysToNext
  const by = {
    // Upcoming soonest first; finished / undated at the bottom.
    deadline: (a, b) => (next(a) ?? 1e9) - (next(b) ?? 1e9) || (b.prestige ?? 0) - (a.prestige ?? 0),
    prestige: (a, b) => (b.prestige ?? 0) - (a.prestige ?? 0) || a.name.localeCompare(b.name),
    decision: (a, b) => DECISION_RANK[decisionOf(a)] - DECISION_RANK[decisionOf(b)] || (next(a) ?? 1e9) - (next(b) ?? 1e9),
    name: (a, b) => a.name.localeCompare(b.name),
    recent: (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  }[sort]
  return [...list].sort((x, y) => isPinned(get(y), today) - isPinned(get(x), today) || by(get(x), get(y)))
}

// ─── Filters ────────────────────────────────────────────────────────────────

export const STATES = [
  { id: 'upcoming', label: 'Not started' },
  { id: 'active', label: 'In progress' },
  { id: 'finished', label: 'Finished' },
  { id: 'none', label: 'No dates' },
]
export const WITHIN = [
  { id: null, label: 'Any time' },
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
]
export const MIN_PRESTIGE = [
  { id: null, label: 'Any' },
  { id: 4, label: '4+' },
  { id: 7, label: '7+' },
  { id: 9, label: '9+' },
]
export const EMPTY_FILTERS = { categories: [], decisions: [], projects: [], states: [], within: null, minPrestige: null, items: [], itemMode: 'any' }

/** Number of active filter groups (for the badge). */
export const filterCount = (f) =>
  (f.categories.length > 0) + (f.decisions.length > 0 || f.projects.length > 0) + (f.states.length > 0) + (f.within !== null) + (f.minPrestige !== null) + (f.items.length > 0)

export function matchesFilters(c, f, tl) {
  if (f.categories.length && !f.categories.includes(c.category)) return false
  // Decisions and projects are OR'd: "Maybe" + project X = maybe, or doing X.
  if (f.decisions.length || f.projects.length) {
    if (!f.decisions.includes(decisionOf(c)) && !(c.project_id && f.projects.includes(c.project_id))) return false
  }
  if (f.states.length && !f.states.includes(tl.state)) return false
  if (f.within !== null && (tl.daysToNext === null || tl.daysToNext > f.within)) return false
  if (f.minPrestige !== null && !(c.prestige >= f.minPrestige)) return false
  if (f.items.length) {
    const have = c.submission_items ?? []
    if (f.itemMode === 'all' ? !f.items.every((id) => have.includes(id)) : !f.items.some((id) => have.includes(id))) return false
  }
  return true
}
