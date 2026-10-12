import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, ExternalLink, FolderOpen, ListChecks, Plus, Search, Trophy, X } from 'lucide-react'
import { useCompetitions } from '../state/useCompetitions'
import { supabase } from '../lib/supabase'
import { localToday } from '../state/useFitness'
import {
  CATEGORIES,
  EMPTY_FILTERS,
  MIN_PRESTIGE,
  SORTS,
  STATES,
  WITHIN,
  addDays,
  buildIndex,
  countdownLabel,
  daysBetween,
  fmtDate,
  decisionOf,
  filterCount,
  hostOf,
  matchesFilters,
  normalizeUrl,
  parseQuery,
  searchCompetitions,
  sortCompetitions,
  timelineState,
  urgency,
} from '../lib/competitions'
import { CategoryPill, Countdown, DecisionPicker, Highlight, OptionManager, PrestigeMeter, TimelineTrack } from '../components/competitions/CompBits'
import CompetitionPanel from '../components/competitions/CompetitionPanel'
import CompFilter from '../components/competitions/CompFilter'
import GroupShare from '../components/competitions/GroupShare'

// Filters and sort are remembered per browser.
const PREF_KEY = 'agenda:competitions'
function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}')
    return { sort: SORTS.some((x) => x.id === p.sort) ? p.sort : 'deadline', filters: { ...EMPTY_FILTERS, ...(p.filters ?? {}) }, group: p.group ?? null }
  } catch {
    return { sort: 'deadline', filters: EMPTY_FILTERS, group: null }
  }
}

const MAX_ITEMS = 3

function Row({ r, tl, today, store, selected, onOpen, onKeyNav }) {
  const c = r.comp
  const items = (c.submission_items ?? []).map((id) => store.optionsById[id]).filter(Boolean)
  const href = normalizeUrl(c.url)
  return (
    <tr className={`comp-row cc-${c.category} ${selected ? 'selected' : ''} ${tl.state === 'finished' || c.decision === 'no' ? 'finished' : ''} ${c.project_id ? 'doing' : ''}`} onClick={() => onOpen(c.id)}>
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
      <td className="c-doing" data-label="Doing?">
        <DecisionPicker comp={c} store={store} onChange={(answer) => store.setDecision(c.id, answer)} compact />
      </td>
      <td className="c-next" data-label="Next">
        <Countdown days={tl.daysToNext} date={tl.next?.date} />
      </td>
    </tr>
  )
}

