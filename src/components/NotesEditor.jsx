import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  Check,
  CheckSquare,
  Code2,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  List,
  ListOrdered,
  Minus,
  Quote,
  Sigma,
  Trash2,
  Type,
} from 'lucide-react'
import { BLOCK_TYPES, CALLOUT_ICONS, CONTINUES, INDENTABLE, MAX_INDENT, matchTypes, newBlock, numberAt, parseNotes, serializeNotes, shortcutFor } from '../lib/notes'
import { MathBlock, MathEditor } from './NotesMath'

const ICONS = { p: Type, h1: Heading1, h2: Heading2, h3: Heading3, todo: CheckSquare, bullet: List, number: ListOrdered, quote: Quote, callout: Lightbulb, math: Sigma, code: Code2, divider: Minus }
const BULLETS = ['•', '◦', '▪']
const PLACEHOLDER = { h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', todo: 'To-do', bullet: 'List', number: 'List', quote: 'Empty quote', callout: 'Callout', code: 'Code' }

/** Is the caret on the first (or last) visual line of a textarea? Measured with a mirror div, since lines wrap. */
function caretLine(el, which) {
  const style = getComputedStyle(el)
  const div = document.createElement('div')
  for (const p of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'whiteSpace', 'wordBreak', 'overflowWrap', 'tabSize']) div.style[p] = style[p]
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', width: `${el.clientWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' })
  const mark = (i) => {
    div.textContent = el.value.slice(0, i)
    const span = document.createElement('span')
    span.textContent = '​'
    div.appendChild(span)
    return span.offsetTop
  }
  document.body.appendChild(div)
  const at = mark(el.selectionStart)
  const edge = which === 'first' ? mark(0) : mark(el.value.length)
  div.remove()
  return Math.abs(at - edge) < 2
}

const autosize = (el) => {
  if (!el) return
  el.style.height = '0px'
  el.style.height = `${el.scrollHeight}px`
}

/**
 * Notion-style notes: one block per line, "/" for the block menu, Markdown
 * shortcuts ("# ", "- ", "[] ", "1. ", "> ", "```", "$$", "---"), Enter/Backspace
 * to split and join, Tab to nest, drag the handle to reorder. Reads and writes
 * Markdown text (lib/notes), so it drops in for a plain textarea.
 */
