import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CalendarCheck, ChevronLeft, ChevronRight, Clock, Globe } from 'lucide-react'
import { callShareApi } from '../lib/backends'
import { addDaysISO, toMinutes } from '../lib/domain'
import { format, fromISODate } from '../lib/dates'
import { formatLocalTime, localTimeZone, zonedToDate } from '../lib/tz'
import Logo from './Logo'

const PAGE_DAYS = 14

/** /b/<token>: pick a free time in someone's bookable blocks. No sign-in. */
export default function BookingPage({ token }) {
  const [page, setPage] = useState(null) // start date of the visible 2 weeks
  const [firstPage, setFirstPage] = useState(null) // today, as the server sees it
  const [state, setState] = useState({ status: 'loading' })
  const [picked, setPicked] = useState(null) // { date, window_id, start, end }
  const [form, setForm] = useState({ name: '', email: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const fetchDays = useCallback(
    (from) =>
      callShareApi('/api/book', token, {
        op: 'load',
        from: from ?? undefined,
        to: from ? addDaysISO(from, PAGE_DAYS - 1) : undefined,
      }),
    [token],
  )
  const apply = (res) => setState(res.error ? { status: 'error', message: res.error.message } : { status: 'ready', info: res.data })
  const load = (from) => fetchDays(from).then(apply)

  useEffect(() => {
    fetchDays(null).then((res) => {
      setState(res.error ? { status: 'error', message: res.error.message } : { status: 'ready', info: res.data })
      if (!res.error) {
        setPage(res.data.from)
        setFirstPage(res.data.from)
      }
    })
  }, [fetchDays])

  const info = state.info
  const ownerTz = info?.timezone
  const visitorTz = localTimeZone()
  const differentTz = ownerTz && ownerTz !== visitorTz

  // Slots are in the owner's zone; show them in the visitor's own time.
  const label = useCallback(
    (date, time) => formatLocalTime(zonedToDate(date, toMinutes(time), ownerTz || visitorTz)),
    [ownerTz, visitorTz],
  )
  const goTo = (from) => {
    setPage(from)
    setState((s) => ({ ...s, status: 'refreshing' }))
    load(from)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await callShareApi('/api/book', token, { op: 'book', ...picked, ...form })
    setSubmitting(false)
    if (res.error) {
      setError(res.error.message)
      if (res.error.status === 409) {
        setPicked(null)
        load(page)
      }
      if (res.error.status === 410) load(page)
      return
    }
    setDone(res.data)
    setState((s) => ({ ...s, info: { ...s.info, remaining: s.info.remaining === null ? null : s.info.remaining - 1 } }))
  }

  if (state.status === 'loading') return <div className="boot"><div className="spinner" /></div>

  return (
    <div className="booking-screen">
      <div className="booking-card">
        <header className="booking-head">
          <div className="auth-brand">
            <Logo size={26} />
            <span>Vapor</span>
          </div>
          {info && (
            <>
              <h1>{info.name || 'Book a time'}</h1>
              <p className="muted">
                {info.owner ? `with ${info.owner} · ` : ''}
                <Clock size={13} /> {info.slot_minutes} min
                {info.remaining !== null && info.remaining > 0 && ` · ${info.remaining} spot${info.remaining === 1 ? '' : 's'} left`}
              </p>
            </>
          )}
        </header>

        {state.status === 'error' ? (
          <div className="booking-empty">
            <h2>This booking link isn’t available</h2>
            <p className="muted">{state.message}</p>
          </div>
        ) : done ? (
          <div className="booking-done">
            <CalendarCheck size={34} />
            <h2>You’re booked</h2>
            <p>
              {format(fromISODate(done.date), 'EEEE, MMMM d')} · {label(done.date, done.start)} – {label(done.date, done.end)}
            </p>
            <p className="muted small">
              It’s on {info.owner ? `${info.owner}’s` : 'the'} calendar. You can close this page.
            </p>
          </div>
        ) : info.closed ? (
          <div className="booking-empty">
            <h2>Fully booked</h2>
            <p className="muted">This link has been used up. Ask {info.owner ?? 'the owner'} for a new one.</p>
          </div>
        ) : picked ? (
          <form className="booking-form-step" onSubmit={submit}>
            <button type="button" className="btn ghost sm" onClick={() => setPicked(null)}>
              <ArrowLeft size={14} /> Change time
            </button>
            <div className="picked-summary">
              <strong>{format(fromISODate(picked.date), 'EEEE, MMMM d')}</strong>
              <span>
                {label(picked.date, picked.start)} – {label(picked.date, picked.end)}
              </span>
            </div>
            <label className="field">
              <span className="field-label">Your name</span>
              <input required autoFocus maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Email (optional)</span>
              <input type="email" maxLength={120} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Anything to share? (optional)</span>
              <textarea rows={3} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button className="btn primary full" disabled={submitting || !form.name.trim()}>
              {submitting ? 'Booking…' : 'Confirm booking'}
            </button>
          </form>
        ) : (
          <>
            <div className="booking-nav">
              <button
                className="icon-btn"
                aria-label="Earlier"
                disabled={!page || page <= firstPage}
                onClick={() => {
                  const prev = addDaysISO(page, -PAGE_DAYS)
                  goTo(prev < firstPage ? firstPage : prev)
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <span className="range-label">
                {page && `${format(fromISODate(info.from), 'MMM d')} – ${format(fromISODate(info.to), 'MMM d')}`}
              </span>
              <button
                className="icon-btn"
                aria-label="Later"
                disabled={!info.to || info.to >= info.last}
                onClick={() => goTo(addDaysISO(info.to, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            {differentTz && (
              <p className="muted small tz-note">
                <Globe size={13} /> Times shown in your time zone ({visitorTz.replace('_', ' ')})
              </p>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className={`booking-days ${state.status === 'refreshing' ? 'is-refreshing' : ''}`}>
              {info.days.length === 0 && (
                <div className="booking-empty">
                  <h2>No open times in these dates</h2>
                  <p className="muted">Try the next dates.</p>
                </div>
              )}
              {info.days.map((d) => (
                <section key={d.date} className="booking-day">
                  <h3>
                    {format(fromISODate(d.date), 'EEEE')} <span className="muted">{format(fromISODate(d.date), 'MMM d')}</span>
                  </h3>
                  <div className="slot-grid">
                    {d.slots.map((s) => (
                      <button key={s.window_id + s.start} className="slot" onClick={() => setPicked({ date: d.date, ...s })}>
                        {label(d.date, s.start)}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
