import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_TARGET, DEFAULT_TEST_DATE, QUESTIONS, gradeOf, guessAmcCompetition, isMiss, tally } from '../lib/amc'

const MIGRATION_HINT = 'Run supabase/migrations/0014_amc_prep.sql in the Supabase SQL editor to enable AMC Prep.'
const TABLE = { mocks: 'amc_mocks', errors: 'amc_errors' }
// Seeded on first visit: the diagnostic taken the night before the plan starts.
const DIAGNOSTIC = { name: 'AMC 10A 2022 (diagnostic)', date: '2026-10-11' }

/**
 * AMC prep for the signed-in owner: one settings row (test date, target, plan
 * and checklist ticks, linked competition), mock scores and the error log.
 * Writes are optimistic and go through a serial queue; realtime keeps other
 * tabs and the AI live.
 */
export function useAmcPrep(userId, { onError } = {}) {
  const [data, setData] = useState({ prep: null, mocks: {}, errors: {} })
  const [competitions, setCompetitions] = useState([])
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
    errorRef.current?.(/amc_/.test(m) && /relation|schema|exist/.test(m) ? MIGRATION_HINT : m || 'Something went wrong')
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

  // ── Load (and seed the settings row + diagnostic on first visit) ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [p, m, e, c] = await Promise.all([
        supabase.from('amc_prep').select('*').maybeSingle(),
        supabase.from('amc_mocks').select('*'),
        supabase.from('amc_errors').select('*'),
        supabase.from('competitions').select('id, name, url, timeline'),
      ])
      if (cancelled) return
      setLoading(false)
      if (!c.error) setCompetitions(c.data)
      const error = p.error ?? m.error ?? e.error
      if (error) return report(error)
      const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))
      let prep = p.data
      const mocks = byId(m.data)
      if (!prep) {
        prep = {
          user_id: userId,
          competition_id: guessAmcCompetition(c.data ?? [])?.id ?? null,
          test_date: DEFAULT_TEST_DATE,
          target_score: DEFAULT_TARGET,
          plan_done: [],
          topics_done: [],
          block_ids: [],
          notes: '',
        }
        enqueue(['prep'], () => supabase.from('amc_prep').insert(prep))
        if (!m.data.some((x) => x.name === DIAGNOSTIC.name)) {
          const diag = { id: crypto.randomUUID(), ...DIAGNOSTIC, correct: null, blank: null, wrong: null, created_at: new Date().toISOString() }
          mocks[diag.id] = diag
          enqueue([diag.id], () => supabase.from('amc_mocks').insert({ ...diag, user_id: userId }))
        }
      }
      commit(() => ({ prep, mocks, errors: byId(e.data) }))
    })()
    return () => {
      cancelled = true
    }
  }, [userId, commit, enqueue])

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
    const channel = supabase.channel(`amc-${userId}`)
    for (const [key, table] of Object.entries(TABLE)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, apply(key))
      // Deletes aren't filterable by column.
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, apply(key))
    }
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'amc_prep', filter: `user_id=eq.${userId}` }, (p) => {
      if (!pending.current.has('prep') && p.new) commit((prev) => ({ ...prev, prep: p.new }))
    })
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, commit])

  // ── Settings row ──
  const savePrep = useCallback(
    (patch, { debounce = 0 } = {}) => {
      const before = ref.current.prep
      if (!before) return
      commit((prev) => ({ ...prev, prep: { ...prev.prep, ...patch } }))
      const send = (p) => enqueue(['prep'], () => supabase.from('amc_prep').update(p).eq('user_id', userId))
      const t = timers.current.get('prep')
      if (!debounce) {
        if (t) {
          clearTimeout(t.handle)
          timers.current.delete('prep')
          release('prep')
        }
        return send({ ...(t?.patch ?? {}), ...patch })
      }
      if (t) clearTimeout(t.handle)
      else hold('prep')
      const merged = { ...(t?.patch ?? {}), ...patch }
      timers.current.set('prep', {
        patch: merged,
        handle: setTimeout(() => {
          timers.current.delete('prep')
          release('prep')
          send(merged)
        }, debounce),
      })
    },
    [commit, enqueue, userId],
  )

  /** Add or remove a value in one of the settings row's arrays (plan_done, topics_done). */
  const toggleIn = useCallback(
    (field, value) => {
      const list = ref.current.prep?.[field] ?? []
      savePrep({ [field]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] })
    },
    [savePrep],
  )

  // ── Mocks and errors ──
  const insert = useCallback(
    (key, fields) => {
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...fields }
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
    (key, id, patch) => {
      const before = ref.current[key][id]
      if (!before) return
      commit((prev) => ({ ...prev, [key]: { ...prev[key], [id]: { ...prev[key][id], ...patch } } }))
      enqueue(
        [id],
        () => supabase.from(TABLE[key]).update(patch).eq('id', id),
        () => commit((prev) => (prev[key][id] ? { ...prev, [key]: { ...prev[key], [id]: before } } : prev)),
      )
    },
    [commit, enqueue],
  )

  const remove = useCallback(
    (key, id) => {
      const before = ref.current[key][id]
      if (!before) return
      commit((prev) => {
        const map = { ...prev[key] }
        delete map[id]
        return { ...prev, [key]: map }
      })
      enqueue([id], () => supabase.from(TABLE[key]).delete().eq('id', id), () => commit((prev) => ({ ...prev, [key]: { ...prev[key], [id]: before } })))
    },
    [commit, enqueue],
  )

  // ── Mock review ──
  /**
   * Keeps the error log in step with one problem of a reviewed mock: a miss
   * (wrong, or blank on #1–18) has exactly one row, anything else has none.
   * `test` is the loaded test ({ label, problems }).
   */
  const syncError = useCallback(
    (mockId, n, entry, test) => {
      const problem = test.problems.find((p) => p.n === n)
      const grade = gradeOf(entry, problem)
      const existing = Object.values(ref.current.errors).find((e) => e.mock_id === mockId && e.problem === n)
      if (!isMiss(grade, n)) {
        if (existing) remove('errors', existing.id)
        return
      }
      const fields = {
        test: test.label,
        topic: entry?.topic ?? problem?.topic ?? 'algebra',
        reason: entry?.reason ?? (grade === 'blank' ? 'time' : 'concept'),
        key_idea: (entry?.note || problem?.hint || '').slice(0, 2000),
      }
      if (!existing) insert('errors', { ...fields, problem: n, mock_id: mockId, redone: false })
      else if (Object.entries(fields).some(([k, v]) => existing[k] !== v)) update('errors', existing.id, fields)
    },
    [insert, update, remove],
  )

  /** Fills the score in from the answers once every problem has been entered. */
  const mockPatch = (answers, test) => {
    const t = tally(answers, test.problems)
    return t.done ? { answers, correct: t.correct, blank: t.blank, wrong: t.wrong } : { answers }
  }

  /** Saves what was put on problem n (pick / key / note / reason / topic; '' clears a field). */
  const answerProblem = useCallback(
    (mockId, n, patch, test) => {
      const mock = ref.current.mocks[mockId]
      if (!mock) return
      const entry = Object.fromEntries(Object.entries({ ...mock.answers?.[n], ...patch }).filter(([, v]) => v !== '' && v != null))
      const answers = { ...mock.answers }
      if (Object.keys(entry).length) answers[n] = entry
      else delete answers[n]
      update('mocks', mockId, mockPatch(answers, test))
      syncError(mockId, n, entry, test)
    },
    [update, syncError],
  )

  /** Points a mock at a test (or none) and regrades every problem against it. */
  const setMockTest = useCallback(
    (mockId, test) => {
      const mock = ref.current.mocks[mockId]
      if (!mock) return
      const answers = mock.answers ?? {}
      update('mocks', mockId, test ? { test_id: test.id, ...mockPatch(answers, test) } : { test_id: null })
      for (let n = 1; n <= QUESTIONS; n++) {
        if (test) syncError(mockId, n, answers[n], test)
        else {
          const e = Object.values(ref.current.errors).find((x) => x.mock_id === mockId && x.problem === n)
          if (e) remove('errors', e.id)
        }
      }
    },
    [update, remove, syncError],
  )

  const mocks = useMemo(() => Object.values(data.mocks), [data.mocks])
  const errors = useMemo(
    () => Object.values(data.errors).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [data.errors],
  )

  return {
    loading,
    prep: data.prep,
    competitions,
    savePrep,
    toggleIn,
    mocks,
    addMock: (fields) => insert('mocks', fields),
    updateMock: (id, patch) => update('mocks', id, patch),
    deleteMock: (id) => remove('mocks', id),
    answerProblem,
    setMockTest,
    errors,
    addError: (fields) => insert('errors', fields),
    updateError: (id, patch) => update('errors', id, patch),
    deleteError: (id) => remove('errors', id),
  }
}
