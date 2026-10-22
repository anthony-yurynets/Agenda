import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, Compass, CornerDownLeft, ExternalLink, FolderOpen, ListChecks, Pencil, Plus, Rocket, Search, Trophy, X } from 'lucide-react'
import { useCompetitions } from '../state/useCompetitions'
import { supabase } from '../lib/supabase'
import { ownerCompBackend } from '../lib/compBackends'
import { localToday } from '../state/useFitness'
import {
  CATEGORIES,
  DECISIONS,
  EMPTY_FILTERS,
  MIN_PRESTIGE,
  SORTS,
  STATES,
  WITHIN,
  buildIndex,
  countdownLabel,
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
import { notesPreview } from '../lib/notes'

// Tab, filters and sort are remembered per browser.
const PREF_KEY = 'agenda:competitions'
function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}')
    return {
      tab: p.tab === 'explore' ? 'explore' : 'doing',
      sort: EXPLORE_SORTS.some((x) => x.id === p.sort) ? p.sort : 'deadline',
      filters: { ...EMPTY_FILTERS, ...(p.filters ?? {}) },
      group: p.group ?? null,
    }
  } catch {
    return { tab: 'doing', sort: 'deadline', filters: EMPTY_FILTERS, group: null }
  }
}

// Explore never holds competitions we're doing, so sorting by answer adds nothing.
const EXPLORE_SORTS = SORTS.filter((s) => s.id !== 'decision')
const EXPLORE_DECISIONS = DECISIONS.filter((d) => d.id !== 'doing')
const MAX_ITEMS = 4

/** Explore table row: what it is, how prestigious, when, and whether we're doing it. */
function Row({ r, tl, store, selected, onOpen, onDecide, onKeyNav }) {
  const c = r.comp
  const href = normalizeUrl(c.url)
  return (
    <tr className={`comp-row cc-${c.category} ${selected ? 'selected' : ''} ${tl.state === 'finished' || c.decision === 'no' ? 'finished' : ''}`} onClick={() => onOpen(c.id)}>
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
          {c.description && <span className="comp-desc">{notesPreview(c.description)}</span>}
        </div>
      </td>
      <td className="c-cat" data-label="Category">
        <CategoryPill id={c.category} />
      </td>
      <td className="c-prestige" data-label="Prestige">
        <PrestigeMeter value={c.prestige} />
      </td>
      <td className="c-next" data-label="Next date">
        <Countdown days={tl.daysToNext} date={tl.next?.date} />
      </td>
      <td className="c-doing" data-label="Doing?">
        <DecisionPicker comp={c} store={store} onChange={(answer) => onDecide(c, answer)} compact />
      </td>
    </tr>
  )
}

