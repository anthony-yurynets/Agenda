import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const MIGRATION_HINT = 'Run supabase/migrations/0010_competitions.sql through 0015_competition_links.sql in the Supabase SQL editor to enable Competitions.'

/**
 * Competitions and their lists (submission items, projects, groups). `backend`
 * decides where they live: the signed-in owner's tables, or /api/group for a
 * guest with an edit link (see lib/compBackends). Writes are optimistic and go
 * through a serial queue; realtime (owner) or polling (guest) keeps it live.
 */
export function useCompetitions(backend, { onError } = {}) {
  const [data, setData] = useState({ comps: {}, options: {}, projects: {}, groups: {} })
  const [loading, setLoading] = useState(true)
  // Guests: who shared it, and whether the link can edit.
  const [info, setInfo] = useState(null)
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
    errorRef.current?.(/competition|project_id|decision|group_ids/.test(m) && /relation|schema|exist/.test(m) ? MIGRATION_HINT : m || 'Something went wrong')
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

  // ── Load (guests reload on a timer: a fresh snapshot is how they learn about others' changes) ──
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!backend.pollMs) return
    const bump = () => document.visibilityState === 'visible' && setTick((t) => t + 1)
    const timer = setInterval(bump, backend.pollMs)
    window.addEventListener('focus', bump)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', bump)
    }
  }, [backend])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await backend.load()
      if (cancelled) return
      setLoading(false)
      if (res.error) return report(res.error)
      if (res.info) setInfo(res.info)
      const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))
      commit((prev) => {
        const next = { comps: byId(res.data.comps), options: byId(res.data.options), projects: byId(res.data.projects), groups: byId(res.data.groups) }
        // Keep rows with local edits still in flight.
        for (const id of pending.current.keys()) for (const key of Object.keys(next)) if (prev[key][id]) next[key][id] = prev[key][id]
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [backend, tick, commit])

  // ── Realtime (owner only) ──
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
    return backend.subscribe(apply)
  }, [backend, commit])

  // ── Generic helpers ──
  const insert = useCallback(
    (key, row) => {
      commit((prev) => ({ ...prev, [key]: { ...prev[key], [row.id]: row } }))
      enqueue(
        [row.id],
        () => backend.insert(key, row),
        () =>
          commit((prev) => {
            const map = { ...prev[key] }
            delete map[row.id]
            return { ...prev, [key]: map }
          }),
      )
      return row.id
    },
    [backend, commit, enqueue],
  )

  const update = useCallback(
    (key, id, patch, { debounce = 0 } = {}) => {
      if (!ref.current[key][id]) return
      commit((prev) => ({ ...prev, [key]: { ...prev[key], [id]: { ...prev[key][id], ...patch } } }))
      const send = (p) => enqueue([id], () => backend.update(key, id, p))
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
    [backend, commit, enqueue],
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
        // …and deleting a project sends its competitions back to undecided.
        if (key === 'projects') {
          next.comps = Object.fromEntries(Object.entries(prev.comps).map(([cid, c]) => [cid, c.project_id === id ? { ...c, project_id: null } : c]))
        }
        // …and deleting a group takes its competitions out of it.
        if (key === 'groups') {
          next.comps = Object.fromEntries(
            Object.entries(prev.comps).map(([cid, c]) => [cid, c.group_ids?.includes(id) ? { ...c, group_ids: c.group_ids.filter((x) => x !== id) } : c]),
          )
        }
        return next
      })
      enqueue([id], () => backend.remove(key, id), () => commit(() => snapshot))
    },
    [backend, commit, enqueue],
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
        group_ids: [],
        timeline: [],
        source: 'user',
        created_at: new Date().toISOString(),
        ...fields,
      }),
    [insert],
  )

  /** Add a named entry to a user list (options or projects); reuses an existing one with the same name. */
  const createNamed = useCallback(
    (key, name) => {
      const clean = name.trim().slice(0, 80)
      if (!clean) return null
      const existing = Object.values(ref.current[key]).find((o) => o.name.toLowerCase() === clean.toLowerCase())
      if (existing) return existing.id
      const position = Object.values(ref.current[key]).reduce((m, o) => Math.max(m, o.position), -1) + 1
      return insert(key, { id: crypto.randomUUID(), name: clean, position, created_at: new Date().toISOString() })
    },
    [insert],
  )

  /** "Are we doing this?": a project id (doing), 'maybe', 'no', or null (undecided). */
  const setDecision = useCallback(
    (id, answer) =>
      update('comps', id, answer === 'maybe' || answer === 'no' ? { decision: answer, project_id: null } : { decision: null, project_id: answer ?? null }),
    [update],
  )

  const competitions = useMemo(() => Object.values(data.comps), [data.comps])
  const sorted = (map) => Object.values(map).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  const options = useMemo(() => sorted(data.options), [data.options])
  const projects = useMemo(() => sorted(data.projects), [data.projects])
  const groups = useMemo(() => sorted(data.groups), [data.groups])

  // Guests can add to the lists but not rename or delete; groups are the owner's to manage.
  const guest = backend.kind !== 'owner'
  const named = (key) => ({
    items: { options, projects, groups }[key],
    ...(key === 'groups' && guest ? {} : { create: (name) => createNamed(key, name) }),
    ...(guest ? {} : { rename: (id, name) => update(key, id, { name: name.slice(0, 80) }, { debounce: 400 }), remove: (id) => remove(key, id) }),
  })

  return {
    loading,
    guest,
    info,
    competitions,
    options,
    optionsById: data.options,
    createCompetition,
    updateCompetition: (id, patch, opts) => update('comps', id, patch, opts),
    deleteCompetition: (id) => remove('comps', id),
    setDecision,
    // Named lists share one shape: { items, create, rename, remove }.
    optionList: named('options'),
    projects,
    projectsById: data.projects,
    projectList: named('projects'),
    groups,
    groupsById: data.groups,
    groupList: named('groups'),
  }
}