export default function NotesEditor({ value, onChange, placeholder = 'Write something, or type “/” for commands…', maxLength, readOnly = false, label }) {
  const [blocks, setBlocks] = useState(() => parseNotes(value))
  // The text we last saw from the parent (or sent it); anything else is an outside change to load.
  const [seen, setSeen] = useState(value ?? '')
  if ((value ?? '') !== seen) {
    setSeen(value ?? '')
    setBlocks(parseNotes(value))
  }
  const [focusedId, setFocusedId] = useState(null)
  // Slash menu: { id, start (index of "/"), active } — or a block's handle menu: { id, handle: true }.
  const [menu, setMenu] = useState(null)
  const [drag, setDrag] = useState(null) // { id, over, after }
  const [tooLong, setTooLong] = useState(0)
  // The math block whose TeX box is open: { id, fresh } (fresh = just made from / or $$).
  const [mathEdit, setMathEdit] = useState(null)
  const refs = useRef(new Map())
  const focusReq = useRef(null)
  const rootRef = useRef(null)

  useLayoutEffect(() => {
    for (const el of refs.current.values()) if (el?.tagName === 'TEXTAREA') autosize(el)
    const req = focusReq.current
    if (!req) return
    focusReq.current = null
    const el = refs.current.get(req.id)
    if (!el) return
    el.focus()
    if (el.tagName === 'TEXTAREA') {
      const pos = req.pos === 'end' ? el.value.length : Math.min(req.pos, el.value.length)
      el.setSelectionRange(pos, pos)
    }
  })

  const commit = (next, focus) => {
    if (focus) focusReq.current = focus
    setBlocks(next)
    const text = serializeNotes(next)
    if (maxLength && text.length > maxLength) return setTooLong(text.length)
    setTooLong(0)
    setSeen(text)
    if (text !== seen) onChange(text)
  }
  const indexOf = (id) => blocks.findIndex((b) => b.id === id)
  const patchAt = (list, i, patch) => list.map((b, j) => (j === i ? { ...b, ...patch } : b))
  const focusNeighbor = (i, dir) => {
    const target = blocks[i + dir]
    if (!target) return false
    focusReq.current = { id: target.id, pos: dir < 0 ? 'end' : 0 }
    setBlocks([...blocks]) // re-render to run the focus effect
    return true
  }

  /** Change a block's type in place (from the slash menu, handle menu or a shortcut). */
  const convert = (list, i, type, extra = {}) => {
    const b = list[i]
    const patch = { type, ...extra }
    if (!INDENTABLE.has(type)) patch.indent = 0
    if (type === 'todo' && b.type !== 'todo') patch.checked = Boolean(extra.checked)
    if (type === 'divider') patch.text = ''
    if (type === 'callout' && !b.icon) patch.icon = CALLOUT_ICONS[0]
    return patchAt(list, i, patch)
  }

  const applyType = (type) => {
    const i = indexOf(menu.id)
    if (i < 0) return setMenu(null)
    const b = blocks[i]
    let list = blocks
    let target = b.id
    if (!menu.handle) {
      // Drop the "/query" that opened the menu.
      const el = refs.current.get(b.id)
      const end = el ? el.selectionStart : b.text.length
      list = patchAt(list, i, { text: b.text.slice(0, menu.start) + b.text.slice(Math.max(end, menu.start + 1)) })
    }
    const rest = list[i].text
    if (menu.handle || !rest.trim()) {
      list = convert(list, i, type, menu.handle ? {} : { text: '' })
    } else {
      const nb = newBlock(type, '', { indent: INDENTABLE.has(type) ? b.indent : 0, ...(type === 'callout' && { icon: CALLOUT_ICONS[0] }) })
      list = [...list.slice(0, i + 1), nb, ...list.slice(i + 1)]
      target = nb.id
    }
    if (type === 'math') {
      // The TeX box takes focus, so no caret request here.
      setMenu(null)
      commit(list)
      return setMathEdit({ id: target, fresh: !menu.handle })
    }
    // A divider needs somewhere to keep typing after it.
    const ti = list.findIndex((x) => x.id === target)
    if (type === 'divider') {
      const after = list[ti + 1]
      if (!after || after.type === 'divider') {
        const p = newBlock()
        list = [...list.slice(0, ti + 1), p, ...list.slice(ti + 1)]
        target = p.id
      } else target = after.id
    }
    setMenu(null)
    commit(list, { id: target, pos: 'end' })
  }

  const remove = (i) => {
    const list = blocks.filter((_, j) => j !== i)
    const focus = blocks[i - 1] ?? blocks[i + 1]
    commit(list.length ? list : [newBlock()], focus ? { id: focus.id, pos: blocks[i - 1] ? 'end' : 0 } : null)
  }

  const onText = (i, e) => {
    const b = blocks[i]
    let text = e.target.value
    const caret = e.target.selectionStart
    if (b.type !== 'code') text = text.replace(/\n/g, ' ')
    let list = patchAt(blocks, i, { text })

    // Markdown shortcuts, typed at the very start of a plain line.
    if (b.type === 'p' || (b.type === 'bullet' && /^\[[ xX]?\] /.test(text))) {
      const sc = shortcutFor(text)
      // Fires once, as the marker is completed (typed or pasted), not on every later edit.
      if (sc && !b.text.startsWith(text.slice(0, text.length - sc.rest.length))) {
        setMenu(null)
        if (sc.type === 'math') {
          commit(convert(list, i, 'math', { text: '' }))
          return setMathEdit({ id: b.id, fresh: true })
        }
        if (sc.type === 'divider') {
          const p = newBlock('p', '', { indent: b.indent })
          list = convert(list, i, 'divider')
          return commit([...list.slice(0, i + 1), p, ...list.slice(i + 1)], { id: p.id, pos: 0 })
        }
        return commit(convert(list, i, sc.type, { text: sc.rest, checked: sc.checked }), { id: b.id, pos: Math.max(0, caret - (text.length - sc.rest.length)) })
      }
    }

    // "/" at the start of a line or after a space opens the block menu.
    if (b.type !== 'code' && text[caret - 1] === '/' && text.length === b.text.length + 1 && (caret === 1 || /\s/.test(text[caret - 2]))) {
      setMenu({ id: b.id, start: caret - 1, end: caret, active: 0 })
    } else if (menu && !menu.handle && menu.id === b.id) {
      const q = text.slice(menu.start + 1, caret)
      if (text[menu.start] !== '/' || caret <= menu.start || /\n|\s\s/.test(q) || (!matchTypes(q).length && /\s$/.test(q))) setMenu(null)
      else setMenu({ ...menu, end: caret, active: menu.active >= matchTypes(q).length ? 0 : menu.active })
    }
    commit(list)
  }

  const onKey = (i, e) => {
    const b = blocks[i]
    const el = e.currentTarget
    const { selectionStart: s, selectionEnd: end } = el
    const collapsed = s === end

    if (menu && !menu.handle && menu.id === b.id) {
      const options = matchTypes(b.text.slice(menu.start + 1, s))
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = options.length || 1
        return setMenu({ ...menu, active: (menu.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n })
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && options.length) {
        e.preventDefault()
        return applyType(options[Math.min(menu.active, options.length - 1)].id)
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        return setMenu(null)
      }
    }
    if (e.nativeEvent.isComposing) return

    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      if (b.type === 'code') {
        // Enter on an empty last line leaves the code block.
        if (e.shiftKey || !(collapsed && s === b.text.length && b.text.endsWith('\n'))) return
        e.preventDefault()
        const p = newBlock()
        const list = patchAt(blocks, i, { text: b.text.slice(0, -1) })
        return commit([...list.slice(0, i + 1), p, ...list.slice(i + 1)], { id: p.id, pos: 0 })
      }
      e.preventDefault()
      // Enter on an empty list item steps out of the list.
      if (CONTINUES.has(b.type) && !b.text) {
        return commit(b.indent > 0 ? patchAt(blocks, i, { indent: b.indent - 1 }) : convert(blocks, i, 'p'), { id: b.id, pos: 0 })
      }
      const nextType = CONTINUES.has(b.type) ? b.type : 'p'
      const indent = INDENTABLE.has(nextType) ? b.indent : 0
      if (s === 0 && b.text) {
        // At the start of a line: open a fresh line above and stay put.
        const nb = newBlock(CONTINUES.has(b.type) ? b.type : 'p', '', { indent })
        return commit([...blocks.slice(0, i), nb, ...blocks.slice(i)], { id: b.id, pos: 0 })
      }
      const nb = newBlock(nextType, b.text.slice(end), { indent })
      const list = patchAt(blocks, i, { text: b.text.slice(0, s) })
      return commit([...list.slice(0, i + 1), nb, ...list.slice(i + 1)], { id: nb.id, pos: 0 })
    }

    if (e.key === 'Backspace' && collapsed && s === 0) {
      if (b.type === 'code' && b.text) return
      e.preventDefault()
      if (b.type !== 'p') return commit(convert(blocks, i, 'p'), { id: b.id, pos: 0 })
      if (b.indent > 0) return commit(patchAt(blocks, i, { indent: b.indent - 1 }), { id: b.id, pos: 0 })
      const prev = blocks[i - 1]
      if (!prev) return
      if (prev.type === 'divider') return commit(blocks.filter((_, j) => j !== i - 1), { id: b.id, pos: 0 })
      const list = patchAt(blocks, i - 1, { text: prev.text + b.text }).filter((_, j) => j !== i)
      return commit(list, { id: prev.id, pos: prev.text.length })
    }

    if (e.key === 'Delete' && collapsed && s === b.text.length) {
      const next = blocks[i + 1]
      if (!next || next.type === 'code') return
      e.preventDefault()
      if (next.type === 'divider') return commit(blocks.filter((_, j) => j !== i + 1), { id: b.id, pos: s })
      return commit(patchAt(blocks, i, { text: b.text + next.text }).filter((_, j) => j !== i + 1), { id: b.id, pos: s })
    }

    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (b.type === 'code') {
        e.preventDefault()
        el.setRangeText('  ', s, end, 'end')
        return onText(i, { target: el })
      }
      if (!INDENTABLE.has(b.type)) return
      e.preventDefault()
      const prev = blocks[i - 1]
      if (e.shiftKey) return b.indent > 0 && commit(patchAt(blocks, i, { indent: b.indent - 1 }), { id: b.id, pos: s })
      // Only nest one level deeper than the line above.
      if (prev && INDENTABLE.has(prev.type) && b.indent <= prev.indent && b.indent < MAX_INDENT) commit(patchAt(blocks, i, { indent: b.indent + 1 }), { id: b.id, pos: s })
      return
    }

    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
    if ((e.key === 'ArrowUp' && caretLine(el, 'first')) || (e.key === 'ArrowLeft' && collapsed && s === 0)) {
      if (focusNeighbor(i, -1)) e.preventDefault()
    } else if ((e.key === 'ArrowDown' && caretLine(el, 'last')) || (e.key === 'ArrowRight' && collapsed && s === b.text.length)) {
      if (focusNeighbor(i, 1)) e.preventDefault()
    }
  }

  const onDividerKey = (i, e) => {
    // Keep page shortcuts (Backspace deletes the selected calendar block…) away from the editor.
    e.stopPropagation()
    if (e.key === 'Backspace' || e.key === 'Delete') (e.preventDefault(), remove(i))
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') focusNeighbor(i, -1) && e.preventDefault()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') focusNeighbor(i, 1) && e.preventDefault()
    else if (e.key === 'Enter') {
      e.preventDefault()
      const p = newBlock()
      commit([...blocks.slice(0, i + 1), p, ...blocks.slice(i + 1)], { id: p.id, pos: 0 })
    } else if (e.key === 'Escape') e.currentTarget.blur()
  }

  const onMathKey = (i, e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation()
      e.preventDefault()
      return setMathEdit({ id: blocks[i].id, fresh: false })
    }
    onDividerKey(i, e)
  }

  /** Close the TeX box. keep: save the draft; next: move on to a line below (Enter / Done). */
  const closeMath = (tex, keep, next) => {
    const edit = mathEdit
    setMathEdit(null)
    const i = indexOf(edit?.id)
    if (i < 0) return
    const b = blocks[i]
    if (!keep) {
      // Escaping out of a brand-new, still-empty equation takes it back to a plain line.
      if (edit.fresh && !b.text.trim()) return commit(convert(blocks, i, 'p', { text: '' }), { id: b.id, pos: 0 })
      return next && focusNeighbor(i, 0)
    }
    let list = patchAt(blocks, i, { text: tex.trim() })
    if (!next) return commit(list)
    if (!edit.fresh) return commit(list, { id: b.id, pos: 0 })
    const after = list[i + 1]
    if (after?.type === 'p' && !after.text && !after.indent) return commit(list, { id: after.id, pos: 0 })
    const p = newBlock()
    list = [...list.slice(0, i + 1), p, ...list.slice(i + 1)]
    commit(list, { id: p.id, pos: 0 })
  }
  const mathAnchor = useCallback(() => refs.current.get(mathEdit?.id), [mathEdit?.id])

  const onPaste = (i, e) => {
    const b = blocks[i]
    const text = e.clipboardData.getData('text/plain')
    if (b.type === 'code' || !text.includes('\n')) return
    e.preventDefault()
    const el = e.currentTarget
    const before = b.text.slice(0, el.selectionStart)
    const after = b.text.slice(el.selectionEnd)
    const pasted = parseNotes(text)
    const first = pasted[0]
    const head = !before && b.type === 'p' ? { ...first, id: b.id } : { ...b, text: before + first.text }
    const body = [head, ...pasted.slice(1)]
    const last = body.at(-1)
    const caret = last.text.length
    body[body.length - 1] = { ...last, text: last.text + after }
    commit([...blocks.slice(0, i), ...body, ...blocks.slice(i + 1)], { id: last.id, pos: caret })
  }

  const move = (fromId, toId, after) => {
    if (fromId === toId) return
    const from = blocks.find((b) => b.id === fromId)
    const rest = blocks.filter((b) => b.id !== fromId)
    const j = rest.findIndex((b) => b.id === toId) + (after ? 1 : 0)
    commit([...rest.slice(0, j), from, ...rest.slice(j)])
  }

  // Click below the last block: keep writing at the end.
  const onRootDown = (e) => {
    if (readOnly || e.target !== rootRef.current) return
    e.preventDefault()
    const last = blocks.at(-1)
    if (last.type === 'p' && !last.text) return focusNeighbor(blocks.length, -1)
    const p = newBlock()
    commit([...blocks, p], { id: p.id, pos: 0 })
  }

  const lone = blocks.length === 1 && blocks[0].type === 'p' && !blocks[0].text

  return (
    <div className={`notes-editor ${readOnly ? 'read-only' : ''}`} ref={rootRef} onMouseDown={onRootDown} role="group" aria-label={label}>
      {blocks.map((b, i) => {
        const focused = focusedId === b.id
        const slash = menu && menu.id === b.id ? menu : null
        const options = slash && !slash.handle ? matchTypes(b.text.slice(slash.start + 1, slash.end)) : null
        const ph = lone ? placeholder : focused ? (PLACEHOLDER[b.type] ?? 'Type “/” for commands') : (PLACEHOLDER[b.type] && b.type !== 'p' ? PLACEHOLDER[b.type] : '')
        return (
          <div
            key={b.id}
            className={`nb nb-${b.type} ${b.checked ? 'checked' : ''} ${drag?.over === b.id ? (drag.after ? 'drop-after' : 'drop-before') : ''} ${drag?.id === b.id ? 'dragging' : ''}`}
            style={{ '--indent': INDENTABLE.has(b.type) ? b.indent : 0 }}
            onDragOver={(e) => {
              if (!drag) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const after = e.clientY > r.top + r.height / 2
              if (drag.over !== b.id || drag.after !== after) setDrag({ ...drag, over: b.id, after })
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (drag) move(drag.id, b.id, drag.after)
              setDrag(null)
            }}
          >
            {!readOnly && (
              <div className="nb-gutter">
                <button
                  type="button"
                  className="nb-handle"
                  tabIndex={-1}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', b.text)
                    setDrag({ id: b.id })
                  }}
                  onDragEnd={() => setDrag(null)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setMenu(slash?.handle ? null : { id: b.id, handle: true })}
                  aria-label="Drag to move, click for options"
                  title="Drag to move · click for options"
                >
                  <GripVertical size={14} />
                </button>
              </div>
            )}

            {b.type === 'todo' && (
              <button
                type="button"
                role="checkbox"
                aria-checked={b.checked}
                aria-label={b.checked ? 'Mark not done' : 'Mark done'}
                className="nb-check"
                disabled={readOnly}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(patchAt(blocks, i, { checked: !b.checked }))}
              >
                {b.checked && <Check size={12} strokeWidth={3} />}
              </button>
            )}
            {b.type === 'bullet' && <span className="nb-marker" aria-hidden="true">{BULLETS[b.indent % BULLETS.length]}</span>}
            {b.type === 'number' && <span className="nb-marker nb-num" aria-hidden="true">{numberAt(blocks, i)}.</span>}
            {b.type === 'callout' && (
              <button
                type="button"
                className="nb-icon"
                disabled={readOnly}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const next = CALLOUT_ICONS[(CALLOUT_ICONS.indexOf(b.icon) + 1) % CALLOUT_ICONS.length]
                  commit(patchAt(blocks, i, { icon: next }))
                }}
                aria-label="Change callout icon"
                title="Change icon"
              >
                {b.icon || CALLOUT_ICONS[0]}
              </button>
            )}

            {b.type === 'math' ? (
              <MathBlock
                tex={b.text}
                readOnly={readOnly}
                ref={(el) => (el ? refs.current.set(b.id, el) : refs.current.delete(b.id))}
                onOpen={() => setMathEdit({ id: b.id, fresh: false })}
                onKeyDown={(e) => onMathKey(i, e)}
                onFocus={() => setFocusedId(b.id)}
                onBlur={() => setFocusedId((f) => (f === b.id ? null : f))}
              />
            ) : b.type === 'divider' ? (
              <div
                className="nb-hr"
                tabIndex={readOnly ? -1 : 0}
                ref={(el) => (el ? refs.current.set(b.id, el) : refs.current.delete(b.id))}
                onKeyDown={(e) => onDividerKey(i, e)}
                onFocus={() => setFocusedId(b.id)}
                onBlur={() => setFocusedId(null)}
                role="separator"
              >
                <hr />
              </div>
            ) : (
              <textarea
                ref={(el) => (el ? refs.current.set(b.id, el) : refs.current.delete(b.id))}
                className="nb-text"
                rows={1}
                value={b.text}
                placeholder={ph}
                readOnly={readOnly}
                spellCheck={b.type !== 'code'}
                aria-label={b.type === 'p' ? label : `${BLOCK_TYPES.find((t) => t.id === b.type).label}${label ? ` in ${label}` : ''}`}
                onChange={(e) => onText(i, e)}
                onKeyDown={(e) => onKey(i, e)}
                onPaste={(e) => onPaste(i, e)}
                onFocus={() => setFocusedId(b.id)}
                onBlur={() => {
                  setFocusedId((f) => (f === b.id ? null : f))
                  if (slash && !slash.handle) setMenu(null)
                }}
              />
            )}

            {mathEdit?.id === b.id && !readOnly && (
              <MathEditor key={b.id} anchor={mathAnchor} initial={b.text} onDone={(tex, next) => closeMath(tex, true, next)} onCancel={() => closeMath('', false, true)} />
            )}

            {slash && (
              <BlockMenu
                options={slash.handle ? BLOCK_TYPES : options}
                active={slash.handle ? BLOCK_TYPES.findIndex((t) => t.id === b.type) : slash.active}
                handle={slash.handle}
                onPick={applyType}
                onHover={(n) => !slash.handle && setMenu({ ...slash, active: n })}
                onDuplicate={() => {
                  const copy = newBlock(b.type, b.text, { indent: b.indent, checked: b.checked, lang: b.lang, icon: b.icon })
                  setMenu(null)
                  commit([...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)], { id: copy.id, pos: 'end' })
                }}
                onDelete={() => (setMenu(null), remove(i))}
                onClose={() => setMenu(null)}
              />
            )}
          </div>
        )
      })}
      {tooLong > 0 && (
        <p className="nb-limit" role="alert">
          Too long to save ({tooLong.toLocaleString()} / {maxLength.toLocaleString()} characters). Trim something to keep your changes.
        </p>
      )}
    </div>
  )
}

