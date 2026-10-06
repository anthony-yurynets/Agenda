import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, GraduationCap, Plus } from 'lucide-react'
import { addDaysISO } from '../../lib/domain'
import { assignmentStatusLabel, isDone, kindLabel, nextAssignmentStatus, sortAssignments, weekStartOf } from '../../lib/agenda'

const fmt = (iso, opts) => new Date(`${iso}T12:00`).toLocaleDateString(undefined, opts)

export function AssignmentCard({ a, subject, today, selected, onOpen, onStatus, draggable = false }) {
  const exam = a.kind === 'exam'
  const overdue = !exam && !isDone(a) && a.due_date < today
  return (
    <div
      className={`as-card ${exam ? '' : `as-${a.status}`} k-${a.kind} ${selected ? 'selected' : ''} ${overdue ? 'overdue' : ''} ${exam && a.due_date < today ? 'past' : ''}`}
      style={{ '--subj': subject?.color ?? 'var(--hairline)' }}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-assignment', a.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpen(a.id)}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen(a.id)}
    >
      <span className="as-title">{a.title || 'Untitled'}</span>
      <div className="as-meta">
        {exam ? (
          <span className="as-exam">
            <GraduationCap size={12} aria-hidden="true" /> {kindLabel(a.kind)}
          </span>
        ) : (
          <button
            className="as-status"
            onClick={(e) => {
              e.stopPropagation()
              onStatus(a.id, nextAssignmentStatus(a.status))
            }}
            title="Change status"
            aria-label={`Status: ${assignmentStatusLabel(a.status)}. Click to change.`}
          >
            <i aria-hidden="true" />
            {assignmentStatusLabel(a.status)}
          </button>
        )}
      </div>
      <div className="as-foot">
        <span className="as-subject">{subject?.name ?? ''}</span>
        {!exam && <span className="as-kind">{kindLabel(a.kind)}</span>}
      </div>
    </div>
  )
}

const CHUNK = 21 // days added when you near either end

/**
 * The week at a glance: an endless strip of day boxes, each a 2×3 grid of
 * assignment cards (more scroll inside the day), no times. Scrolling either
 * way loads more days. Click a day to add something due then, drag a card to move its due date.
 */
