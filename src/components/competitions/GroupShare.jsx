import { useEffect, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import CompetitionLinks from './CompetitionLinks'

/** "Share" dropdown for one competition group: view or edit links at /g/<token>, which can open other groups too. */
export default function GroupShare({ group, groups, toast }) {
  const [open, setOpen] = useState(false)
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

  return (
    <div className="dropdown" ref={ref}>
      <button className={`btn ghost sm ${open ? 'is-active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <Share2 size={14} /> Share
      </button>
      {open && (
        <div className="menu group-share" role="dialog" aria-label={`Share ${group.name}`}>
          <p className="muted small">
            Anyone with a link sees the competitions in its groups, no sign-in. <strong>Can edit</strong> also lets them add, change and remove
            competitions there. Turn a link off to revoke it.
          </p>
          {/* Remount per group so a new link starts with this group picked. */}
          <CompetitionLinks key={group.id} groups={groups} only={group.id} toast={toast} compact />
        </div>
      )}
    </div>
  )
}
