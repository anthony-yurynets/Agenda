import { useEffect, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { generateToken, linkUrl } from '../../lib/shareLinks'
import LinkList from '../LinkList'

const MIGRATION_HINT = 'Run supabase/migrations/0012_competition_groups.sql to share groups.'

/** "Share" dropdown for one competition group: view-only links at /g/<token>. */
export default function GroupShare({ group, toast }) {
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  // Load this group's links each time the menu opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    supabase
      .from('share_links')
      .select('*')
      .eq('kind', 'group')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) toast(/group/.test(error.message) ? MIGRATION_HINT : error.message, 'error')
        setLinks(error ? [] : data)
      })
    return () => {
      cancelled = true
    }
  }, [open, group.id, toast])

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
    setBusy(true)
    const { data, error } = await supabase
      .from('share_links')
      .insert({ kind: 'group', group_id: group.id, token: generateToken(), name: name.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      .select('*')
      .single()
    setBusy(false)
    if (error) return toast(/group|kind/.test(error.message) ? MIGRATION_HINT : error.message, 'error')
    setLinks((l) => [data, ...(l ?? [])])
    setName('')
    copy(linkUrl(data), 'Link created and copied')
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

  return (
    <div className="dropdown" ref={ref}>
      <button className={`btn ghost sm ${open ? 'is-active' : ''}`} onClick={() => (setLinks(null), setOpen((o) => !o))} aria-expanded={open} aria-haspopup="dialog">
        <Share2 size={14} /> Share
      </button>
      {open && (
        <div className="menu group-share" role="dialog" aria-label={`Share ${group.name}`}>
          <p className="muted small">
            Anyone with a link can view the competitions in <strong>{group.name}</strong> — no sign-in, no editing. It stays up to date as you change the
            group. Turn a link off to revoke it.
          </p>
          <form className="token-form" onSubmit={create}>
            <input placeholder="Who is it for? (optional)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Who is the link for" />
            <button className="btn primary sm" disabled={busy}>
              Create link
            </button>
          </form>
          <LinkList links={links ?? []} loading={!links} onCopy={copy} onRevoke={revoke} empty="No links for this group yet." />
        </div>
      )}
    </div>
  )
}