/** Competition tracker: instant search over a frosted table, editing in a side panel. */
export default function CompetitionsPage({ session, toast, focusId = null, onOpenPrep }) {
  const store = useCompetitions(session.user.id, { onError: (m) => toast(m, 'error') })
  const { optionsById, projectsById, groupsById } = store
  const today = localToday()

  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(() => readPrefs().filters)
  const [sort, setSort] = useState(() => readPrefs().sort)
  // The group the table is scoped to (null = all competitions).
  const [groupPref, setGroup] = useState(() => readPrefs().group)
  const groupId = groupPref && groupsById[groupPref] ? groupPref : null
  const group = groupId ? groupsById[groupId] : null
  const competitions = useMemo(
    () => (groupId ? store.competitions.filter((c) => c.group_ids?.includes(groupId)) : store.competitions),
    [store.competitions, groupId],
  )
  const groupCounts = useMemo(() => {
    const u = {}
    for (const c of store.competitions) for (const id of c.group_ids ?? []) u[id] = (u[id] ?? 0) + 1
    return u
  }, [store.competitions])
  const [newGroup, setNewGroup] = useState(null)
  const [openId, setOpenId] = useState(focusId)
  // The competition the AMC Prep page is linked to, to link back to it.
  const [prepCompId, setPrepCompId] = useState(null)
  useEffect(() => {
    supabase
      .from('amc_prep')
      .select('competition_id')
      .maybeSingle()
      .then(({ data }) => setPrepCompId(data?.competition_id ?? null))
  }, [])
  const [itemsOpen, setItemsOpen] = useState(false)
  const [listTab, setListTab] = useState('items')
  const searchRef = useRef(null)
  const tableRef = useRef(null)
  const itemsRef = useRef(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ sort, filters, group: groupPref }))
    } catch {
      // Storage blocked: filters just won't persist.
    }
  }, [sort, filters, groupPref])
  // Drop items that no longer exist (deleted options).
  const activeFilters = useMemo(
    () => ({ ...filters, items: filters.items.filter((id) => optionsById[id]), projects: filters.projects.filter((id) => projectsById[id]) }),
    [filters, optionsById, projectsById],
  )

  const index = useMemo(() => buildIndex(competitions, optionsById, projectsById), [competitions, optionsById, projectsById])
  const timelines = useMemo(() => Object.fromEntries(competitions.map((c) => [c.id, timelineState(c.timeline, today)])), [competitions, today])
  const results = useMemo(() => {
    const hits = searchCompetitions(index, deferredQuery, { today }).filter((r) => matchesFilters(r.comp, activeFilters, timelines[r.comp.id]))
    // A text query ranks by relevance; otherwise use the chosen sort.
    return parseQuery(deferredQuery).terms.length ? hits : sortCompetitions(hits, sort, today, (r) => r.comp)
  }, [index, deferredQuery, activeFilters, timelines, sort, today])

  const counts = useMemo(() => {
    const out = { category: {}, state: {}, decision: {}, project: {} }
    for (const c of competitions) {
      const d = decisionOf(c)
      out.decision[d] = (out.decision[d] ?? 0) + 1
      if (c.project_id) out.project[c.project_id] = (out.project[c.project_id] ?? 0) + 1
      out.category[c.category] = (out.category[c.category] ?? 0) + 1
      const st = timelines[c.id].state
      out.state[st] = (out.state[st] ?? 0) + 1
    }
    return out
  }, [competitions, timelines])
  // List usage counts (Lists menu) cover every competition, not just this group.
  const usage = useMemo(() => {
    const u = { items: {}, projects: {} }
    for (const c of store.competitions) {
      for (const id of c.submission_items ?? []) u.items[id] = (u.items[id] ?? 0) + 1
      if (c.project_id) u.projects[c.project_id] = (u.projects[c.project_id] ?? 0) + 1
    }
    return u
  }, [store.competitions])

  // Every stage in the next 45 days, across competitions.
  const upNext = useMemo(
    () =>
      competitions
        .flatMap((c) => timelines[c.id].stages.filter((s) => s.date >= today && s.date <= addDays(today, 45)).map((s) => ({ c, s })))
        .sort((a, b) => a.s.date.localeCompare(b.s.date))
        .slice(0, 8),
    [competitions, timelines, today],
  )

  const open = openId ? store.competitions.find((c) => c.id === openId) : null
  const nFilters = filterCount(activeFilters)
  const filtered = Boolean(query.trim() || nFilters)
  const setF = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const optionName = (id) => optionsById[id]?.name
  const decisionChipLabel = { doing: 'Doing', maybe: 'Maybe', no: 'Not doing', undecided: 'Undecided' }

  // Removable chips for each active non-category filter.
  const activeChips = [
    ...activeFilters.decisions.map((id) => ({ key: `d-${id}`, label: decisionChipLabel[id], clear: () => setF({ decisions: filters.decisions.filter((x) => x !== id) }) })),
    ...activeFilters.projects.map((id) => ({ key: `p-${id}`, label: `Project: ${projectsById[id].name}`, clear: () => setF({ projects: filters.projects.filter((x) => x !== id) }) })),
    ...activeFilters.states.map((id) => ({ key: `s-${id}`, label: STATES.find((x) => x.id === id).label, clear: () => setF({ states: filters.states.filter((x) => x !== id) }) })),
    activeFilters.within !== null && { key: 'within', label: `Next date ≤ ${WITHIN.find((x) => x.id === activeFilters.within)?.label ?? `${activeFilters.within} days`}`, clear: () => setF({ within: null }) },
    activeFilters.minPrestige !== null && { key: 'prestige', label: `Prestige ${MIN_PRESTIGE.find((x) => x.id === activeFilters.minPrestige)?.label ?? `${activeFilters.minPrestige}+`}`, clear: () => setF({ minPrestige: null }) },
    ...activeFilters.items.map((id, i) => ({
      key: `i-${id}`,
      label: `${i > 0 ? (activeFilters.itemMode === 'all' ? '& ' : 'or ') : 'Needs '}${optionName(id)}`,
      clear: () => setF({ items: filters.items.filter((x) => x !== id) }),
    })),
  ].filter(Boolean)

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

  const toggleCat = (id) => setF({ categories: filters.categories.includes(id) ? filters.categories.filter((x) => x !== id) : [...filters.categories, id] })
  const clearAll = () => (setQuery(''), setFilters(EMPTY_FILTERS))
  const add = () =>
    setOpenId(store.createCompetition({ category: filters.categories.length === 1 ? filters.categories[0] : 'other', group_ids: groupId ? [groupId] : [] }))
  const createGroup = (e) => {
    e.preventDefault()
    const id = store.groupList.create(newGroup ?? '')
    if (id) setGroup(id)
    setNewGroup(null)
  }

  return (
    <div className="comps">
      <div className="comps-main">
        <header className="comps-head glass-tile">
          <div className="comps-title">
            <Trophy size={20} />
            <div>
              <h2>{group ? group.name : 'Competitions'}</h2>
              <p className="muted small">
                {competitions.length} {group ? 'in this group' : 'tracked'}
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
                <ListChecks size={15} /> Lists
              </button>
              {itemsOpen && (
                <div className="menu items-menu">
                  <div className="segmented small lists-tabs" role="tablist" aria-label="Lists">
                    {[
                      ['items', 'Submission items'],
                      ['projects', 'Projects'],
                      ['groups', 'Groups'],
                    ].map(([id, label]) => (
                      <button key={id} role="tab" aria-selected={listTab === id} className={listTab === id ? 'on' : ''} onClick={() => setListTab(id)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {listTab === 'items' ? (
                    <OptionManager key="items" list={store.optionList} usage={usage.items} startEditing />
                  ) : listTab === 'projects' ? (
                    <OptionManager key="projects" list={store.projectList} usage={usage.projects} startEditing placeholder="New project (e.g. Solar drone)" noun="projects" />
                  ) : (
                    <OptionManager key="groups" list={store.groupList} usage={groupCounts} startEditing placeholder="New group (e.g. Summer 2027)" noun="groups" />
                  )}
                </div>
              )}
            </div>
            <button className="btn primary" onClick={add}>
              <Plus size={15} /> Add
            </button>
          </div>
        </header>

        <nav className="comp-groups" aria-label="Groups">
          <FolderOpen size={15} className="muted" aria-hidden="true" />
          <div className="chips" role="tablist">
            {[{ id: null, name: 'All' }, ...store.groups].map((g) => (
              <button key={g.id ?? 'all'} role="tab" aria-selected={groupId === g.id} className={`chip group-chip ${groupId === g.id ? 'on' : ''}`} onClick={() => setGroup(g.id)}>
                {g.name}
                <span className="chip-count">{g.id ? (groupCounts[g.id] ?? 0) : store.competitions.length}</span>
              </button>
            ))}
          </div>
          {newGroup === null ? (
            <button className="btn ghost sm" onClick={() => setNewGroup('')}>
              <Plus size={13} /> Group
            </button>
          ) : (
            <form className="group-new" onSubmit={createGroup}>
              <input
                autoFocus
                placeholder="Group name"
                value={newGroup}
                maxLength={80}
                aria-label="New group name"
                onChange={(e) => setNewGroup(e.target.value)}
                onBlur={() => !newGroup.trim() && setNewGroup(null)}
                onKeyDown={(e) => e.key === 'Escape' && setNewGroup(null)}
              />
              <button className="btn primary sm" disabled={!newGroup.trim()}>
                Create
              </button>
            </form>
          )}
          <span className="flex1" />
          {group && <GroupShare key={group.id} group={group} toast={toast} />}
        </nav>

        <div className="comps-filters">
          <div className="chips" role="group" aria-label="Filter by category">
            {CATEGORIES.map((c) => {
              const on = filters.categories.includes(c.id)
              return (
                <button key={c.id} className={`chip cat-chip cc-${c.id} ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggleCat(c.id)}>
                  <i aria-hidden="true" />
                  {c.label}
                  <span className="chip-count">{counts.category[c.id] ?? 0}</span>
                </button>
              )
            })}
          </div>
          <span className="flex1" />
          <CompFilter value={activeFilters} onChange={setFilters} options={store.options} projects={store.projects} counts={counts} />
          <div className="segmented small" role="radiogroup" aria-label="Sort by">
            {SORTS.map((s) => (
              <button key={s.id} role="radio" aria-checked={sort === s.id} className={sort === s.id ? 'on' : ''} onClick={() => setSort(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {(activeChips.length > 0 || filtered) && (
          <div className="active-filters" aria-label="Active filters">
            {activeChips.map((c) => (
              <button key={c.key} className="af-chip" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}>
                {c.label} <X size={12} />
              </button>
            ))}
            <span className="af-count muted small">
              {results.length} of {competitions.length}
            </span>
            <button className="btn ghost sm" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}

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
                <th scope="col">Doing?</th>
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
                  store={store}
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
                  <p>{query.trim() ? `No competitions match “${query.trim()}”${nFilters ? ' with these filters' : ''}.` : 'No competitions match these filters.'}</p>
                  <p className="muted small">
                    {query.trim() ? 'Try fewer words, or ' : ''}
                    <button className="link-btn" onClick={clearAll}>
                      clear {query.trim() && nFilters ? 'search and filters' : query.trim() ? 'the search' : 'all filters'}
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <Trophy size={26} className="muted" />
                  <p>{group ? `Nothing in ${group.name} yet.` : 'Track your first competition.'}</p>
                  <p className="muted small">
                    {group ? 'Add one here, or open any competition and pick this group.' : 'Add one, or ask your AI to research and add competitions for you.'}
                  </p>
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

      {open && <CompetitionPanel key={open.id} comp={open} store={store} today={today} onClose={() => setOpenId(null)} toast={toast} onOpenPrep={open.id === prepCompId ? onOpenPrep : null} />}
    </div>
  )
}
