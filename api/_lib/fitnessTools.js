// MCP tools for the Fitness page: read recovery/progress, and create, edit and
// log workouts. All queries are scoped to `userId` (service-role client).

import {
  MUSCLES,
  MUSCLE_IDS,
  LEVELS,
  addDays,
  recovery,
  suggestGroup,
  weekStreak,
  weekDays,
  setsPerMuscle,
  personalRecords,
  workoutStats,
  isCardio,
  distanceUnit,
} from '../../src/lib/fitness.js'
import { isValidDate } from '../../src/lib/domain.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES = ['planned', 'done', 'skipped']
const KINDS = ['strength', 'cardio']
const must = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const unwrap = ({ data, error }) => {
  if (error) throw new Error(/relation|schema cache/.test(error.message) ? 'Fitness tables missing: run supabase/migrations/0009_fitness.sql and 0016_cardio.sql' : error.message)
  return data
}

const setSchema = {
  type: 'object',
  properties: {
    reps: { type: 'integer', minimum: 0 },
    weight: { type: 'number', minimum: 0, description: "In the user's unit (see get_fitness_summary → settings.unit). Omit for bodyweight." },
    minutes: { type: 'number', minimum: 0, description: 'Cardio only: duration of this interval in minutes.' },
    distance: { type: 'number', minimum: 0, description: 'Cardio only: miles if settings.unit is lb, kilometres if kg.' },
    done: { type: 'boolean', description: 'true once performed. Planned sets are false (default).' },
  },
}
const musclesProp = {
  type: 'array',
  items: { type: 'string', enum: MUSCLE_IDS },
  description: 'Muscles worked, main muscle FIRST (it counts fully toward fatigue; the rest count half). Optional for cardio.',
}
const exerciseSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'e.g. "Bench press", or "Run" for cardio' },
    kind: { type: 'string', enum: KINDS, description: 'Default strength (sets of reps × weight). cardio logs minutes and distance instead.' },
    muscles: musclesProp,
    notes: { type: 'string' },
    sets: {
      type: 'array',
      items: setSchema,
      description: 'One entry per set, e.g. 3 × {reps: 8, weight: 135}. For cardio, one entry per interval, e.g. {minutes: 30, distance: 3}.',
    },
  },
  required: ['name'],
}

export const FITNESS_TOOLS = [
  {
    name: 'get_fitness_summary',
    title: 'Fitness summary',
    description:
      'Start here before planning workouts. Returns the user\'s settings (weight unit, weekly goal, training days — ' +
      'they train on weekdays), current recovery per muscle (Fresh → Fatigued, hours until fresh), this week\'s ' +
      'sessions, their weekly streak, a suggested muscle group, sets per muscle over the last 7 days, recent PRs and ' +
      'the last two weeks of workouts.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_workouts',
    title: 'List workouts',
    description: 'Workouts between two dates (inclusive), with exercises and sets.',
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['from', 'to'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_workout',
    title: 'Get workout',
    description: 'One workout with its exercises and sets (ids included, for logging).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_workout',
    title: 'Create workout',
    description:
      'Plan (or record) a workout with its exercises and sets — strength and/or cardio (kind "cardio": minutes/distance). Planned sets have done=false; the user ticks them ' +
      'off in the app. Pick exercises that fit the user\'s recovery (get_fitness_summary).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'e.g. "Push day"' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string', enum: STATUSES, description: 'Default planned.' },
        notes: { type: 'string' },
        exercises: { type: 'array', items: exerciseSchema },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'update_workout',
    title: 'Update workout',
    description: 'Rename, reschedule, change status (planned/done/skipped) or notes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        date: { type: 'string' },
        status: { type: 'string', enum: STATUSES },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_exercise',
    title: 'Add exercise',
    description: 'Add an exercise (with sets) to an existing workout.',
    inputSchema: { ...exerciseSchema, properties: { workout_id: { type: 'string' }, ...exerciseSchema.properties }, required: ['workout_id', 'name'] },
  },
  {
    name: 'update_exercise',
    title: 'Update exercise',
    description: 'Rename an exercise or change its muscles/notes.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' }, muscles: musclesProp, notes: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'log_sets',
    title: 'Log sets',
    description:
      'Record or edit sets for an exercise (intervals of minutes/distance for cardio). Entries with an id update that set; entries without one are added. ' +
      'remove_set_ids deletes sets.',
    inputSchema: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string' },
        sets: { type: 'array', items: { ...setSchema, properties: { id: { type: 'string' }, ...setSchema.properties } } },
        remove_set_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['exercise_id'],
    },
  },
  {
    name: 'delete_workout',
    title: 'Delete workout',
    description: 'Delete a workout with all its exercises and sets.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { destructiveHint: true },
  },
  {
    name: 'delete_exercise',
    title: 'Delete exercise',
    description: 'Remove an exercise (and its sets) from a workout.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { destructiveHint: true },
  },
]

