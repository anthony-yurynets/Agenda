import { useEffect, useState } from 'react'
import { CalendarClock, Check, Copy, Link2, Plus, Trash2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format } from '../lib/dates'

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const linkUrl = (l) => `${window.location.origin}/${l.kind === 'edit' ? 's' : 'b'}/${l.token}`
const SLOT_OPTIONS = [15, 20, 30, 45, 60, 90, 120]
const MIGRATION_HINT = 'Run supabase/migrations/0004_sharing.sql in the Supabase SQL editor to enable sharing.'

export default function Sharing({ toast }) {
  const [links, setLinks] = useState(null)
  const [editName, setEditName] = useState('')
  const [booking, setBooking] = useState({ name: '', slot: 30, uses: 1, expires: '' })
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="integrations sharing">
      <section className="panel">
        <h3>
          <Users size={17} /> Edit access
        </h3>
        <p className="muted small">
          Anyone with an edit link can view and change your calendar without signing in. Turn a link off to revoke it.
        </p>
        <form
          className="token-form"
          onSubmit={(e) => {
            e.preventDefault()
            create({ kind: 'edit', name: editName.trim() }).then((ok) => ok && setEditName(''))
          }}
        >
          <input placeholder="Who is it for? (optional)" value={editName} maxLength={80} onChange={(e) => setEditName(e.target.value)} />
          <button className="btn primary" disabled={busy}>
            <Plus size={16} /> Create link
          </button>
        </form>
        <LinkList links={editLinks} loading={!links} onCopy={copy} onRevoke={revoke} empty="No edit links yet." />
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
    </div>
  )
}

function LinkList({ links, loading, onCopy, onRevoke, empty }) {
  const [copied, setCopied] = useState(null)
  if (loading) return <p className="muted small">Loading…</p>
  return (
    <ul className="token-list">
      {links.length === 0 && <li className="muted small">{empty}</li>}
      {links.map((l) => {
        const used = l.kind === 'booking' && l.max_uses && l.uses >= l.max_uses
        const expired = l.expires_at && new Date(l.expires_at) < new Date()
        return (
          <li key={l.id} className={used || expired ? 'is-spent' : ''}>
            <div>
              <strong>
                <Link2 size={13} /> {l.name || (l.kind === 'edit' ? 'Edit link' : 'Booking link')}
              </strong>
              <small className="muted">
                {l.kind === 'booking' && (
                  <>
                    {l.slot_minutes} min · {l.uses}/{l.max_uses} used
                    {used && ' · used up'} ·{' '}
                  </>
                )}
                {expired ? 'expired' : l.expires_at ? `expires ${format(new Date(l.expires_at), 'MMM d')}` : `created ${format(new Date(l.created_at), 'MMM d')}`}
              </small>
            </div>
            <div className="link-actions">
              <button
                className="btn ghost sm"
                onClick={() => {
                  onCopy(linkUrl(l))
                  setCopied(l.id)
                  setTimeout(() => setCopied(null), 1500)
                }}
              >
                {copied === l.id ? <Check size={14} /> : <Copy size={14} />} Copy link
              </button>
              <button className="btn ghost danger sm" onClick={() => onRevoke(l.id)} aria-label="Turn off link">
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
