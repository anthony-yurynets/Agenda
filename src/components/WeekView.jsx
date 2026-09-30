import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DAY_MINUTES, fromMinutes } from '../lib/domain'
import { format, isSameDay, nowMinutes, toISODate } from '../lib/dates'
import { buildChildrenMap, layoutOverlaps } from '../lib/tree'
import BlockCard from './BlockCard'
import QuickCreate from './QuickCreate'
import StatusIcon from './StatusIcon'
import { Repeat } from 'lucide-react'

// Vertical zoom: pixels per minute. Pinch (trackpad / touch) or Ctrl+scroll changes it.
const DEFAULT_PPM = 1.2
const MIN_PPM = 0.5
const MAX_PPM = 6
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function readZoom() {
  try {
    const v = Number(localStorage.getItem('vapor:zoom'))
    return v >= MIN_PPM && v <= MAX_PPM ? v : DEFAULT_PPM
  } catch {
    return DEFAULT_PPM
  }
}

/** Time-axis labels: hours, plus half/quarter hours once there's room. */
function axisLabels(ppm) {
  const step = ppm >= 4.5 ? 15 : ppm >= 2.4 ? 30 : 60
  const out = []
  for (let m = step; m < DAY_MINUTES; m += step) out.push(m)
  return out
}

function useNow() {
  const [now, setNow] = useState(() => ({ date: new Date(), mins: nowMinutes() }))
  useEffect(() => {
    const t = setInterval(() => setNow({ date: new Date(), mins: nowMinutes() }), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function WeekView({ days, store, blocks, visible, allDay = [], search, selectedId, quickId, onSelect, onCreate, onCreateAllDay, onQuickClose, onQuickExpand }) {
  const { categoriesById, moveBlock } = store
  const scrollRef = useRef(null)
  const colsRef = useRef(null)
  const gesture = useRef(null)
  const [draft, setDraft] = useState(null) // creation drag {day, start, end}
  const [preview, setPreview] = useState(null) // move/resize {id, date, start, end}
  const headRef = useRef(null)
  const [ppm, setPpm] = useState(readZoom)
  const ppmRef = useRef(ppm) // scale currently on screen
  const pendingPpm = useRef(null) // scale requested but not yet rendered
  const zoomAnchor = useRef(null) // { minute, y }: keep this minute under the fingers
  const [zoomHint, setZoomHint] = useState(false)
  const hintTimer = useRef(null)
  // Finer drag snapping when zoomed in.
  const SNAP = ppm >= 2.4 ? 5 : 15
  const snapDown = (m) => Math.floor(m / SNAP) * SNAP
  const snapNear = (m) => Math.round(m / SNAP) * SNAP
  const now = useNow()
  const dayISO = useMemo(() => days.map(toISODate), [days])
  const todayIndex = days.findIndex((d) => isSameDay(d, now.date))

  // Start the day scrolled to something useful.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const n = nowMinutes()
    const target = todayIndex >= 0 && n >= 9 * 60 ? n - 120 : 7 * 60
    el.scrollTop = Math.max(0, target * ppmRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Zoom ──
  // Apply a new scale, then restore scroll so the anchored minute stays put.
  useLayoutEffect(() => {
    ppmRef.current = ppm
    pendingPpm.current = null
    const a = zoomAnchor.current
    const el = scrollRef.current
    if (a && el) el.scrollTop = (headRef.current?.offsetHeight ?? 0) + a.minute * ppm - a.y
    zoomAnchor.current = null
    try {
      localStorage.setItem('vapor:zoom', String(ppm))
    } catch {
      /* storage unavailable */
    }
  }, [ppm])

  const zoomTo = useCallback((clientY, target) => {
    const el = scrollRef.current
    const cols = colsRef.current
    if (!el || !cols) return
    const next = clamp(target, MIN_PPM, MAX_PPM)
    if (Math.abs(next - (pendingPpm.current ?? ppmRef.current)) < 0.001) return
    if (!zoomAnchor.current) {
      // Measure against what's rendered; several events may land before the next paint.
      const minute = clamp((clientY - cols.getBoundingClientRect().top) / ppmRef.current, 0, DAY_MINUTES)
      zoomAnchor.current = { minute, y: clientY - el.getBoundingClientRect().top }
    }
    pendingPpm.current = next
    setPpm(next)
    setZoomHint(true)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setZoomHint(false), 1400)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const current = () => pendingPpm.current ?? ppmRef.current

    // Trackpad pinch arrives as ctrl+wheel in Chrome/Firefox/Edge (and Ctrl+mouse wheel works too).
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 0.05 : 0.01
      zoomTo(e.clientY, current() * Math.exp(-e.deltaY * unit))
    }
    // Safari sends gesture events for trackpad pinch.
    let gestureBase = null
    const onGestureStart = (e) => {
      e.preventDefault()
      gestureBase = current()
    }
    const onGestureChange = (e) => {
      e.preventDefault()
      if (gestureBase) zoomTo(e.clientY, gestureBase * e.scale)
    }
    const onGestureEnd = () => (gestureBase = null)
    // Two-finger pinch on touch screens: vertical finger distance drives the scale.
    let pinch = null
    const spread = (t) => Math.max(Math.abs(t[0].clientY - t[1].clientY), 30)
    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return
      gesture.current?.onCancel() // a finger may have started a create/move
      pinch = { dist: spread(e.touches), base: current() }
    }
    const onTouchMove = (e) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const mid = (e.touches[0].clientY + e.touches[1].clientY) / 2
      zoomTo(mid, (pinch.base * spread(e.touches)) / pinch.dist)
    }
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) pinch = null
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGestureStart)
    el.addEventListener('gesturechange', onGestureChange)
    el.addEventListener('gestureend', onGestureEnd)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
      el.removeEventListener('gestureend', onGestureEnd)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [zoomTo])

  useEffect(() => () => clearTimeout(hintTimer.current), [])

  const resetZoom = () => {
    const el = scrollRef.current
    if (el) zoomTo(el.getBoundingClientRect().top + el.clientHeight / 2, DEFAULT_PPM)
  }

  const childrenMap = useMemo(() => buildChildrenMap(blocks), [blocks])

  const isMatch = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    const memo = new Map()
    const test = (b) => {
      if (memo.has(b.id)) return memo.get(b.id)
      const hit = b.title.toLowerCase().includes(q) || (childrenMap.get(b.id) ?? []).some(test)
      memo.set(b.id, hit)
      return hit
    }
    return test
  }, [search, childrenMap])

  const ctx = useMemo(
    () => ({ childrenMap, categoriesById, selectedId, isMatch }),
    [childrenMap, categoriesById, selectedId, isMatch],
  )

  // Blocks per day, with the in-flight drag preview applied.
  const byDay = useMemo(() => {
    const map = new Map(dayISO.map((d) => [d, []]))
    for (const b of visible) {
      const eff = preview?.id === b.id ? { ...b, ...preview } : b
      map.get(eff.date)?.push(eff)
    }
    return map
  }, [visible, preview, dayISO])

  // All-day blocks per day (drawn as spines), also following a drag preview.
  const allDayByDay = useMemo(() => {
    const map = new Map(dayISO.map((d) => [d, []]))
    for (const b of allDay) {
      const eff = preview?.id === b.id ? { ...b, ...preview } : b
      map.get(eff.date)?.push(eff)
    }
    for (const list of map.values()) list.sort((a, b) => a.title.localeCompare(b.title))
    return map
  }, [allDay, preview, dayISO])

  // ── Geometry helpers ──
  const minutesAt = (clientY) => (clientY - colsRef.current.getBoundingClientRect().top) / ppm
  const dayAt = (clientX) => {
    const r = colsRef.current.getBoundingClientRect()
    return clamp(Math.floor(((clientX - r.left) / r.width) * days.length), 0, days.length - 1)
  }

  // ── Pointer gestures (create / move / resize) ──
  const endGesture = useCallback(() => {
    window.removeEventListener('pointermove', gesture.current?.onMove)
    window.removeEventListener('pointerup', gesture.current?.onUp)
    window.removeEventListener('pointercancel', gesture.current?.onCancel)
    gesture.current = null
  }, [])

  const beginGesture = (g) => {
    const onMove = (e) => g.move(e)
    const onUp = (e) => {
      g.up(e)
      endGesture()
    }
    const onCancel = () => {
      setDraft(null)
      setPreview(null)
      endGesture()
    }
    gesture.current = { onMove, onUp, onCancel }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  useEffect(() => endGesture, [endGesture])

  const startCreate = (e, dayIndex) => {
    if (e.button !== 0 || e.target.closest('.block, .quick')) return
    if (quickId) return // outside-click closes the quick editor instead
    e.preventDefault()
    const anchor = clamp(snapDown(minutesAt(e.clientY)), 0, DAY_MINUTES - SNAP)
    const y0 = e.clientY
    let moved = false
    let range = { start: anchor, end: anchor + SNAP }
    setDraft({ day: dayIndex, ...range, pending: true })
    beginGesture({
      move: (ev) => {
        if (!moved && Math.abs(ev.clientY - y0) < 5) return
        moved = true
        const m = clamp(minutesAt(ev.clientY), 0, DAY_MINUTES)
        range = m >= anchor
          ? { start: anchor, end: Math.max(anchor + SNAP, Math.ceil(m / SNAP) * SNAP) }
          : { start: snapDown(m), end: anchor + SNAP }
        setDraft({ day: dayIndex, ...range })
      },
      up: () => {
        setDraft(null)
        if (!moved) range = { start: anchor, end: Math.min(anchor + 60, DAY_MINUTES) }
        onCreate(dayISO[dayIndex], range.start, range.end)
      },
    })
  }

  const startBlockGesture = (e, block, mode) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    // A click on a nested card selects that sub-block; dragging moves the whole tree.
    const clickedId = e.target.closest('[data-block-id]')?.dataset.blockId ?? block.id
    const x0 = e.clientX
    const y0 = e.clientY
    const dur = block.end - block.start
    let moved = false
    let next = null
    beginGesture({
      move: (ev) => {
        if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return
        moved = true
        const dy = snapNear((ev.clientY - y0) / ppm)
        if (mode === 'move') {
          const start = clamp(block.start + dy, 0, DAY_MINUTES - dur)
          // Sessions inside an all-day block stay on its day.
          next = { id: block.id, date: block.parent_id ? block.date : dayISO[dayAt(ev.clientX)], start, end: start + dur }
        } else {
          next = { id: block.id, date: block.date, start: block.start, end: clamp(block.end + dy, block.start + SNAP, DAY_MINUTES) }
        }
        setPreview(next)
      },
      up: () => {
        setPreview(null)
        if (!moved) return onSelect(clickedId)
        if (next && (next.date !== block.date || next.start !== block.start || next.end !== block.end)) {
          moveBlock(block.id, next)
        }
      },
    })
  }

  /** Spines: click to open, drag sideways to move to another day. */
  const startSpineGesture = (e, block) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const x0 = e.clientX
    let moved = false
    let date = block.date
    beginGesture({
      move: (ev) => {
        if (!moved && Math.abs(ev.clientX - x0) < 6) return
        moved = true
        date = dayISO[dayAt(ev.clientX)]
        setPreview({ id: block.id, date })
      },
      up: () => {
        setPreview(null)
        if (!moved) return onSelect(block.id)
        if (date !== block.date) moveBlock(block.id, { date, start: block.start, end: block.end })
      },
    })
  }

  const quickBlock = quickId ? blocks[quickId] : null
  const quickDay = quickBlock ? dayISO.indexOf(quickBlock.date) : -1

  return (
    <div className="week" style={{ '--days': days.length, '--hour': `${60 * ppm}px` }}>
      <div className="week-scroll" ref={scrollRef}>
        <div className="week-head" ref={headRef}>
          <div className="gutter-head" onDoubleClick={resetZoom} title="Pinch or Ctrl+scroll to zoom · double-click to reset">{Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace('_', ' ')}</div>
          {days.map((d, i) => {
            const spines = allDayByDay.get(dayISO[i]) ?? []
            return (
              <div
                key={dayISO[i]}
                className={`day-head ${i === todayIndex ? 'today' : ''}`}
                onDoubleClick={() => onCreateAllDay?.(dayISO[i])}
                title="Double-click to add an all-day block"
              >
                <span className="dow">{format(d, 'EEE')}</span>
                <span className="dom">{format(d, 'd')}</span>
                {spines.length > 0 && (
                  <span className="allday-marks" aria-label={`${spines.length} all-day`}>
                    {spines.map((b) => (
                      <i key={b.id} className={`s-${b.status}`} style={{ '--cat': categoriesById.get(b.category_id)?.color ?? '#94a3b8' }} />
                    ))}
                  </span>
                )}
              </div>
            )
          })}
          {quickBlock?.all_day && quickDay >= 0 && (
            <QuickCreate
              key={quickBlock.id}
              block={quickBlock}
              store={store}
              style={quickHeaderPosition(quickDay, days.length)}
              onClose={onQuickClose}
              onExpand={() => onQuickExpand(quickBlock.id)}
            />
          )}
        </div>

        <div className="week-body" style={{ height: DAY_MINUTES * ppm }}>
          <div className="gutter">
            {axisLabels(ppm).map((m) => (
              <div key={m} className={`hour-label ${m % 60 ? 'minor' : ''}`} style={{ top: m * ppm }}>
                {fromMinutes(m)}
              </div>
            ))}
            {todayIndex >= 0 && (
              <div className="now-label" style={{ top: now.mins * ppm }}>
                {fromMinutes(now.mins)}
              </div>
            )}
          </div>

          <div className="cols" ref={colsRef}>
            {days.map((d, i) => {
              const list = byDay.get(dayISO[i]) ?? []
              const layout = layoutOverlaps(list)
              const spines = allDayByDay.get(dayISO[i]) ?? []
              const reserve = spines.length * SPINE_STEP // room kept free for spines on the right
              const tint = spines[0] && categoriesById.get(spines[0].category_id)?.color
              return (
                <div
                  key={dayISO[i]}
                  className={`day-col ${i === todayIndex ? 'today' : ''} ${d.getDay() % 6 === 0 ? 'weekend' : ''} ${spines.length ? 'has-allday' : ''}`}
                  style={tint ? { '--allday': tint } : undefined}
                  onPointerDown={(e) => startCreate(e, i)}
                >
                  {spines.map((b, n) => (
                    <DaySpine
                      key={b.id}
                      block={b}
                      index={n}
                      color={categoriesById.get(b.category_id)?.color}
                      selected={selectedId === b.id}
                      dimmed={isMatch && !isMatch(b)}
                      dragging={preview?.id === b.id}
                      onPointerDown={(e) => startSpineGesture(e, b)}
                    />
                  ))}
                  {list.map((b) => {
                    const { col, cols } = layout.get(b.id) ?? { col: 0, cols: 1 }
                    const height = Math.max((b.end - b.start) * ppm - 3, 18)
                    return (
                      <BlockCard
                        key={b.id}
                        block={b}
                        height={height}
                        ctx={ctx}
                        dragging={preview?.id === b.id}
                        style={{
                          top: b.start * ppm + 1,
                          height,
                          left: `calc((100% - ${reserve}px) * ${col / cols} + 4px)`,
                          width: `calc((100% - ${reserve}px) / ${cols} - 8px)`,
                        }}
                        onPointerDown={(e) => startBlockGesture(e, b, 'move')}
                        onResizeStart={(e) => startBlockGesture(e, b, 'resize')}
                      />
                    )
                  })}

                  {draft?.day === i && (
                    <div className="draft" style={{ top: draft.start * ppm, height: (draft.end - draft.start) * ppm }}>
                      {!draft.pending && `${fromMinutes(draft.start)} – ${fromMinutes(draft.end)}`}
                    </div>
                  )}

                  {i === todayIndex && (
                    <div className="now-line" style={{ top: now.mins * ppm }}>
                      <span />
                    </div>
                  )}
                </div>
              )
            })}

            {quickBlock && !quickBlock.all_day && quickDay >= 0 && (
              <QuickCreate
                key={quickBlock.id}
                block={quickBlock}
                store={store}
                style={quickPosition(quickDay, days.length, quickBlock.start, ppm)}
                onClose={onQuickClose}
                onExpand={() => onQuickExpand(quickBlock.id)}
              />
            )}
          </div>
        </div>
      </div>
      {zoomHint && (
        <div className="zoom-hint" role="status">
          {Math.round((ppm / DEFAULT_PPM) * 100)}%
          {Math.abs(ppm - DEFAULT_PPM) > 0.01 && (
            <button className="link-btn" onClick={resetZoom}>
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const SPINE_STEP = 25 // px per spine (21px wide + gap)

/**
 * An all-day block: a slim ribbon down the right edge of its day, title set
 * vertically and pinned to the top of the view while you scroll.
 */
function DaySpine({ block, index, color, selected, dimmed, dragging, onPointerDown }) {
  return (
    <div
      className={`spine s-${block.status} ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ right: 4 + index * SPINE_STEP, '--cat': color ?? '#94a3b8' }}
      data-block-id={block.id}
      onPointerDown={onPointerDown}
      title={`${block.title || 'Untitled'} · all day`}
    >
      <div className="spine-label">
        <StatusIcon status={block.status} size={12} className="status-fg" />
        {(block.virtual || block.recurrence_id) && <Repeat size={11} className="ai-mark" />}
        <span>{block.title || 'Untitled'}</span>
      </div>
    </div>
  )
}

/** Quick editor for a new all-day block: hangs below the sticky header. */
function quickHeaderPosition(dayIndex, dayCount) {
  if (dayCount === 1) return { top: 'calc(100% + 6px)', right: 12 }
  const toRight = dayCount === 7 ? dayIndex < 5 : dayIndex < dayCount / 2
  const frac = (toRight ? dayIndex : dayIndex + 1) / dayCount
  const x = `calc(var(--gutter) + (100% - var(--gutter)) * ${frac})`
  return toRight ? { top: 'calc(100% + 6px)', left: `calc(${x} + 6px)` } : { top: 'calc(100% + 6px)', left: `calc(${x} - 322px)` }
}

function quickPosition(dayIndex, dayCount, start, ppm) {
  const top = clamp(start * ppm, 8, DAY_MINUTES * ppm - 360)
  if (dayCount === 1) return { top: top + 24, right: 12 }
  const colPct = 100 / dayCount
  const toRight = dayCount === 7 ? dayIndex < 5 : dayIndex < dayCount / 2
  return toRight
    ? { top, left: `calc(${(dayIndex + 1) * colPct}% + 6px)` }
    : { top, left: `calc(${dayIndex * colPct}% - 326px)` }
}
