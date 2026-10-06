import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORY_PALETTE } from '../lib/domain'

const MIGRATION_HINT = 'Run supabase/migrations/0013_dashboard.sql in the Supabase SQL editor to enable the Agenda.'
const TABLE = { assignments: 'assignments', subjects: 'assignment_subjects', links: 'dashboard_links' }

/**
 * Agenda data for the signed-in owner: assignments/exams, the subject list
 * and quick links. Writes are optimistic and go through a serial queue;
 * realtime keeps other tabs live.
 */
export function useAgenda(userId, { onError } = {}) {
  const [data, setData] = useState({ assignments: {}, subjects: {}, links: {} })
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
  const report = (err) => {
    const m = err?.message ?? ''
    errorRef.current?.(/assignment|dashboard_links/.test(m) && /relation|schema|exist/.test(m) ? MIGRATION_HINT : m || 'Something went wrong')
  }

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
      const [a, s, l] = await Promise.all(Object.values(TABLE).map((t) => supabase.from(t).select('*')))
      if (cancelled) return
      setLoading(false)
      const error = a.error ?? s.error ?? l.error
      if (error) return report(error)
      const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))
      commit(() => ({ assignments: byId(a.data), subjects: byId(s.data), links: byId(l.data) }))
    })()
    return () => {
      cancelled = true
    }
  }, [userId, commit])

  // ── Realtime ──
  useEffect(() => {
    const apply = (key) => (p) => {
      const id = p.new?.id ?? p.old?.id
      if (!id || pending.current.has(id)) return
      commit((prev) => {
        if (p.eventType === 'DELETE' && !prev[key][id]) return prev
        const map = { ...prev[key] }
        if (p.eventType === 'DELETE') delete map[id]
        else map[id] = p.new
        return { ...prev, [key]: map }
      })
    }
    const channel = supabase.channel(`agenda-${userId}`)
    for (const [key, table] of Object.entries(TABLE)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, apply(key))
      // Deletes aren't filterable by column.
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, apply(key))
    }
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, commit])

  // ── Generic helpers ──
  const insert = useCallback(
    (key, row) => {
      commit((prev) => ({ ...prev, [key]: { ...prev[key], [row.id]: row } }))
      enqueue(
        [row.id],
        () => supabase.from(TABLE[key]).insert({ ...row, user_id: userId }),
        () =>
          commit((prev) => {
            const map = { ...prev[key] }
            delete map[row.id]
            return { ...prev, [key]: map }
          }),
      )
      return row.id
    },
    [commit, enqueue, userId],
  )

  const update = useCallback(
    (key, id, patch, { debounce = 0 } = {}) => {
      if (!ref.current[key][id]) return
      commit((prev) => ({ ...prev, [key]: { ...prev[key], [id]: { ...prev[key][id], ...patch } } }))
      const send = (p) => enqueue([id], () => supabase.from(TABLE[key]).update(p).eq('id', id))
      const t = timers.current.get(id)
      if (!debounce) {
        // Fold any pending debounced patch in, so an older value can't land last.
        if (t) {
          clearTimeout(t.handle)
          timers.current.delete(id)
          release(id)
        }
        return send({ ...(t?.patch ?? {}), ...patch })
      }
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
    [commit, enqueue],
  )

  const remove = useCallback(
    (key, id) => {
      const snapshot = ref.current
      if (!snapshot[key][id]) return
      commit((prev) => {
        const next = { ...prev, [key]: { ...prev[key] } }
        delete next[key][id]
        // Mirror the DB: deleting a subject leaves its assignments without one.
        if (key === 'subjects') {
          next.assignments = Object.fromEntries(
            Object.entries(prev.assignments).map(([aid, a]) => [aid, a.subject_id === id ? { ...a, subject_id: null } : a]),
          )
        }
        return next
      })
      enqueue([id], () => supabase.from(TABLE[key]).delete().eq('id', id), () => commit(() => snapshot))
    },
    [commit, enqueue],
  )

  // ── Actions ──
  const createAssignment = useCallback(
    (fields) =>
      insert('assignments', {
        id: crypto.randomUUID(),
        title: '',
        kind: 'assignment',
        status: 'not_started',
        subject_id: null,
        created_at: new Date().toISOString(),
        ...fields,
      }),
    [insert],
  )

  /** Add a subject (reusing one with the same name); each gets the next palette color. */
  const createSubject = useCallback(
    (name) => {
      const clean = name.trim().slice(0, 80)
      if (!clean) return null
      const all = Object.values(ref.current.subjects)
      const existing = all.find((s) => s.name.toLowerCase() === clean.toLowerCase())
      if (existing) return existing.id
      const position = all.reduce((m, s) => Math.max(m, s.position), -1) + 1
      return insert('subjects', {
        id: crypto.randomUUID(),
        name: clean,
        color: CATEGORY_PALETTE[position % CATEGORY_PALETTE.length],
        position,
        created_at: new Date().toISOString(),
      })
    },
    [insert],
  )

  const createLink = useCallback(
    (fields) => {
      const position = Object.values(ref.current.links).reduce((m, l) => Math.max(m, l.position), -1) + 1
      return insert('links', { id: crypto.randomUUID(), title: '', position, created_at: new Date().toISOString(), ...fields })
    },
    [insert],
  )

  const assignments = useMemo(() => Object.values(data.assignments), [data.assignments])
  const sorted = (map, name) => Object.values(map).sort((a, b) => a.position - b.position || a[name].localeCompare(b[name]))
  const subjects = useMemo(() => sorted(data.subjects, 'name'), [data.subjects])
  const links = useMemo(() => sorted(data.links, 'title'), [data.links])

  return {
    loading,
    assignments,
    createAssignment,
    updateAssignment: (id, patch, opts) => update('assignments', id, patch, opts),
    deleteAssignment: (id) => remove('assignments', id),
    subjects,
    subjectsById: data.subjects,
    createSubject,
    // Same shape as the competition lists, so OptionManager can edit it.
    subjectList: {
      items: subjects,
      create: createSubject,
      rename: (id, name) => update('subjects', id, { name: name.slice(0, 80) }, { debounce: 400 }),
      remove: (id) => remove('subjects', id),
    },
    links,
    createLink,
    updateLink: (id, patch, opts) => update('links', id, patch, opts),
    deleteLink: (id) => remove('links', id),
  }
}
