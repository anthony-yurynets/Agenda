import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, ExternalLink, ListChecks, Plus, Search, Trophy, X } from 'lucide-react'
import { useCompetitions } from '../state/useCompetitions'
import { localToday } from '../state/useFitness'
import {
  CATEGORIES,
  SORTS,
  addDays,
  buildIndex,
  countdownLabel,
  daysBetween,
  fmtDate,
  hostOf,
  normalizeUrl,
  parseQuery,
  searchCompetitions,
  sortCompetitions,
  timelineState,
  urgency,
} from '../lib/competitions'
import { CategoryPill, Countdown, Highlight, OptionManager, PrestigeMeter, TimelineTrack } from '../components/competitions/CompBits'
import CompetitionPanel from '../components/competitions/CompetitionPanel'

const MAX_ITEMS = 3

function Row({ r, tl, today, optionsById, selected, onOpen, onKeyNav }) {
  const c = r.comp
  const items = (c.submission_items ?? []).map((id) => optionsById[id]).filter(Boolean)
  const href = normalizeUrl(c.url)
  return (
    <tr className={`comp-row cc-${c.category} ${selected ? 'selected' : ''} ${tl.state === 'finished' ? 'finished' : ''}`} onClick={() => onOpen(c.id)}>
      <td className="c-name">
        <span className="cat-edge" aria-hidden="true" />
        <button className="comp-open" onClick={(e) => (e.stopPropagation(), onOpen(c.id))} onKeyDown={onKeyNav} data-comp-row>
          <span className="comp-title">{c.name ? <Highlight text={c.name} indices={r.highlight} /> : <span className="muted">Untitled competition</span>}</span>
        </button>
        <div className="comp-sub">
          {href && (
            <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="comp-link" aria-label={`Open ${c.name || 'competition'} site`}>
              {hostOf(c.url)} <ExternalLink size={11} />
            </a>
          )}
          {c.description && <span className="comp-desc">{c.description}</span>}
        </div>
      </td>
      <td className="c-cat" data-label="Category">
        <CategoryPill id={c.category} />
      </td>
      <td className="c-prestige" data-label="Prestige">
        <PrestigeMeter value={c.prestige} />
      </td>
      <td className="c-items" data-label="Submit">
        <div className="item-chips">
          {items.slice(0, MAX_ITEMS).map((o) => (
            <span key={o.id} className="item-chip">
              {o.name}
            </span>
          ))}
          {items.length > MAX_ITEMS && (
            <span className="item-chip more" title={items.slice(MAX_ITEMS).map((o) => o.name).join(', ')}>
              +{items.length - MAX_ITEMS}
            </span>
          )}
          {!items.length && <span className="muted small">—</span>}
        </div>
      </td>
      <td className="c-timeline" data-label="Timeline">
        <TimelineTrack tl={tl} today={today} />
      </td>
      <td className="c-next" data-label="Next">
        <Countdown days={tl.daysToNext} date={tl.next?.date} />
      </td>
    </tr>
  )
}

