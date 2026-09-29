// Converting the calendar owner's wall-clock times (their time zone) into the
// visitor's local time, for the booking page.

function partsIn(date, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((x) => [x.type, Number(x.value)]),
  )
  return p
}

const offsetMinutes = (utcMs, timeZone) => {
  const p = partsIn(new Date(utcMs), timeZone)
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utcMs) / 60000
}

/** 'YYYY-MM-DD' + minutes-of-day in `timeZone` → the real instant. */
export function zonedToDate(date, minutes, timeZone) {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  try {
    const first = offsetMinutes(guess, timeZone)
    let utc = guess - first * 60000
    const second = offsetMinutes(utc, timeZone)
    if (second !== first) utc = guess - second * 60000 // DST edge
    return new Date(utc)
  } catch {
    return new Date(guess)
  }
}

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export const formatLocalTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
