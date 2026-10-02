import { useMemo } from 'react'
import { Bot, ExternalLink, Plus, Trash2, X } from 'lucide-react'
import { CATEGORIES, addDays, daysBetween, fmtDate, isDate, normalizeUrl, prestigeTier, stages as sortStages } from '../../lib/competitions'
import { OptionManager } from './CompBits'

/** Timeline editor: one row per stage, as a vertical rail. Date and "Day N" stay in sync. */
function TimelineEditor({ timeline, today, onChange }) {
  const list = Array.isArray(timeline) ? timeline : []
  const sorted = sortStages(list)
  const base = sorted[0]?.date
  const set = (i, patch, opts) => onChange(list.map((s, j) => (j === i ? { ...s, ...patch } : s)), opts)
  const add = () => {
    const last = sorted[sorted.length - 1]?.date
    onChange([...list, { label: `Stage ${list.length + 1}`, date: last ? addDays(last, 7) : today }])
  }
  // Show rows in date order, but keep editing the stored entry.
  const order = list.map((s, i) => ({ s, i })).sort((a, b) => (a.s.date ?? '').localeCompare(b.s.date ?? ''))

  return (
    <div className="tl-editor">
      <ol className="tl-rail">
        {order.map(({ s, i }, k) => {
          const valid = isDate(s.date)
          const day = valid && base ? daysBetween(base, s.date) + 1 : ''
          const state = !valid ? '' : (s.end ?? s.date) < today ? 'past' : s.date <= today ? 'now' : 'future'
          return (
            <li key={i} className={`tl-row ${state}`}>
              <span className="tl-node" aria-hidden="true" />
              <div className="tl-row-main">
                <div className="tl-row-top">
                  <input
                    className="tl-label"
                    value={s.label ?? ''}
                    placeholder={`Stage ${k + 1}`}
                    maxLength={80}
                    aria-label="Stage name"
                    onChange={(e) => set(i, { label: e.target.value }, { debounce: 400 })}
                  />
                  <button className="icon-btn sm" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Remove ${s.label || 'stage'}`}>
                    <X size={14} />
                  </button>
                </div>
                <div className="tl-row-fields">
                  <label>
                    <span>Starts</span>
                    <input type="date" value={s.date ?? ''} onChange={(e) => e.target.value && set(i, { date: e.target.value })} />
                  </label>
                  <label className="tl-day" title="Days since the first stage (Day 1)">
                    <span>Day</span>
                    <input
                      type="number"
                      min={1}
                      value={day}
                      disabled={!base || k === 0}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isInteger(n) && n >= 1 && n <= 3650) set(i, { date: addDays(base, n - 1) })
                      }}
                    />
                  </label>
                  <label>
                    <span>Ends</span>
                    <input
                      type="date"
                      value={s.end ?? ''}
                      min={s.date}
                      onChange={(e) => {
                        const next = { ...s, end: e.target.value }
                        if (!e.target.value) delete next.end
                        onChange(list.map((x, j) => (j === i ? next : x)))
                      }}
                    />
                  </label>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {!list.length && <p className="empty-sub">Add the stages and deadlines — e.g. registration, stage 1 submission, finals.</p>}
      <button className="btn ghost sm tl-add" onClick={add}>
        <Plus size={13} /> Add stage
      </button>
    </div>
  )
}

/** Edit one competition. */
export default function CompetitionPanel({ comp: c, store, today, onClose, toast }) {
  const update = (patch, opts) => store.updateCompetition(c.id, patch, opts)
  const tier = prestigeTier(c.prestige)
  const href = normalizeUrl(c.url)
  const usage = useMemo(() => {
    const u = {}
    for (const x of store.competitions) for (const id of x.submission_items ?? []) u[id] = (u[id] ?? 0) + 1
    return u
  }, [store.competitions])
  const toggleItem = (id) => {
    const items = c.submission_items ?? []
    update({ submission_items: items.includes(id) ? items.filter((x) => x !== id) : [...items, id] })
  }

  return (
    <aside className="comp-panel" aria-label="Competition details">
      <div className="bp-head">
        <span className="muted small">{c.created_at ? `Added ${fmtDate(c.created_at.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}` : 'New competition'}</span>
        {c.source === 'ai' && (
          <span className="ai-badge flat">
            <Bot size={13} /> From your AI
          </span>
        )}
        <span className="flex1" />
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="bp-scroll">
        <input
          className="comp-name-input"
          placeholder="Competition name"
          value={c.name}
          maxLength={200}
          autoFocus={!c.name}
          aria-label="Competition name"
          onChange={(e) => update({ name: e.target.value }, { debounce: 400 })}
        />

        <label className="field">
          <span className="field-label">Link</span>
          <div className="link-field">
            <input placeholder="https://…" value={c.url} maxLength={2000} onChange={(e) => update({ url: e.target.value }, { debounce: 400 })} />
            {href && (
              <a className="icon-btn" href={href} target="_blank" rel="noreferrer" aria-label="Open link in new tab">
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        </label>

        <label className="field">
          <span className="field-label">Description</span>
          <textarea
            className="notes"
            rows={3}
            placeholder="What it is, eligibility, prizes, notes to self…"
            value={c.description}
            maxLength={4000}
            onChange={(e) => update({ description: e.target.value }, { debounce: 500 })}
          />
        </label>

        <span className="field-label">Category</span>
        <div className="chips" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              role="radio"
              aria-checked={c.category === cat.id}
              className={`chip cat-chip cc-${cat.id} ${c.category === cat.id ? 'on' : ''}`}
              onClick={() => update({ category: cat.id })}
            >
              <i aria-hidden="true" />
              {cat.label}
            </button>
          ))}
        </div>

        <span className="field-label">
          Prestige {c.prestige ? <span className="count">{c.prestige}/10 · {tier.label}</span> : <span className="muted">· not rated</span>}
        </span>
        <div className="prestige-picker" role="radiogroup" aria-label="Prestige out of 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={c.prestige === n}
              aria-label={`${n} out of 10`}
              className={`${c.prestige >= n ? 'filled' : ''} ${c.prestige === n ? 'on' : ''} p-${prestigeTier(n).label.toLowerCase()}`}
              onClick={() => update({ prestige: c.prestige === n ? null : n })}
            >
              {n}
            </button>
          ))}
        </div>

        <span className="field-label">Submission items</span>
        <OptionManager store={store} selected={c.submission_items ?? []} onToggle={toggleItem} usage={usage} />

        <span className="field-label">Timeline</span>
        <TimelineEditor timeline={c.timeline} today={today} onChange={(timeline, opts) => update({ timeline }, opts)} />
      </div>

      <div className="bp-foot">
        <button
          className="btn ghost danger"
          onClick={() => {
            store.deleteCompetition(c.id)
            toast('Competition deleted')
            onClose()
          }}
        >
          <Trash2 size={15} /> Delete
        </button>
        <span className="flex1" />
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </aside>
  )
}
