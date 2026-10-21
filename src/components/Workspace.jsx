import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useCalendar } from '../state/useCalendar'
import { addDays, toISODate, visibleDays } from '../lib/dates'
import { STATUSES } from '../lib/domain'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import Integrations from './Integrations'
import Sharing from './Sharing'
import { emptyBackend, ownerBackend } from '../lib/backends'
import Toasts from './Toasts'
import ProductivityDial from './ProductivityDial'
import { useToasts } from './useToasts'
import { PAGES } from '../pages'
import { usePref } from '../lib/prefs'
import CalendarPage from '../pages/CalendarPage'
import TestingPage from '../pages/TestingPage'
import AgendaPage from '../pages/AgendaPage'
// Heavy (body-map SVGs): loaded when the tab is first opened.
const FitnessPage = lazy(() => import('../pages/FitnessPage'))
const CompetitionsPage = lazy(() => import('../pages/CompetitionsPage'))
const AmcPrepPage = lazy(() => import('../pages/AmcPrepPage'))

// Settings screens reached from the sidebar (not tabs).
const SETTINGS_PAGES = ['sharing', 'integrations']
const PAGE_TITLES = { ...Object.fromEntries(PAGES.map((p) => [p.id, p.label])), sharing: 'Sharing', integrations: 'Integrations' }

