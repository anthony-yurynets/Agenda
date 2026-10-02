import { useState } from 'react'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { categoryLabel, countdownLabel, fmtDate, highlightRuns, prestigeTier, urgency } from '../../lib/competitions'

export function Highlight({ text, indices }) {
  return highlightRuns(text, indices).map((r, i) => (r.hit ? <mark key={i}>{r.text}</mark> : <span key={i}>{r.text}</span>))
}

export function CategoryPill({ id }) {
  return (
    <span className={`cat-pill cc-${id}`}>
      <i aria-hidden="true" />
      {categoryLabel(id)}
    </span>
  )
}

/** 10 ticks, filled up to the score. */
export function PrestigeMeter({ value }) {
  const tier = prestigeTier(value)
  if (!value) return <span className="muted small">Unrated</span>
  return (
    <div className={`prestige p-${tier.label.toLowerCase()}`} role="img" aria-label={`Prestige ${value} out of 10, ${tier.label}`}>
      <div className="prestige-num">
        <strong>{value}</strong>
        <span>/10</span>
      </div>
      <div className="prestige-ticks" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={i < value ? 'on' : ''} />
        ))}
      </div>
    </div>
  )
}

export function Countdown({ days, date }) {
  if (days === null || days === undefined) return <span className="muted small">—</span>
  return (
    <div className={`countdown u-${urgency(days)}`}>
      <strong>{countdownLabel(days)}</strong>
      <span>{fmtDate(date)}</span>
    </div>
  )
}

/**
 * Timeline as a track: stages are dots placed by date between the first and
 * last stage, with a "today" marker. Past stages are filled.
 */
export function TimelineTrack({ tl, today }) {
  const { stages, start, end, next } = tl
  if (!stages.length) return <span className="muted small">No dates yet</span>
  const span = Math.max(new Date(`${end}T00:00`) - new Date(`${start}T00:00`), 1)
  const pos = (iso) => Math.min(Math.max((new Date(`${iso}T00:00`) - new Date(`${start}T00:00`)) / span, 0), 1) * 100
  const label = stages.map((s) => `${s.label || `Stage ${s.index + 1}`}: ${fmtDate(s.date)} (day ${s.day})`).join('; ')
  return (
    <div className={`tl tl-${tl.state}`} role="img" aria-label={`Timeline: ${label}`}>
      <div className="tl-track">
        <span className="tl-fill" style={{ width: `${(tl.progress ?? 0) * 100}%` }} />
        {stages.map((s) => (
          <span
            key={s.index}
            className={`tl-dot ${s.date < today ? 'past' : ''} ${next?.index === s.index ? 'next' : ''}`}
            style={{ left: `${stages.length === 1 ? 50 : pos(s.date)}%` }}
            title={`${s.label || `Stage ${s.index + 1}`} · ${fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric' })} · Day ${s.day}`}
          />
        ))}
        {tl.state === 'active' && <span className="tl-today" style={{ left: `${pos(today)}%` }} title="Today" />}
      </div>
      <div className="tl-caption">
        {next ? (
          <>
            <span className="tl-stage">{next.label || `Stage ${next.index + 1}`}</span>
            <span className="muted">
              {' '}
              · Day {next.day} · {next.index + 1}/{stages.length}
            </span>
          </>
        ) : (
          <span className="muted">All {stages.length} stages done</span>
        )}
      </div>
    </div>
  )
}

/**
 * The submission-item option list: toggle chips (when `selected` is given),
 * and an edit mode to add, rename and delete options.
 */
export function OptionManager({ store, selected, onToggle, usage, startEditing = false }) {
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState('')
  const [names, setNames] = useState({})
  const add = (e) => {
    e.preventDefault()
    const id = store.createOption(draft)
    if (id && onToggle && !selected?.includes(id)) onToggle(id)
    setDraft('')
  }
  const commitName = (o) => {
    const v = (names[o.id] ?? o.name).trim()
    if (v && v !== o.name) store.renameOption(o.id, v)
    setNames((n) => ({ ...n, [o.id]: undefined }))
  }

  return (
    <div className="opt-manager">
      {editing ? (
        <ul className="opt-edit-list">
          {store.options.map((o) => (
            <li key={o.id}>
              <input
                value={names[o.id] ?? o.name}
                maxLength={80}
                aria-label="Option name"
                onChange={(e) => setNames((n) => ({ ...n, [o.id]: e.target.value }))}
                onBlur={() => commitName(o)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              {usage && <span className="count" title="Competitions using this">{usage[o.id] ?? 0}</span>}
              <button className="icon-btn sm" onClick={() => store.deleteOption(o.id)} aria-label={`Delete ${o.name}`}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {!store.options.length && <li className="muted small">No options yet — add your first below.</li>}
        </ul>
      ) : (
        <div className="chips" role="group" aria-label="Submission items">
          {store.options.map((o) => {
            const on = selected?.includes(o.id)
            return (
              <button key={o.id} className={`chip opt-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onToggle(o.id)}>
                {on && <Check size={12} />}
                {o.name}
              </button>
            )
          })}
          {!store.options.length && <span className="muted small">No options yet. Add one below.</span>}
        </div>
      )}
      <form className="opt-add" onSubmit={add}>
        <input placeholder="New item (e.g. Demo video)" value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} aria-label="New submission item" />
        <button className="btn ghost sm" disabled={!draft.trim()}>
          <Plus size={13} /> Add
        </button>
        {onToggle && (
          <button type="button" className={`btn ghost sm ${editing ? 'is-active' : ''}`} onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
            {editing ? <Check size={13} /> : <Pencil size={13} />} {editing ? 'Done' : 'Edit list'}
          </button>
        )}
      </form>
    </div>
  )
}
