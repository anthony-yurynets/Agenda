import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Bot, Repeat } from 'lucide-react'
import { fromMinutes, hasStatus, statusLabel } from '../lib/domain'
import { format, isSameDay, toISODate } from '../lib/dates'
import { buildChildrenMap } from '../lib/tree'
import StatusIcon from './StatusIcon'

export default function ListView({ days, store, blocks, visible, search, selectedId, onSelect, onNew }) {
  const childrenMap = useMemo(() => buildChildrenMap(blocks), [blocks])
  const [collapsed, setCollapsed] = useState(() => new Set())
  const q = search.trim().toLowerCase()

  const matches = (b) => !q || b.title.toLowerCase().includes(q) || (childrenMap.get(b.id) ?? []).some(matches)

  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const groups = days.map((d) => {
    const iso = toISODate(d)
    return {
      day: d,
      iso,
      items: visible.filter((b) => b.date === iso && matches(b)).sort((a, b) => a.start - b.start),
    }
  })
  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="list-view">
      {total === 0 && (
        <div className="empty">
          <div className="empty-art" aria-hidden="true">
            <span /><span /><span />
          </div>
          <h3>{q ? 'No blocks match your search' : 'Nothing planned in this range'}</h3>
          <p className="muted">{q ? 'Try a different word.' : 'Create a block, or ask your AI assistant to plan your day.'}</p>
          {!q && (
            <button className="btn primary" onClick={onNew}>
              <Plus size={16} /> New block
            </button>
          )}
        </div>
      )}
      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.iso} className="list-day">
              <header className={isSameDay(g.day, new Date()) ? 'today' : ''}>
                <span className="list-dow">{format(g.day, 'EEEE')}</span>
                <span className="muted">{format(g.day, 'MMM d')}</span>
                <span className="list-count">{g.items.length}</span>
              </header>
              <ul>
                {g.items.map((b) => (
                  <Row
                    key={b.id}
                    block={b}
                    depth={0}
                    childrenMap={childrenMap}
                    store={store}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    collapsed={collapsed}
                    toggle={toggle}
                  />
                ))}
              </ul>
            </section>
          ),
      )}
    </div>
  )
}

function Row({ block, depth, childrenMap, store, selectedId, onSelect, collapsed, toggle }) {
  const kids = childrenMap.get(block.id) ?? []
  const cat = store.categoriesById.get(block.category_id)
  const open = !collapsed.has(block.id)
  const tracked = kids.filter((k) => hasStatus(k.status))
  const done = tracked.filter((k) => k.status === 'done').length
  return (
    <li>
      <div
        className={`list-row s-${block.status} ${selectedId === block.id ? 'selected' : ''} ${depth ? 'nested' : ''} ${block.all_day ? 'allday' : ''}`}
        style={{ '--cat': cat?.color ?? '#94a3b8', '--depth': depth }}
        onClick={() => onSelect(block.id)}
      >
        <span className="list-caret">
          {kids.length > 0 && (
            <button
              className="icon-btn sm"
              onClick={(e) => {
                e.stopPropagation()
                toggle(block.id)
              }}
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          )}
        </span>
        <span className="list-bar" />
        <span className="list-time">
          {block.all_day ? (
            <span className="allday-tag">All day</span>
          ) : (
            <>
              {fromMinutes(block.start)}
              <small>{fromMinutes(block.end)}</small>
            </>
          )}
        </span>
        <span className="list-main">
          <span className="list-title">
            {block.title || 'Untitled'}
            {depth === 0 && (block.virtual || block.recurrence_id) && <Repeat size={12} className="ai-mark" />}
            {block.source === 'ai' && <Bot size={12} className="ai-mark" />}
          </span>
          {block.notes && <span className="list-notes">{block.notes}</span>}
        </span>
        {tracked.length > 0 && (
          <span className="list-progress" title={`${done} of ${tracked.length} sub-blocks done`}>
            <span style={{ width: `${(done / tracked.length) * 100}%` }} />
            <small>
              {done}/{tracked.length}
            </small>
          </span>
        )}
        {cat && depth === 0 && (
          <span className="cat-tag" style={{ '--cat': cat.color }}>
            {cat.name}
          </span>
        )}
        {hasStatus(block.status) && (
          <span className="status-pill sm">
            <StatusIcon status={block.status} size={13} />
            <span className="hide-sm">{statusLabel(block.status)}</span>
          </span>
        )}
      </div>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Row
              key={k.id}
              block={k}
              depth={depth + 1}
              childrenMap={childrenMap}
              store={store}
              selectedId={selectedId}
              onSelect={onSelect}
              collapsed={collapsed}
              toggle={toggle}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
