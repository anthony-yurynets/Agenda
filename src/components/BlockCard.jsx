import { memo } from 'react'
import { Bot, CalendarPlus, Repeat, UserRound } from 'lucide-react'
import { fromMinutes, hasStatus, statusLabel } from '../lib/domain'
import StatusIcon from './StatusIcon'
import { notesPreview } from '../lib/notes'

// Vertical rhythm (px) — must match .block-* rules in index.css.
const METRICS = {
  top: { pad: 7, time: 15, title: 17, gap: 5 },
  nested: { pad: 4, time: 13, title: 15, gap: 3 },
}

/**
 * A block and, recursively, its sub-blocks. Sub-blocks are laid out
 * proportionally inside the parent's "region" so a divided block reads
 * like a block that has been cut into pieces.
 */
function BlockCard({ block, height, depth = 0, ctx, style, onPointerDown, onResizeStart, dragging }) {
  const { childrenMap, categoriesById, selectedId, isMatch } = ctx
  const cat = block.category_id ? categoriesById.get(block.category_id) : null
  const kids = childrenMap.get(block.id) ?? []
  const m = depth === 0 ? METRICS.top : METRICS.nested

  const tiny = height < (depth === 0 ? 30 : 24)
  const showTime = !tiny && height >= m.pad + m.time + m.title + 4
  const headerH = tiny ? height : m.pad + (showTime ? m.time : 0) + m.title
  const regionH = height - headerH - m.gap - 5
  const nest = kids.length > 0 && regionH >= 22
  const showPill = depth === 0 && kids.length === 0 && height >= 104 && hasStatus(block.status)
  const showNote = showTime && kids.length === 0 && Boolean(block.notes?.trim())
  const span =Math.max(block.end - block.start, 1)

  const classes = [
    'block',
    `s-${block.status}`,
    depth === 0 ? 'top' : 'nested',
    tiny && 'tiny',
    selectedId === block.id && 'selected',
    isMatch && !isMatch(block) && 'dimmed',
    dragging && 'dragging',
    kids.length > 0 && 'has-kids',
    block.bookable && depth === 0 && 'bookable',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      style={{ ...style, '--cat': cat?.color ?? '#94a3b8' }}
      data-block-id={block.id}
      onPointerDown={onPointerDown}
      title={`${block.title || 'Untitled'} · ${fromMinutes(block.start)}–${fromMinutes(block.end)}`}
    >
      <span className="block-bar" />
      <div className="block-body">
        {showTime && (
          <div className="block-time">
            <span>
              {fromMinutes(block.start)} – {fromMinutes(block.end)}
            </span>
            {depth === 0 && (block.virtual || block.recurrence_id) && <Repeat size={11} className="ai-mark" aria-label="Repeats" />}
            {block.source === 'ai' && <Bot size={11} className="ai-mark" aria-label="Added by AI" />}
            {block.source === 'booking' && <UserRound size={11} className="ai-mark" aria-label="Booked" />}
            {depth === 0 && block.bookable && <CalendarPlus size={11} className="ai-mark" aria-label="Open for booking" />}
            <StatusIcon status={block.status} size={depth === 0 ? 13 : 11} className="status-fg" />
          </div>
        )}
        <div className={`block-title ${nest || !showTime ? 'one-line' : ''}`}>{block.title || 'Untitled'}</div>
        {showNote && <div className="block-note">{notesPreview(block.notes)}</div>}

        {nest && (
          <div className="block-region" style={{ height: regionH }}>
            {kids.map((k) => {
              const s = Math.max(k.start, block.start)
              const e = Math.min(k.end, block.end)
              if (e <= s) return null
              const top = ((s - block.start) / span) * regionH
              const h = Math.max(((e - s) / span) * regionH - 2, 8)
              return (
                <MemoCard key={k.id} block={k} height={h} depth={depth + 1} ctx={ctx} style={{ top, height: h }} />
              )
            })}
          </div>
        )}
        {kids.length > 0 && !nest && !tiny && (
          <div className="block-segments" aria-label={`${kids.length} sub-blocks`}>
            {kids.map((k) => (
              <span
                key={k.id}
                className={`seg s-${k.status}`}
                style={{
                  left: `${((Math.max(k.start, block.start) - block.start) / span) * 100}%`,
                  width: `${((Math.min(k.end, block.end) - Math.max(k.start, block.start)) / span) * 100}%`,
                }}
              />
            ))}
          </div>
        )}
        {showPill && (
          <div className="status-pill">
            <StatusIcon status={block.status} size={14} />
            {statusLabel(block.status)}
          </div>
        )}
      </div>
      {onResizeStart && <div className="resize-handle" onPointerDown={onResizeStart} />}
    </div>
  )
}

const MemoCard = memo(BlockCard)
export default MemoCard
