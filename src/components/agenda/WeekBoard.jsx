import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { addDaysISO } from '../../lib/domain'
import { assignmentStatusLabel, kindLabel, nextAssignmentStatus, sortAssignments, weekDates, weekStartOf } from '../../lib/agenda'

const fmt = (iso, opts) => new Date(`${iso}T12:00`).toLocaleDateString(undefined, opts)

export function AssignmentCard({ a, subject, today, selected, onOpen, onStatus, draggable = false }) {
  const overdue = a.status !== 'done' && a.due_date < today
  return (
    <div
      className={`as-card as-${a.status} k-${a.kind} ${selected ? 'selected' : ''} ${overdue ? 'overdue' : ''}`}
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
        <span className="as-kind">{kindLabel(a.kind)}</span>
      </div>
      {subject && <span className="as-subject">{subject.name}</span>}
    </div>
  )
}

/**
 * The week at a glance: seven day boxes of assignment cards, no times. Click
 * a day to add something due then, drag a card to move its due date.
 */
export default function WeekBoard({ dash, today, selectedId, onOpen, onNew }) {
  const [monday, setMonday] = useState(() => weekStartOf(today))
  const [over, setOver] = useState(null)
  const days = useMemo(() => weekDates(monday), [monday])

  const byDay = useMemo(() => {
    const map = Object.fromEntries(days.map((d) => [d, []]))
    for (const a of dash.assignments) if (map[a.due_date]) map[a.due_date].push(a)
    for (const d of days) map[d] = sortAssignments(map[d])
    return map
  }, [dash.assignments, days])

  const isThisWeek = monday === weekStartOf(today)
  const label = `${fmt(days[0], { month: 'short', day: 'numeric' })} – ${fmt(days[6], days[0].slice(5, 7) === days[6].slice(5, 7) ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`

  return (
    <div className="wb">
      <div className="tile-head">
        <h3>{isThisWeek ? 'This week' : 'Week'}</h3>
        <span className="wb-range">{label}</span>
        <div className="date-nav">
          <button className="icon-btn sm" onClick={() => setMonday((m) => addDaysISO(m, -7))} aria-label="Previous week">
            <ChevronLeft size={16} />
          </button>
          {!isThisWeek && (
            <button className="btn ghost sm" onClick={() => setMonday(weekStartOf(today))}>
              Today
            </button>
          )}
          <button className="icon-btn sm" onClick={() => setMonday((m) => addDaysISO(m, 7))} aria-label="Next week">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="wb-days">
        {days.map((d) => {
          const items = byDay[d]
          const open = items.filter((a) => a.status !== 'done').length
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
                {open > 0 && <span className="count">{open}</span>}
                <span className="flex1" />
                <button className="icon-btn sm wb-add" onClick={() => onNew({ due_date: d })} aria-label={`Add assignment due ${fmt(d, { weekday: 'long' })}`}>
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
