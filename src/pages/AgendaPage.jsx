import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ClipboardList, GraduationCap, Tags } from 'lucide-react'
import { useAgenda } from '../state/useAgenda'
import { addDaysISO } from '../lib/domain'
import { nowMinutes, todayISO } from '../lib/dates'
import { UPCOMING_DAYS, isDone, upcomingEvents } from '../lib/agenda'
import { OptionManager } from '../components/competitions/CompBits'
import AssignmentEditor from '../components/agenda/AssignmentEditor'
import WeekBoard, { AssignmentCard } from '../components/agenda/WeekBoard'
import Upcoming from '../components/agenda/Upcoming'
import QuickLinks from '../components/agenda/QuickLinks'
import BlockPanel from '../components/BlockPanel'

const greeting = (mins) => (mins < 5 * 60 ? 'Good evening' : mins < 12 * 60 ? 'Good morning' : mins < 18 * 60 ? 'Good afternoon' : 'Good evening')

/**
 * The landing page: add assignments and exams fast, see the week's due work,
 * what's coming up on the calendar, and quick links. Calendar events open in
 * the same panel as on the Calendar page.
 */
export default function AgendaPage({ session, store, toast }) {
  const dash = useAgenda(session.user.id, { onError: (m) => toast(m, 'error') })

  // The clock drives "Coming up" and "today"; tick every minute.
  const [clock, setClock] = useState(() => ({ today: todayISO(), mins: nowMinutes() }))
  useEffect(() => {
    const t = setInterval(() => setClock({ today: todayISO(), mins: nowMinutes() }), 60_000)
    return () => clearInterval(t)
  }, [])
  const { today, mins } = clock

  // The calendar store only holds the Calendar page's visible range; pull in the next two months.
  const { loadRange } = store
  useEffect(() => {
    loadRange(today, addDaysISO(today, UPCOMING_DAYS))
  }, [loadRange, today])
  const { events, display, aliases } = useMemo(() => upcomingEvents(store.blocks, today, mins), [store.blocks, today, mins])

  // An event opened from Coming up. Editing one day of a repeat swaps in a real row (aliases).
  const [eventRaw, setEventId] = useState(null)
  const eventReal = eventRaw && (aliases[eventRaw] ?? eventRaw)
  const eventId = eventReal && display[eventReal] ? eventReal : null

  // The assignment editor: { key, assignment } — a fresh key per open.
  const [editor, setEditor] = useState(null)
  const seq = useRef(0)
  const openNew = (fields = {}) => {
    setEventId(null)
    setEditor({
      key: ++seq.current,
      assignment: { id: null, title: '', kind: 'assignment', status: 'not_started', due_date: addDaysISO(today, 1), subject_id: null, ...fields },
    })
  }
  const openExisting = (id) => {
    const a = dash.assignments.find((x) => x.id === id)
    if (!a) return
    setEventId(null)
    setEditor({ key: ++seq.current, assignment: a })
  }

  const [subjectsOpen, setSubjectsOpen] = useState(false)
  const subjectsRef = useRef(null)
  useEffect(() => {
    if (!subjectsOpen) return
    const close = (e) => !subjectsRef.current?.contains(e.target) && setSubjectsOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [subjectsOpen])

  // A / E add an assignment / exam; Esc closes the event panel (ignored while typing).
  useEffect(() => {
    const onKey = (e) => {
      if (editor) return // it handles its own keys
      if (e.key === 'Escape') {
        setEventId(null)
        setSubjectsOpen(false)
        return
      }
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key?.toLowerCase()
      if (k === 'a' || k === 'e') {
        e.preventDefault()
        openNew({ kind: k === 'e' ? 'exam' : 'assignment' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const stats = useMemo(() => {
    const open = dash.assignments.filter((a) => !isDone(a))
    const weekEnd = addDaysISO(today, 6)
    return {
      overdue: open.filter((a) => a.kind !== 'exam' && a.due_date < today).sort((a, b) => a.due_date.localeCompare(b.due_date)),
      dueToday: open.filter((a) => a.due_date === today).length,
      dueWeek: open.filter((a) => a.due_date >= today && a.due_date <= weekEnd).length,
      exams: open.filter((a) => a.kind === 'exam' && a.due_date >= today && a.due_date <= weekEnd).length,
    }
  }, [dash.assignments, today])

  const name = (session.user.user_metadata?.full_name || session.user.user_metadata?.name || '').split(' ')[0]
  const editingId = editor?.assignment.id

  return (
    <div className="dash">
      <div className="dash-grid">
        <section className="glass-tile d-head">
          <div className="dh-hello">
            <h2>
              {greeting(mins)}
              {name ? `, ${name}` : ''}
            </h2>
            <p className="muted">
              {new Date(`${today}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              {' · '}
              {stats.dueToday ? `${stats.dueToday} due today` : 'Nothing due today'}
              {` · ${stats.dueWeek} due in the next 7 days`}
              {stats.exams > 0 && ` · ${stats.exams} exam${stats.exams === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="dh-actions">
            <div className="dropdown" ref={subjectsRef}>
              <button className={`btn ghost ${subjectsOpen ? 'is-active' : ''}`} onClick={() => setSubjectsOpen((o) => !o)} aria-expanded={subjectsOpen}>
                <Tags size={15} /> Subjects
              </button>
              {subjectsOpen && (
                <div className="menu items-menu">
                  <div className="menu-label">Subjects</div>
                  <OptionManager list={dash.subjectList} startEditing placeholder="New subject (e.g. Chemistry)" noun="subjects" />
                </div>
              )}
            </div>
            <button className="btn ghost" onClick={() => openNew({ kind: 'exam' })} title="Add exam (E)">
              <GraduationCap size={15} /> Add exam <kbd>E</kbd>
            </button>
            <button className="btn primary" onClick={() => openNew({ kind: 'assignment' })} title="Add assignment (A)">
              <ClipboardList size={15} /> Add assignment <kbd className="on-dark">A</kbd>
            </button>
          </div>
          {stats.overdue.length > 0 && (
            <div className="dh-overdue">
              <span className="dh-overdue-label">Overdue</span>
              {stats.overdue.map((a) => (
                <AssignmentCard
                  key={a.id}
                  a={a}
                  subject={dash.subjectsById[a.subject_id]}
                  today={today}
                  selected={editingId === a.id}
                  onOpen={openExisting}
                  onStatus={(id, status) => dash.updateAssignment(id, { status })}
                />
              ))}
            </div>
          )}
        </section>

        <section className="glass-tile d-week">
          <WeekBoard dash={dash} today={today} selectedId={editingId} onOpen={openExisting} onNew={openNew} />
          {!dash.loading && dash.assignments.length === 0 && (
            <p className="wb-hint muted small">
              <BookOpen size={13} /> Press <kbd>A</kbd> to add an assignment or <kbd>E</kbd> for an exam. <kbd>Tab</kbd> moves between fields, <kbd>Esc</kbd> saves.
            </p>
          )}
        </section>

        <section className="glass-tile d-soon">
          <Upcoming events={events} today={today} nowMins={mins} categoriesById={store.categoriesById} selectedId={eventId} onOpen={(id) => (setEditor(null), setEventId(id))} />
        </section>

        <section className="glass-tile d-links">
          <QuickLinks dash={dash} />
        </section>
      </div>

      {editor && (
        <AssignmentEditor
          key={editor.key}
          assignment={editor.assignment}
          dash={dash}
          toast={toast}
          onClose={() => setEditor(null)}
          onAnother={(fields) => openNew(fields)}
        />
      )}
      {eventId && (
        <BlockPanel key={eventRaw} id={eventId} store={store} blocks={display} onSelect={setEventId} onClose={() => setEventId(null)} toast={toast} />
      )}
    </div>
  )
}
