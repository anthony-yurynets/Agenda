import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ExternalLink, Minus, RotateCcw, X } from 'lucide-react'
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'
import {
  CHOICES,
  LOG_BLANKS_THROUGH,
  QUESTIONS,
  REASONS,
  TOPICS,
  aopsUrl,
  fmtDay,
  gradeOf,
  isMiss,
  keyOf,
  loadTest,
  loadTestIndex,
  matchTest,
  scoreOf,
  tally,
} from '../../lib/amc'

const MATH = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false },
]

/** A problem statement from the bundled dataset, with its LaTeX typeset. */
function Statement({ html }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = html
    renderMathInElement(el, { delimiters: MATH, throwOnError: false, strict: 'ignore' })
  }, [html])
  return <div className="mr-statement" ref={ref} />
}

/** Lets a note be typed freely and saves it when the field is left. */
function NoteInput({ value, onSave }) {
  const [draft, setDraft] = useState(value)
  const [prev, setPrev] = useState(value)
  if (value !== prev) {
    setPrev(value)
    setDraft(value)
  }
  const save = () => draft.trim() !== value && onSave(draft.trim())
  return (
    <input
      className="mr-note"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      placeholder="Why did you miss it?"
      maxLength={2000}
    />
  )
}

const GRADE_ICON = { correct: <Check size={14} />, wrong: <X size={14} />, blank: <Minus size={14} /> }

