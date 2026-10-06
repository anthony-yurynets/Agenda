import { addDaysISO, weekdayOf } from './domain'
import { expandBlocks } from './recurrence'

export const KINDS = [
  { id: 'assignment', label: 'Assignment' },
  { id: 'exam', label: 'Exam' },
]

// Status ids double as class names (`as-<id>`) for the card tint.
export const ASSIGNMENT_STATUSES = [
  { id: 'not_started', label: 'Not started' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
]
export const assignmentStatusLabel = (id) => ASSIGNMENT_STATUSES.find((s) => s.id === id)?.label ?? id
export const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label ?? id

/** Click-to-cycle order for a card's status pill. */
export const nextAssignmentStatus = (s) => {
  const order = ASSIGNMENT_STATUSES.map((x) => x.id)
  return order[(order.indexOf(s) + 1) % order.length]
}

/** Monday of the week containing `date` (YYYY-MM-DD). */
export const weekStartOf = (date) => addDaysISO(date, -['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(weekdayOf(date)))

export const weekDates = (monday) => Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i))

/** Order inside a day: open work first, exams before assignments, then oldest first. */
export function sortAssignments(list) {
  const done = (a) => (a.status === 'done' ? 1 : 0)
  return [...list].sort(
    (a, b) => done(a) - done(b) || (a.kind === 'exam' ? 0 : 1) - (b.kind === 'exam' ? 0 : 1) || (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  )
}

export const UPCOMING_DAYS = 60

/**
 * The next `limit` calendar events from now: top-level blocks (repeats
 * expanded), skipping canceled ones and those switched off with hide_upcoming.
 * `blocks` is the calendar store's map; returns display blocks (occurrence ids
 * for repeats) plus the expanded map and aliases (see expandBlocks) so a panel
 * can open them.
 */
export function upcomingEvents(blocks, today, nowMins, limit = 5) {
  const to = addDaysISO(today, UPCOMING_DAYS)
  const { display, aliases } = expandBlocks(blocks, today, to)
  const list = Object.values(display).filter(
    (b) =>
      !b.parent_id &&
      !(b.repeat && !b.virtual) && // series templates show through their occurrences
      !b.hide_upcoming &&
      b.status !== 'canceled' &&
      b.date <= to &&
      (b.date > today || (b.date === today && (b.all_day || b.end > nowMins))),
  )
  list.sort((a, b) => a.date.localeCompare(b.date) || (b.all_day ? 1 : 0) - (a.all_day ? 1 : 0) || a.start - b.start)
  return { events: list.slice(0, limit), display, aliases }
}

/** "Now", "in 25 min", "in 3 h", "Tomorrow", "Thu", "Oct 14". */
export function whenLabel(block, today, nowMins) {
  if (block.date === today) {
    if (block.all_day) return 'Today'
    const mins = block.start - nowMins
    if (mins <= 0) return 'Now'
    if (mins < 60) return `in ${mins} min`
    return `in ${Math.round(mins / 60)} h`
  }
  if (block.date === addDaysISO(today, 1)) return 'Tomorrow'
  const d = new Date(`${block.date}T12:00`)
  if (block.date < addDaysISO(today, 7)) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Favicon for a link; the tile falls back to a letter if it fails to load. */
export const faviconUrl = (host) => (host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : '')