const readPref = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(`agenda:${key}`)) ?? fallback
  } catch {
    return fallback
  }
}
const writePref = (key, value) => {
  try {
    localStorage.setItem(`agenda:${key}`, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

/** Days to show: picked from the width, unless the user chose a fixed number. */
function useDayCount(fixed) {
  const pick = () => (window.innerWidth < 640 ? 1 : window.innerWidth < 1100 ? 3 : 7)
  const [n, setN] = useState(pick)
  useEffect(() => {
    const onResize = () => setN(pick())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return fixed || n
}

/**
 * The app shell: sidebar, top bar with page tabs, and the active page.
 * Signed-in owners get their own data; a guest with an edit link passes
 * `backend` (the share API) and `guest` ({ owner, tools }) and only sees the
 * shareable pages their link grants.
 * `embed` renders the compact widget layout (Notion): no top bar, and the
 * sidebar becomes a slide-out menu.
 */
export default function Workspace({ session, backend: backendProp, guest, embed = false }) {
  // Pages this person may open: owners get all (minus the Agenda if they hid it
  // in Settings), guests the tools on their link, the Notion widget just the calendar.
  const [showAgenda] = usePref('showAgenda', true)
  const pages = useMemo(() => {
    if (embed) return PAGES.filter((p) => p.id === 'calendar')
    if (guest) return PAGES.filter((p) => p.shareable && (guest.tools ?? ['calendar']).includes(p.id))
    return showAgenda ? PAGES : PAGES.filter((p) => p.id !== 'agenda')
  }, [embed, guest, showAgenda])
  const limited = Boolean(guest || embed)
  const [blockStyle] = usePref('blockStyle', 'clear')
  const [rateProductivity] = usePref('rateProductivity', false)
  // The page list (sidebar) only shows when there's somewhere else to go.
  const navPages = !limited || pages.length > 1 ? pages : null
  const allowed = [...pages.map((p) => p.id), ...(limited ? [] : SETTINGS_PAGES)]
  // Owners land on the Agenda (the Calendar if it's hidden); guests and the widget on their first page.
  const [pagePref, setPage] = useState('agenda')
  const page = allowed.includes(pagePref) ? pagePref : (pages[0]?.id ?? null)
  const canCalendar = pages.some((p) => p.id === 'calendar')
  const [calViewPref, setCalView] = useState(() => readPref('view', 'calendar'))
  const calView = calViewPref === 'list' ? 'list' : 'calendar'

  const userId = session?.user.id
  const backend = useMemo(
    () => (!canCalendar ? emptyBackend() : (backendProp ?? ownerBackend(userId))),
    [canCalendar, backendProp, userId],
  )
  const [anchor, setAnchor] = useState(() => new Date())
  const [fixedDays, setFixedDays] = useState(() => (embed ? readPref('embedDays', 0) : 0))
  useEffect(() => {
    if (embed) writePref('embedDays', fixedDays)
  }, [embed, fixedDays])
  const dayCount = useDayCount(fixedDays)
  const days = useMemo(() => visibleDays(anchor, dayCount), [anchor, dayCount])
  const rangeStart = toISODate(days[0])
  const rangeEnd = toISODate(days[days.length - 1])

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

  // Calendar data stays loaded (and live) while you're on other pages.
  const store = useCalendar(backend, { rangeStart, rangeEnd, onError: (m) => toast(m, 'error') })
  const { categories } = store

  useEffect(() => writePref('view', calView), [calView])
  useEffect(() => writePref('hiddenCats', [...hiddenCats]), [hiddenCats])
  useEffect(
    () => writePref('hiddenStatuses', STATUSES.map((s) => s.id).filter((id) => !statusFilter.has(id))),
    [statusFilter],
  )
  useEffect(() => writePref('activeCategory', activeCategory), [activeCategory])

  // Default category for new blocks: the chosen one, else the first.
  const defaultCategoryId =
    (activeCategory && categories.some((c) => c.id === activeCategory) && activeCategory) || categories[0]?.id || null

  // Alt+1…9 jumps between page tabs (e.code, since Alt changes e.key on macOS).
  useEffect(() => {
    const onKey = (e) => {
      const n = /^Digit([1-9])$/.exec(e.code)?.[1]
      if (!e.altKey || e.metaKey || e.ctrlKey || !n || !pages[n - 1]) return
      e.preventDefault()
      setPage(pages[n - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pages])

  const toggleCategory = (id) =>
    setHiddenCats((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // A competition to open when the Competitions page mounts (from AMC Prep).
  const [focusComp, setFocusComp] = useState(null)
  const goTo = (id) => {
    setPage(id)
    setNavOpen(false)
    setFocusComp(null)
  }
  const openCompetition = (id) => {
    goTo('competitions')
    setFocusComp(id)
  }

  let content
  if (page === 'integrations') content = <Integrations toast={toast} />
  else if (page === 'sharing') content = <Sharing toast={toast} />
  else if (page === 'testing') content = <TestingPage />
  else if (page === 'agenda') content = <AgendaPage session={session} store={store} toast={toast} />
  else if (page === 'fitness') {
    content = (
      <Suspense fallback={<div className="boot"><div className="spinner" /></div>}>
        <FitnessPage session={session} toast={toast} />
      </Suspense>
    )
  }
  else if (page === 'competitions') {
    content = (
      <Suspense fallback={<div className="boot"><div className="spinner" /></div>}>
        <CompetitionsPage session={session} toast={toast} focusId={focusComp} onOpenPrep={() => goTo('amc')} />
      </Suspense>
    )
  }
  else if (page === 'amc') {
    content = (
      <Suspense fallback={<div className="boot"><div className="spinner" /></div>}>
        <AmcPrepPage session={session} store={store} toast={toast} onOpenCompetition={openCompetition} />
      </Suspense>
    )
  }
  else if (page !== 'calendar') {
    content = (
      <section className="panel blank-page">
        <div className="blank-page-inner">
          <h2>Nothing shared here</h2>
          <p className="muted">This link doesn’t include any tools. Ask for a new one.</p>
        </div>
      </section>
    )
  } else {
    content = (
      <CalendarPage
        store={store}
        days={days}
        dayCount={dayCount}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        step={(dir) => setAnchor((a) => addDays(a, dir * dayCount))}
        goToday={() => setAnchor(new Date())}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        hiddenCats={hiddenCats}
        search={search}
        setSearch={setSearch}
        defaultCategoryId={defaultCategoryId}
        calView={calView}
        setCalView={setCalView}
        embed={embed}
        fixedDays={fixedDays}
        setFixedDays={setFixedDays}
        onMenu={() => setNavOpen(true)}
        toast={toast}
      />
    )
  }

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''} ${embed ? 'embed' : ''} ${blockStyle === 'solid' ? 'blocks-solid' : ''}`}>
      <Sidebar
        pages={navPages}
        page={page}
        setPage={goTo}
        store={store}
        hiddenCats={hiddenCats}
        toggleCategory={toggleCategory}
        activeCategory={defaultCategoryId}
        setActiveCategory={setActiveCategory}
        onClose={() => setNavOpen(false)}
        guest={guest}
        embed={embed}
      />
      <div className="main">
        {!embed && (
          <Topbar
            title={PAGE_TITLES[page] ?? 'Calendar'}
            subtitle={guest ? `You're editing ${guest.owner ? `${guest.owner}'s` : 'a shared'} calendar` : null}
            session={session}
            guest={guest}
            search={search}
            setSearch={setSearch}
            showSearch={page === 'calendar'}
            onMenu={() => setNavOpen(true)}
          />
        )}
        <div className="content">{content}</div>
      </div>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      {rateProductivity && !limited && <ProductivityDial store={store} />}
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
