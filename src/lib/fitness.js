// Fitness domain logic, shared by the Fitness page and the MCP server.
// Keep dependency-free. Muscle ids are react-muscle-highlighter slugs.
//
// Recovery model: every completed set adds fatigue to its muscles (1.0 for the
// exercise's first/primary muscle, 0.5 for the others), and fatigue decays
// exponentially: load(t) = Σ weight · e^(−hours_since / τ). Bigger muscles
// recover more slowly (larger τ). A muscle counts as fresh below FRESH_BELOW.

export const MUSCLES = [
  { id: 'chest', label: 'Chest', group: 'push', tau: 32, side: 'front' },
  { id: 'deltoids', label: 'Shoulders', group: 'push', tau: 28, side: 'both' },
  { id: 'triceps', label: 'Triceps', group: 'push', tau: 22, side: 'back' },
  { id: 'upper-back', label: 'Upper back', group: 'pull', tau: 32, side: 'back' },
  { id: 'trapezius', label: 'Traps', group: 'pull', tau: 28, side: 'both' },
  { id: 'biceps', label: 'Biceps', group: 'pull', tau: 22, side: 'front' },
  { id: 'forearm', label: 'Forearms', group: 'pull', tau: 20, side: 'both' },
  { id: 'quadriceps', label: 'Quads', group: 'legs', tau: 34, side: 'front' },
  { id: 'hamstring', label: 'Hamstrings', group: 'legs', tau: 34, side: 'back' },
  { id: 'gluteal', label: 'Glutes', group: 'legs', tau: 34, side: 'back' },
  { id: 'adductors', label: 'Adductors', group: 'legs', tau: 28, side: 'both' },
  { id: 'calves', label: 'Calves', group: 'legs', tau: 22, side: 'both' },
  { id: 'tibialis', label: 'Tibialis', group: 'legs', tau: 20, side: 'front' },
  { id: 'abs', label: 'Abs', group: 'core', tau: 22, side: 'front' },
  { id: 'obliques', label: 'Obliques', group: 'core', tau: 22, side: 'front' },
  { id: 'lower-back', label: 'Lower back', group: 'core', tau: 34, side: 'back' },
  { id: 'neck', label: 'Neck', group: 'core', tau: 22, side: 'both' },
]
export const MUSCLE_IDS = MUSCLES.map((m) => m.id)
export const MUSCLE_BY_ID = Object.fromEntries(MUSCLES.map((m) => [m.id, m]))
export const muscleLabel = (id) => MUSCLE_BY_ID[id]?.label ?? id

export const GROUPS = [
  { id: 'push', label: 'Push', hint: 'chest · shoulders · triceps' },
  { id: 'pull', label: 'Pull', hint: 'back · biceps · forearms' },
  { id: 'legs', label: 'Legs', hint: 'quads · hamstrings · glutes · calves' },
  { id: 'core', label: 'Core', hint: 'abs · obliques · lower back' },
]

export const FRESH_BELOW = 1
export const LEVELS = [
  { id: 0, label: 'Fresh', min: 0 },
  { id: 1, label: 'Recovering', min: 1 },
  { id: 2, label: 'Worked', min: 2 },
  { id: 3, label: 'Tired', min: 3.5 },
  { id: 4, label: 'Fatigued', min: 5.5 },
]
export const levelFor = (load) => [...LEVELS].reverse().find((l) => load >= l.min) ?? LEVELS[0]

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_MS = 86_400_000
const utc = (iso) => new Date(`${iso}T00:00:00Z`)
const iso = (d) => d.toISOString().slice(0, 10)
export const addDays = (date, n) => iso(new Date(utc(date).getTime() + n * DAY_MS))
export const weekdayOf = (date) => WEEKDAYS[utc(date).getUTCDay()]
/** Monday of the week containing `date` (YYYY-MM-DD). */
export const weekStart = (date) => addDays(date, -((utc(date).getUTCDay() + 6) % 7))

/** When a workout's sets count as having happened (ms). */
function workoutTime(w, nowMs) {
  if (w.completed_at) return Math.min(new Date(w.completed_at).getTime(), nowMs)
  // Logged but not finished: treat as midday local time on its date, never in the future.
  const [y, m, d] = w.date.split('-').map(Number)
  return Math.min(new Date(y, m - 1, d, 12).getTime(), nowMs)
}

const doneSets = (ex) => (ex.sets ?? []).filter((s) => s.done)

/**
 * Current fatigue per muscle. `workouts` are nested ({ exercises: [{ muscles, sets }] }).
 * Returns { [muscleId]: { load, level, hoursToFresh, lastTrained } }.
 */
