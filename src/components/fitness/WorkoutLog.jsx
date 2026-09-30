import { Bot, Check, Plus } from 'lucide-react'
import { MUSCLE_BY_ID, muscleLabel, trained, workoutStats } from '../../lib/fitness'

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const dateParts = (iso) => {
  const d = new Date(`${iso}T12:00:00`)
  return { dow: DOW[d.getDay()], dom: d.getDate(), month: d.toLocaleString([], { month: 'short' }) }
}

/** Progress ring: completed sets out of planned sets. */
function Ring({ value, done }) {
  const r = 15
  const c = 2 * Math.PI * r
  return (
    <svg className="wk-ring" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} className="ring-track" />
      <circle cx="20" cy="20" r={r} className="ring-fill" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 20 20)" />
      {done && <Check x="12" y="12" width="16" height="16" className="ring-check" />}
    </svg>
  )
}

function stateOf(w, today) {
  if (w.status === 'skipped') return 'skipped'
  if (trained(w) && w.status === 'done') return 'done'
  if (w.date === today) return 'today'
  if (w.date > today) return 'planned'
  return trained(w) ? 'done' : 'missed'
}

function Card({ w, today, selected, onOpen, unit }) {
  const { dow, dom, month } = dateParts(w.date)
  const st = workoutStats(w)
  const state = stateOf(w, today)
  const shown = st.muscles.slice(0, 4)
  return (
    <button className={`wk-card ${state} ${selected ? 'selected' : ''}`} onClick={() => onOpen(w.id)}>
      <div className="wk-date">
        <span className="wk-dow">{dow}</span>
        <span className="wk-dom">{dom}</span>
        <span className="wk-month">{month}</span>
      </div>
      <div className="wk-main">
        <div className="wk-title">
          <span>{w.title || 'Workout'}</span>
          {w.source === 'ai' && <Bot size={13} className="muted" aria-label="Created by AI" />}
          {state === 'today' && <span className="wk-tag">Today</span>}
          {state === 'missed' && <span className="wk-tag muted-tag">Missed</span>}
          {state === 'skipped' && <span className="wk-tag muted-tag">Skipped</span>}
        </div>
        <div className="wk-muscles">
          {shown.map((m) => (
            <span key={m} className={`mchip g-${MUSCLE_BY_ID[m]?.group ?? 'core'}`}>
              {muscleLabel(m)}
            </span>
          ))}
          {st.muscles.length > shown.length && <span className="mchip more">+{st.muscles.length - shown.length}</span>}
          {!st.muscles.length && <span className="muted small">No exercises yet</span>}
        </div>
        <div className="wk-stats">
          {w.exercises.length} exercise{w.exercises.length === 1 ? '' : 's'} · {st.done}/{st.sets} sets
          {st.volume > 0 && ` · ${Math.round(st.volume).toLocaleString()} ${unit}`}
        </div>
      </div>
      <Ring value={st.sets ? st.done / st.sets : 0} done={state === 'done'} />
    </button>
  )
}

/** Workouts as a timeline: what's next on top, history below. */
export default function WorkoutLog({ workouts, today, selectedId, onOpen, onNew, unit, onUnit }) {
  const upcoming = workouts.filter((w) => w.date >= today && w.status === 'planned').sort((a, b) => a.date.localeCompare(b.date))
  const upIds = new Set(upcoming.map((w) => w.id))
  const history = workouts.filter((w) => !upIds.has(w.id))

  return (
    <div className="workout-log">
      <div className="tile-head">
        <h3>Workouts</h3>
        <span className="flex1" />
        <div className="segmented small" role="radiogroup" aria-label="Weight unit">
          {['lb', 'kg'].map((u) => (
            <button key={u} role="radio" aria-checked={unit === u} className={unit === u ? 'on' : ''} onClick={() => onUnit(u)}>
              {u}
            </button>
          ))}
        </div>
        <button className="btn primary sm" onClick={onNew}>
          <Plus size={14} /> Log workout
        </button>
      </div>
      <div className="wk-scroll">
        {upcoming.length > 0 && <div className="wk-section">Up next</div>}
        {upcoming.map((w) => (
          <Card key={w.id} w={w} today={today} selected={selectedId === w.id} onOpen={onOpen} unit={unit} />
        ))}
        {history.length > 0 && <div className="wk-section">History</div>}
        {history.map((w) => (
          <Card key={w.id} w={w} today={today} selected={selectedId === w.id} onOpen={onOpen} unit={unit} />
        ))}
        {!workouts.length && (
          <div className="wk-empty">
            <p>No workouts yet.</p>
            <p className="muted small">Log one, or ask your AI to plan your week.</p>
          </div>
        )}
      </div>
    </div>
  )
}
