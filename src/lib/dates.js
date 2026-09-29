import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns'

export const toISODate = (d) => format(d, 'yyyy-MM-dd')
export const fromISODate = (s) => parseISO(s)
export const todayISO = () => toISODate(new Date())

/** Visible days for the calendar: full weeks start on Monday, smaller spans start at the anchor. */
export function visibleDays(anchor, count) {
  const start = count === 7 ? startOfWeek(anchor, { weekStartsOn: 1 }) : anchor
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

export function rangeLabel(days) {
  const first = days[0]
  const last = days[days.length - 1]
  if (days.length === 1) return format(first, 'EEEE, MMM d, yyyy')
  if (first.getMonth() === last.getMonth()) return `${format(first, 'MMM d')} – ${format(last, 'd, yyyy')}`
  if (first.getFullYear() === last.getFullYear()) return `${format(first, 'MMM d')} – ${format(last, 'MMM d, yyyy')}`
  return `${format(first, 'MMM d, yyyy')} – ${format(last, 'MMM d, yyyy')}`
}

export const nowMinutes = () => {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

export { addDays, format, isSameDay }
