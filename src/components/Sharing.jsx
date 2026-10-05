import { useEffect, useState } from 'react'
import { CalendarClock, FolderOpen, Plus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format } from '../lib/dates'
import { generateToken, linkUrl } from '../lib/shareLinks'
import LinkList from './LinkList'
import { SHAREABLE_PAGES } from '../pages'
const SLOT_OPTIONS = [15, 20, 30, 45, 60, 90, 120]
const MIGRATION_HINT = 'Run supabase/migrations/0004_sharing.sql in the Supabase SQL editor to enable sharing.'

export default function Sharing({ toast }) {
  const [links, setLinks] = useState(null)
  const [editName, setEditName] = useState('')
  const [editTools, setEditTools] = useState(() => SHAREABLE_PAGES.map((p) => p.id))
  const [booking, setBooking] = useState({ name: '', slot: 30, uses: 1, expires: '' })
  const [busy, setBusy] = useState(false)
  const [groups, setGroups] = useState({})

  useEffect(() => {
    supabase
      .from('share_links')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          toast(/share_links/.test(error.message) ? MIGRATION_HINT : error.message, 'error')
          setLinks([])
        } else setLinks(data)
      })
    // Names for competition-group links (shared from the Competitions page).
    supabase
      .from('competition_groups')
      .select('id, name')
      .then(({ data }) => setGroups(Object.fromEntries((data ?? []).map((g) => [g.id, g.name]))))
  }, [toast])

  const create = async (row) => {
    setBusy(true)
    const { data, error } = await supabase
      .from('share_links')
      .insert({ token: generateToken(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...row })
      .select('*')
      .single()
    setBusy(false)
    if (error) {
      toast(/share_links|bookable/.test(error.message) ? MIGRATION_HINT : error.message, 'error')
      return null
    }
    setLinks((l) => [data, ...(l ?? [])])
    copy(linkUrl(data), 'Link created and copied')
    return data
  }

  // Change which tools an existing edit link opens (takes effect on the guest's next load).
  const setLinkTools = async (link, tools) => {
    if (!tools.length) return toast('A link needs at least one tool', 'error')
    const prev = links
    setLinks((l) => l.map((x) => (x.id === link.id ? { ...x, tools } : x)))
    const { error } = await supabase.from('share_links').update({ tools }).eq('id', link.id)
    if (error) {
      setLinks(prev)
      toast(/tools/.test(error.message) ? 'Run supabase/migrations/0008_share_tools.sql first.' : error.message, 'error')
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

  const copy = async (text, message = 'Link copied') => {
    try {
      await navigator.clipboard.writeText(text)
      toast(message)
    } catch {
      toast('Couldn’t copy — select the link and copy it manually', 'error')
    }
  }

  const editLinks = (links ?? []).filter((l) => l.kind === 'edit')
  const bookingLinks = (links ?? []).filter((l) => l.kind === 'booking')
  const groupLinks = (links ?? []).filter((l) => l.kind === 'group')

  return (
    <div className="integrations sharing">
      <section className="panel">
        <h3>
          <Users size={17} /> Edit access
        </h3>
        <p className="muted small">
          Anyone with an edit link can view and change the tools you pick, without signing in. They only see those tabs.
          Turn a link off to revoke it.
        </p>
        <ToolPicker value={editTools} onChange={setEditTools} />
        <form
          className="token-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!editTools.length) return toast('Pick at least one tool to share', 'error')
            create({ kind: 'edit', name: editName.trim(), tools: editTools }).then((ok) => ok && setEditName(''))
          }}
        >
          <input placeholder="Who is it for? (optional)" value={editName} maxLength={80} onChange={(e) => setEditName(e.target.value)} />
          <button className="btn primary" disabled={busy}>
            <Plus size={16} /> Create link
          </button>
        </form>
        <LinkList
          links={editLinks}
          loading={!links}
          onCopy={copy}
          onRevoke={revoke}
          empty="No edit links yet."
          renderExtra={(l) => <ToolPicker compact value={l.tools ?? ['calendar']} onChange={(tools) => setLinkTools(l, tools)} />}
        />
      </section>

      <section className="panel">
        <h3>
          <CalendarClock size={17} /> Booking links
        </h3>
        <p className="muted small">
          People pick a free time inside blocks you’ve marked <strong>Open for booking</strong> (in a block’s details).
          Each booking becomes a sub-block there. The link stops working after the number of uses you set.
        </p>
        <form
          className="booking-form"
          onSubmit={(e) => {
            e.preventDefault()
            create({
              kind: 'booking',
              name: booking.name.trim(),
              slot_minutes: booking.slot,
              max_uses: booking.uses,
              expires_at: booking.expires ? new Date(`${booking.expires}T23:59:59`).toISOString() : null,
            }).then((ok) => ok && setBooking((b) => ({ ...b, name: '' })))
          }}
        >
          <label className="field">
            <span className="field-label">What’s it for</span>
            <input
              placeholder="e.g. Intro call"
              value={booking.name}
              maxLength={80}
              onChange={(e) => setBooking({ ...booking, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Length</span>
            <select value={booking.slot} onChange={(e) => setBooking({ ...booking, slot: Number(e.target.value) })}>
              {SLOT_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Uses</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={booking.uses}
              onChange={(e) => setBooking({ ...booking, uses: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })}
            />
          </label>
          <label className="field">
            <span className="field-label">Expires (optional)</span>
            <input
              type="date"
              value={booking.expires}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setBooking({ ...booking, expires: e.target.value })}
            />
          </label>
          <button className="btn primary" disabled={busy}>
            <Plus size={16} /> Create link
          </button>
        </form>
        <LinkList links={bookingLinks} loading={!links} onCopy={copy} onRevoke={revoke} empty="No booking links yet." />
      </section>

      {groupLinks.length > 0 && (
        <section className="panel">
          <h3>
            <FolderOpen size={17} /> Competition groups
          </h3>
          <p className="muted small">
            View-only links to a group of competitions. Create them from a group’s <strong>Share</strong> button on the Competitions page.
          </p>
          <LinkList
            links={groupLinks}
            loading={!links}
            onCopy={copy}
            onRevoke={revoke}
            empty=""
            renderExtra={(l) => <small className="muted">Group: {groups[l.group_id] ?? '…'}</small>}
          />
        </section>
      )}
    </div>
  )
}

/** Checkboxes for the tools (shareable pages) a link opens. */
function ToolPicker({ value, onChange, compact = false }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id])
  return (
    <div className={`tool-picker ${compact ? 'compact' : ''}`} role="group" aria-label="Tools this link opens">
      {!compact && <span className="field-label">Tools this link opens</span>}
      <div className="chips">
        {SHAREABLE_PAGES.map(({ id, label, icon: Icon }) => {
          const on = value.includes(id)
          return (
            <button key={id} type="button" className={`chip tool-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(id)}>
              <Icon size={13} /> {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
