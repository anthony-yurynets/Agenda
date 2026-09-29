// Shared between the browser app and the MCP serverless function.
// Keep this file dependency-free.

export const STATUSES = [
  { id: 'planned', label: 'Planned' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
  { id: 'canceled', label: 'Canceled' },
  // Fixed commitments (sleep, school) that will happen anyway: no tracking.
  { id: 'none', label: 'No status' },
]

export const hasStatus = (status) => status !== 'none'

export const STATUS_IDS = STATUSES.map((s) => s.id)

export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label ?? id

export const CATEGORY_PALETTE = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#64748b',
]

export const DEFAULT_CATEGORIES = [
  { name: 'Work', color: '#3b82f6' },
  { name: 'Personal', color: '#8b5cf6' },
  { name: 'Health', color: '#22c55e' },
  { name: 'Learning', color: '#f97316' },
]

export const DAY_MINUTES = 24 * 60

const TIME_RE = /^([01]?\d|2[0-4]):([0-5]\d)(?::[0-5]\d)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** "09:30" | "09:30:00" -> 570. Returns null when invalid. */
export function toMinutes(time) {
  if (typeof time !== 'string') return null
  const m = TIME_RE.exec(time.trim())
  if (!m) return null
  const mins = Number(m[1]) * 60 + Number(m[2])
  return mins > DAY_MINUTES ? null : mins
}

/** 570 -> "09:30" */
export function fromMinutes(mins) {
  const clamped = Math.max(0, Math.min(DAY_MINUTES, Math.round(mins)))
  const h = String(Math.floor(clamped / 60)).padStart(2, '0')
  const m = String(clamped % 60).padStart(2, '0')
  return `${h}:${m}`
}

export function isValidDate(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return false
  const d = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

/**
 * Evenly divide [start, end) into `parts` slices, snapped to `snap` minutes.
 * Returns [{start, end}] in minutes.
 */
export function divideRange(start, end, parts, snap = 5) {
  const out = []
  const span = end - start
  for (let i = 0; i < parts; i++) {
    const s = start + Math.round((span * i) / parts / snap) * snap
    const e = i === parts - 1 ? end : start + Math.round((span * (i + 1)) / parts / snap) * snap
    out.push({ start: s, end: e })
  }
  return out.filter((r) => r.end > r.start)
}

// ─── Repeats ───────────────────────────────────────────────────────────────
// repeat = { freq: 'daily'|'weekly'|'monthly'|'yearly', interval, days?, until? }
// Dates are 'YYYY-MM-DD' strings, handled in UTC so there are no DST surprises.

export const REPEAT_FREQS = ['daily', 'weekly', 'monthly', 'yearly']
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const WEEKDAY_LABELS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }
const DAY_MS = 86_400_000
export const WORKWEEK = ['mon', 'tue', 'wed', 'thu', 'fri']
export const WEEKEND = ['sat', 'sun']
const sameDays = (a = [], b) => a.length === b.length && b.every((d) => a.includes(d))

const utc = (iso) => new Date(`${iso}T00:00:00Z`)
const iso = (d) => d.toISOString().slice(0, 10)
export const weekdayOf = (date) => WEEKDAYS[utc(date).getUTCDay()]
export const addDaysISO = (date, n) => iso(new Date(utc(date).getTime() + n * DAY_MS))

/** Occurrence ids look like `<template uuid>::<YYYY-MM-DD>`. */
export const isOccurrenceId = (id) => typeof id === 'string' && id.includes('::')
export function splitOccurrenceId(id) {
  const [templateId, date] = id.split('::')
  return { templateId, date }
}
export const occurrenceId = (templateId, date) => `${templateId}::${date}`

/** Named shortcut for a rule, if it is one: 'daily' | 'weekdays' | 'weekends' | null. */
export function repeatPreset(repeat) {
  if (!repeat || (repeat.interval ?? 1) !== 1 || repeat.until || repeat.count) return null
  if (repeat.freq === 'daily') return 'daily'
  if (repeat.freq !== 'weekly') return null
  if (sameDays(repeat.days, WORKWEEK)) return 'weekdays'
  if (sameDays(repeat.days, WEEKEND)) return 'weekends'
  return null
}

const daysInMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
/** 1–5: which occurrence of its weekday this date is within the month. */
export const weekOfMonth = (date) => Math.ceil(utc(date).getUTCDate() / 7)
/** True if no later same-weekday exists in the month. */
export const isLastWeekdayOfMonth = (date) => {
  const d = utc(date)
  return d.getUTCDate() + 7 > daysInMonth(d)
}
const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', '-1': 'last' }
const FULL_DAY = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' }
export const monthlyWeekdayLabel = (week, weekday) => `${ORDINALS[week]} ${FULL_DAY[weekday]}`

/**
 * Validate + normalize a repeat rule. Returns null for "doesn't repeat"; throws on bad input.
 *
 * { freq: 'daily' | 'weekly' | 'monthly' | 'yearly',   (also 'weekdays' / 'weekends' shorthands)
 *   interval: 1–99,
 *   days: ['mon', …],             weekly: which weekdays
 *   week: 1–4 | -1, weekday: 'tue' monthly: "2nd Tuesday" / "last Friday" instead of the same date
 *   until: 'YYYY-MM-DD' | count: 1–999 }   optional end: a date, or after N occurrences
 */
export function normalizeRepeat(input, startDate) {
  if (input === null || input === undefined || input === false || input === 'none') return null
  if (typeof input === 'string') input = { freq: input }
  if (input.freq === 'none') return null
  if (input.freq === 'weekdays') input = { ...input, freq: 'weekly', days: WORKWEEK }
  if (input.freq === 'weekends') input = { ...input, freq: 'weekly', days: WEEKEND }
  const freq = input.freq
  if (!REPEAT_FREQS.includes(freq)) throw new Error(`repeat.freq must be one of ${REPEAT_FREQS.join(', ')}`)
  const interval = input.interval === undefined || input.interval === null ? 1 : Number(input.interval)
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) throw new Error('repeat.interval must be 1–99')
  const out = { freq, interval }
  if (freq === 'weekly') {
    const days = (input.days?.length ? input.days : [weekdayOf(startDate)]).map((d) => String(d).slice(0, 3).toLowerCase())
    if (!days.every((d) => WEEKDAYS.includes(d))) throw new Error(`repeat.days must use ${WEEKDAYS.join(', ')}`)
    out.days = WEEKDAYS.filter((d) => days.includes(d))
  }
  if (freq === 'monthly' && input.week !== undefined && input.week !== null) {
    const week = Number(input.week)
    if (![1, 2, 3, 4, -1].includes(week)) throw new Error('repeat.week must be 1, 2, 3, 4 or -1 (last)')
    const weekday = String(input.weekday ?? weekdayOf(startDate)).slice(0, 3).toLowerCase()
    if (!WEEKDAYS.includes(weekday)) throw new Error(`repeat.weekday must be one of ${WEEKDAYS.join(', ')}`)
    out.week = week
    out.weekday = weekday
  }
  if (input.until && input.count) throw new Error('Use either repeat.until or repeat.count, not both')
  if (input.until) {
    if (!isValidDate(input.until)) throw new Error('repeat.until must be YYYY-MM-DD')
    if (input.until < startDate) throw new Error('repeat.until is before the first occurrence')
    out.until = input.until
  }
  if (input.count) {
    const count = Number(input.count)
    if (!Number.isInteger(count) || count < 1 || count > 999) throw new Error('repeat.count must be 1–999')
    out.count = count
  }
  return out
}