// ─── helpers ────────────────────────────────────────────────────────────────

function cleanMuscles(list, { optional = false } = {}) {
  if (optional && (list === undefined || list === null)) return []
  must(Array.isArray(list) && (optional || list.length), 'muscles: give at least one muscle')
  const bad = list.filter((m) => !MUSCLE_IDS.includes(m))
  must(!bad.length, `Unknown muscle(s): ${bad.join(', ')}. Valid: ${MUSCLE_IDS.join(', ')}`)
  return [...new Set(list)]
}

function cleanSet(s) {
  const reps = s.reps === undefined || s.reps === null ? null : Number(s.reps)
  const weight = s.weight === undefined || s.weight === null ? null : Number(s.weight)
  must(reps === null || (Number.isInteger(reps) && reps >= 0 && reps <= 1000), 'reps must be a whole number 0–1000')
  must(weight === null || (weight >= 0 && weight <= 10000), 'weight must be 0–10000')
  return { reps, weight, done: Boolean(s.done) }
}

function cleanCardioSet(s) {
  const minutes = s.minutes === undefined || s.minutes === null ? null : Number(s.minutes)
  const distance = s.distance === undefined || s.distance === null ? null : Number(s.distance)
  must(minutes === null || (minutes >= 0 && minutes <= 1440), 'minutes must be 0–1440')
  must(distance === null || (distance >= 0 && distance <= 10000), 'distance must be 0–10000')
  return { minutes, distance, done: Boolean(s.done) }
}

const cleanKind = (kind = 'strength') => {
  must(KINDS.includes(kind), `kind must be one of ${KINDS.join(', ')}`)
  return kind
}
const setCleaner = (kind) => (kind === 'cardio' ? cleanCardioSet : cleanSet)

const localToday = (tz) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

