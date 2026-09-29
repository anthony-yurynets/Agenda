import { useEffect, useRef, useState } from 'react'
import { Check, SlidersHorizontal } from 'lucide-react'
import { STATUSES } from '../lib/domain'
import StatusIcon from './StatusIcon'

export default function StatusFilter({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const toggle = (id) => {
    const next = new Set(value)
    next.has(id) ? next.delete(id) : next.add(id)
    if (next.size) onChange(next)
  }
  const active = value.size < STATUSES.length

  return (
    <div className="dropdown" ref={ref}>
      <button className={`btn ghost ${active ? 'is-active' : ''}`} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={15} /> <span className="hide-sm">Filter</span>
        {active && <span className="badge">{value.size}</span>}
      </button>
      {open && (
        <div className="menu right">
          <div className="menu-label">Show statuses</div>
          {STATUSES.map((s) => (
            <button key={s.id} onClick={() => toggle(s.id)} className={`s-${s.id}`}>
              <StatusIcon status={s.id} size={15} className="status-fg" />
              <span className="flex1">{s.label}</span>
              {value.has(s.id) && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
