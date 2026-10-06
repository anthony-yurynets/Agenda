import { CalendarClock } from 'lucide-react'
import { fromMinutes } from '../../lib/domain'
import { whenLabel } from '../../lib/dashboard'
import StatusIcon from '../StatusIcon'

/** The next few calendar events. Clicking one opens it like on the Calendar. */
export default function Upcoming({ events, today, nowMins, categoriesById, selectedId, onOpen }) {
  return (
    <div className="tile-inner">
      <div className="tile-head">
        <h3>Coming up</h3>
      </div>
      {events.length === 0 ? (
        <div className="dash-empty">
          <CalendarClock size={20} />
          <p>Nothing on the calendar in the next two months.</p>
        </div>
      ) : (
        <ul className="up-list">
          {events.map((b) => {
            const cat = categoriesById.get(b.category_id)
            const d = new Date(`${b.date}T12:00`)
            const when = whenLabel(b, today, nowMins)
            return (
              <li key={b.id}>
                <button
                  className={`up-item s-${b.status} ${selectedId === b.id ? 'selected' : ''} ${when === 'Now' ? 'now' : ''}`}
                  style={{ '--cat': cat?.color ?? '#94a3b8' }}
                  onClick={() => onOpen(b.id)}
                >
                  <span className={`up-date ${b.date === today ? 'today' : ''}`}>
                    <span className="wk-dow">{d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
                    <span className="up-dom">{d.getDate()}</span>
                  </span>
                  <span className="up-main">
                    <span className="up-title">
                      <span>{b.title || 'Untitled'}</span>
                      <StatusIcon status={b.status} size={13} className="status-fg" />
                    </span>
                    <span className="up-when">
                      <strong>{when}</strong>
                      <span className="muted"> · {b.all_day ? 'All day' : `${fromMinutes(b.start)}–${fromMinutes(b.end === 1440 ? 1439 : b.end)}`}</span>
                      {cat && <span className="muted"> · {cat.name}</span>}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