export function recovery(workouts, now = new Date()) {
  const nowMs = now.getTime()
  const out = Object.fromEntries(MUSCLES.map((m) => [m.id, { load: 0, lastTrained: null }]))
  for (const w of workouts) {
    if (w.status === 'skipped') continue
    const t = workoutTime(w, nowMs)
    const hours = (nowMs - t) / 3_600_000
    for (const ex of w.exercises ?? []) {
      const n = doneSets(ex).length
      if (!n) continue
      ;(ex.muscles ?? []).forEach((id, i) => {
        const m = MUSCLE_BY_ID[id]
        if (!m) return
        out[id].load += n * (i === 0 ? 1 : 0.5) * Math.exp(-hours / m.tau)
        if (!out[id].lastTrained || t > out[id].lastTrained) out[id].lastTrained = t
      })
    }
  }
  for (const m of MUSCLES) {
    const r = out[m.id]
    r.level = levelFor(r.load).id
    r.hoursToFresh = r.load > FRESH_BELOW ? Math.ceil(m.tau * Math.log(r.load / FRESH_BELOW)) : 0
    r.lastTrained = r.lastTrained ? new Date(r.lastTrained).toISOString() : null
  }
  return out
}

/** The training group (push/pull/legs/core) whose muscles are freshest right now. */
export function suggestGroup(rec) {
  const scored = GROUPS.map((g) => {
    const ms = MUSCLES.filter((m) => m.group === g.id)
    return { ...g, load: ms.reduce((s, m) => s + rec[m.id].load, 0) / ms.length }
  })
  return scored.sort((a, b) => a.load - b.load)[0]
}

/** Completed sets per muscle since `sinceDate` (primary muscle only). */
export function setsPerMuscle(workouts, sinceDate) {
  const out = {}
  for (const w of workouts) {
    if (w.date < sinceDate || w.status === 'skipped') continue
    for (const ex of w.exercises ?? []) {
      const id = ex.muscles?.[0]
      if (id && MUSCLE_BY_ID[id]) out[id] = (out[id] ?? 0) + doneSets(ex).length
    }
  }
  return out
}

/** Did this workout happen? (marked done, or has at least one completed set) */
export const trained = (w) => w.status === 'done' || (w.exercises ?? []).some((ex) => doneSets(ex).length)

/** Distinct training days per week (Mon-based) → Map(weekStart → count). */
function sessionsByWeek(workouts) {
  const days = new Set(workouts.filter(trained).map((w) => w.date))
  const weeks = new Map()
  for (const d of days) {
    const k = weekStart(d)
    weeks.set(k, (weeks.get(k) ?? 0) + 1)
  }
  return weeks
}

/**
 * Weekly streak: consecutive weeks hitting `goal` training days. The current
 * week only adds to it once the goal is reached — it never breaks it.
 */
export function weekStreak(workouts, goal, today) {
  const weeks = sessionsByWeek(workouts)
  const current = weekStart(today)
  const thisWeek = weeks.get(current) ?? 0
  let live = 0
  for (let wk = addDays(current, -7); (weeks.get(wk) ?? 0) >= goal; wk = addDays(wk, -7)) live++
  const streak = live + (thisWeek >= goal ? 1 : 0)
  // Longest run of consecutive goal weeks, ever.
  let best = 0
  let run = 0
  let prev = null
  for (const wk of [...weeks.keys()].filter((k) => weeks.get(k) >= goal).sort()) {
    run = prev && addDays(prev, 7) === wk ? run + 1 : 1
    best = Math.max(best, run)
    prev = wk
  }
  return { streak, best: Math.max(best, streak), thisWeek, goal }
}

/**
 * The training days of the week containing `today`, each with a state:
 * done · planned · missed · today · upcoming.
 */
export function weekDays(workouts, today, trainingDays = ['mon', 'tue', 'wed', 'thu', 'fri']) {
  const start = weekStart(today)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
    .filter((d) => trainingDays.includes(weekdayOf(d)))
    .map((date) => {
      const ws = workouts.filter((w) => w.date === date)
      const done = ws.some(trained)
      const planned = ws.some((w) => w.status === 'planned')
      let state = 'upcoming'
      if (done) state = 'done'
      else if (date < today) state = 'missed'
      else if (date === today) state = planned ? 'planned' : 'today'
      else if (planned) state = 'planned'
      return { date, weekday: weekdayOf(date), state, workout: ws[0] ?? null }
    })
}

/** Estimated one-rep max (Epley). */
export const e1rm = (weight, reps) => (weight && reps ? weight * (1 + reps / 30) : 0)

/** Best set per exercise (by estimated 1RM), most recent first. */
export function personalRecords(workouts, limit = 5) {
  const best = new Map()
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      const key = ex.name.trim().toLowerCase()
      if (!key) continue
      for (const s of doneSets(ex)) {
        const score = e1rm(Number(s.weight), s.reps)
        if (!score) continue
        const cur = best.get(key)
        if (!cur || score > cur.score) best.set(key, { name: ex.name.trim(), weight: Number(s.weight), reps: s.reps, score, date: w.date })
      }
    }
  }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score).slice(0, limit)
}

/** Totals for one workout. */
export function workoutStats(w) {
  let sets = 0
  let done = 0
  let volume = 0
  const muscles = new Set()
  for (const ex of w.exercises ?? []) {
    for (const s of ex.sets ?? []) {
      sets++
      if (s.done) {
        done++
        volume += (Number(s.weight) || 0) * (s.reps || 0)
      }
    }
    ;(ex.muscles ?? []).forEach((m) => muscles.add(m))
  }
  return { sets, done, volume, muscles: [...muscles] }
}
