import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react'
import { useVapor } from '../state/useVapor'
import { addDays, nowMinutes, rangeLabel, toISODate, visibleDays } from '../lib/dates'
import { STATUSES } from '../lib/domain'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import WeekView from './WeekView'
import ListView from './ListView'
import BlockPanel from './BlockPanel'
import Integrations from './Integrations'
import StatusFilter from './StatusFilter'
import Toasts from './Toasts'
import { useToasts } from './useToasts'
import { expandBlocks } from '../lib/recurrence'

const readPref = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(`vapor:${key}`)) ?? fallback
  } catch {
    return fallback
  }
}
const writePref = (key, value) => {
  try {
    localStorage.setItem(`vapor:${key}`, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

function useDayCount() {
  const pick = () => (window.innerWidth < 640 ? 1 : window.innerWidth < 1100 ? 3 : 7)
  const [n, setN] = useState(pick)
  useEffect(() => {
    const onResize = () => setN(pick())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return n
}

export default function Workspace({ session }) {
  const [view, setView] = useState(() => readPref('view', 'calendar'))
  const [anchor, setAnchor] = useState(() => new Date())
  const dayCount = useDayCount()
  const days = useMemo(() => visibleDays(anchor, dayCount), [anchor, dayCount])
  const rangeStart = toISODate(days[0])
  const rangeEnd = toISODate(days[days.length - 1])

  const [selectedRaw, setSelectedId] = useState(null)
  const [quickRaw, setQuickId] = useState(null)
  const [hiddenCats, setHiddenCats] = useState(() => new Set(readPref('hiddenCats', [])))
  // Persist the *hidden* statuses so statuses added later show up by default.
  const [statusFilter, setStatusFilter] = useState(() => {
    const hidden = new Set(readPref('hiddenStatuses', []))
    return new Set(STATUSES.map((s) => s.id).filter((id) => !hidden.has(id)))
  })
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(() => readPref('activeCategory', null))
  const [navOpen, setNavOpen] = useState(false)
  const { toasts, push: toast, dismiss } = useToasts()

  const store = useVapor(session, { rangeStart, rangeEnd, onError: (m) => toast(m, 'error') })
  const { blocks: rawBlocks, categories } = store
  // Series templates expanded into occurrences for the visible range.
  const { display: blocks, aliases } = useMemo(
    () => expandBlocks(rawBlocks, rangeStart, rangeEnd),
    [rawBlocks, rangeStart, rangeEnd],
  )
  // Occurrences are replaced by real rows once edited (aliases), and a block can
  // vanish underneath us (deleted by AI, another tab) — treat that as closed.
  const resolveShown = (id) => {
    const real = id && (aliases[id] ?? id)
    return real && blocks[real] ? real : null
  }
  const selectedId = resolveShown(selectedRaw)
  const quickId = resolveShown(quickRaw)

  useEffect(() => writePref('view', view), [view])
  useEffect(() => writePref('hiddenCats', [...hiddenCats]), [hiddenCats])
  useEffect(
    () => writePref('hiddenStatuses', STATUSES.map((s) => s.id).filter((id) => !statusFilter.has(id))),
    [statusFilter],
  )
  useEffect(() => writePref('activeCategory', activeCategory), [activeCategory])

  // Default category for new blocks: the chosen one, else the first.
  const defaultCategoryId =
    (activeCategory && categories.some((c) => c.id === activeCategory) && activeCategory) || categories[0]?.id || null

  const visibleTopLevel = useMemo(
    () =>
      Object.values(blocks).filter(
        (b) =>
          !b.parent_id &&
          !(b.repeat && !b.virtual) &&
          b.date >= rangeStart &&
          b.date <= rangeEnd &&
          statusFilter.has(b.status) &&
          !(b.category_id && hiddenCats.has(b.category_id)),
      ),
    [blocks, rangeStart, rangeEnd, statusFilter, hiddenCats],
  )

  const step = (dir) => setAnchor((a) => addDays(a, dir * dayCount))
  const goToday = () => setAnchor(new Date())

  const createAt = useCallback(
    (date, start, end) => {
      const id = store.createBlock({ date, start, end, category_id: defaultCategoryId })
      setSelectedId(null)
      setQuickId(id)
      return id
    },
    [store, defaultCategoryId],
  )

  const newBlockNow = useCallback(() => {
    const today = toISODate(new Date())
    const inRange = today >= rangeStart && today <= rangeEnd
    const date = inRange ? today : rangeStart
    const start = inRange ? Math.min(Math.ceil((nowMinutes() + 1) / 30) * 30, 23 * 60) : 9 * 60
    if (view !== 'calendar') setView('calendar')
    createAt(date, start, start + 60)
  }, [createAt, rangeStart, rangeEnd, view])

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t.closest?.('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        newBlockNow()
      } else if (e.key === 't' || e.key === 'T') goToday()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'Escape') {
        setSelectedId(null)
        setQuickId(null)
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
        store.deleteBlock(selectedId)
        setSelectedId(null)
        toast('Block deleted')
      } else if (e.key === 'c') setView('calendar')
      else if (e.key === 'l') setView('list')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })


  const openBlock = (id) => {
    setQuickId(null)
    setSelectedId(id)
  }

  const toggleCategory = (id) =>
    setHiddenCats((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const pageMeta = {
    calendar: ['Calendar', 'Drag on the grid to add a block'],
    list: ['Agenda', 'Blocks in this range'],
    integrations: ['Integrations', 'Connect AI clients over MCP'],
  }[view]

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar
        view={view}
        setView={(v) => {
          setView(v)
          setNavOpen(false)
        }}
        store={store}
        hiddenCats={hiddenCats}
        toggleCategory={toggleCategory}
        activeCategory={defaultCategoryId}
        setActiveCategory={setActiveCategory}
        onClose={() => setNavOpen(false)}
      />
      <div className="main">
        <Topbar
          title={pageMeta[0]}
          subtitle={pageMeta[1]}
          session={session}
          search={search}
          setSearch={setSearch}
          showSearch={view !== 'integrations'}
          onMenu={() => setNavOpen(true)}
        />
        <div className="content">
          {view === 'integrations' ? (
            <Integrations toast={toast} />
          ) : (
            <section className="panel calendar-panel">
              <div className="toolbar">
                <div className="segmented" role="tablist">
                  <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
                    <List size={16} /> List
                  </button>
                  <button role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>
                    <CalendarDays size={16} /> Calendar
                  </button>
                </div>
                <div className="date-nav">
                  <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous">
                    <ChevronLeft size={18} />
                  </button>
                  <button className="btn ghost today-btn" onClick={goToday}>Today</button>
                  <button className="icon-btn" onClick={() => step(1)} aria-label="Next">
                    <ChevronRight size={18} />
                  </button>
                  <span className="range-label">{rangeLabel(days)}</span>
                </div>
                <div className="toolbar-count">
                  <strong>{visibleTopLevel.length}</strong> block{visibleTopLevel.length === 1 ? '' : 's'}
                  <span className="muted"> {dayCount === 1 ? 'today' : `in ${dayCount} days`}</span>
                </div>
                <div className="toolbar-actions">
                  <StatusFilter value={statusFilter} onChange={setStatusFilter} />
                  <button className="btn primary" onClick={newBlockNow} title="New block (N)">
                    <Plus size={16} /> <span className="hide-sm">New block</span>
                  </button>
                </div>
              </div>

              <div className="view-area">
                {view === 'calendar' ? (
                  <WeekView
                    days={days}
                    store={store}
                    blocks={blocks}
                    visible={visibleTopLevel}
                    search={search}
                    selectedId={selectedId}
                    quickId={quickId}
                    onSelect={openBlock}
                    onCreate={createAt}
                    onQuickClose={() => setQuickId(null)}
                    onQuickExpand={(id) => openBlock(id)}
                    toast={toast}
                  />
                ) : (
                  <ListView
                    days={days}
                    store={store}
                    blocks={blocks}
                    visible={visibleTopLevel}
                    search={search}
                    selectedId={selectedId}
                    onSelect={openBlock}
                    onNew={newBlockNow}
                  />
                )}
                {selectedId && (
                  <BlockPanel
                    key={selectedRaw}
                    id={selectedId}
                    store={store}
                    blocks={blocks}
                    onSelect={openBlock}
                    onClose={() => setSelectedId(null)}
                    toast={toast}
                  />
                )}
              </div>
            </section>
          )}
        </div>
      </div>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
