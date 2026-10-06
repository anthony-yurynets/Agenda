import { useMemo, useState } from 'react'
import { ChevronRight, CornerDownRight, Plus, Repeat, Scissors, Bot, Trash2, UserRound, X } from 'lucide-react'
import { STATUSES, fromMinutes, toMinutes, describeRepeat } from '../lib/domain'
import { isInTemplate, seriesOf } from '../lib/recurrence'
import RepeatEditor from './RepeatEditor'
import { ancestors, buildChildrenMap } from '../lib/tree'
import StatusIcon from './StatusIcon'

const nextStatus = (s) => {
  const order = ['planned', 'in_progress', 'done']
  const i = order.indexOf(s)
  return i === -1 ? 'planned' : order[(i + 1) % order.length]
}

export default function BlockPanel({ id, store, blocks, onSelect, onClose, toast }) {
  const { setRepeat, categories, categoriesById, updateBlock, moveBlock, deleteBlock, divideBlock, addSubBlock } = store
  const block = blocks[id]
  const childrenMap = useMemo(() => buildChildrenMap(blocks), [blocks])
  const trail = useMemo(() => ancestors(blocks, id), [blocks, id])
  const parent = trail[trail.length - 1]
  const kids = childrenMap.get(id) ?? []
  const [divideOpen, setDivideOpen] = useState(false)
  const cat = categoriesById.get(block.category_id)

  const seriesId = seriesOf(blocks, block)
  const series = seriesId ? blocks[seriesId] : null
  const editingSeries = isInTemplate(blocks, block) // template itself or inside it
  const isOccurrence = !!seriesId && !editingSeries // one date of a series
  const canRepeat = !parent && !isOccurrence

  const setTime = (key, value) => {
    const mins = toMinutes(value)
    if (mins === null) return
    let { start, end } = block
    if (key === 'start') {
      const dur = end - start
      start = mins
      end = Math.min(mins + dur, 24 * 60)
    } else end = mins
    if (end <= start) return toast('End time must be after start', 'error')
    if (parent && (start < parent.start || end > parent.end)) {
      return toast(`Sub-blocks must stay within ${fromMinutes(parent.start)}–${fromMinutes(parent.end)}`, 'error')
    }
    moveBlock(id, { date: block.date, start, end })
  }

  const setAllDay = (on) => {
    if (on) return updateBlock(id, { all_day: true, bookable: false, start: 0, end: 24 * 60 })
    // Back to a timed block: wrap its sessions if it has any, else 09:00–10:00.
    const start = kids.length ? Math.min(...kids.map((k) => k.start)) : 9 * 60
    const end = kids.length ? Math.max(...kids.map((k) => k.end)) : 10 * 60
    updateBlock(id, { all_day: false, start, end })
  }

  const setDate = (value) => {
    if (!value || parent) return
    moveBlock(id, { date: value, start: block.start, end: block.end })
  }

  const remove = () => {
    deleteBlock(id)
    toast(isOccurrence && !parent ? 'Occurrence removed' : kids.length ? 'Block and sub-blocks deleted' : 'Block deleted')
    parent ? onSelect(parent.id) : onClose()
  }

  const removeSeries = () => {
    deleteBlock(seriesId)
    toast('Series deleted')
    onClose()
  }

  return (
    <aside className="block-panel" style={{ '--cat': cat?.color ?? '#94a3b8' }} aria-label="Block details">
      <div className="bp-head">
        <div className="crumbs">
          {trail.map((a) => (
            <span key={a.id} className="crumb">
              <button onClick={() => onSelect(a.id)}>{a.title || 'Untitled'}</button>
              <ChevronRight size={13} />
            </span>
          ))}
          {!trail.length && <span className="muted">{editingSeries ? 'Series' : 'Block details'}</span>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="bp-scroll">
        {editingSeries && (
          <div className="series-note">
            <Repeat size={14} /> Editing every occurrence{series?.repeat ? ` · ${describeRepeat(series.repeat, series.date)}` : ''}
          </div>
        )}
        {isOccurrence && series && (
          <div className="series-note">
            <Repeat size={14} />
            <span className="flex1">Changes here apply to this day only.</span>
            <button className="link-btn" onClick={() => onSelect(seriesId)}>
              Edit series
            </button>
          </div>
        )}
        <div className={`bp-title-wrap s-${block.status}`}>
          <span className="block-bar" />
          <textarea
            className="bp-title"
            rows={1}
            placeholder="Untitled"
            value={block.title}
            maxLength={200}
            onChange={(e) => updateBlock(id, { title: e.target.value.replace(/\n/g, '') }, { debounce: 400 })}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          />
        </div>
        {block.source === 'ai' && (
          <div className="ai-badge">
            <Bot size={13} /> Added via MCP
          </div>
        )}
        {block.source === 'booking' && (
          <div className="ai-badge">
            <UserRound size={13} /> Booked through a booking link
          </div>
        )}
        {block.source === 'shared' && (
          <div className="ai-badge">
            <UserRound size={13} /> Added by someone with your edit link
          </div>
        )}

        <div className="field-label">Status</div>
        <div className="chips">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              className={`chip status-chip s-${s.id} ${block.status === s.id ? 'on' : ''}`}
              onClick={() => updateBlock(id, { status: s.id })}
            >
              <StatusIcon status={s.id} size={13} />
              {s.label}
            </button>
          ))}
        </div>

        <div className="field-label">Category</div>
        <div className="chips">
          {categories.map((c) => (
            <button
              key={c.id}
              className={`chip ${block.category_id === c.id ? 'on' : ''}`}
              style={{ '--cat': c.color }}
              onClick={() => updateBlock(id, { category_id: block.category_id === c.id ? null : c.id })}
            >
              <span className="cat-dot" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Date</span>
            <input type="date" value={block.date} disabled={!!parent} onChange={(e) => setDate(e.target.value)} />
          </label>
          {block.all_day ? (
            <div className="field allday-field">
              <span className="field-label">Time</span>
              <span className="allday-chip">All day</span>
            </div>
          ) : (
            <>
              <label className="field">
                <span className="field-label">Start</span>
                <input type="time" step={300} value={fromMinutes(block.start)} onChange={(e) => setTime('start', e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">End</span>
                <input
                  type="time"
                  step={300}
                  value={block.end === 1440 ? '23:59' : fromMinutes(block.end)}
                  onChange={(e) => setTime('end', e.target.value === '23:59' ? '24:00' : e.target.value)}
                />
              </label>
            </>
          )}
        </div>
        {!parent && (
          <label className="toggle-row">
            <span>
              <strong>All day</strong>
              <small>Shown as a ribbon down the whole day. Its sub-blocks can still have times.</small>
            </span>
            <input type="checkbox" className="switch" checked={!!block.all_day} onChange={(e) => setAllDay(e.target.checked)} />
          </label>
        )}
        {parent && <p className="field-hint">Sub-blocks share their parent’s date.</p>}
        {editingSeries && !parent && <p className="field-hint">The date is when the series starts.</p>}

        {canRepeat && (
          <>
            <div className="field-label">Repeat</div>
            <RepeatEditor repeat={block.repeat} date={block.date} onChange={(r) => setRepeat(id, r)} />
          </>
        )}

        {!parent && !block.all_day && (
          <label className="toggle-row">
            <span>
              <strong>Open for booking</strong>
              <small>People with a booking link can pick times inside this block{editingSeries ? ', every time it repeats' : ''}.</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={!!block.bookable}
              onChange={(e) => updateBlock(id, { bookable: e.target.checked })}
            />
          </label>
        )}

        {!parent && store.kind === 'owner' && (
          <label className="toggle-row">
            <span>
              <strong>Show in Coming up</strong>
              <small>List it in the Agenda’s Coming up{editingSeries ? ', every time it repeats' : isOccurrence ? ' (this day only)' : ''}.</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={!block.hide_upcoming}
              onChange={(e) => updateBlock(id, { hide_upcoming: !e.target.checked })}
            />
          </label>
        )}

        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            className="notes"
            rows={3}
            placeholder="Add details, links, a checklist…"
            value={block.notes}
            maxLength={5000}
            onChange={(e) => updateBlock(id, { notes: e.target.value }, { debounce: 500 })}
          />
        </label>

        <div className="sub-head">
          <span className="field-label">Sub-blocks {kids.length > 0 && <span className="count">{kids.length}</span>}</span>
          <div className="sub-actions">
            <div className="dropdown">
              <button className="btn ghost sm" onClick={() => setDivideOpen((o) => !o)}>
                <Scissors size={14} /> Divide
              </button>
              {divideOpen && (
                <div className="menu right">
                  <div className="menu-label">Divide evenly into</div>
                  {[2, 3, 4, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        divideBlock(id, n)
                        setDivideOpen(false)
                      }}
                    >
                      {n} parts
                      <span className="muted flex1 right-text">{Math.round((block.end - block.start) / n)} min each</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn ghost sm" onClick={() => onSelect(addSubBlock(id))}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {kids.length === 0 ? (
          <div className="empty-sub">
            Break this block into smaller pieces. Every sub-block can be divided again.
          </div>
        ) : (
          <ul className="tree">
            {kids.map((k) => (
              <TreeRow key={k.id} block={k} depth={0} childrenMap={childrenMap} store={store} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>

      <div className="bp-foot">
        {isOccurrence && !parent ? (
          <>
            <button className="btn ghost danger" onClick={remove}>
              <Trash2 size={15} /> Delete this day
            </button>
            <button className="btn ghost danger" onClick={removeSeries}>
              Delete series
            </button>
          </>
        ) : (
          <button className="btn ghost danger" onClick={editingSeries && !parent ? removeSeries : remove}>
            <Trash2 size={15} /> {editingSeries && !parent ? 'Delete series' : `Delete${kids.length ? ' with sub-blocks' : ''}`}
          </button>
        )}
      </div>
    </aside>
  )
}

function TreeRow({ block, depth, childrenMap, store, onSelect }) {
  const kids = childrenMap.get(block.id) ?? []
  const cat = store.categoriesById.get(block.category_id)
  return (
    <li>
      <div className={`tree-row s-${block.status}`} style={{ paddingLeft: 8 + depth * 18, '--cat': cat?.color ?? '#94a3b8' }}>
        {depth > 0 && <CornerDownRight size={13} className="muted" />}
        {block.status === 'none' ? (
          <span className="status-toggle" aria-hidden="true" />
        ) : (
          <button
            className="status-toggle status-fg"
            onClick={() => store.updateBlock(block.id, { status: nextStatus(block.status) })}
            title="Cycle status"
          >
            <StatusIcon status={block.status} size={16} />
          </button>
        )}
        <span className="tree-bar" />
        <button className="tree-main" onClick={() => onSelect(block.id)}>
          <span className="tree-title">{block.title || 'Untitled'}</span>
          <span className="tree-time">
            {fromMinutes(block.start)}–{fromMinutes(block.end)}
          </span>
        </button>
        {kids.length > 0 && <span className="count">{kids.length}</span>}
      </div>
      {kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <TreeRow key={k.id} block={k} depth={depth + 1} childrenMap={childrenMap} store={store} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}
