import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_CATEGORIES,
  CATEGORY_PALETTE,
  divideRange,
  fromMinutes,
  toMinutes,
  isOccurrenceId,
  splitOccurrenceId,
  DAY_MINUTES,
} from '../lib/domain'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Rows use minutes in the UI; convert at the edges.
const fromRow = (r) => ({
  id: r.id,
  parent_id: r.parent_id,
  title: r.title,
  date: r.date,
  start: toMinutes(r.start_time),
  end: toMinutes(r.end_time),
  category_id: r.category_id,
  status: r.status,
  notes: r.notes ?? '',
  source: r.source,
  repeat: r.repeat ?? null,
  repeat_exdates: r.repeat_exdates ?? [],
  recurrence_id: r.recurrence_id ?? null,
  recurrence_date: r.recurrence_date ?? null,
  bookable: r.bookable ?? false,
  all_day: r.all_day ?? false,
  hide_upcoming: r.hide_upcoming ?? false,
})

const toRow = (b, userId) => ({
  id: b.id,
  user_id: userId,
  parent_id: b.parent_id ?? null,
  title: b.title ?? '',
  date: b.date,
  start_time: fromMinutes(b.start),
  end_time: fromMinutes(b.end),
  category_id: b.category_id ?? null,
  status: b.status,
  notes: b.notes ?? '',
  source: b.source ?? 'user',
  repeat: b.repeat ?? null,
  repeat_exdates: b.repeat_exdates ?? [],
  recurrence_id: b.recurrence_id ?? null,
  recurrence_date: b.recurrence_date ?? null,
  bookable: b.bookable ?? false,
  all_day: b.all_day ?? false,
  // Only sent when set: guests' share API and databases without 0013 don't know it.
  ...(b.hide_upcoming ? { hide_upcoming: true } : {}),
})

const patchToRow = (patch) => {
  const row = {}
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'start') row.start_time = fromMinutes(v)
    else if (k === 'end') row.end_time = fromMinutes(v)
    else row[k] = v
  }
  return row
}

const childrenOf = (all, id) => Object.values(all).filter((b) => b.parent_id === id)
const findException = (all, templateId, date) =>
  Object.values(all).find((b) => b.recurrence_id === templateId && b.recurrence_date === date)

const MIGRATION_HINT = 'Your database is missing a migration: run the files in supabase/migrations (in order) in the Supabase SQL editor.'

/**
 * The calendar store. `backend` decides where data lives: the signed-in owner's
 * Supabase tables, or the share-link API for a guest editor (see lib/backends).
 */