/** The "/" menu (filtered block types) or a block's handle menu (turn into, duplicate, delete). */
function BlockMenu({ options, active, handle, onPick, onHover, onDuplicate, onDelete, onClose }) {
  const ref = useRef(null)
  const [up, setUp] = useState(false)
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (r && r.bottom > window.innerHeight - 8 && r.top - r.height > 60) setUp(true)
    ref.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }, [active])
  useLayoutEffect(() => {
    if (!handle) return
    const close = (e) => !ref.current?.contains(e.target) && !e.target.closest?.('.nb-handle') && onClose()
    const esc = (e) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc, true)
    }
  }, [handle, onClose])

  return (
    <div className={`menu nb-menu ${up ? 'up' : ''}`} ref={ref} role="listbox" aria-label={handle ? 'Block options' : 'Insert block'} onMouseDown={(e) => e.preventDefault()}>
      <div className="menu-label">{handle ? 'Turn into' : 'Basic blocks'}</div>
      {options.map((t, n) => {
        const Icon = ICONS[t.id]
        return (
          <button key={t.id} type="button" role="option" aria-selected={n === active} className={n === active ? 'on' : ''} onClick={() => onPick(t.id)} onMouseEnter={() => onHover(n)}>
            <span className="nb-menu-icon">
              <Icon size={16} />
            </span>
            <span className="nb-menu-text">
              <strong>{t.label}</strong>
              {!handle && <small>{t.hint}</small>}
            </span>
            {t.md && !handle && <kbd>{t.md}</kbd>}
            {handle && n === active && <Check size={14} />}
          </button>
        )
      })}
      {!options.length && <div className="nb-menu-empty muted small">No matching blocks</div>}
      {handle && (
        <>
          <div className="dm-sep" />
          <button type="button" onClick={onDuplicate}>
            <Copy size={15} /> Duplicate
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            <Trash2 size={15} /> Delete
          </button>
        </>
      )}
    </div>
  )
}
