import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { STATUSES, WEEKEND, WORKWEEK, fromMinutes, weekdayOf } from '../lib/domain'
import { format, fromISODate } from '../lib/dates'
import StatusIcon from './StatusIcon'
import RepeatEditor from './RepeatEditor'

/**
 * Inline editor that pops next to a freshly created block. The block already
 * exists (optimistically) — every keystroke and click updates it live.
 * Enter saves · Esc discards an empty block · click outside closes.
 */
export default function QuickCreate({ block, store, style, onClose, onExpand }) {
  const { categories, updateBlock, deleteBlock, setRepeat } = store
  const repeatPresets = [
    { id: 'none', label: 'Once', rule: null },
    { id: 'daily', label: 'Daily', rule: { freq: 'daily', interval: 1 } },
    { id: 'weekdays', label: 'Weekdays', rule: { freq: 'weekly', interval: 1, days: WORKWEEK } },
    { id: 'weekends', label: 'Weekends', rule: { freq: 'weekly', interval: 1, days: WEEKEND } },
    { id: 'weekly', label: `Weekly`, rule: { freq: 'weekly', interval: 1, days: [weekdayOf(block.date)] } },
  ]
  const [customOpen, setCustomOpen] = useState(false)
  const activePreset =
    repeatPresets.find((p) => JSON.stringify(p.rule) === JSON.stringify(block.repeat ?? null))?.id ?? (block.repeat ? 'custom' : 'none')

  const ref = useRef(null)
  const inputRef = useRef(null)
  const finish = (discardIfEmpty) => {
    if (discardIfEmpty && !block.title.trim()) deleteBlock(block.id)
    onClose()
  }
  const finishRef = useRef(finish)
  useLayoutEffect(() => {
    finishRef.current = finish
  })

  useEffect(() => {
    inputRef.current?.focus()
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) finishRef.current(true)
    }
    // Register after the current pointer sequence so the creating click doesn't close us.
    const t = setTimeout(() => document.addEventListener('pointerdown', onDown), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [])

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      finish(false)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish(true)
    } else if (e.altKey && /^[1-9]$/.test(e.key)) {
      const cat = categories[Number(e.key) - 1]
      if (cat) {
        e.preventDefault()
        updateBlock(block.id, { category_id: cat.id })
      }
    }
  }

  return (
    <div className="quick" ref={ref} style={style} onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="New block">
      <input
        ref={inputRef}
        className="quick-title"
        placeholder="What are you working on?"
        value={block.title}
        maxLength={200}
        onChange={(e) => updateBlock(block.id, { title: e.target.value }, { debounce: 350 })}
        onKeyDown={onKeyDown}
      />
      <div className="quick-when">
        <span>
          {format(fromISODate(block.date), 'EEE, MMM d')} ·{' '}
          {block.all_day ? 'All day' : `${fromMinutes(block.start)} – ${fromMinutes(block.end)}`}
        </span>
        <label className="allday-switch">
          All day
          <input
            type="checkbox"
            className="switch"
            checked={!!block.all_day}
            onChange={(e) => {
              // A new block has no sub-blocks, so switching back just restores an hour.
              updateBlock(block.id, e.target.checked ? { all_day: true, start: 0, end: 24 * 60 } : { all_day: false, start: 9 * 60, end: 10 * 60 })
              inputRef.current?.focus()
            }}
          />
        </label>
      </div>

      <div className="field-label">Category</div>
      <div className="chips">
        {categories.map((c, i) => (
          <button
            key={c.id}
            className={`chip ${block.category_id === c.id ? 'on' : ''}`}
            style={{ '--cat': c.color }}
            onClick={() => {
              updateBlock(block.id, { category_id: c.id })
              inputRef.current?.focus()
            }}
            title={i < 9 ? `Alt+${i + 1}` : undefined}
          >
            <span className="cat-dot" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      <div className="field-label">Status</div>
      <div className="chips">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            className={`chip status-chip s-${s.id} ${block.status === s.id ? 'on' : ''}`}
            onClick={() => {
              updateBlock(block.id, { status: s.id })
              inputRef.current?.focus()
            }}
          >
            <StatusIcon status={s.id} size={13} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="field-label">Repeat</div>
      <div className="chips">
        {repeatPresets.map((p) => (
          <button
            key={p.id}
            className={`chip ${activePreset === p.id && !customOpen ? 'on' : ''}`}
            onClick={() => {
              setRepeat(block.id, p.rule)
              setCustomOpen(false)
              inputRef.current?.focus()
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          className={`chip ${customOpen || activePreset === 'custom' ? 'on' : ''}`}
          onClick={() => {
            if (!block.repeat) setRepeat(block.id, { freq: 'weekly', interval: 1, days: [weekdayOf(block.date)] })
            setCustomOpen((o) => !o)
          }}
          aria-expanded={customOpen}
        >
          Custom…
        </button>
      </div>
      {customOpen && (
        <div className="quick-custom">
          <RepeatEditor repeat={block.repeat} date={block.date} onChange={(r) => setRepeat(block.id, r)} />
        </div>
      )}

      <div className="quick-foot">
        <button className="btn ghost sm" onClick={onExpand}>
          <Maximize2 size={14} /> More
        </button>
        <span className="hint"><kbd>↵</kbd> save <kbd>esc</kbd> discard</span>
        <button className="btn primary sm" onClick={() => finish(false)}>Save</button>
      </div>
    </div>
  )
}
