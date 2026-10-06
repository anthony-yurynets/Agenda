import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { ASSIGNMENT_STATUSES, KINDS } from '../../lib/dashboard'

const FIELDS = ['title', 'kind', 'status', 'due_date', 'subject_id']

/**
 * Subject combobox: type to filter, ↑/↓ to move, Enter or Tab to pick. A name
 * that doesn't exist yet is created on pick. Clearing the text clears it.
 */
function SubjectPicker({ value, subjects, onChange, onCreate }) {
  const current = subjects.find((s) => s.id === value)
  const [text, setText] = useState(current?.name ?? '')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)

  const q = text.trim().toLowerCase()
  const exact = subjects.find((s) => s.name.toLowerCase() === q)
  // Showing the current subject's full name: list everything, not just it.
  const filtering = q && !(current && current.name.toLowerCase() === q)
  const matches = filtering ? subjects.filter((s) => s.name.toLowerCase().includes(q)) : subjects
  const options = [...matches, ...(q && !exact ? [{ id: null, name: text.trim(), create: true }] : [])]
  const active = Math.min(hi, options.length - 1)

  const pick = (o) => {
    setOpen(false)
    if (!o) {
      setText('')
      return onChange(null)
    }
    setText(o.name)
    onChange(o.create ? onCreate(o.name) : o.id)
  }
  /** Settle whatever is typed: empty → none, exact name → it, else the highlighted option. */
  const settle = () => {
    if (!q) return pick(null)
    if (exact && !open) return pick(exact)
    pick(options[active] ?? exact)
  }

  return (
    <div className="ae-subject">
      <span className="ae-dot" style={{ background: current?.color ?? 'transparent' }} aria-hidden="true" />
      <input
        value={text}
        placeholder="None"
        aria-label="Subject"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        maxLength={80}
        onFocus={(e) => {
          e.currentTarget.select()
          setOpen(true)
          setHi(0)
        }}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setHi(0)
        }}
        onBlur={settle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
            setHi((h) => (Math.min(h, options.length - 1) + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % Math.max(options.length, 1))
          } else if (e.key === 'Enter' && open && options.length) {
            // Pick; the next Enter saves the assignment.
            e.preventDefault()
            e.stopPropagation()
            pick(options[active])
          } else if (e.key === 'Escape' || e.key === 'Enter') settle() // then the editor closes and saves
        }}
      />
      {open && options.length > 0 && (
        <div className="menu ae-menu" role="listbox">
          {options.map((o, i) => (
            <button
              key={o.id ?? 'create'}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'hi' : ''}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the input
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(o)}
            >
              {o.create ? <Plus size={13} /> : <span className="ae-dot" style={{ background: o.color }} />}
              <span className="flex1">{o.create ? `Create “${o.name}”` : o.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Quick editor for an assignment or exam, built for the keyboard: the title is
 * focused, Tab walks the fields, Enter or Esc (or clicking away) saves and
 * closes, ⌘/Ctrl+Enter saves and starts another. New items without a title are
 * dropped.
 */
export default function AssignmentEditor({ assignment, dash, onClose, onAnother, toast }) {
  const isNew = !assignment.id
  const [draft, setDraftState] = useState(assignment)
  const draftRef = useRef(assignment)
  const set = (patch) => {
    draftRef.current = { ...draftRef.current, ...patch }
    setDraftState(draftRef.current)
  }
  const titleRef = useRef(null)
  const boxRef = useRef(null)
  // What's in the database so far: saving again only sends what changed since.
  const savedRef = useRef(isNew ? null : assignment)
  const deletedRef = useRef(false)

  const save = () => {
    if (deletedRef.current) return
    const d = { ...draftRef.current, title: draftRef.current.title.trim() }
    const saved = savedRef.current
    if (!saved) {
      if (!d.title) return
      const id = dash.createAssignment(Object.fromEntries(FIELDS.map((f) => [f, d[f]])))
      savedRef.current = { ...d, id }
      return
    }
    const patch = Object.fromEntries(FIELDS.filter((f) => d[f] !== saved[f]).map((f) => [f, d[f]]))
    if (!Object.keys(patch).length) return
    dash.updateAssignment(saved.id, patch)
    savedRef.current = { ...saved, ...patch }
  }
  const close = () => {
    save()
    onClose()
  }

  // Leaving the page (or clicking another card) still saves.
  const latest = useRef({ save, close })
  useEffect(() => {
    latest.current = { save, close }
  })
  useEffect(() => () => latest.current.save(), [])

  useEffect(() => {
    const away = (e) => !boxRef.current?.contains(e.target) && latest.current.close()
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [])

  const onKeyDown = (e) => {
    if (e.key === 'Tab' && e.target.type === 'date') {
      // A date input tabs through month/day/year; one Tab should mean the next field.
      const fields = [...boxRef.current.querySelectorAll('.ae-title, .ae-props input, .ae-props select')]
      const next = fields[fields.indexOf(e.target) + (e.shiftKey ? -1 : 1)]
      if (next) {
        e.preventDefault()
        next.focus()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'BUTTON') {
      e.preventDefault()
      const d = draftRef.current
      close()
      if ((e.metaKey || e.ctrlKey) && onAnother) onAnother({ kind: d.kind, due_date: d.due_date, subject_id: d.subject_id })
    }
  }

  const noun = draft.kind === 'exam' ? 'exam' : 'assignment'
  return (
    <div className={`ae glass k-${draft.kind}`} ref={boxRef} onKeyDown={onKeyDown} role="dialog" aria-label={isNew ? `New ${noun}` : `Edit ${noun}`}>
      <div className="ae-head">
        <span className="ae-kind">{isNew ? `New ${noun}` : `Edit ${noun}`}</span>
        <button className="icon-btn sm" onClick={close} aria-label="Save and close" tabIndex={-1}>
          <X size={15} />
        </button>
      </div>
      {/* Shift+Tab from the title wraps to the last field. */}
      <span tabIndex={0} className="sr-only" onFocus={() => boxRef.current?.querySelector('.ae-subject input')?.focus()} />
      <input
        ref={titleRef}
        className="ae-title"
        value={draft.title}
        placeholder={draft.kind === 'exam' ? 'Unit 3 test' : 'Problem set 4'}
        maxLength={200}
        autoFocus
        aria-label="Title"
        onChange={(e) => set({ title: e.target.value })}
      />
      <div className="ae-props">
        <label className="ae-row">
          <span>Due</span>
          <input type="date" value={draft.due_date} onChange={(e) => e.target.value && set({ due_date: e.target.value })} />
        </label>
        <label className="ae-row">
          <span>Status</span>
          <select className={`ae-select as-${draft.status}`} value={draft.status} onChange={(e) => set({ status: e.target.value })}>
            {ASSIGNMENT_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ae-row">
          <span>Type</span>
          <select className="ae-select" value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ae-row">
          <span>Subject</span>
          <SubjectPicker value={draft.subject_id} subjects={dash.subjects} onChange={(id) => set({ subject_id: id })} onCreate={dash.createSubject} />
        </div>
      </div>
      {/* Tab from the last field wraps back to the title. */}
      <span tabIndex={0} className="sr-only" onFocus={() => titleRef.current?.focus()} />
      <div className="ae-foot">
        {!isNew && (
          <button
            className="btn ghost danger sm"
            tabIndex={-1}
            onClick={() => {
              deletedRef.current = true
              dash.deleteAssignment(assignment.id)
              toast(`${noun[0].toUpperCase()}${noun.slice(1)} deleted`)
              onClose()
            }}
          >
            <Trash2 size={13} /> Delete
          </button>
        )}
        <span className="ae-hint">
          <kbd>Tab</kbd> next · <kbd>Esc</kbd> save · <kbd>⌘↵</kbd> save &amp; add another
        </span>
      </div>
    </div>
  )
}