async function loadWorkouts(sb, userId, from, to) {
  const rows = unwrap(
    await sb.from('workouts').select('*, workout_exercises(*, workout_sets(*))').eq('user_id', userId).gte('date', from).lte('date', to),
  )
  return rows
    .map(({ workout_exercises: exs = [], ...w }) => ({
      ...w,
      exercises: exs
        .map(({ workout_sets: sets = [], ...e }) => ({ ...e, sets: sets.sort((a, b) => a.position - b.position) }))
        .sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

const num = (v) => (v === null || v === undefined ? null : Number(v))

function shape(w, unit) {
  const st = workoutStats(w)
  return {
    id: w.id,
    title: w.title,
    date: w.date,
    status: w.status,
    source: w.source,
    notes: w.notes || undefined,
    exercises: w.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind ?? 'strength',
      muscles: e.muscles,
      notes: e.notes || undefined,
      sets: e.sets.map((s) =>
        isCardio(e)
          ? { id: s.id, minutes: num(s.minutes), distance: num(s.distance), done: s.done }
          : { id: s.id, reps: s.reps, weight: num(s.weight), done: s.done },
      ),
    })),
    summary:
      `${st.done}/${st.sets} sets done` +
      (st.volume ? ` · ${Math.round(st.volume)} ${unit} volume` : '') +
      (st.minutes ? ` · ${Math.round(st.minutes)} min cardio` : '') +
      (st.distance ? ` · ${+st.distance.toFixed(2)} ${distanceUnit(unit)}` : ''),
  }
}

async function settingsFor(sb, userId) {
  const s = unwrap(await sb.from('fitness_settings').select('*').eq('user_id', userId).maybeSingle())
  return { unit: 'lb', weekly_goal: 4, training_days: ['mon', 'tue', 'wed', 'thu', 'fri'], ...(s ?? {}) }
}

async function loadOne(sb, userId, id) {
  must(UUID_RE.test(id ?? ''), 'id must be a workout UUID')
  const w = unwrap(await sb.from('workouts').select('*').eq('user_id', userId).eq('id', id).maybeSingle())
  must(w, `Workout ${id} not found`)
  return (await loadWorkouts(sb, userId, w.date, w.date)).find((x) => x.id === id)
}

async function ownedExercise(sb, userId, id) {
  must(UUID_RE.test(id ?? ''), 'exercise id must be a UUID')
  const e = unwrap(await sb.from('workout_exercises').select('*').eq('user_id', userId).eq('id', id).maybeSingle())
  must(e, `Exercise ${id} not found`)
  return e
}

async function insertExercise(sb, userId, workoutId, spec, position) {
  must(typeof spec.name === 'string' && spec.name.trim(), 'Each exercise needs a name')
  const kind = cleanKind(spec.kind)
  const ex = unwrap(
    await sb
      .from('workout_exercises')
      .insert({
        user_id: userId,
        workout_id: workoutId,
        name: spec.name.trim().slice(0, 120),
        kind,
        muscles: cleanMuscles(spec.muscles, { optional: kind === 'cardio' }),
        notes: spec.notes ?? '',
        position,
      })
      .select('*')
      .single(),
  )
  const sets = (spec.sets ?? []).map((s, i) => ({ user_id: userId, exercise_id: ex.id, position: i, ...setCleaner(kind)(s) }))
  if (sets.length) unwrap(await sb.from('workout_sets').insert(sets))
  return ex
}

// ─── implementations ───────────────────────────────────────────────────────

export const fitnessImpl = {
  async get_fitness_summary(sb, userId) {
    const settings = await settingsFor(sb, userId)
    const today = localToday(settings.timezone)
    const workouts = await loadWorkouts(sb, userId, addDays(today, -180), addDays(today, 60))
    const rec = recovery(workouts)
    const streak = weekStreak(workouts, settings.weekly_goal, today)
    const suggestion = suggestGroup(rec)
    return {
      today,
      settings: { unit: settings.unit, weekly_goal: settings.weekly_goal, training_days: settings.training_days },
      recovery: MUSCLES.map((m) => ({
        muscle: m.id,
        label: m.label,
        status: LEVELS[rec[m.id].level].label,
        hours_until_fresh: rec[m.id].hoursToFresh,
        last_trained: rec[m.id].lastTrained,
      })),
      suggested_focus: { group: suggestion.id, muscles: suggestion.hint },
      this_week: { sessions: streak.thisWeek, goal: streak.goal, days: weekDays(workouts, today, settings.training_days).map((d) => ({ date: d.date, state: d.state })) },
      streak_weeks: streak.streak,
      best_streak_weeks: streak.best,
      sets_last_7_days: setsPerMuscle(workouts, addDays(today, -6)),
      personal_records: personalRecords(workouts, 8).map((p) => ({ exercise: p.name, weight: p.weight, reps: p.reps, est_1rm: Math.round(p.score), date: p.date })),
      recent_workouts: workouts.filter((w) => w.date >= addDays(today, -14)).map((w) => shape(w, settings.unit)),
      muscle_ids: MUSCLE_IDS,
    }
  },

  async list_workouts(sb, userId, { from, to }) {
    must(isValidDate(from) && isValidDate(to) && from <= to, 'from/to must be YYYY-MM-DD, from ≤ to')
    const { unit } = await settingsFor(sb, userId)
    return (await loadWorkouts(sb, userId, from, to)).map((w) => shape(w, unit))
  },

  async get_workout(sb, userId, { id }) {
    const { unit } = await settingsFor(sb, userId)
    return shape(await loadOne(sb, userId, id), unit)
  },

  async create_workout(sb, userId, { title, date, status = 'planned', notes = '', exercises = [] }) {
    must(typeof title === 'string', 'title is required')
    must(isValidDate(date), 'date must be YYYY-MM-DD')
    must(STATUSES.includes(status), `status must be one of ${STATUSES.join(', ')}`)
    // Validate everything before writing anything.
    exercises.forEach((e) => {
      const kind = cleanKind(e.kind)
      cleanMuscles(e.muscles, { optional: kind === 'cardio' })
      ;(e.sets ?? []).forEach(setCleaner(kind))
    })
    const w = unwrap(
      await sb
        .from('workouts')
        .insert({ user_id: userId, title: title.slice(0, 120), date, status, notes, source: 'ai', completed_at: status === 'done' ? new Date().toISOString() : null })
        .select('*')
        .single(),
    )
    for (const [i, e] of exercises.entries()) await insertExercise(sb, userId, w.id, e, i)
    return fitnessImpl.get_workout(sb, userId, { id: w.id })
  },

  async update_workout(sb, userId, { id, title, date, status, notes }) {
    const w = await loadOne(sb, userId, id)
    const patch = {}
    if (title !== undefined) patch.title = String(title).slice(0, 120)
    if (notes !== undefined) patch.notes = String(notes)
    if (date !== undefined) {
      must(isValidDate(date), 'date must be YYYY-MM-DD')
      patch.date = date
    }
    if (status !== undefined) {
      must(STATUSES.includes(status), `status must be one of ${STATUSES.join(', ')}`)
      patch.status = status
      patch.completed_at = status === 'done' ? (w.completed_at ?? new Date().toISOString()) : null
    }
    unwrap(await sb.from('workouts').update(patch).eq('user_id', userId).eq('id', w.id))
    return fitnessImpl.get_workout(sb, userId, { id: w.id })
  },

  async add_exercise(sb, userId, { workout_id, ...spec }) {
    const w = await loadOne(sb, userId, workout_id)
    await insertExercise(sb, userId, w.id, spec, w.exercises.length)
    return fitnessImpl.get_workout(sb, userId, { id: w.id })
  },

  async update_exercise(sb, userId, { id, name, muscles, notes }) {
    const e = await ownedExercise(sb, userId, id)
    const patch = {}
    if (name !== undefined) patch.name = String(name).slice(0, 120)
    if (notes !== undefined) patch.notes = String(notes)
    if (muscles !== undefined) patch.muscles = cleanMuscles(muscles, { optional: isCardio(e) })
    unwrap(await sb.from('workout_exercises').update(patch).eq('user_id', userId).eq('id', e.id))
    return fitnessImpl.get_workout(sb, userId, { id: e.workout_id })
  },

  async log_sets(sb, userId, { exercise_id, sets = [], remove_set_ids = [] }) {
    const e = await ownedExercise(sb, userId, exercise_id)
    const existing = unwrap(await sb.from('workout_sets').select('*').eq('user_id', userId).eq('exercise_id', e.id))
    const known = new Set(existing.map((s) => s.id))
    let position = existing.reduce((m, s) => Math.max(m, s.position), -1) + 1
    const clean = setCleaner(e.kind)
    for (const s of sets) {
      if (s.id) {
        must(known.has(s.id), `Set ${s.id} isn't part of this exercise`)
        const patch = {}
        const c = clean(s)
        for (const k of ['reps', 'weight', 'minutes', 'distance']) if (s[k] !== undefined && k in c) patch[k] = c[k]
        if (s.done !== undefined) patch.done = Boolean(s.done)
        unwrap(await sb.from('workout_sets').update(patch).eq('user_id', userId).eq('id', s.id))
      } else {
        unwrap(await sb.from('workout_sets').insert({ user_id: userId, exercise_id: e.id, position: position++, ...clean(s) }))
      }
    }
    for (const id of remove_set_ids) {
      must(known.has(id), `Set ${id} isn't part of this exercise`)
      unwrap(await sb.from('workout_sets').delete().eq('user_id', userId).eq('id', id))
    }
    return fitnessImpl.get_workout(sb, userId, { id: e.workout_id })
  },

  async delete_workout(sb, userId, { id }) {
    const w = await loadOne(sb, userId, id)
    unwrap(await sb.from('workouts').delete().eq('user_id', userId).eq('id', w.id))
    return { deleted: w.id, title: w.title }
  },

  async delete_exercise(sb, userId, { id }) {
    const e = await ownedExercise(sb, userId, id)
    unwrap(await sb.from('workout_exercises').delete().eq('user_id', userId).eq('id', e.id))
    return fitnessImpl.get_workout(sb, userId, { id: e.workout_id })
  },
}
