import {
  WEEKDAYS,
  WEEKEND,
  WORKWEEK,
  addDaysISO,
  isLastWeekdayOfMonth,
  monthlyWeekdayLabel,
  normalizeRepeat,
  repeatPreset,
  weekOfMonth,
  weekdayOf,
} from '../lib/domain'

const FREQS = [
  { id: 'none', label: "Doesn't repeat" },
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Every weekday' },
  { id: 'weekends', label: 'Every weekend' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
]
const UNITS = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** Controlled editor for a repeat rule. Emits a normalized rule or null. */
export default function RepeatEditor({ repeat, date, onChange }) {
  const emit = (next) => {
    try {
      onChange(normalizeRepeat(next, date))
    } catch {
      /* ignore invalid intermediate input */
    }
  }
  const freq = repeat?.freq ?? 'none'
  const preset = repeatPreset(repeat)
  const shortcut = preset === 'weekdays' || preset === 'weekends' ? preset : null
  const days = repeat?.days ?? [weekdayOf(date)]
  const ends = repeat?.count ? 'count' : repeat?.until ? 'until' : 'never'

  const pick = (id) => {
    if (id === 'none') return emit(null)
    const keep = { until: repeat?.until, count: repeat?.count }
    if (id === 'weekdays') return emit({ ...keep, freq: 'weekly', interval: 1, days: WORKWEEK })
    if (id === 'weekends') return emit({ ...keep, freq: 'weekly', interval: 1, days: WEEKEND })
    emit({ ...keep, freq: id, interval: repeat?.interval ?? 1 })
  }

  // Monthly options derived from the start date: "on day 13", "on the 2nd Tuesday", "on the last Tuesday".
  const weekday = weekdayOf(date)
  const nth = weekOfMonth(date)
  const monthlyOptions = [
    { id: 'day', label: `On day ${Number(date.slice(8, 10))}`, rule: { week: null } },
    ...(nth <= 4 ? [{ id: `w${nth}`, label: `On the ${monthlyWeekdayLabel(nth, weekday)}`, rule: { week: nth, weekday } }] : []),
    ...(isLastWeekdayOfMonth(date) ? [{ id: 'w-1', label: `On the ${monthlyWeekdayLabel(-1, weekday)}`, rule: { week: -1, weekday } }] : []),
  ]
  const monthlyValue = repeat?.week ? `w${repeat.week}` : 'day'

  return (
    <div className="repeat-editor">
      <div className="repeat-row">
        <select value={shortcut ?? freq} onChange={(e) => pick(e.target.value)} aria-label="Repeat">
          {FREQS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        {repeat && !shortcut && (
          <label className="repeat-interval">
            every
            <input
              type="number"
              min={1}
              max={99}
              value={repeat.interval}
              onChange={(e) => emit({ ...repeat, interval: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
            />
            {UNITS[freq]}
            {repeat.interval > 1 ? 's' : ''}
          </label>
        )}
      </div>

      {freq === 'weekly' && (
        <div className="weekday-toggles" role="group" aria-label="Repeat on">
          {ORDER.map((d) => {
            const on = days.includes(d)
            return (
              <button
                key={d}
                className={on ? 'on' : ''}
                aria-pressed={on}
                onClick={() => {
                  const next = on ? days.filter((x) => x !== d) : [...days, d]
                  if (next.length) emit({ ...repeat, days: WEEKDAYS.filter((x) => next.includes(x)) })
                }}
              >
                {d.slice(0, 2)}
              </button>
            )
          })}
        </div>
      )}

      {freq === 'monthly' && monthlyOptions.length > 1 && (
        <select
          value={monthlyValue}
          onChange={(e) => emit({ ...repeat, ...monthlyOptions.find((o) => o.id === e.target.value).rule })}
          aria-label="Monthly on"
        >
          {monthlyOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {repeat && (
        <div className="repeat-ends">
          <span className="repeat-ends-label">Ends</span>
          <div className="segmented small">
            {[
              ['never', 'Never'],
              ['until', 'On date'],
              ['count', 'After'],
            ].map(([id, label]) => (
              <button
                key={id}
                className={ends === id ? 'on' : ''}
                onClick={() => {
                  const base = { ...repeat, until: null, count: null }
                  if (id === 'until') emit({ ...base, until: repeat.until ?? addDaysISO(date, 90) })
                  else if (id === 'count') emit({ ...base, count: repeat.count ?? 10 })
                  else emit(base)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {ends === 'until' && (
            <input type="date" value={repeat.until} min={date} onChange={(e) => e.target.value && emit({ ...repeat, until: e.target.value })} />
          )}
          {ends === 'count' && (
            <label className="repeat-interval">
              <input
                type="number"
                min={1}
                max={999}
                value={repeat.count}
                onChange={(e) => emit({ ...repeat, count: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })}
              />
              time{repeat.count === 1 ? '' : 's'}
            </label>
          )}
        </div>
      )}
    </div>
  )
}