export default function WeekBoard({ dash, today, selectedId, onOpen, onNew }) {
  const [range, setRange] = useState(() => ({ start: addDaysISO(weekStartOf(today), -CHUNK), count: CHUNK * 3 }))
  const [over, setOver] = useState(null)
  const [view, setView] = useState({ first: CHUNK, visible: 7 })
  const days = useMemo(() => Array.from({ length: range.count }, (_, i) => addDaysISO(range.start, i)), [range])

  const scroller = useRef(null)
  const keep = useRef(null) // { date, offset }: the day to hold in place while days are added before it
  const target = useRef({ date: today, behavior: 'instant' }) // where to scroll after the next layout
  const busy = useRef(false)

  /** Width of one day plus the gap. */
  const step = useCallback(() => {
    const [a, b] = scroller.current.children
    return b ? b.offsetLeft - a.offsetLeft : scroller.current.clientWidth / 7
  }, [])
  const readView = useCallback(() => {
    const el = scroller.current
    const s = step()
    const next = { first: Math.round(el.scrollLeft / s), visible: Math.max(1, Math.round((el.clientWidth + 8) / s)) }
    setView((v) => (v.first === next.first && v.visible === next.visible ? v : next))
  }, [step])
  // Desktop lines weeks up Monday-first; narrower screens start at the day itself.
  const anchor = (date) => (view.visible >= 7 ? weekStartOf(date) : date)

  const jumpTo = (date, behavior = 'smooth') => {
    const i = days.indexOf(date)
    if (i >= 0) return scroller.current.scrollTo({ left: i * step(), behavior })
    target.current = { date, behavior: 'instant' }
    setRange({ start: addDaysISO(weekStartOf(date), -CHUNK), count: CHUNK * 3 })
  }

  useLayoutEffect(() => {
    const el = scroller.current
    // Put the same day back where it was (the browser may or may not have re-snapped to it already).
    if (keep.current) {
      el.scrollLeft = days.indexOf(keep.current.date) * step() + keep.current.offset
      keep.current = null
    }
    if (target.current) {
      const i = days.indexOf(target.current.date)
      if (i >= 0) el.scrollTo({ left: i * step(), behavior: target.current.behavior })
      target.current = null
    }
    busy.current = false
    readView()
  }, [days, step, readView])

  useEffect(() => {
    const ro = new ResizeObserver(readView)
    ro.observe(scroller.current)
    return () => ro.disconnect()
  }, [readView])

  const onScroll = () => {
    readView()
    if (busy.current) return
    const el = scroller.current
    const s = step()
    const edge = s * 7
    if (el.scrollLeft < edge) {
      busy.current = true
      const i = Math.floor(el.scrollLeft / s)
      keep.current = { date: days[i], offset: el.scrollLeft - i * s }
      setRange((r) => ({ start: addDaysISO(r.start, -CHUNK), count: r.count + CHUNK }))
    } else if (el.scrollLeft + el.clientWidth > el.scrollWidth - edge) {
      busy.current = true
      setRange((r) => ({ ...r, count: r.count + CHUNK }))
    }
  }
  const page = (dir) => scroller.current.scrollBy({ left: dir * view.visible * step(), behavior: 'smooth' })

  const byDay = useMemo(() => {
    const map = Object.fromEntries(days.map((d) => [d, []]))
    for (const a of dash.assignments) if (map[a.due_date]) map[a.due_date].push(a)
    for (const d of days) map[d] = sortAssignments(map[d])
    return map
  }, [dash.assignments, days])

  const first = days[Math.min(view.first, days.length - 1)]
  const last = days[Math.min(view.first + view.visible - 1, days.length - 1)]
  const showsToday = first <= today && today <= last
  const label =
    first === last
      ? fmt(first, { month: 'short', day: 'numeric' })
      : `${fmt(first, { month: 'short', day: 'numeric' })} – ${fmt(last, first.slice(5, 7) === last.slice(5, 7) ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`

  return (
    <div className="wb">
      <div className="tile-head">
        <h3>{showsToday ? 'This week' : 'Week'}</h3>
        <span className="wb-range">{label}</span>
        <div className="date-nav">
          <button className="icon-btn sm" onClick={() => page(-1)} aria-label="Earlier">
            <ChevronLeft size={16} />
          </button>
          {!showsToday && (
            <button className="btn ghost sm" onClick={() => jumpTo(anchor(today))}>
              Today
            </button>
          )}
          <button className="icon-btn sm" onClick={() => page(1)} aria-label="Later">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="wb-days" ref={scroller} onScroll={onScroll}>
        {days.map((d) => {
          const items = byDay[d]
          const open = items.filter((a) => !isDone(a)).length
          return (
            <section
              key={d}
              className={`wb-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${over === d ? 'drop' : ''}`}
              aria-label={fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('text/x-assignment')) return
                e.preventDefault()
                setOver(d)
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(null)}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/x-assignment')
                setOver(null)
                if (id) dash.updateAssignment(id, { due_date: d })
              }}
            >
              <header className="wb-day-head">
                <span className="wb-dow">{fmt(d, { weekday: 'short' })}</span>
                <span className="wb-dom">{Number(d.slice(8))}</span>
                {d.endsWith('-01') && <span className="wb-month">{fmt(d, { month: 'short' })}</span>}
                {open > 0 && <span className="count">{open}</span>}
                <span className="flex1" />
                <button className="icon-btn sm wb-add" onClick={() => onNew({ due_date: d })} aria-label={`Add assignment due ${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}`}>
                  <Plus size={14} />
                </button>
              </header>
              <div
                className="wb-cards"
                onClick={(e) => e.target === e.currentTarget && onNew({ due_date: d })}
                title={items.length ? undefined : 'Click to add'}
              >
                {items.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    a={a}
                    subject={dash.subjectsById[a.subject_id]}
                    today={today}
                    selected={selectedId === a.id}
                    onOpen={onOpen}
                    onStatus={(id, status) => dash.updateAssignment(id, { status })}
                    draggable
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
