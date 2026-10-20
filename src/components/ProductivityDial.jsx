import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { expandBlocks } from '../lib/recurrence'
import { fromMinutes } from '../lib/domain'
import { isOccurrenceId, splitOccurrenceId } from '../lib/domain'
import { nowMinutes, todayISO } from '../lib/dates'
import { usePref } from '../lib/prefs'

const LEGACY_KEY = 'agenda:ratings'
const SCORES = Array.from({ length: 10 }, (_, i) => i + 1)

// Gauge geometry: a 270° arc opening at the bottom.
const R = 22
const ARC = 2 * Math.PI * R * 0.75
const scoreColor = (s) => (s >= 7 ? '#1ba672' : s >= 4 ? '#e29a12' : '#de4b4f')

/** Re-render every 30s so blocks that just ended get picked up. */
function useNow() {
  const [now, setNow] = useState(() => ({ date: todayISO(), minutes: nowMinutes() }))
  useEffect(() => {
    const id = setInterval(() => setNow({ date: todayISO(), minutes: nowMinutes() }), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * Productivity ratings (Settings → Rate productivity): when a timed block
 * ends, ask for a 1–10 score; the corner dial shows today's average.
 * Scores are saved on the block (productivity_rating: 1–10, 0 = skipped).
 * Rating a repeating occurrence turns it into its own row.
 */
export default function ProductivityDial({ store }) {
  const now = useNow()
  // The day's list stays pinned in the corner until closed (remembered).
  const [open, setOpen] = usePref('ratingsOpen', true)
  const [dismissed, setDismissed] = useState(null)
  const [editing, setEditing] = useState(null)
  useImportLocalRatings(store)

  // Today's timed, trackable top-level blocks that have already ended.
  const ended = useMemo(() => {
    const { display } = expandBlocks(store.blocks, now.date, now.date)
    return Object.values(display)
      .filter(
        (b) =>
          b.date === now.date &&
          !b.parent_id &&
          !b.all_day &&
          !(b.repeat && !b.virtual) &&
          b.status !== 'canceled' &&
          b.status !== 'none' &&
          b.end <= now.minutes,
      )
      .sort((a, b) => b.end - a.end)
  }, [store.blocks, now])

  const unrated = ended.filter((b) => b.productivity_rating == null)
  const pending = unrated[0] ?? null
  // Pop the prompt open whenever a new block needs rating.
  const showPrompt = pending && (open || dismissed !== pending.id)

  const rated = ended.filter((b) => b.productivity_rating > 0)
  const avg = rated.length ? rated.reduce((s, b) => s + b.productivity_rating, 0) / rated.length : null

  const rate = (id, score) => store.updateBlock(id, { productivity_rating: score })

  const rerate = (id, score) => {
    rate(id, score)
    setEditing(null)
  }

  const close = () => {
    setOpen(false)
    setEditing(null)
    setDismissed(pending?.id ?? null)
  }

  return (
    <div className="prod">
      {(showPrompt || open) && (
        <div className="prod-pop" role="dialog" aria-label="Productivity">
          <div className="prod-pop-head">
            <strong>{pending ? 'How productive was it?' : 'Today'}</strong>
            <button className="icon-btn sm" onClick={close} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          {pending ? (
            <>
              <div className="prod-block">
                <span className="prod-title">{pending.title || 'Untitled'}</span>
                <small>
                  {fromMinutes(pending.start)}–{fromMinutes(pending.end)}
                  {unrated.length > 1 && ` · ${unrated.length - 1} more to rate`}
                </small>
              </div>
              <div className="prod-scores">
                <Scores onPick={(s) => rate(pending.id, s)} />
              </div>
              <button className="prod-skip" onClick={() => rate(pending.id, 0)}>
                Skip
              </button>
            </>
          ) : rated.length ? (
            <ul className="prod-list">
              {rated.map((b) => (
                <li key={b.id} className={editing === b.id ? 'editing' : ''}>
                  <button
                    className="prod-row"
                    onClick={() => setEditing(editing === b.id ? null : b.id)}
                    aria-expanded={editing === b.id}
                    title="Change rating"
                  >
                    <span>{b.title || 'Untitled'}</span>
                    <b style={{ color: scoreColor(b.productivity_rating) }}>{b.productivity_rating}</b>
                  </button>
                  {editing === b.id && (
                    <div className="prod-scores">
                      <Scores current={b.productivity_rating} onPick={(s) => rerate(b.id, s)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="prod-empty">Nothing rated yet today. You’ll be asked when a block ends.</p>
          )}
        </div>
      )}
      <button
        className="prod-dial"
        onClick={() => (showPrompt || open ? close() : setOpen(true))}
        aria-label={avg == null ? 'Productivity: no ratings today' : `Productivity today: ${avg.toFixed(1)} out of 10`}
        title={avg == null ? 'No ratings today' : `${rated.length} rated today`}
      >
        <svg viewBox="0 0 56 56" width="56" height="56">
          <circle className="prod-track" cx="28" cy="28" r={R} strokeDasharray={`${ARC} 999`} transform="rotate(135 28 28)" />
          {avg != null && (
            <circle
              className="prod-value"
              cx="28"
              cy="28"
              r={R}
              stroke={scoreColor(avg)}
              strokeDasharray={`${(ARC * avg) / 10} 999`}
              transform="rotate(135 28 28)"
            />
          )}
        </svg>
        <span className="prod-num">{avg == null ? '–' : avg.toFixed(1)}</span>
        {pending && <span className="prod-dot" />}
      </button>
    </div>
  )
}

/**
 * Ratings used to live in localStorage; move any for loaded blocks onto the
 * blocks themselves once, then drop the old key.
 */
function useImportLocalRatings(store) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current || store.loading) return
    done.current = true
    let legacy
    try {
      legacy = JSON.parse(localStorage.getItem(LEGACY_KEY))
    } catch {
      return
    }
    if (!legacy) return
    for (const [id, r] of Object.entries(legacy)) {
      const own = store.blocks[isOccurrenceId(id) ? splitOccurrenceId(id).templateId : id]
      if (!own || (!isOccurrenceId(id) && own.productivity_rating != null)) continue
      store.updateBlock(id, { productivity_rating: r.score ?? 0 })
    }
    try {
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* storage unavailable */
    }
  }, [store])
}

function Scores({ current, onPick }) {
  return SCORES.map((s) => (
    <button key={s} className={s === current ? 'on' : ''} onClick={() => onPick(s)} style={{ '--sc': scoreColor(s) }}>
      {s}
    </button>
  ))
}
