// Where the calendar store reads and writes. Every write returns `{ error }`
// like supabase-js, so the store's optimistic queue treats them the same.
import { supabase } from './supabase'

/** The signed-in owner: talks to Supabase directly (RLS scopes everything). */
export function ownerBackend(userId) {
  return {
    kind: 'owner',
    userId,
    canSeedCategories: true,
    pollMs: 0,

    loadCategories: () => supabase.from('categories').select('*').order('position'),

    async loadBlocks(from, to) {
      const inRange = `and(date.gte.${from},date.lte.${to}),and(recurrence_date.gte.${from},recurrence_date.lte.${to})`
      const [range, series] = await Promise.all([
        supabase.from('blocks').select('*').or(inRange),
        supabase.from('blocks').select('*').not('repeat', 'is', null).lte('date', to),
      ])
      if (range.error?.code === '42703' || series.error?.code === '42703') {
        // A migration hasn't been applied yet — still show plain blocks.
        const plain = await supabase.from('blocks').select('*').gte('date', from).lte('date', to)
        return { data: plain.data ?? [], error: plain.error, outdatedSchema: true }
      }
      if (range.error || series.error) return { error: range.error ?? series.error }
      // Sub-blocks of series templates live on the template's (earlier) date.
      const rows = [...range.data, ...series.data]
      let frontier = series.data.map((r) => r.id)
      while (frontier.length) {
        const { data, error } = await supabase.from('blocks').select('*').in('parent_id', frontier)
        if (error) return { error }
        rows.push(...data)
        frontier = data.map((r) => r.id)
      }
      return { data: rows }
    },

    insertBlocks: (rows) => supabase.from('blocks').insert(rows),
    updateBlock: (id, patch) => supabase.from('blocks').update(patch).eq('id', id),
    upsertBlocks: (rows) => supabase.from('blocks').upsert(rows),
    deleteBlock: (id) => supabase.from('blocks').delete().eq('id', id),
    insertCategories: (rows) => supabase.from('categories').insert(rows),
    updateCategory: (id, patch) => supabase.from('categories').update(patch).eq('id', id),
    deleteCategory: (id) => supabase.from('categories').delete().eq('id', id),

    /** Live changes (from the MCP server, shared editors, bookings, other tabs). */
    subscribe({ onBlock, onBlockDelete, onCategory, onCategoryDelete }) {
      const channel = supabase
        .channel(`vapor-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `user_id=eq.${userId}` }, (p) =>
          p.eventType === 'DELETE' ? onBlockDelete(p.old?.id) : onBlock(p.new),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${userId}` }, (p) =>
          p.eventType === 'DELETE' ? onCategoryDelete(p.old?.id) : onCategory(p.new),
        )
        .subscribe()
      // Deletes aren't filterable by column, so listen unfiltered for those.
      const deletes = supabase
        .channel(`vapor-del-${userId}`)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'blocks' }, (p) => onBlockDelete(p.old?.id))
        .subscribe()
      return () => {
        supabase.removeChannel(channel)
        supabase.removeChannel(deletes)
      }
    },
  }
}

/** Call a share-link API endpoint. Resolves to `{ data }` or `{ error }`. */
export async function callShareApi(path, token, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.error) return { error: { message: json.error ?? `Request failed (${res.status})`, status: res.status } }
    return { data: json.data }
  } catch {
    return { error: { message: 'Network error — check your connection.' } }
  }
}

/** A guest holding an edit link: everything goes through /api/share. No realtime, so poll. */
export function sharedBackend(token) {
  const call = (op, args) => callShareApi('/api/share', token, { op, ...args })
  let cache = null // categories arrive with each blocks load
  return {
    kind: 'shared',
    userId: 'shared',
    canSeedCategories: false,
    pollMs: 5000,

    async loadCategories() {
      if (cache) return { data: cache }
      const today = new Date().toISOString().slice(0, 10)
      const res = await call('load', { from: today, to: today })
      return res.error ? res : { data: res.data.categories }
    },
    async loadBlocks(from, to) {
      const res = await call('load', { from, to })
      if (res.error) return res
      cache = res.data.categories
      return { data: res.data.blocks, categories: res.data.categories }
    },
    insertBlocks: (rows) => call('insert', { rows }),
    updateBlock: (id, patch) => call('update', { id, patch }),
    upsertBlocks: (rows) => call('upsert', { rows }),
    deleteBlock: (id) => call('delete', { id }),
    insertCategories: (rows) => call('category.insert', { rows }),
    updateCategory: (id, patch) => call('category.update', { id, patch }),
    deleteCategory: (id) => call('category.delete', { id }),
    subscribe: () => () => {},
  }
}
