import { useState } from 'react'
import { Check, Copy, Link2, Trash2 } from 'lucide-react'
import { format } from '../lib/dates'
import { linkUrl } from '../lib/shareLinks'

export default function LinkList({ links, loading, onCopy, onRevoke, empty, actions, renderExtra }) {
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
                <Link2 size={13} /> {l.name || { edit: 'Edit link', booking: 'Booking link', group: 'View link' }[l.kind]}
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
              {renderExtra?.(l)}
            </div>
            <div className="link-actions">
              {actions ? (
                actions.map((a) => (
                  <button key={a.label} className="btn ghost sm" onClick={() => a.onClick(l)}>
                    {a.icon} {a.label}
                  </button>
                ))
              ) : (
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
              )}
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
