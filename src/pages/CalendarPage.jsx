import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, List, Menu, Plus, Search } from 'lucide-react'
import { nowMinutes, rangeLabel, toISODate } from '../lib/dates'
import { expandBlocks } from '../lib/recurrence'
import WeekView from '../components/WeekView'
import ListView from '../components/ListView'
import BlockPanel from '../components/BlockPanel'
import StatusFilter from '../components/StatusFilter'

/**
 * The Calendar page: week grid / agenda, quick-create and the block panel.
 * Data, the visible range and the filters live in Workspace (the sidebar and
 * top bar share them); everything else about the calendar lives here. Keyboard
 * shortcuts are registered only while this page is showing.
 */
export default function CalendarPage({
  store,
  days,
  dayCount,
  rangeStart,
  rangeEnd,
  step,
  goToday,
  statusFilter,
  setStatusFilter,
  hiddenCats,
  search,
  setSearch,
  defaultCategoryId,
  calView,
  setCalView,
  embed,
  fixedDays,
  setFixedDays,
  onMenu,
  toast,
}) {
  const [selectedRaw, setSelectedId] = useState(null)
  const [quickRaw, setQuickId] = useState(null)

  // Series templates expanded into occurrences for the visible range.
  const { display: blocks, aliases } = useMemo(
    () => expandBlocks(store.blocks, rangeStart, rangeEnd),
    [store.blocks, rangeStart, rangeEnd],
  )
  // Occurrences are replaced by real rows once edited (aliases), and a block can
  // vanish underneath us (deleted by AI, another tab) — treat that as closed.
  const resolveShown = (id) => {
    const real = id && (aliases[id] ?? id)
    return real && blocks[real] ? real : null
  }
  const selectedId = resolveShown(selectedRaw)
  const quickId = resolveShown(quickRaw)

  // What the grid shows: timed top-level blocks, plus the timed sub-blocks of
  // all-day blocks (a "Conference" day's sessions). All-day blocks themselves
  // are drawn as day spines.
  const { timed, allDay } = useMemo(() => {
    const shown = (b) =>
      !(b.repeat && !b.virtual) &&
      b.date >= rangeStart &&
      b.date <= rangeEnd &&
      statusFilter.has(b.status) &&
      !(b.category_id && hiddenCats.has(b.category_id))
    const timed = []
    const allDay = []
    for (const b of Object.values(blocks)) {
      if (!shown(b)) continue
      if (!b.parent_id) (b.all_day ? allDay : timed).push(b)
      else {
        const p = blocks[b.parent_id]
        if (p && !p.parent_id && p.all_day && shown(p)) timed.push(b)
      }
    }
    return { timed, allDay }
  }, [blocks, rangeStart, rangeEnd, statusFilter, hiddenCats])
  const topLevelCount = allDay.length + timed.filter((b) => !b.parent_id).length

  const createAt = useCallback(
    (date, start, end, allDayBlock = false) => {
      const id = store.createBlock({ date, start, end, all_day: allDayBlock, category_id: defaultCategoryId })
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
    if (calView !== 'calendar') setCalView('calendar')
    createAt(date, start, start + 60)
  }, [createAt, rangeStart, rangeEnd, calView, setCalView])

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
      } else if (e.key === 'c') setCalView('calendar')
      else if (e.key === 'l') setCalView('list')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const openBlock = (id) => {
    setQuickId(null)
    setSelectedId(id)
  }

  return (
    <section className="panel calendar-panel">
      <div className="toolbar">
        {embed && (
          <button className="icon-btn" onClick={onMenu} aria-label="Menu: categories and theme">
            <Menu size={18} />
          </button>
        )}
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={calView === 'list'} className={calView === 'list' ? 'on' : ''} onClick={() => setCalView('list')}>
            <List size={16} /> List
          </button>
          <button
            role="tab"
            aria-selected={calView === 'calendar'}
            className={calView === 'calendar' ? 'on' : ''}
            onClick={() => setCalView('calendar')}
          >
            <CalendarDays size={16} /> Calendar
          </button>
        </div>
        <div className="date-nav">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft size={18} />
          </button>
          <button className="btn ghost today-btn" onClick={goToday}>
            Today
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next">
            <ChevronRight size={18} />
          </button>
          <span className="range-label">{rangeLabel(days)}</span>
        </div>
        <div className="toolbar-count">
          <strong>{topLevelCount}</strong> block{topLevelCount === 1 ? '' : 's'}
          <span className="muted"> {dayCount === 1 ? 'today' : `in ${dayCount} days`}</span>
        </div>
        <div className="toolbar-actions">
          {embed && (
            <>
              <div className="segmented small day-switch" role="radiogroup" aria-label="Days shown">
                {[
                  [0, 'Auto'],
                  [1, 'Day'],
                  [3, '3 days'],
                  [7, 'Week'],
                ].map(([n, label]) => (
                  <button key={n} role="radio" aria-checked={fixedDays === n} className={fixedDays === n ? 'on' : ''} onClick={() => setFixedDays(n)}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="search compact">
                <Search size={15} />
                <input
                  placeholder="Search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
                />
              </label>
            </>
          )}
          <StatusFilter value={statusFilter} onChange={setStatusFilter} />
          <button className="btn primary" onClick={newBlockNow} title="New block (N)">
            <Plus size={16} /> <span className="hide-sm">New block</span>
          </button>
        </div>
      </div>

      <div className="view-area">
        {calView === 'calendar' ? (
          <WeekView
            days={days}
            store={store}
            blocks={blocks}
            visible={timed}
            allDay={allDay}
            search={search}
            selectedId={selectedId}
            quickId={quickId}
            onSelect={openBlock}
            onCreate={createAt}
            onCreateAllDay={(date) => createAt(date, 0, 24 * 60, true)}
            onQuickClose={() => setQuickId(null)}
            onQuickExpand={(id) => openBlock(id)}
            toast={toast}
          />
        ) : (
          <ListView
            days={days}
            store={store}
            blocks={blocks}
            visible={[...allDay, ...timed.filter((b) => !b.parent_id)]}
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
  )
}
