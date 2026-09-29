import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DAY_MINUTES, fromMinutes } from '../lib/domain'
import { format, isSameDay, nowMinutes, toISODate } from '../lib/dates'
import { buildChildrenMap, layoutOverlaps } from '../lib/tree'
import BlockCard from './BlockCard'
import QuickCreate from './QuickCreate'

export const PX_PER_MIN = 1.2
const SNAP = 15
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const snapDown = (m) => Math.floor(m / SNAP) * SNAP
const snapNear = (m) => Math.round(m / SNAP) * SNAP
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function useNow() {
  const [now, setNow] = useState(() => ({ date: new Date(), mins: nowMinutes() }))
  useEffect(() => {
    const t = setInterval(() => setNow({ date: new Date(), mins: nowMinutes() }), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function WeekView({ days, store, blocks, visible, search, selectedId, quickId, onSelect, onCreate, onQuickClose, onQuickExpand }) {
  const { categoriesById, moveBlock } = store
  const scrollRef = useRef(null)
  const colsRef = useRef(null)
  const gesture = useRef(null)
  const [draft, setDraft] = useState(null) // creation drag {day, start, end}
  const [preview, setPreview] = useState(null) // move/resize {id, date, start, end}
  const now = useNow()
  const dayISO = useMemo(() => days.map(toISODate), [days])
  const todayIndex = days.findIndex((d) => isSameDay(d, now.date))

  // Start the day scrolled to something useful.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const n = nowMinutes()
    const target = todayIndex >= 0 && n >= 9 * 60 ? n - 120 : 7 * 60
    el.scrollTop = Math.max(0, target * PX_PER_MIN)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // ── Geometry helpers ──
  const minutesAt = (clientY) => (clientY - colsRef.current.getBoundingClientRect().top) / PX_PER_MIN
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
        const dy = snapNear((ev.clientY - y0) / PX_PER_MIN)
        if (mode === 'move') {
          const start = clamp(block.start + dy, 0, DAY_MINUTES - dur)
          next = { id: block.id, date: dayISO[dayAt(ev.clientX)], start, end: start + dur }
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

  const quickBlock = quickId ? blocks[quickId] : null
  const quickDay = quickBlock ? dayISO.indexOf(quickBlock.date) : -1

  return (
    <div className="week" style={{ '--days': days.length }}>
      <div className="week-scroll" ref={scrollRef}>
        <div className="week-head">
          <div className="gutter-head">{Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace('_', ' ')}</div>
          {days.map((d, i) => (
            <div key={dayISO[i]} className={`day-head ${i === todayIndex ? 'today' : ''}`}>
              <span className="dow">{format(d, 'EEE')}</span>
              <span className="dom">{format(d, 'd')}</span>
            </div>
          ))}
        </div>

        <div className="week-body" style={{ height: DAY_MINUTES * PX_PER_MIN }}>
          <div className="gutter">
            {HOURS.map((h) => (
              <div key={h} className="hour-label" style={{ top: h * 60 * PX_PER_MIN }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
            {todayIndex >= 0 && (
              <div className="now-label" style={{ top: now.mins * PX_PER_MIN }}>
                {fromMinutes(now.mins)}
              </div>
            )}
          </div>

          <div className="cols" ref={colsRef}>
            {days.map((d, i) => {
              const list = byDay.get(dayISO[i]) ?? []
              const layout = layoutOverlaps(list)
              return (
                <div
                  key={dayISO[i]}
                  className={`day-col ${i === todayIndex ? 'today' : ''} ${d.getDay() % 6 === 0 ? 'weekend' : ''}`}
                  onPointerDown={(e) => startCreate(e, i)}
                >
                  {list.map((b) => {
                    const { col, cols } = layout.get(b.id) ?? { col: 0, cols: 1 }
                    const height = Math.max((b.end - b.start) * PX_PER_MIN - 3, 18)
                    return (
                      <BlockCard
                        key={b.id}
                        block={b}
                        height={height}
                        ctx={ctx}
                        dragging={preview?.id === b.id}
                        style={{
                          top: b.start * PX_PER_MIN + 1,
                          height,
                          left: `calc(${(col / cols) * 100}% + 4px)`,
                          width: `calc(${100 / cols}% - 8px)`,
                        }}
                        onPointerDown={(e) => startBlockGesture(e, b, 'move')}
                        onResizeStart={(e) => startBlockGesture(e, b, 'resize')}
                      />
                    )
                  })}

                  {draft?.day === i && (
                    <div className="draft" style={{ top: draft.start * PX_PER_MIN, height: (draft.end - draft.start) * PX_PER_MIN }}>
                      {!draft.pending && `${fromMinutes(draft.start)} – ${fromMinutes(draft.end)}`}
                    </div>
                  )}

                  {i === todayIndex && (
                    <div className="now-line" style={{ top: now.mins * PX_PER_MIN }}>
                      <span />
                    </div>
                  )}
                </div>
              )
            })}

            {quickBlock && quickDay >= 0 && (
              <QuickCreate
                key={quickBlock.id}
                block={quickBlock}
                store={store}
                style={quickPosition(quickDay, days.length, quickBlock.start)}
                onClose={onQuickClose}
                onExpand={() => onQuickExpand(quickBlock.id)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function quickPosition(dayIndex, dayCount, start) {
  const top = clamp(start * PX_PER_MIN, 8, DAY_MINUTES * PX_PER_MIN - 360)
  if (dayCount === 1) return { top: top + 24, right: 12 }
  const colPct = 100 / dayCount
  const toRight = dayCount === 7 ? dayIndex < 5 : dayIndex < dayCount / 2
  return toRight
    ? { top, left: `calc(${(dayIndex + 1) * colPct}% + 6px)` }
    : { top, left: `calc(${dayIndex * colPct}% - 326px)` }
}
