// Where the competitions store reads and writes: the signed-in owner's tables,
// or /api/group for a guest holding an edit link. Writes return `{ error }`
// like supabase-js, so the store's optimistic queue treats them the same.
import { supabase } from './supabase'
import { callShareApi } from './backends'

const TABLE = { comps: 'competitions', options: 'competition_options', projects: 'competition_projects', groups: 'competition_groups' }

/** The signed-in owner: Supabase directly (RLS scopes everything), live via realtime. */
export function ownerCompBackend(userId) {
  return {
    kind: 'owner',
    userId,
    pollMs: 0,
    async load() {
      const [c, o, p, g] = await Promise.all(Object.values(TABLE).map((t) => supabase.from(t).select('*')))
      const error = c.error ?? o.error ?? p.error ?? g.error
      return error ? { error } : { data: { comps: c.data, options: o.data, projects: p.data, groups: g.data } }
    },
    insert: (key, row) => supabase.from(TABLE[key]).insert({ ...row, user_id: userId }),
    update: (key, id, patch) => supabase.from(TABLE[key]).update(patch).eq('id', id),
    remove: (key, id) => supabase.from(TABLE[key]).delete().eq('id', id),
    subscribe(apply) {
      const channel = supabase.channel(`competitions-${userId}`)
      for (const [key, table] of Object.entries(TABLE)) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, apply(key))
        // Deletes aren't filterable by column.
        channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, apply(key))
      }
      channel.subscribe()
      return () => supabase.removeChannel(channel)
    },
  }
}

/**
 * A guest with an edit link: everything goes through /api/group, confined to
 * the link's groups. No realtime, so the store polls. Lists (items, projects)
 * can be added to but not renamed or deleted; groups can't be changed at all.
 */
export function sharedCompBackend(token) {
  const call = (op, args) => callShareApi('/api/group', token, { op, ...args })
  const denied = async () => ({ error: { message: 'Not allowed with a shared link.' } })
  return {
    kind: 'shared',
    userId: 'shared',
    pollMs: 5000,
    async load() {
      const res = await call('load')
      if (res.error) return res
      const d = res.data
      return { data: { comps: d.competitions, options: d.options, projects: d.projects, groups: d.groups }, info: { owner: d.owner, access: d.access, name: d.name } }
    },
    insert(key, row) {
      if (key === 'comps') return call('insert', { row })
      if (key === 'options') return call('option.create', { row })
      if (key === 'projects') return call('project.create', { row })
      return denied()
    },
    update: (key, id, patch) => (key === 'comps' ? call('update', { id, patch }) : denied()),
    remove: (key, id) => (key === 'comps' ? call('delete', { id }) : denied()),
    subscribe: () => () => {},
  }
}
