import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addDays } from '../lib/fitness'

const HISTORY_DAYS = 180
const AHEAD_DAYS = 60
const DEFAULT_SETTINGS = { unit: 'lb', weekly_goal: 4, training_days: ['mon', 'tue', 'wed', 'thu', 'fri'] }
const MIGRATION_HINT = 'Run supabase/migrations/0009_fitness.sql and 0016_cardio.sql in the Supabase SQL editor to enable Fitness.'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Fitness data for the signed-in owner: workouts → exercises → sets, kept as
 * flat maps and served nested. Writes are optimistic and go through a serial
 * queue (parents before children); realtime keeps AI-created workouts live.
 */
export function useFitness(userId, { onError } = {}) {
  const [data, setData] = useState({ workouts: {}, exercises: {}, sets: {} })
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const ref = useRef(data)
  const errorRef = useRef(onError)
  useEffect(() => {
    errorRef.current = onError
  })

  const commit = useCallback((fn) => {
    const next = fn(ref.current)
    if (next === ref.current) return
    ref.current = next
    setData(next)
  }, [])

  const queue = useRef(Promise.resolve())
  const pending = useRef(new Map())
  const timers = useRef(new Map())
  const hold = (id) => pending.current.set(id, (pending.current.get(id) ?? 0) + 1)
  const release = (id) => {
    const n = (pending.current.get(id) ?? 1) - 1
    if (n <= 0) pending.current.delete(id)
    else pending.current.set(id, n)
  }
  const report = (err) => errorRef.current?.(/workout|fitness|kind|minutes|distance/.test(err?.message ?? '') && /relation|schema|exist/.test(err?.message ?? '') ? MIGRATION_HINT : (err?.message ?? 'Something went wrong'))

  const enqueue = useCallback((ids, fn, rollback) => {
    ids.forEach(hold)
    queue.current = queue.current
      .then(async () => {
        const res = await fn()
        if (res?.error) throw res.error
      })
      .catch((err) => {
        rollback?.()
        report(err)
      })
      .finally(() => ids.forEach(release))
  }, [])

  // ── Load ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const today = localToday()
      const [w, s] = await Promise.all([
        supabase
          .from('workouts')
          .select('*, workout_exercises(*, workout_sets(*))')
          .gte('date', addDays(today, -HISTORY_DAYS))
          .lte('date', addDays(today, AHEAD_DAYS)),
        supabase.from('fitness_settings').select('*').maybeSingle(),
      ])
      if (cancelled) return
      setLoading(false)
      if (w.error) return report(w.error)
      if (s.data) setSettings({ ...DEFAULT_SETTINGS, ...s.data })
      // Keep the user's time zone on record so the AI (MCP) knows what "today" is.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!s.error && s.data?.timezone !== tz) supabase.from('fitness_settings').upsert({ user_id: userId, timezone: tz }).then(() => {})
      const next = { workouts: {}, exercises: {}, sets: {} }
      for (const { workout_exercises: exs = [], ...wk } of w.data) {
        next.workouts[wk.id] = wk
        for (const { workout_sets: sets = [], ...ex } of exs) {
          next.exercises[ex.id] = ex
          for (const st of sets) next.sets[st.id] = st
        }
      }
      commit(() => next)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, commit])

  // ── Realtime ──
  useEffect(() => {
    const tableKey = { workouts: 'workouts', workout_exercises: 'exercises', workout_sets: 'sets' }
    let channel = supabase.channel(`fitness-${userId}`)
    for (const table of Object.keys(tableKey)) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, (p) => {
        const id = p.new?.id ?? p.old?.id
        if (!id || pending.current.has(id)) return
        const key = tableKey[table]
        commit((prev) => {
          const map = { ...prev[key] }
          if (p.eventType === 'DELETE') delete map[id]
          else map[id] = p.new
          return { ...prev, [key]: map }
        })
      })
    }
    channel.subscribe()
    // Deletes aren't filterable by column; cascades arrive here too.
    const deletes = supabase.channel(`fitness-del-${userId}`)
    for (const table of Object.keys(tableKey)) {
      deletes.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        const id = p.old?.id
        if (!id || pending.current.has(id)) return
        commit((prev) => {
          const key = tableKey[table]
          if (!prev[key][id]) return prev
          const map = { ...prev[key] }
          delete map[id]
          return { ...prev, [key]: map }
        })
      })
    }
    deletes.subscribe()
    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(deletes)
    }
  }, [userId, commit])

  // ── Generic helpers ──
  const TABLE = { workouts: 'workouts', exercises: 'workout_exercises', sets: 'workout_sets' }

  const insert = useCallback(
    (key, row) => {
      commit((prev) => ({ ...prev, [key]: { ...prev[key], [row.id]: row } }))
      const { id, ...rest } = row
      enqueue(
        [id],
        () => supabase.from(TABLE[key]).insert({ id, ...rest, user_id: userId }),
        () =>
          commit((prev) => {
            const map = { ...prev[key] }
            delete map[id]
            return { ...prev, [key]: map }
          }),
      )
      return id
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, enqueue, userId],
  )

  const update = useCallback(
    (key, id, patch, { debounce = 0 } = {}) => {
      const before = ref.current[key][id]
      if (!before) return
      commit((prev) => ({ ...prev, [key]: { ...prev[key], [id]: { ...prev[key][id], ...patch } } }))
      const send = (p) => enqueue([id], () => supabase.from(TABLE[key]).update(p).eq('id', id))
      if (!debounce) return send(patch)
      const t = timers.current.get(id)
      if (t) clearTimeout(t.handle)
      else hold(id)
      const merged = { ...(t?.patch ?? {}), ...patch }
      timers.current.set(id, {
        patch: merged,
        handle: setTimeout(() => {
          timers.current.delete(id)
          release(id)
          send(merged)
        }, debounce),
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, enqueue],
  )

  const remove = useCallback(
    (key, id) => {
      const snapshot = ref.current
      if (!snapshot[key][id]) return
      // Drop the row and anything that cascades from it.
      commit((prev) => {
        const next = { workouts: { ...prev.workouts }, exercises: { ...prev.exercises }, sets: { ...prev.sets } }
        delete next[key][id]
        const exIds =
          key === 'workouts' ? Object.values(prev.exercises).filter((e) => e.workout_id === id).map((e) => e.id) : key === 'exercises' ? [id] : []
        for (const e of exIds) delete next.exercises[e]
        for (const s of Object.values(prev.sets)) if (exIds.includes(s.exercise_id)) delete next.sets[s.id]
        return next
      })
      enqueue([id], () => supabase.from(TABLE[key]).delete().eq('id', id), () => commit(() => snapshot))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, enqueue],
  )

  // ── Actions ──
  const createWorkout = useCallback(
    (fields = {}) =>
      insert('workouts', { id: crypto.randomUUID(), title: '', date: localToday(), status: 'planned', notes: '', source: 'user', ...fields }),
    [insert],
  )

  const addExercise = useCallback(
    (workoutId, fields = {}) => {
      const position = Object.values(ref.current.exercises).filter((e) => e.workout_id === workoutId).length
      const cardio = fields.kind === 'cardio'
      const id = insert('exercises', { id: crypto.randomUUID(), workout_id: workoutId, name: '', muscles: [], notes: '', position, ...fields })
      // Cardio starts with one interval (minutes, distance); strength with three sets.
      const blank = cardio ? { minutes: null, distance: null } : { reps: null, weight: null }
      for (let i = 0; i < (cardio ? 1 : 3); i++) insert('sets', { id: crypto.randomUUID(), exercise_id: id, position: i, ...blank, done: false })
      return id
    },
    [insert],
  )

  const addSet = useCallback(
    (exerciseId) => {
      const sets = Object.values(ref.current.sets)
        .filter((s) => s.exercise_id === exerciseId)
        .sort((a, b) => a.position - b.position)
      const last = sets[sets.length - 1]
      const cardio = ref.current.exercises[exerciseId]?.kind === 'cardio'
      return insert('sets', {
        id: crypto.randomUUID(),
        exercise_id: exerciseId,
        position: (last?.position ?? -1) + 1,
        ...(cardio
          ? { minutes: last?.minutes ?? null, distance: last?.distance ?? null }
          : { reps: last?.reps ?? null, weight: last?.weight ?? null }),
        done: false,
      })
    },
    [insert],
  )

  /** Marking a workout done also records when (the DB trigger does the same). */
  const setWorkoutStatus = useCallback(
    (id, status) => update('workouts', id, { status, completed_at: status === 'done' ? new Date().toISOString() : null }),
    [update],
  )

  const saveSettings = useCallback(
    async (patch) => {
      const next = { ...settings, ...patch }
      setSettings(next)
      const { error } = await supabase.from('fitness_settings').upsert({ user_id: userId, ...patch })
      if (error) report(error)
    },
     
    [settings, userId],
  )

  // Nested view: workouts (newest first) with their exercises and sets.
  const workouts = useMemo(() => {
    const setsBy = {}
    for (const s of Object.values(data.sets)) (setsBy[s.exercise_id] ??= []).push(s)
    const exBy = {}
    for (const e of Object.values(data.exercises)) {
      ;(exBy[e.workout_id] ??= []).push({ ...e, sets: (setsBy[e.id] ?? []).sort((a, b) => a.position - b.position) })
    }
    return Object.values(data.workouts)
      .map((w) => ({ ...w, exercises: (exBy[w.id] ?? []).sort((a, b) => a.position - b.position) }))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }, [data])

  return {
    loading,
    workouts,
    settings,
    saveSettings,
    createWorkout,
    updateWorkout: (id, patch, opts) => update('workouts', id, patch, opts),
    setWorkoutStatus,
    deleteWorkout: (id) => remove('workouts', id),
    addExercise,
    updateExercise: (id, patch, opts) => update('exercises', id, patch, opts),
    deleteExercise: (id) => remove('exercises', id),
    addSet,
    updateSet: (id, patch, opts) => update('sets', id, patch, opts),
    deleteSet: (id) => remove('sets', id),
  }
}

export { localToday }