export function useCalendar(backend, { rangeStart, rangeEnd, onError }) {
  const userId = backend.userId
  const [blocks, setBlocks] = useState({})
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // blocksRef is updated synchronously by commit(), so an action can build on
  // the result of the previous one in the same event (e.g. materialize → edit).
  const blocksRef = useRef(blocks)
  const commit = useCallback((fn) => {
    const next = fn(blocksRef.current)
    if (next === blocksRef.current) return
    blocksRef.current = next
    setBlocks(next)
  }, [])

  const errorRef = useRef(onError)
  useLayoutEffect(() => {
    errorRef.current = onError
  })

  // Serial write queue: keeps parent inserts ahead of child inserts, and
  // lets the UI stay fully optimistic.
  const queue = useRef(Promise.resolve())
  const pending = useRef(new Map()) // id -> count of in-flight writes
  const timers = useRef(new Map())

  const hold = (id) => pending.current.set(id, (pending.current.get(id) ?? 0) + 1)
  const release = (id) => {
    const n = (pending.current.get(id) ?? 1) - 1
    if (n <= 0) pending.current.delete(id)
    else pending.current.set(id, n)
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
        const msg = err.message ?? 'Something went wrong'
        errorRef.current?.(/repeat|recurrence|bookable|all_day|hide_upcoming|source_check|status_check/.test(msg) ? MIGRATION_HINT : msg)
      })
      .finally(() => ids.forEach(release))
  }, [])

  const upsertLocal = useCallback(
    (rows) =>
      commit((prev) => {
        const next = { ...prev }
        for (const r of rows) if (!pending.current.has(r.id)) next[r.id] = fromRow(r)
        return next
      }),
    [commit],
  )

  // ── Initial categories (seed defaults on first visit) ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await backend.loadCategories()
      if (cancelled) return
      if (error) return errorRef.current?.(error.message)
      if (data.length || !backend.canSeedCategories) return setCategories(data)
      const seed = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: crypto.randomUUID(), user_id: userId, position: i }))
      setCategories(seed)
      const res = await backend.insertCategories(seed)
      if (res.error) errorRef.current?.(res.error.message)
    })()
    return () => {
      cancelled = true
    }
  }, [backend, userId])

  // Guests have no realtime, so their backend asks to be polled (and we refresh on focus).
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

  // ── Blocks for the visible range, plus any series that reach into it ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await backend.loadBlocks(rangeStart, rangeEnd)
      if (cancelled) return
      setLoading(false)
      if (res.error) return errorRef.current?.(res.error.message)
      if (res.outdatedSchema) errorRef.current?.(MIGRATION_HINT)
      if (backend.pollMs) {
        // A polled snapshot is authoritative (it's how guests learn about deletes),
        // except for rows with local edits still in flight.
        commit((prev) => {
          const next = {}
          for (const r of res.data) next[r.id] = fromRow(r)
          for (const id of pending.current.keys()) if (prev[id]) next[id] = prev[id]
          return next
        })
        if (res.categories) setCategories(res.categories)
      } else upsertLocal(res.data)
    })()
    return () => {
      cancelled = true
    }
  }, [backend, rangeStart, rangeEnd, tick, commit, upsertLocal])

  /** Load an extra date range into the store (the Agenda's "Coming up"). Owner only: guests' polls replace the store. */
  const loadRange = useCallback(
    async (from, to) => {
      if (backend.pollMs) return
      const res = await backend.loadBlocks(from, to)
      if (res.error) return errorRef.current?.(res.error.message)
      upsertLocal(res.data)
    },
    [backend, upsertLocal],
  )

  // ── Realtime: changes from the MCP server, shared editors, bookings, other tabs ──
  useEffect(() => {
    const removeLocal = (id) =>
      commit((prev) => {
        if (!prev[id]) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })
    return backend.subscribe({
      onBlock: (row) => row?.id && !pending.current.has(row.id) && upsertLocal([row]),
      onBlockDelete: (id) => id && !pending.current.has(id) && removeLocal(id),
      onCategory: (row) => {
        if (!row?.id || pending.current.has(row.id)) return
        setCategories((prev) =>
          prev.some((c) => c.id === row.id) ? prev.map((c) => (c.id === row.id ? row : c)) : [...prev, row],
        )
      },
      onCategoryDelete: (id) => id && !pending.current.has(id) && setCategories((prev) => prev.filter((c) => c.id !== id)),
    })
  }, [backend, commit, upsertLocal])

  // ── Helpers ──
  const removeLocalRows = useCallback(
    (ids) =>
      commit((prev) => {
        const next = { ...prev }
        ids.forEach((i) => delete next[i])
        return next
      }),
    [commit],
  )

  /** Insert rows parent-first (the DB trigger checks the parent exists). */
  const insertTree = useCallback(
    (rows) => {
      const byDepth = []
      const depth = new Map()
      for (const r of rows) {
        const d = r.parent_id && depth.has(r.parent_id) ? depth.get(r.parent_id) + 1 : 0
        depth.set(r.id, d)
        ;(byDepth[d] ??= []).push(toRow(r, userId))
      }
      enqueue(
        rows.map((r) => r.id),
        async () => {
          for (const level of byDepth) {
            const res = await backend.insertBlocks(level)
            if (res.error) return res
          }
          return {}
        },
        () => removeLocalRows(rows.map((r) => r.id)),
      )
    },
    [backend, enqueue, removeLocalRows, userId],
  )

  /**
   * Turn a virtual occurrence into real rows (a copy of the series' tree on that
   * date) so it can be edited on its own. Returns the real id for `occId`.
   */
  const materialize = useCallback(
    (occId) => {
      const { templateId, date } = splitOccurrenceId(occId)
      const all = blocksRef.current
      const existing = findException(all, templateId, date)
      if (existing) return existing.id
      const tpl = all[templateId]
      if (!tpl) return null

      let root = tpl
      while (root.parent_id && all[root.parent_id]) root = all[root.parent_id]

      const created = []
      const copy = (src, parentId) => {
        const row = {
          ...src,
          id: crypto.randomUUID(),
          parent_id: parentId,
          date,
          repeat: null,
          repeat_exdates: [],
          recurrence_id: src.id,
          recurrence_date: date,
        }
        created.push(row)
        for (const c of childrenOf(all, src.id)) copy(c, row.id)
      }
      copy(root, null)

      commit((prev) => {
        const next = { ...prev }
        for (const r of created) next[r.id] = r
        return next
      })
      insertTree(created)
      return created.find((r) => r.recurrence_id === templateId)?.id ?? null
    },
    [commit, insertTree],
  )

  const resolve = useCallback((id) => (isOccurrenceId(id) ? materialize(id) : id), [materialize])

  // ── Block actions ──
  const createBlock = useCallback(
    (fields) => {
      const block = {
        id: crypto.randomUUID(),
        parent_id: null,
        title: '',
        status: 'planned',
        category_id: null,
        notes: '',
        source: 'user',
        repeat: null,
        repeat_exdates: [],
        recurrence_id: null,
        recurrence_date: null,
        ...fields,
      }
      commit((prev) => ({ ...prev, [block.id]: block }))
      insertTree([block])
      return block.id
    },
    [commit, insertTree],
  )

  const flushTimer = (id) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t.handle)
      timers.current.delete(id)
      t.run()
    }
  }

  const updateBlock = useCallback(
    (rawId, patch, { debounce = 0 } = {}) => {
      const id = resolve(rawId)
      const before = id && blocksRef.current[id]
      if (!before) return
      commit((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))

      if (!debounce) {
        return enqueue(
          [id],
          () => backend.updateBlock(id, patchToRow(patch)),
          () => commit((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...pickKeys(before, patch) } } : prev)),
        )
      }
      // Merge consecutive debounced patches (e.g. typing a title). The id is
      // held as "pending" for the lifetime of the timer so realtime echoes of
      // older writes don't overwrite what the user is typing.
      const existing = timers.current.get(id)
      if (existing) clearTimeout(existing.handle)
      else hold(id)
      const merged = { ...(existing?.patch ?? {}), ...patch }
      const run = () => {
        timers.current.delete(id)
        release(id)
        enqueue([id], () => backend.updateBlock(id, patchToRow(merged)))
      }
      timers.current.set(id, { patch: merged, run, handle: setTimeout(run, debounce) })
    },
    [backend, commit, enqueue, resolve],
  )

  /** Move/resize a block; sub-blocks shift with it and are clamped into the new range. */
  const moveBlock = useCallback(
    (rawId, { date, start, end }) => {
      const id = resolve(rawId)
      const all = blocksRef.current
      const block = all[id]
      if (!block) return
      flushTimer(id)
      const delta = start - block.start
      const changed = [{ ...block, date, start, end }]
      const clampInto = (parentStart, parentEnd, parentId) => {
        for (const child of childrenOf(all, parentId)) {
          let s = child.start + delta
          let e = child.end + delta
          s = Math.max(parentStart, Math.min(s, parentEnd - 5))
          e = Math.min(parentEnd, Math.max(e, s + 5))
          changed.push({ ...child, date, start: s, end: e })
          clampInto(s, e, child.id)
        }
      }
      clampInto(start, end, id)
      const previous = changed.map((c) => all[c.id])
      commit((prev) => {
        const next = { ...prev }
        for (const c of changed) next[c.id] = c
        return next
      })
      enqueue(
        changed.map((c) => c.id),
        () => backend.upsertBlocks(changed.map((c) => toRow(c, userId))),
        () =>
          commit((prev) => {
            const next = { ...prev }
            for (const p of previous) next[p.id] = p
            return next
          }),
      )
    },
    [backend, commit, enqueue, resolve, userId],
  )

  const addExdate = useCallback(
    (templateId, date) => {
      const tpl = blocksRef.current[templateId]
      if (!tpl) return
      updateBlock(templateId, { repeat_exdates: [...new Set([...(tpl.repeat_exdates ?? []), date])] })
    },
    [updateBlock],
  )

  /**
   * Delete a real block and everything that cascades from it in the DB: its
   * sub-blocks and, for a series, every individually-edited occurrence.
   */
  const deleteConcrete = useCallback(
    (id) => {
      const all = blocksRef.current
      const block = all[id]
      if (!block) return
      // Deleting an edited occurrence must not bring the virtual one back.
      if (block.recurrence_id && !block.parent_id && block.recurrence_date) {
        addExdate(block.recurrence_id, block.recurrence_date)
      }

      const doomed = new Set([id])
      let grew = true
      while (grew) {
        grew = false
        for (const b of Object.values(all)) {
          if (doomed.has(b.id)) continue
          if (doomed.has(b.parent_id) || doomed.has(b.recurrence_id)) {
            doomed.add(b.id)
            grew = true
          }
        }
      }
      const ids = [...doomed]
      ids.forEach((i) => {
        const t = timers.current.get(i)
        if (t) {
          clearTimeout(t.handle)
          timers.current.delete(i)
          release(i)
        }
      })
      const removed = ids.map((i) => all[i])
      removeLocalRows(ids)
      enqueue(
        ids,
        () => backend.deleteBlock(id),
        () =>
          commit((prev) => {
            const next = { ...prev }
            removed.forEach((b) => (next[b.id] = b))
            return next
          }),
      )
    },
    [addExdate, backend, commit, enqueue, removeLocalRows],
  )

  /** Delete a block. For a virtual occurrence, only that one date is removed from the series. */
  const deleteBlock = useCallback(
    (id) => {
      if (!isOccurrenceId(id)) return deleteConcrete(id)
      const all = blocksRef.current
      const { templateId, date } = splitOccurrenceId(id)
      const exception = findException(all, templateId, date)
      if (exception) return deleteConcrete(exception.id)
      const tpl = all[templateId]
      if (!tpl) return
      if (!tpl.parent_id) return addExdate(templateId, date)
      const real = materialize(id) // a sub-block inside one occurrence
      if (real) deleteConcrete(real)
    },
    [addExdate, deleteConcrete, materialize],
  )

  /** Set or clear the repeat rule of a series template / plain top-level block. */
  const setRepeat = useCallback((templateId, repeat) => updateBlock(templateId, { repeat }), [updateBlock])

  const divideBlock = useCallback(
    (rawId, parts) => {
      const id = resolve(rawId)
      const block = blocksRef.current[id]
      if (!block) return []
      const rows = divideRange(block.start, block.end, parts).map((slot, i) => ({
        id: crypto.randomUUID(),
        parent_id: id,
        title: `${block.title || 'Part'} · ${i + 1}`,
        date: block.date,
        start: slot.start,
        end: slot.end,
        category_id: block.category_id,
        status: 'planned',
        notes: '',
        source: 'user',
        repeat: null,
        repeat_exdates: [],
        recurrence_id: null,
        recurrence_date: null,
      }))
      commit((prev) => {
        const next = { ...prev }
        for (const r of rows) next[r.id] = r
        return next
      })
      insertTree(rows)
      return rows.map((r) => r.id)
    },
    [commit, insertTree, resolve],
  )

  /** Add one sub-block in the first free gap of the parent (or its second half). */
  const addSubBlock = useCallback(
    (rawId) => {
      const id = resolve(rawId)
      const all = blocksRef.current
      const parent = all[id]
      if (!parent) return null
      const kids = childrenOf(all, id).sort((a, b) => a.start - b.start)
      let cursor = parent.start
      let slot = null
      for (const k of kids) {
        if (k.start - cursor >= 10) {
          slot = { start: cursor, end: k.start }
          break
        }
        cursor = Math.max(cursor, k.end)
      }
      if (!slot && parent.end - cursor >= 10) slot = { start: cursor, end: parent.end }
      if (!slot) {
        const mid = parent.start + Math.round((parent.end - parent.start) / 2 / 5) * 5
        slot = { start: mid, end: parent.end }
      }
      return createBlock({ parent_id: id, title: '', date: parent.date, ...slot, category_id: parent.category_id })
    },
    [createBlock, resolve],
  )

  /**
   * Paste a copied block tree (root first, as plain blocks) as a new one-off
   * block on `date`, its root starting at `start` (clamped to fit the day).
   * All-day roots keep their times. Returns the new root id.
   */
  const pasteTree = useCallback(
    (tree, { date, start }) => {
      const [root] = tree
      if (!root) return null
      const dur = root.end - root.start
      const shift = root.all_day ? 0 : clamp(start, 0, DAY_MINUTES - dur) - root.start
      const ids = new Map(tree.map((b) => [b.id, crypto.randomUUID()]))
      const rows = tree.map((b) => ({
        id: ids.get(b.id),
        parent_id: b === root ? null : ids.get(b.parent_id),
        title: b.title,
        date,
        start: b.start + shift,
        end: b.end + shift,
        category_id: b.category_id,
        status: b.status,
        notes: b.notes,
        source: 'user',
        repeat: null,
        repeat_exdates: [],
        recurrence_id: null,
        recurrence_date: null,
        bookable: b.bookable ?? false,
        all_day: b === root ? (b.all_day ?? false) : false,
        hide_upcoming: b.hide_upcoming ?? false,
      }))
      commit((prev) => {
        const next = { ...prev }
        for (const r of rows) next[r.id] = r
        return next
      })
      insertTree(rows)
      return rows[0].id
    },
    [commit, insertTree],
  )

  // ── Category actions ──
  const createCategory = useCallback(
    (name) => {
      const cat = {
        id: crypto.randomUUID(),
        user_id: userId,
        name,
        color: CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length],
        position: categories.length,
      }
      setCategories((prev) => [...prev, cat])
      enqueue(
        [cat.id],
        () => backend.insertCategories([cat]),
        () => setCategories((prev) => prev.filter((c) => c.id !== cat.id)),
      )
      return cat.id
    },
    [backend, categories.length, enqueue, userId],
  )

  const updateCategory = useCallback(
    (id, patch) => {
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      enqueue([id], () => backend.updateCategory(id, patch))
    },
    [backend, enqueue],
  )

  const deleteCategory = useCallback(
    (id) => {
      setCategories((prev) => prev.filter((c) => c.id !== id))
      commit((prev) => {
        const next = { ...prev }
        for (const b of Object.values(next)) if (b.category_id === id) next[b.id] = { ...b, category_id: null }
        return next
      })
      enqueue([id], () => backend.deleteCategory(id))
    },
    [backend, commit, enqueue],
  )

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  return {
    kind: backend.kind,
    blocks,
    categories,
    categoriesById,
    loading,
    loadRange,
    createBlock,
    updateBlock,
    moveBlock,
    deleteBlock,
    setRepeat,
    divideBlock,
    addSubBlock,
    pasteTree,
    createCategory,
    updateCategory,
    deleteCategory,
  }
}

function pickKeys(obj, keysFrom) {
  const out = {}
  for (const k of Object.keys(keysFrom)) out[k] = obj[k]
  return out
}

