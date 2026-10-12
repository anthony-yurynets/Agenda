import { useLayoutEffect, useRef, useState } from 'react'
import { daysUntil, fmtDay, scoreOf } from '../../lib/amc'

const H = 220
const PAD = { top: 14, right: 16, bottom: 26, left: 34 }
const TICKS = [0, 30, 60, 90, 120, 150]

/** Mock scores over time (one series) with a dashed line at the target. */
export default function ScoreChart({ mocks, target, from, to }) {
  const wrapRef = useRef(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState(null)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The x axis spans the prep window, stretched to include any mock outside it.
  const first = mocks[0]?.date < from ? mocks[0].date : from
  const last = mocks.at(-1)?.date > to ? mocks.at(-1).date : to
  const span = Math.max(1, daysUntil(first, last))
  const x = (date) => PAD.left + (daysUntil(first, date) / span) * (w - PAD.left - PAD.right)
  const y = (v) => PAD.top + (1 - v / 150) * (H - PAD.top - PAD.bottom)
  const pts = mocks.map((m) => ({ m, x: x(m.date), y: y(scoreOf(m)) }))
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const tip = hover !== null ? pts[hover] : null

  return (
    <div className="amc-chart" ref={wrapRef}>
      <svg width={w} height={H} role="img" aria-label={`Mock scores over time, target ${target}`}>
        {TICKS.map((t) => (
          <g key={t}>
            <line className="ac-grid" x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="ac-tick" x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <text className="ac-tick" x={PAD.left} y={H - 6}>
          {fmtDay(first)}
        </text>
        <text className="ac-tick" x={w - PAD.right} y={H - 6} textAnchor="end">
          {fmtDay(last)}
        </text>
        <line className="ac-target" x1={PAD.left} x2={w - PAD.right} y1={y(target)} y2={y(target)} />
        <text className="ac-target-label" x={w - PAD.right} y={y(target) - 5} textAnchor="end">
          Target {target}
        </text>
        {pts.length > 1 && <path className="ac-line" d={path} />}
        {pts.map((p, i) => (
          <g key={p.m.id} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <circle className="ac-hit" cx={p.x} cy={p.y} r={14} />
            <circle className={`ac-dot ${hover === i ? 'on' : ''}`} cx={p.x} cy={p.y} r={hover === i ? 5.5 : 4.5} />
          </g>
        ))}
      </svg>
      {tip && (
        <div className="ac-tip" style={{ left: Math.min(Math.max(tip.x, 80), w - 80), top: tip.y }}>
          <strong>{scoreOf(tip.m)}</strong>
          <span>{tip.m.name || 'Mock'}</span>
          <span className="muted">{fmtDay(tip.m.date)}</span>
        </div>
      )}
    </div>
  )
}
