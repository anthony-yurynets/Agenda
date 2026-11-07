import { Suspense, lazy, useEffect, useState } from 'react'
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { PLAN_END, PLAN_START, QUESTIONS, fmtDay, loadTestIndex, matchTest, scoreOf, scoredMocks, wrongOf } from '../../lib/amc'
import ScoreChart from './ScoreChart'

// KaTeX comes with it, so it loads when a review is first opened.
const MockReview = lazy(() => import('./MockReview'))

const num = (v) => (v === '' || v == null ? null : Number(v))
const blankForm = (today) => ({ id: null, name: '', date: today, correct: '', blank: '', wrong: '' })

/**
 * Log mock tests (score = 6 × correct + 1.5 × blank) and chart them against the
 * target. A mock named after a real test ("AMC 10B 2024") opens its review,
 * where each problem's answer is entered and misses go to the error log.
 */
export default function MockTracker({ amc, target, today }) {
  const [form, setForm] = useState(() => blankForm(today))
  const [reviewing, setReviewing] = useState(null)
  const [index, setIndex] = useState(null)
  useEffect(() => {
    loadTestIndex().then(setIndex, () => {})
  }, [])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const correct = num(form.correct)
  const blank = num(form.blank)
  // Wrong fills itself in from the other two unless typed.
  const wrong = form.wrong === '' ? (correct !== null ? QUESTIONS - correct - (blank ?? 0) : null) : num(form.wrong)
  const total = (correct ?? 0) + (blank ?? 0) + (wrong ?? 0)
  const invalid = [correct, blank, wrong].some((v) => v !== null && (!Number.isInteger(v) || v < 0 || v > QUESTIONS)) || total > QUESTIONS
  const preview = correct === null ? null : scoreOf({ correct, blank })

  const submit = (e) => {
    e.preventDefault()
    if (invalid || !form.date) return
    const row = { name: form.name.trim() || 'Mock', date: form.date, correct, blank: correct === null ? blank : (blank ?? 0), wrong }
    if (form.id) amc.updateMock(form.id, row)
    else {
      const id = amc.addMock(row)
      if (matchTest(row.name, index)) setReviewing(id)
    }
    setForm(blankForm(today))
  }
  const edit = (m) => set({ id: m.id, name: m.name, date: m.date, correct: m.correct ?? '', blank: m.blank ?? '', wrong: m.wrong ?? '' })

  const graded = scoredMocks(amc.mocks)
  const list = [...amc.mocks].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <section className="glass-tile amc-mocks" id="amc-mocks">
      <div className="tile-head">
        <h3>Mock scores</h3>
      </div>
      <form className="amc-form mock-form" onSubmit={submit}>
        <label className="mf-name">
          <span>Test</span>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="AMC 10B 2019" maxLength={120} />
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
        </label>
        <label>
          <span>Correct</span>
          <input type="number" inputMode="numeric" min={0} max={QUESTIONS} value={form.correct} onChange={(e) => set({ correct: e.target.value })} />
        </label>
        <label>
          <span>Blank</span>
          <input type="number" inputMode="numeric" min={0} max={QUESTIONS} value={form.blank} onChange={(e) => set({ blank: e.target.value })} />
        </label>
        <label>
          <span>Wrong</span>
          <input type="number" inputMode="numeric" min={0} max={QUESTIONS} value={form.wrong} placeholder={wrong !== null ? String(wrong) : ''} onChange={(e) => set({ wrong: e.target.value })} />
        </label>
        <div className="mf-score">
          <span>Score</span>
          <strong>{preview ?? '—'}</strong>
        </div>
        <div className="mf-actions">
          {form.id && (
            <button type="button" className="btn ghost sm" onClick={() => setForm(blankForm(today))}>
              Cancel
            </button>
          )}
          <button className="btn primary sm" disabled={invalid}>
            {form.id ? 'Save' : <><Plus size={14} /> Add</>}
          </button>
        </div>
        {invalid && <p className="error-text mf-err">Correct + blank + wrong can’t be more than {QUESTIONS}.</p>}
      </form>

      {graded.length ? (
        <ScoreChart mocks={graded} target={target} from={PLAN_START} to={PLAN_END} />
      ) : (
        <div className="dash-empty">
          <p>Enter a mock’s results to start the chart.</p>
        </div>
      )}

      <ul className="mock-list">
        {list.map((m) => {
          const s = scoreOf(m)
          return (
            <li key={m.id} className={form.id === m.id ? 'editing' : ''}>
              <span className="ml-date">{fmtDay(m.date)}</span>
              <button className="ml-name" onClick={() => setReviewing(m.id)} title="Review problem by problem">
                {m.name || 'Mock'}
              </button>
              <span className="ml-split muted">{s === null ? 'Not graded yet' : `${m.correct} ✓ · ${m.blank ?? 0} blank · ${wrongOf(m) ?? 0} ✗`}</span>
              <strong className={`ml-score ${s !== null && s >= target ? 'hit' : ''}`}>{s ?? '—'}</strong>
              <button className="icon-btn sm" onClick={() => setReviewing(m.id)} aria-label={`Review ${m.name} problem by problem`} title="Review problems">
                <ListChecks size={13} />
              </button>
              <button className="icon-btn sm" onClick={() => edit(m)} aria-label={`Edit ${m.name}`}>
                <Pencil size={13} />
              </button>
              <button className="icon-btn sm" onClick={() => amc.deleteMock(m.id)} aria-label={`Delete ${m.name}`}>
                <Trash2 size={13} />
              </button>
            </li>
          )
        })}
      </ul>
      {reviewing && (
        <Suspense fallback={null}>
          <MockReview amc={amc} mockId={reviewing} onClose={() => setReviewing(null)} />
        </Suspense>
      )}
    </section>
  )
}
