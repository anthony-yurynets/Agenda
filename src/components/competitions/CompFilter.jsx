import { useEffect, useRef, useState } from 'react'
import { Check, Rocket, SlidersHorizontal } from 'lucide-react'
import { CATEGORIES, DECISIONS, EMPTY_FILTERS, MIN_PRESTIGE, STATES, WITHIN, filterCount } from '../../lib/competitions'

const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

function Single({ label, options, value, onChange }) {
  return (
    <div className="segmented small cf-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Filter dropdown: category, status, next date, prestige and submission items.
 * `decisions` limits the "Are we doing it?" answers offered (and hides projects
 * when 'doing' isn't one of them).
 */
export default function CompFilter({ value: f, onChange, options, projects, counts, decisions = DECISIONS }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const set = (patch) => onChange({ ...f, ...patch })
  const n = filterCount(f)

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
      <button className={`btn ghost ${n ? 'is-active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <SlidersHorizontal size={15} /> Filter
        {n > 0 && <span className="badge">{n}</span>}
      </button>
      {open && (
        <div className="menu comp-filter" role="dialog" aria-label="Filter competitions">
          <div className="cf-section">
            <span className="field-label">Category</span>
            <div className="chips">
              {CATEGORIES.map((c) => {
                const on = f.categories.includes(c.id)
                return (
                  <button key={c.id} className={`chip cat-chip cc-${c.id} ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ categories: toggleIn(f.categories, c.id) })}>
                    <i aria-hidden="true" />
                    {c.label}
                    <span className="chip-count">{counts.category[c.id] ?? 0}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="cf-section">
            <span className="field-label">Are we doing it?</span>
            <div className="chips">
              {decisions.map((d) => {
                const on = f.decisions.includes(d.id)
                return (
                  <button key={d.id} className={`chip dec-chip d-${d.id} ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ decisions: toggleIn(f.decisions, d.id) })}>
                    {on && <Check size={12} />}
                    {d.label}
                    <span className="chip-count">{counts.decision[d.id] ?? 0}</span>
                  </button>
                )
              })}
            </div>
            {projects.length > 0 && decisions.some((d) => d.id === 'doing') && (
              <div className="chips cf-projects" role="group" aria-label="Doing with project">
                {projects.map((p) => {
                  const on = f.projects.includes(p.id)
                  return (
                    <button key={p.id} className={`chip opt-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ projects: toggleIn(f.projects, p.id) })}>
                      {on ? <Check size={12} /> : <Rocket size={12} />}
                      {p.name}
                      <span className="chip-count">{counts.project[p.id] ?? 0}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="cf-section">
            <span className="field-label">Status</span>
            <div className="chips">
              {STATES.map((s) => {
                const on = f.states.includes(s.id)
                return (
                  <button key={s.id} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ states: toggleIn(f.states, s.id) })}>
                    {on && <Check size={12} />}
                    {s.label}
                    <span className="chip-count">{counts.state[s.id] ?? 0}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="cf-section">
            <span className="field-label">Next date within</span>
            <Single label="Next date within" options={WITHIN} value={f.within} onChange={(within) => set({ within })} />
          </div>

          <div className="cf-section">
            <span className="field-label">Minimum prestige</span>
            <Single label="Minimum prestige" options={MIN_PRESTIGE} value={f.minPrestige} onChange={(minPrestige) => set({ minPrestige })} />
          </div>

          <div className="cf-section">
            <span className="field-label">
              Submission items
              <span className="flex1" />
              {f.items.length > 1 && (
                <span className="segmented small cf-mode" role="radiogroup" aria-label="Item match">
                  {['any', 'all'].map((m) => (
                    <button key={m} role="radio" aria-checked={f.itemMode === m} className={f.itemMode === m ? 'on' : ''} onClick={() => set({ itemMode: m })}>
                      {m === 'any' ? 'Any' : 'All'}
                    </button>
                  ))}
                </span>
              )}
            </span>
            <div className="chips">
              {options.map((o) => {
                const on = f.items.includes(o.id)
                return (
                  <button key={o.id} className={`chip opt-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ items: toggleIn(f.items, o.id) })}>
                    {on && <Check size={12} />}
                    {o.name}
                  </button>
                )
              })}
              {!options.length && <span className="muted small">No submission items yet.</span>}
            </div>
          </div>

          <div className="cf-foot">
            <button className="btn ghost sm" disabled={!n} onClick={() => onChange(EMPTY_FILTERS)}>
              Reset
            </button>
            <span className="flex1" />
            <button className="btn primary sm" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
