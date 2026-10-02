import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const MIGRATION_HINT = 'Run supabase/migrations/0010_competitions.sql in the Supabase SQL editor to enable Competitions.'
const TABLE = { comps: 'competitions', options: 'competition_options' }

/**
 * Competitions and submission-item options for the signed-in owner. Writes
 * are optimistic and go through a serial queue; realtime keeps AI edits live.
 */
export function useCompetitions(userId, { onError } = {}) {
  const [data, setData] = useState({ comps: {}, options: {} })
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
    errorRef.current?.(/competition/.test(m) && /relation|schema|exist/.test(m) ? MIGRATION_HINT : m || 'Something went wrong')
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
      const [c, o] = await Promise.all([supabase.from('competitions').select('*'), supabase.from('competition_options').select('*')])
      if (cancelled) return
      setLoading(false)
      if (c.error || o.error) return report(c.error ?? o.error)
      commit(() => ({
        comps: Object.fromEntries(c.data.map((r) => [r.id, r])),
        options: Object.fromEntries(o.data.map((r) => [r.id, r])),
      }))
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
    const channel = supabase.channel(`competitions-${userId}`)
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
        // Mirror the DB trigger: deleting an option removes it from competitions.
        if (key === 'options') {
          next.comps = Object.fromEntries(
            Object.entries(prev.comps).map(([cid, c]) => [cid, c.submission_items?.includes(id) ? { ...c, submission_items: c.submission_items.filter((x) => x !== id) } : c]),
          )
        }
        return next
      })
      enqueue([id], () => supabase.from(TABLE[key]).delete().eq('id', id), () => commit(() => snapshot))
    },
    [commit, enqueue],
  )

  // ── Actions ──
  const createCompetition = useCallback(
    (fields = {}) =>
      insert('comps', {
        id: crypto.randomUUID(),
        name: '',
        url: '',
        description: '',
        prestige: null,
        category: 'other',
        submission_items: [],
        timeline: [],
        source: 'user',
        created_at: new Date().toISOString(),
        ...fields,
      }),
    [insert],
  )

  const createOption = useCallback(
    (name) => {
      const clean = name.trim().slice(0, 80)
      if (!clean) return null
      const existing = Object.values(ref.current.options).find((o) => o.name.toLowerCase() === clean.toLowerCase())
      if (existing) return existing.id
      const position = Object.values(ref.current.options).reduce((m, o) => Math.max(m, o.position), -1) + 1
      return insert('options', { id: crypto.randomUUID(), name: clean, position, created_at: new Date().toISOString() })
    },
    [insert],
  )

  const competitions = useMemo(() => Object.values(data.comps), [data.comps])
  const options = useMemo(() => Object.values(data.options).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [data.options])

  return {
    loading,
    competitions,
    options,
    optionsById: data.options,
    createCompetition,
    updateCompetition: (id, patch, opts) => update('comps', id, patch, opts),
    deleteCompetition: (id) => remove('comps', id),
    createOption,
    renameOption: (id, name) => update('options', id, { name: name.slice(0, 80) }, { debounce: 400 }),
    deleteOption: (id) => remove('options', id),
  }
}