/** Doing card: the next thing due up top, then the timeline and what we have to submit. */
function DoingCard({ r, tl, today, store, selected, onOpen, onDecide, onKeyNav }) {
  const c = r.comp
  const items = (c.submission_items ?? []).map((id) => store.optionsById[id]).filter(Boolean)
  const href = normalizeUrl(c.url)
  const done = tl.state === 'finished'
  return (
    <article className={`doing-card cc-${c.category} ${selected ? 'selected' : ''} ${done ? 'finished' : ''}`} onClick={() => onOpen(c.id)}>
      <div className="dc-head">
        <button className="comp-open" onClick={(e) => (e.stopPropagation(), onOpen(c.id))} onKeyDown={onKeyNav} data-comp-row>
          <span className="comp-title">{c.name ? <Highlight text={c.name} indices={r.highlight} /> : <span className="muted">Untitled competition</span>}</span>
        </button>
        <DecisionPicker comp={c} store={store} onChange={(answer) => onDecide(c, answer)} compact />
      </div>
      <div className="dc-meta">
        <CategoryPill id={c.category} />
        {href && (
          <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="comp-link" aria-label={`Open ${c.name || 'competition'} site`}>
            {hostOf(c.url)} <ExternalLink size={11} />
          </a>
        )}
      </div>
      <div className={`dc-next u-${done ? 'none' : urgency(tl.daysToNext)}`}>
        {done ? (
          <span className="muted">All stages done</span>
        ) : tl.next ? (
          <>
            <strong>{countdownLabel(tl.daysToNext)}</strong>
            <span>
              {tl.next.label || `Stage ${tl.next.index + 1}`} · {fmtDate(tl.next.date, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </>
        ) : (
          <span className="muted">No dates yet</span>
        )}
      </div>
      {tl.stages.length > 0 && <TimelineTrack tl={tl} today={today} />}
      {items.length > 0 && (
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
        </div>
      )}
    </article>
  )
}

/**
 * Competition tracker: instant search over a frosted table, editing in a side panel.
 * A guest with an edit link passes `backend` (lib/compBackends) and sees only the
 * link's groups, without list management, group creation or sharing.
 */
export default function CompetitionsPage({ session, toast, focusId = null, onOpenPrep, backend: backendProp }) {
  const userId = session?.user.id
  const backend = useMemo(() => backendProp ?? ownerCompBackend(userId), [backendProp, userId])
  const store = useCompetitions(backend, { onError: (m) => toast(m, 'error') })
  const guest = store.guest
  const { optionsById, projectsById, groupsById } = store
  const today = localToday()

  const [tab, setTab] = useState(() => readPrefs().tab)
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
    if (backendProp) return
    supabase
      .from('amc_prep')
      .select('competition_id')
      .maybeSingle()
      .then(({ data }) => setPrepCompId(data?.competition_id ?? null))
  }, [backendProp])
  const [itemsOpen, setItemsOpen] = useState(false)
  const [listTab, setListTab] = useState('items')
  const searchRef = useRef(null)
  const tableRef = useRef(null)
  const itemsRef = useRef(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ tab, sort, filters, group: groupPref }))
    } catch {
      // Storage blocked: filters just won't persist.
    }
  }, [tab, sort, filters, groupPref])
  // Drop items that no longer exist (deleted options), and "doing" answers,
  // which Explore never shows.
  const activeFilters = useMemo(
    () => ({ ...filters, decisions: filters.decisions.filter((id) => id !== 'doing'), items: filters.items.filter((id) => optionsById[id]), projects: [] }),
    [filters, optionsById],
  )

  const index = useMemo(() => buildIndex(competitions, optionsById, projectsById), [competitions, optionsById, projectsById])
  const timelines = useMemo(() => Object.fromEntries(competitions.map((c) => [c.id, timelineState(c.timeline, today)])), [competitions, today])
  // Search narrows both tabs; filters and sort only apply to Explore.
  const hits = useMemo(() => searchCompetitions(index, deferredQuery, { today }), [index, deferredQuery, today])
  const ranked = parseQuery(deferredQuery).terms.length > 0
  const doing = useMemo(() => {
    const list = hits.filter((r) => decisionOf(r.comp) === 'doing')
    const sorted = ranked ? list : sortCompetitions(list, 'deadline', today, (r) => r.comp)
    // Finished ones sink below the ones still running.
    return [...sorted.filter((r) => timelines[r.comp.id].state !== 'finished'), ...sorted.filter((r) => timelines[r.comp.id].state === 'finished')]
  }, [hits, ranked, today, timelines])
  const exploreAll = useMemo(() => hits.filter((r) => decisionOf(r.comp) !== 'doing'), [hits])
  const explore = useMemo(() => {
    const list = exploreAll.filter((r) => matchesFilters(r.comp, activeFilters, timelines[r.comp.id]))
    const sorted = ranked ? list : sortCompetitions(list, sort, today, (r) => r.comp)
    // "Not doing" goes to the bottom, out of the way.
    return [...sorted.filter((r) => r.comp.decision !== 'no'), ...sorted.filter((r) => r.comp.decision === 'no')]
  }, [exploreAll, activeFilters, timelines, ranked, sort, today])
  const results = tab === 'doing' ? doing : explore

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

  const open = openId ? store.competitions.find((c) => c.id === openId) : null
  const nFilters = filterCount(activeFilters)
  const searching = Boolean(query.trim())
  const filtered = searching || (tab === 'explore' && nFilters > 0)
  const setF = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const optionName = (id) => optionsById[id]?.name
  const decisionChipLabel = { doing: 'Doing', maybe: 'Maybe', no: 'Not doing', undecided: 'Undecided' }

  // Removable chips for each active non-category filter.
  const activeChips = [
    ...activeFilters.decisions.map((id) => ({ key: `d-${id}`, label: decisionChipLabel[id], clear: () => setF({ decisions: filters.decisions.filter((x) => x !== id) }) })),
    ...activeFilters.categories.map((id) => ({ key: `c-${id}`, label: CATEGORIES.find((x) => x.id === id)?.label ?? id, clear: () => setF({ categories: filters.categories.filter((x) => x !== id) }) })),
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

  const clearAll = () => (setQuery(''), setFilters(EMPTY_FILTERS))
  // Saying yes (picking a project) or no moves a competition between tabs; say where it went.
  const decide = (c, answer) => {
    const was = decisionOf(c)
    store.setDecision(c.id, answer)
    const name = c.name || 'Competition'
    const nowDoing = answer !== null && answer !== 'maybe' && answer !== 'no'
    if (nowDoing && was !== 'doing') toast(`${name} moved to Doing`)
    else if (!nowDoing && was === 'doing') toast(`${name} moved to Explore`)
  }
  // A guest's new competition has to land in one of the shared groups.
  const addGroup = groupId ?? (guest ? store.groups[0]?.id : null)
  const add = () => {
    setTab('explore')
    setOpenId(store.createCompetition({ category: filters.categories.length === 1 ? filters.categories[0] : 'other', group_ids: addGroup ? [addGroup] : [] }))
  }
  const createGroup = (e) => {
    e.preventDefault()
    const id = store.groupList.create(newGroup ?? '')
    if (id) setGroup(id)
    setNewGroup(null)
  }

  const tabs = [
    { id: 'doing', label: 'Doing', icon: Rocket, count: doing.length },
    { id: 'explore', label: 'Explore', icon: Compass, count: exploreAll.length },
  ]
  const itemProps = (r) => ({ r, tl: timelines[r.comp.id], today, store, selected: r.comp.id === openId, onOpen: setOpenId, onDecide: decide, onKeyNav })

  return (
    <div className="comps">
      <div className="comps-main">
        <header className="comps-head">
          <div className="segmented comps-tabs" role="tablist" aria-label="Competitions">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button key={id} role="tab" id={`comps-tab-${id}`} aria-selected={tab === id} aria-controls="comps-body" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                <Icon size={15} />
                {label}
                <span className="chip-count">{count}</span>
              </button>
            ))}
          </div>
          <label className="search comps-search">
            <Search size={16} />
            <input
              ref={searchRef}
              placeholder={tab === 'doing' ? 'Search what we’re doing…' : 'Search name, item, stage…  try  #research  >7  soon'}
              value={query}
              aria-label="Search competitions"
              aria-controls="comps-body"
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
            {guest && (
              <span className="view-only muted small">
                <Pencil size={13} /> {store.info?.owner ? `Shared by ${store.info.owner}` : 'Can edit'}
              </span>
            )}
            {!guest && (
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
            )}
            <button className="btn primary" onClick={add}>
              <Plus size={15} /> Add
            </button>
          </div>
        </header>

        <div className="comps-toolbar">
          <div className="chips comp-groups" role="group" aria-label="Group">
            {[{ id: null, name: guest ? 'All shared' : 'All groups' }, ...store.groups].map((g) => (
              <button key={g.id ?? 'all'} aria-pressed={groupId === g.id} className={`chip group-chip ${groupId === g.id ? 'on' : ''}`} onClick={() => setGroup(g.id)}>
                {g.id && <FolderOpen size={13} aria-hidden="true" />}
                {g.name}
                <span className="chip-count">{g.id ? (groupCounts[g.id] ?? 0) : store.competitions.length}</span>
              </button>
            ))}
            {guest ? null : newGroup === null ? (
              <button className="btn ghost sm" onClick={() => setNewGroup('')} aria-label="New group">
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
            {group && !guest && <GroupShare key={group.id} group={group} groups={store.groups} toast={toast} />}
          </div>
          <span className="flex1" />
          {tab === 'explore' && (
            <>
              <CompFilter value={activeFilters} onChange={setFilters} options={store.options} projects={store.projects} counts={counts} decisions={EXPLORE_DECISIONS} />
              <label className="comps-sort">
                <ArrowDownUp size={14} aria-hidden="true" />
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
                  {EXPLORE_SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        {(activeChips.length > 0 && tab === 'explore') || searching ? (
          <div className="active-filters" aria-label="Active filters">
            {tab === 'explore' &&
              activeChips.map((c) => (
                <button key={c.key} className="af-chip" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}>
                  {c.label} <X size={12} />
                </button>
              ))}
            <span className="af-count muted small">
              {results.length} of {tab === 'doing' ? competitions.filter((c) => decisionOf(c) === 'doing').length : competitions.length - competitions.filter((c) => decisionOf(c) === 'doing').length}
            </span>
            <button className="btn ghost sm" onClick={clearAll}>
              Clear all
            </button>
          </div>
        ) : null}

        <section className="comps-body" id="comps-body" role="tabpanel" aria-labelledby={`comps-tab-${tab}`} ref={tableRef}>
          {tab === 'doing' ? (
            doing.length > 0 && (
              <div className="doing-grid">
                {doing.map((r) => (
                  <DoingCard key={r.comp.id} {...itemProps(r)} />
                ))}
              </div>
            )
          ) : (
            explore.length > 0 && (
              <div className="comp-table-wrap glass-tile">
                <table className="comp-table">
                  <caption className="sr-only">Competitions to explore{filtered ? `, ${explore.length} matching` : ''}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Competition</th>
                      <th scope="col">Category</th>
                      <th scope="col">Prestige</th>
                      <th scope="col">Next date</th>
                      <th scope="col">Doing?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explore.map((r) => (
                      <Row key={r.comp.id} {...itemProps(r)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          {!results.length && !store.loading && (
            <div className="comp-empty">
              {filtered ? (
                <>
                  <p>{searching ? `Nothing matches “${query.trim()}”${tab === 'explore' && nFilters ? ' with these filters' : ''}.` : 'Nothing matches these filters.'}</p>
                  <p className="muted small">
                    <button className="link-btn" onClick={clearAll}>
                      Clear {searching && tab === 'explore' && nFilters ? 'search and filters' : searching ? 'the search' : 'all filters'}
                    </button>
                  </p>
                </>
              ) : tab === 'doing' ? (
                <>
                  <Rocket size={26} className="muted" />
                  <p>{group ? `Not entering anything in ${group.name} yet.` : 'Not entering anything yet.'}</p>
                  <p className="muted small">In Explore, set “Doing?” to a project and it shows up here.</p>
                  <button className="btn primary sm" onClick={() => setTab('explore')}>
                    <Compass size={14} /> Explore competitions
                  </button>
                </>
              ) : (
                <>
                  <Trophy size={26} className="muted" />
                  <p>{group ? `Nothing to explore in ${group.name}.` : competitions.length ? 'You’re doing everything you’ve found.' : 'Track your first competition.'}</p>
                  <p className="muted small">Add one, or ask your AI to research and add competitions for you.</p>
                  <button className="btn primary sm" onClick={add}>
                    <Plus size={14} /> Add competition
                  </button>
                </>
              )}
            </div>
          )}
          {results.length > 0 && (
            <p className="comp-hint muted small">
              <span>
                <kbd>/</kbd> search · <kbd>↑</kbd>
                <kbd>↓</kbd> move · <kbd><CornerDownLeft size={10} /></kbd> open
              </span>
            </p>
          )}
        </section>
      </div>

      {open && <CompetitionPanel key={open.id} comp={open} store={store} today={today} onClose={() => setOpenId(null)} toast={toast} onOpenPrep={open.id === prepCompId ? onOpenPrep : null} />}
    </div>
  )
}
