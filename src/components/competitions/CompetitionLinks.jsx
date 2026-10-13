import { useEffect, useState } from 'react'
import { Eye, Pencil, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { generateToken, linkUrl } from '../../lib/shareLinks'
import LinkList from '../LinkList'

const MIGRATION_HINT = 'Run supabase/migrations/0015_competition_links.sql to share competitions.'
const hint = (err) => (/group_ids|access|kind|group/.test(err.message) ? MIGRATION_HINT : err.message)
const groupsOf = (l) => (l.group_ids?.length ? l.group_ids : l.group_id ? [l.group_id] : [])

/** View / Edit toggle for a link. */
function AccessPicker({ value, onChange, compact = false }) {
  return (
    <div className={`segmented small access-picker ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Access">
      {[
        ['view', 'Can view', Eye],
        ['edit', 'Can edit', Pencil],
      ].map(([id, label, Icon]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>
          <Icon size={12} /> {label}
        </button>
      ))}
    </div>
  )
}

/** Chips for the groups a link opens. */
function GroupPicker({ groups, value, onChange, compact = false }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((g) => g !== id) : [...value, id])
  return (
    <div className={`chips group-picker ${compact ? 'compact' : ''}`} role="group" aria-label="Groups this link opens">
      {groups.map((g) => {
        const on = value.includes(g.id)
        return (
          <button key={g.id} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(g.id)}>
            {g.name}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Competition links (/g/<token>): open the chosen groups with view or edit
 * access, no sign-in. `only` limits the list to links that include that group
 * (the Share button on a group); new links start with `only` selected.
 */
export default function CompetitionLinks({ groups, only = null, toast, compact = false }) {
  const [links, setLinks] = useState(null)
  const [name, setName] = useState('')
  const [access, setAccess] = useState('view')
  const [picked, setPicked] = useState(() => (only ? [only] : []))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('share_links')
      .select('*')
      .eq('kind', 'group')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) toast(hint(error), 'error')
        setLinks(error ? [] : data)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const copy = async (text, message = 'Link copied') => {
    try {
      await navigator.clipboard.writeText(text)
      toast(message)
    } catch {
      toast('Couldn’t copy — select the link and copy it manually', 'error')
    }
  }

  const create = async (e) => {
    e.preventDefault()
    if (!picked.length) return toast('Pick at least one group for the link', 'error')
    setBusy(true)
    const { data, error } = await supabase
      .from('share_links')
      .insert({ kind: 'group', group_ids: picked, access, token: generateToken(), name: name.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      .select('*')
      .single()
    setBusy(false)
    if (error) return toast(hint(error), 'error')
    setLinks((l) => [data, ...(l ?? [])])
    setName('')
    copy(linkUrl(data), 'Link created and copied')
  }

  // Change an existing link's access or groups (the guest sees it on their next refresh).
  const change = async (link, patch) => {
    if (patch.group_ids && !patch.group_ids.length) return toast('A link needs at least one group — turn it off instead', 'error')
    const prev = links
    setLinks((l) => l.map((x) => (x.id === link.id ? { ...x, ...patch } : x)))
    const { error } = await supabase.from('share_links').update(patch).eq('id', link.id)
    if (error) {
      setLinks(prev)
      toast(hint(error), 'error')
    }
  }

  const revoke = async (id) => {
    const prev = links
    setLinks((l) => l.filter((x) => x.id !== id))
    const { error } = await supabase.from('share_links').delete().eq('id', id)
    if (error) {
      setLinks(prev)
      toast(error.message, 'error')
    } else toast('Link turned off')
  }

  const shown = (links ?? []).filter((l) => !only || groupsOf(l).includes(only))

  return (
    <div className={`comp-links ${compact ? 'compact' : ''}`}>
      {groups.length ? (
        <form className="comp-link-form" onSubmit={create}>
          <span className="field-label">Groups this link opens</span>
          <GroupPicker groups={groups} value={picked} onChange={setPicked} />
          <div className="comp-link-row">
            <AccessPicker value={access} onChange={setAccess} />
            <input placeholder="Who is it for? (optional)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Who is the link for" />
            <button className="btn primary sm" disabled={busy || !picked.length}>
              <Plus size={14} /> Create link
            </button>
          </div>
        </form>
      ) : (
        <p className="muted small">Make a group on the Competitions page first, then share it here.</p>
      )}
      <LinkList
        links={shown}
        loading={!links}
        onCopy={copy}
        onRevoke={revoke}
        empty={only ? 'No links for this group yet.' : 'No competition links yet.'}
        renderExtra={(l) => (
          <div className="comp-link-extra">
            <AccessPicker compact value={l.access === 'edit' ? 'edit' : 'view'} onChange={(a) => change(l, { access: a })} />
            <GroupPicker compact groups={groups} value={groupsOf(l)} onChange={(ids) => change(l, { group_ids: ids, group_id: null })} />
          </div>
        )}
      />
    </div>
  )
}