function ProblemRow({ n, problem, entry, inQueue, open, onToggle, onAnswer, testLabel }) {
  const key = keyOf(entry, problem)
  const grade = gradeOf(entry, problem)
  const miss = isMiss(grade, n)
  const topic = entry?.topic ?? problem?.topic
  const url = aopsUrl(testLabel, n)
  const pick = (v) => onAnswer({ pick: entry?.pick === v ? '' : v })
  // Choosing the dataset's own answer clears the override.
  const setKey = (v) => onAnswer({ key: v === problem?.answer ? '' : v })

  return (
    <li className={`mr-row g-${grade} ${open ? 'open' : ''}`}>
      <div className="mr-main">
        <button className="mr-num" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} problem ${n}`}>
          <ChevronDown size={14} className="mr-chev" />
          {n}
        </button>
        <span className="mr-topic">{topic && <span className={`amc-tag t-${topic}`}>{TOPICS.find((t) => t.id === topic)?.short}</span>}</span>
        <div className="mr-picks" role="group" aria-label={`Your answer to problem ${n}`}>
          {CHOICES.map((c) => (
            <button key={c} className={entry?.pick === c ? 'on' : ''} onClick={() => pick(c)} aria-pressed={entry?.pick === c}>
              {c}
            </button>
          ))}
          <button className={`mr-blank ${entry?.pick === 'blank' ? 'on' : ''}`} onClick={() => pick('blank')} aria-pressed={entry?.pick === 'blank'}>
            Blank
          </button>
        </div>
        <label className="mr-key">
          <span>Key</span>
          <select className="ae-select" value={key} onChange={(e) => setKey(e.target.value)} aria-label={`Correct answer to problem ${n}`}>
            {!key && <option value="">?</option>}
            {key.length > 1 && <option value={key}>{key.split('').join('/')}</option>}
            {CHOICES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <span className="mr-grade" title={grade === 'unset' ? '' : grade}>
          {GRADE_ICON[grade]}
        </span>
      </div>

      {miss && (
        <div className="mr-miss">
          <select className="ae-select" value={entry?.reason ?? (grade === 'blank' ? 'time' : 'concept')} onChange={(e) => onAnswer({ reason: e.target.value })} aria-label="Why it was missed">
            {REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <select className="ae-select" value={topic ?? 'algebra'} onChange={(e) => onAnswer({ topic: e.target.value === problem?.topic ? '' : e.target.value })} aria-label="Topic">
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <NoteInput value={entry?.note ?? ''} onSave={(note) => onAnswer({ note })} />
          {inQueue && (
            <span className="mr-queued" title="In the error log’s redo queue">
              <RotateCcw size={12} /> Redo
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="mr-detail">
          {problem ? <Statement html={problem.html} /> : <p className="muted small">This problem isn’t in the dataset.</p>}
          <div className="mr-detail-foot">
            {problem?.hint && (
              <details className="mr-hint">
                <summary>Key idea</summary>
                {problem.hint}
              </details>
            )}
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="btn ghost sm">
                Solutions on AoPS <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * One mock, problem by problem: the answer you put, the answer key (from the
 * dataset, changeable), and why you missed it. Misses go to the error log
 * and its redo queue on their own (blanks only on #1–18); the score fills in
 * once all 25 are entered.
 */
export default function MockReview({ amc, mockId, onClose }) {
  const mock = amc.mocks.find((m) => m.id === mockId)
  const [index, setIndex] = useState(null)
  const [test, setTest] = useState(null)
  const [failed, setFailed] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const testId = mock?.test_id ?? null

  useEffect(() => {
    loadTestIndex().then(setIndex, (e) => setFailed(e.message))
  }, [])

  // A mock named after a real test is matched to it on first open.
  const autoMatched = useRef(false)
  useEffect(() => {
    if (!index || !mock || mock.test_id || autoMatched.current) return
    autoMatched.current = true
    const id = matchTest(mock.name, index)
    if (id) loadTest(id).then((t) => amc.setMockTest(mock.id, t), (e) => setFailed(e.message))
  }, [index, mock, amc])

  useEffect(() => {
    if (!testId) return
    let live = true
    loadTest(testId).then((t) => live && setTest(t), (e) => live && setFailed(e.message))
    return () => {
      live = false
    }
  }, [testId])
  const shown = testId && test?.id === testId ? test : null

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !e.target.closest?.('input, select') && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const queued = useMemo(() => new Set(amc.errors.filter((e) => e.mock_id === mockId).map((e) => e.problem)), [amc.errors, mockId])

  if (!mock) return null
  const answers = mock.answers ?? {}
  const t = tally(answers, shown?.problems)
  const live = scoreOf({ correct: t.correct, blank: t.blank })
  const groups = index ? [['AMC 10', index.filter((x) => x.id.includes('-10'))], ['AMC 12', index.filter((x) => x.id.includes('-12'))]] : []
  const toggle = (n) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  const allOpen = open.size === QUESTIONS

  const pickTest = (id) => {
    if (!id) return amc.setMockTest(mock.id, null)
    loadTest(id).then((tt) => amc.setMockTest(mock.id, tt), (e) => setFailed(e.message))
  }

  // Portaled: the tiles' backdrop-filter would trap a fixed overlay inside them.
  return createPortal(
    <div className="modal-scrim mr-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal mock-review" role="dialog" aria-modal="true" aria-labelledby="mr-title">
        <div className="modal-head mr-head">
          <div className="mr-title">
            <h2 id="mr-title">{mock.name || 'Mock'}</h2>
            <span className="muted small">{fmtDay(mock.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
          <select className="ae-select mr-test" value={testId ?? ''} onChange={(e) => pickTest(e.target.value)} aria-label="Which test this mock was">
            <option value="">{index ? 'Pick the test…' : 'Loading tests…'}</option>
            {groups.map(([label, list]) => (
              <optgroup key={label} label={label}>
                {list.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button className="icon-btn sm" onClick={onClose} aria-label="Close review">
            <X size={16} />
          </button>
        </div>

        <div className="mr-stats">
          <span className="mr-stat s-correct"><strong>{t.correct}</strong> correct</span>
          <span className="mr-stat s-wrong"><strong>{t.wrong}</strong> wrong</span>
          <span className="mr-stat"><strong>{t.blank}</strong> blank</span>
          {t.unset > 0 && <span className="mr-stat muted"><strong>{t.unset}</strong> to enter</span>}
          <span className="mr-stat mr-score">
            <strong>{live}</strong> {t.done ? 'score' : 'so far'}
          </span>
          <button className="btn ghost sm mr-expand" onClick={() => setOpen(allOpen ? new Set() : new Set(Array.from({ length: QUESTIONS }, (_, i) => i + 1)))}>
            {allOpen ? 'Hide problems' : 'Show all problems'}
          </button>
        </div>
        <p className="muted small mr-rule">
          Wrong answers and blanks on #1–{LOG_BLANKS_THROUGH} go to the error log and redo queue{queued.size ? ` (${queued.size} so far)` : ''}. Blanks on #{LOG_BLANKS_THROUGH + 1}–{QUESTIONS} don’t.
        </p>

        {failed && <p className="error-text">{failed}</p>}
        {!testId ? (
          <div className="dash-empty">
            <p>{index ? 'Pick which test this was to load its problems and answer key.' : 'Loading tests…'}</p>
          </div>
        ) : !shown ? (
          <div className="mr-loading">
            <div className="spinner" />
          </div>
        ) : (
          <ol className="mr-list">
            {Array.from({ length: QUESTIONS }, (_, i) => i + 1).map((n) => (
              <ProblemRow
                key={n}
                n={n}
                problem={shown.problems.find((p) => p.n === n)}
                entry={answers[n]}
                inQueue={queued.has(n)}
                open={open.has(n)}
                onToggle={() => toggle(n)}
                onAnswer={(patch) => amc.answerProblem(mock.id, n, patch, shown)}
                testLabel={shown.label}
              />
            ))}
          </ol>
        )}
      </div>
    </div>,
    document.body,
  )
}