/** Competition tracker: instant search over a frosted table, editing in a side panel. */
export default function CompetitionsPage({ session, toast }) {
  const store = useCompetitions(session.user.id, { onError: (m) => toast(m, 'error') })
  const { competitions, optionsById } = store
  const today = localToday()

  const [query, setQuery] = useState('')
  const [cats, setCats] = useState(() => new Set())
  const [sort, setSort] = useState('deadline')
  const [openId, setOpenId] = useState(null)
  const [itemsOpen, setItemsOpen] = useState(false)
  const searchRef = useRef(null)
  const tableRef = useRef(null)
  const itemsRef = useRef(null)
  const deferredQuery = useDeferredValue(query)

  const index = useMemo(() => buildIndex(competitions, optionsById), [competitions, optionsById])
  const timelines = useMemo(() => Object.fromEntries(competitions.map((c) => [c.id, timelineState(c.timeline, today)])), [competitions, today])
  const results = useMemo(() => {
    const hits = searchCompetitions(index, deferredQuery, { today }).filter((r) => !cats.size || cats.has(r.comp.category))
    // A text query ranks by relevance; otherwise use the chosen sort.
    return parseQuery(deferredQuery).terms.length ? hits : sortCompetitions(hits, sort, today, (r) => r.comp)
  }, [index, deferredQuery, cats, sort, today])

  const counts = useMemo(() => {
    const out = {}
    for (const c of competitions) out[c.category] = (out[c.category] ?? 0) + 1
    return out
  }, [competitions])
  const usage = useMemo(() => {
    const u = {}
    for (const c of competitions) for (const id of c.submission_items ?? []) u[id] = (u[id] ?? 0) + 1
    return u
  }, [competitions])

  // Every stage in the next 45 days, across competitions.
  const upNext = useMemo(
    () =>
      competitions
        .flatMap((c) => timelines[c.id].stages.filter((s) => s.date >= today && s.date <= addDays(today, 45)).map((s) => ({ c, s })))
        .sort((a, b) => a.s.date.localeCompare(b.s.date))
        .slice(0, 8),
    [competitions, timelines, today],
  )

  const open = openId ? competitions.find((c) => c.id === openId) : null
  const filtered = query.trim() || cats.size

  // "/" focuses search; Escape closes the panel.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !e.target.closest?.('input, textarea')) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (e.key === 'Escape' && openId && !e.target.closest?.('input, textarea')) setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  useEffect(() => {
    if (!itemsOpen) return
    const close = (e) => !itemsRef.current?.contains(e.target) && setItemsOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [itemsOpen])

  const rowButtons = () => [...(tableRef.current?.querySelectorAll('[data-comp-row]') ?? [])]
  const onKeyNav = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const btns = rowButtons()
    const i = btns.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)
    if (i < 0) searchRef.current?.focus()
    else btns[Math.min(i, btns.length - 1)]?.focus()
  }

  const toggleCat = (id) =>
    setCats((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const add = () => setOpenId(store.createCompetition({ category: cats.size === 1 ? [...cats][0] : 'other' }))

  return (
    <div className="comps">
      <div className="comps-main">
        <header className="comps-head glass-tile">
          <div className="comps-title">
            <Trophy size={20} />
            <div>
              <h2>Competitions</h2>
              <p className="muted small">
                {competitions.length} tracked
                {upNext.length > 0 && ` · next date ${countdownLabel(daysBetween(today, upNext[0].s.date)).toLowerCase()}`}
              </p>
            </div>
          </div>
          <label className="search comps-search">
            <Search size={17} />
            <input
              ref={searchRef}
              placeholder="Search name, item, stage…  try  #research  >7  soon"
              value={query}
              aria-label="Search competitions"
              aria-controls="comp-table"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') (setQuery(''), e.currentTarget.blur())
                else if (e.key === 'ArrowDown') (e.preventDefault(), rowButtons()[0]?.focus())
                else if (e.key === 'Enter' && results[0]) setOpenId(results[0].comp.id)
              }}
            />
            {query ? (
              <button className="icon-btn sm" onClick={() => (setQuery(''), searchRef.current?.focus())} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </label>
          <div className="comps-actions">
            <div className="dropdown" ref={itemsRef}>
              <button className={`btn ghost ${itemsOpen ? 'is-active' : ''}`} onClick={() => setItemsOpen((o) => !o)} aria-expanded={itemsOpen}>
                <ListChecks size={15} /> Items
              </button>
              {itemsOpen && (
                <div className="menu items-menu">
                  <div className="menu-label">Submission item options</div>
                  <OptionManager store={store} usage={usage} startEditing />
                </div>
              )}
            </div>
            <button className="btn primary" onClick={add}>
              <Plus size={15} /> Add
            </button>
          </div>
        </header>

        <div className="comps-filters">
          <div className="chips" role="group" aria-label="Filter by category">
            {CATEGORIES.map((c) => (
              <button key={c.id} className={`chip cat-chip cc-${c.id} ${cats.has(c.id) ? 'on' : ''}`} aria-pressed={cats.has(c.id)} onClick={() => toggleCat(c.id)}>
                <i aria-hidden="true" />
                {c.label}
                <span className="chip-count">{counts[c.id] ?? 0}</span>
              </button>
            ))}
            {filtered ? (
              <button className="chip" onClick={() => (setQuery(''), setCats(new Set()))}>
                <X size={12} /> Clear
              </button>
            ) : null}
          </div>
          <span className="flex1" />
          <div className="segmented small" role="radiogroup" aria-label="Sort by">
            {SORTS.map((s) => (
              <button key={s.id} role="radio" aria-checked={sort === s.id} className={sort === s.id ? 'on' : ''} onClick={() => setSort(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {upNext.length > 0 && !filtered && (
          <section className="up-next" aria-label="Upcoming dates">
            {upNext.map(({ c, s }) => {
              const d = daysBetween(today, s.date)
              return (
                <button key={`${c.id}-${s.index}`} className={`un-card cc-${c.category} u-${urgency(d)}`} onClick={() => setOpenId(c.id)}>
                  <span className="un-when">
                    <strong>{countdownLabel(d)}</strong> · {fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="un-comp">{c.name || 'Untitled'}</span>
                  <span className="un-stage">{s.label || `Stage ${s.index + 1}`}</span>
                </button>
              )
            })}
          </section>
        )}

        <section className="comp-table-wrap glass-tile" ref={tableRef}>
          <table className="comp-table" id="comp-table">
            <caption className="sr-only">
              Competitions{filtered ? `, ${results.length} matching` : ''}
            </caption>
            <thead>
              <tr>
                <th scope="col">Competition</th>
                <th scope="col">Category</th>
                <th scope="col">Prestige</th>
                <th scope="col">Submission items</th>
                <th scope="col">Timeline</th>
                <th scope="col">Next date</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <Row
                  key={r.comp.id}
                  r={r}
                  tl={timelines[r.comp.id]}
                  today={today}
                  optionsById={optionsById}
                  selected={r.comp.id === openId}
                  onOpen={setOpenId}
                  onKeyNav={onKeyNav}
                />
              ))}
            </tbody>
          </table>
          {!results.length && !store.loading && (
            <div className="comp-empty">
              {competitions.length ? (
                <>
                  <p>No competitions match “{query}”.</p>
                  <p className="muted small">Try fewer words, or clear the category filter.</p>
                </>
              ) : (
                <>
                  <Trophy size={26} className="muted" />
                  <p>Track your first competition.</p>
                  <p className="muted small">Add one, or ask your AI to research and add competitions for you.</p>
                  <button className="btn primary sm" onClick={add}>
                    <Plus size={14} /> Add competition
                  </button>
                </>
              )}
            </div>
          )}
          <p className="comp-hint muted small" aria-live="polite">
            {filtered ? `${results.length} of ${competitions.length}` : `${competitions.length} competitions`}
            <span>
              <kbd>/</kbd> search · <kbd>↑</kbd>
              <kbd>↓</kbd> move · <kbd><CornerDownLeft size={10} /></kbd> open
            </span>
          </p>
        </section>
      </div>

      {open && <CompetitionPanel key={open.id} comp={open} store={store} today={today} onClose={() => setOpenId(null)} toast={toast} />}
    </div>
  )
}
