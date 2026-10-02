import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, CircleHelp, Pencil, Plus, Rocket, Trash2, X } from 'lucide-react'
import { categoryLabel, countdownLabel, decisionOf, fmtDate, highlightRuns, prestigeTier, urgency } from '../../lib/competitions'

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
 * A user-editable named list (submission items, projects): toggle chips (when
 * `selected` is given), and an edit mode to add, rename and delete entries.
 * `list` is { items, create, rename, remove } from useCompetitions.
 */
export function OptionManager({ list, selected, onToggle, usage, startEditing = false, placeholder = 'New item (e.g. Demo video)', noun = 'options' }) {
  const [editing, setEditing] = useState(startEditing)
  const [draft, setDraft] = useState('')
  const [names, setNames] = useState({})
  const add = (e) => {
    e.preventDefault()
    const id = list.create(draft)
    if (id && onToggle && !selected?.includes(id)) onToggle(id)
    setDraft('')
  }
  const commitName = (o) => {
    const v = (names[o.id] ?? o.name).trim()
    if (v && v !== o.name) list.rename(o.id, v)
    setNames((n) => ({ ...n, [o.id]: undefined }))
  }

  return (
    <div className="opt-manager">
      {editing ? (
        <ul className="opt-edit-list">
          {list.items.map((o) => (
            <li key={o.id}>
              <input
                value={names[o.id] ?? o.name}
                maxLength={80}
                aria-label="Name"
                onChange={(e) => setNames((n) => ({ ...n, [o.id]: e.target.value }))}
                onBlur={() => commitName(o)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              {usage && <span className="count" title="Competitions using this">{usage[o.id] ?? 0}</span>}
              <button className="icon-btn sm" onClick={() => list.remove(o.id)} aria-label={`Delete ${o.name}`}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {!list.items.length && <li className="muted small">No {noun} yet — add your first below.</li>}
        </ul>
      ) : (
        <div className="chips" role="group">
          {list.items.map((o) => {
            const on = selected?.includes(o.id)
            return (
              <button key={o.id} className={`chip opt-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onToggle(o.id)}>
                {on && <Check size={12} />}
                {o.name}
              </button>
            )
          })}
          {!list.items.length && <span className="muted small">No {noun} yet. Add one below.</span>}
        </div>
      )}
      <form className="opt-add" onSubmit={add}>
        <input placeholder={placeholder} value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} aria-label={placeholder} />
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

const DECISION_ICON = { doing: Rocket, maybe: CircleHelp, no: X, undecided: CircleHelp }

/** Read-only badge for a competition's "Are we doing this?" answer. */
export function DecisionBadge({ comp, projectsById }) {
  const d = decisionOf(comp)
  const Icon = DECISION_ICON[d]
  const label = d === 'doing' ? projectsById[comp.project_id]?.name ?? 'Doing' : d === 'maybe' ? 'Maybe' : d === 'no' ? 'Not doing' : 'Decide'
  return (
    <span className={`decision d-${d}`}>
      <Icon size={12} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

/**
 * "Are we doing this?" — pick a project (yes, entering with it), Maybe or No.
 * New projects can be added inline; `onChange` gets a project id, 'maybe', 'no' or null.
 */
export function DecisionPicker({ comp, store, onChange, compact = false }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef(null)
  const d = decisionOf(comp)
  const toggle = () => {
    // Open upward when the scroll area has no room below (the table clips overflow).
    const box = ref.current?.getBoundingClientRect()
    const area = ref.current?.closest('.comp-table-wrap, .bp-scroll')?.getBoundingClientRect()
    if (box && area) setUp(area.bottom - box.bottom < 300 && box.top - area.top > area.bottom - box.bottom)
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc, true)
    }
  }, [open])

  const pick = (answer) => {
    onChange(answer)
    setOpen(false)
  }
  const addProject = (e) => {
    e.preventDefault()
    const id = store.projectList.create(draft)
    if (id) pick(id)
    setDraft('')
  }

  return (
    <div className={`dropdown decision-picker ${compact ? 'compact' : ''}`} ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        className={`decision-btn d-${d}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Are we doing ${comp.name || 'this'}? ${d === 'doing' ? `Yes, with ${store.projectsById[comp.project_id]?.name}` : d}`}
      >
        <DecisionBadge comp={comp} projectsById={store.projectsById} />
        <ChevronDown size={13} className="decision-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className={`menu decision-menu ${up ? 'up' : ''}`} role="menu">
          <div className="menu-label">Yes — enter with project</div>
          {store.projects.map((p) => (
            <button key={p.id} role="menuitemradio" aria-checked={comp.project_id === p.id} className="dm-project" onClick={() => pick(p.id)}>
              <Rocket size={14} />
              <span className="flex1">{p.name}</span>
              {comp.project_id === p.id && <Check size={14} />}
            </button>
          ))}
          <form className="dm-add" onSubmit={addProject}>
            <input placeholder="New project…" value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} aria-label="New project name" />
            <button className="icon-btn sm" disabled={!draft.trim()} aria-label="Add project and choose it">
              <Plus size={14} />
            </button>
          </form>
          <div className="dm-sep" />
          {[
            ['maybe', 'Maybe', CircleHelp],
            ['no', 'Not doing it', X],
          ].map(([id, label, Icon]) => (
            <button key={id} role="menuitemradio" aria-checked={d === id} className={`dm-${id}`} onClick={() => pick(id)}>
              <Icon size={14} />
              <span className="flex1">{label}</span>
              {d === id && <Check size={14} />}
            </button>
          ))}
          {d !== 'undecided' && (
            <button role="menuitem" className="dm-clear" onClick={() => pick(null)}>
              <span className="flex1">Clear answer</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