function matches(startDate, repeat, date) {
  const s = utc(startDate)
  const d = utc(date)
  const n = repeat.interval || 1
  switch (repeat.freq) {
    case 'daily':
      return Math.round((d - s) / DAY_MS) % n === 0
    case 'weekly': {
      if (!(repeat.days ?? [weekdayOf(startDate)]).includes(WEEKDAYS[d.getUTCDay()])) return false
      const monday = (x) => x.getTime() - ((x.getUTCDay() + 6) % 7) * DAY_MS
      return Math.round((monday(d) - monday(s)) / (7 * DAY_MS)) % n === 0
    }
    case 'monthly': {
      const months = (d.getUTCFullYear() - s.getUTCFullYear()) * 12 + d.getUTCMonth() - s.getUTCMonth()
      if (months % n !== 0) return false
      if (repeat.week) {
        if (WEEKDAYS[d.getUTCDay()] !== repeat.weekday) return false
        return repeat.week === -1 ? isLastWeekdayOfMonth(date) : weekOfMonth(date) === repeat.week
      }
      return d.getUTCDate() === s.getUTCDate()
    }
    case 'yearly':
      return d.getUTCMonth() === s.getUTCMonth() && d.getUTCDate() === s.getUTCDate() && (d.getUTCFullYear() - s.getUTCFullYear()) % n === 0
    default:
      return false
  }
}

/** For count-limited series: the date of the last occurrence (skipped dates still count, as in RFC 5545). */
function lastByCount(startDate, repeat) {
  let seen = 0
  let d = startDate
  for (let guard = 0; guard < 3660; guard++, d = addDaysISO(d, 1)) {
    if (d === startDate || matches(startDate, repeat, d)) {
      seen++
      if (seen >= repeat.count) return d
    }
  }
  return d
}

/**
 * Dates in [from, to] on which a series starting at `startDate` occurs. As in
 * RFC 5545, the start date is always the first occurrence even if the rule
 * wouldn't produce it (e.g. created on a Saturday, repeating on weekdays).
 */
export function occurrenceDates(startDate, repeat, from, to, exdates = []) {
  if (!repeat) return []
  const lo = from > startDate ? from : startDate
  let hi = repeat.until && repeat.until < to ? repeat.until : to
  if (repeat.count) {
    const last = lastByCount(startDate, repeat)
    if (last < hi) hi = last
  }
  const skip = new Set(exdates ?? [])
  const out = []
  for (let d = lo, guard = 0; d <= hi && guard < 1500; d = addDaysISO(d, 1), guard++) {
    if (!skip.has(d) && (d === startDate || matches(startDate, repeat, d))) out.push(d)
  }
  return out
}

/** "Every week on Mon, Wed until 2026-12-01", "Every month on the last Friday, 10 times" */
export function describeRepeat(repeat, startDate) {
  if (!repeat) return "Doesn't repeat"
  const n = repeat.interval || 1
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[repeat.freq]
  let text = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`
  if (repeat.freq === 'daily' && n === 1) text = 'Daily'
  if (repeat.freq === 'weekly') {
    const days = repeat.days ?? []
    if (n === 1 && sameDays(days, WORKWEEK)) text = 'Every weekday'
    else if (n === 1 && sameDays(days, WEEKEND)) text = 'Every weekend'
    else if (days.length === 7 && n === 1) text = 'Daily'
    else text += ` on ${days.map((d) => WEEKDAY_LABELS[d]).join(', ')}`
  }
  if (repeat.freq === 'monthly') {
    if (repeat.week) text += ` on the ${monthlyWeekdayLabel(repeat.week, repeat.weekday)}`
    else if (startDate) text += ` on day ${utc(startDate).getUTCDate()}`
  }
  if (repeat.until) text += ` until ${repeat.until}`
  if (repeat.count) text += `, ${repeat.count} time${repeat.count === 1 ? '' : 's'}`
  return text
}

// ─── Booking ───────────────────────────────────────────────────────────────

/** Current date + minute-of-day in an IANA time zone (the calendar owner's). */
export function nowIn(timeZone) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    )
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
  } catch {
    const d = new Date()
    return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() }
  }
}

/**
 * Bookable slots of `slot` minutes inside a window, skipping busy intervals
 * and anything already in the past.
 * win = { date, start, end, busy: [[start, end], ...] }
 */
export function freeSlots(win, slot, now) {
  const out = []
  for (let s = win.start; s + slot <= win.end; s += slot) {
    const e = s + slot
    if (now && (win.date < now.date || (win.date === now.date && s <= now.minutes))) continue
    if (win.busy.some(([bs, be]) => s < be && e > bs)) continue
    out.push({ start: s, end: e })
  }
  return out
}
