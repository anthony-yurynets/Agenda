import { useMemo, useState } from 'react'
import { ExternalLink, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { REASONS, TOPICS, aopsUrl, countBy, reasonLabel, topicLabel } from '../../lib/amc'

const EMPTY = { test: '', problem: '', topic: 'algebra', reason: 'concept', key_idea: '' }

/** Opens the problem on the AoPS wiki, when the test name says which one it is. */
function OpenProblem({ e }) {
  const url = aopsUrl(e.test, e.problem)
  if (!url) return null
  return (
    <a className="icon-btn sm el-open" href={url} target="_blank" rel="noreferrer" title="Open on AoPS" aria-label="Open problem on AoPS">
      <ExternalLink size={13} />
    </a>
  )
}

/** Bars of counts; the largest is called out as the weakest. */
function Counts({ title, list, counts, active, onPick }) {
  const max = Math.max(1, ...Object.values(counts))
  const top = Math.max(...Object.values(counts))
  return (
    <div className="el-counts">
      <div className="el-counts-title">{title}</div>
      {list.map((x) => (
        <button key={x.id} className={`el-bar ${active === x.id ? 'on' : ''} ${top > 0 && counts[x.id] === top ? 'worst' : ''}`} onClick={() => onPick(active === x.id ? '' : x.id)}>
          <span className="el-bar-label">{x.label}</span>
          <span className="el-bar-track">
            <i style={{ width: `${(counts[x.id] / max) * 100}%` }} />
          </span>
          <span className="el-bar-n">{counts[x.id]}</span>
        </button>
      ))}
    </div>
  )
}

/** Every missed problem: why, the key idea, and whether it's been redone. */
export default function ErrorLog({ amc }) {
  const [form, setForm] = useState(EMPTY)
  const [topic, setTopic] = useState('')
  const [reason, setReason] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const { errors } = amc
  const byTopic = useMemo(() => countBy(errors, 'topic', TOPICS), [errors])
  const byReason = useMemo(() => countBy(errors, 'reason', REASONS), [errors])
  const shown = errors.filter((e) => (!topic || e.topic === topic) && (!reason || e.reason === reason))
  const queue = errors.filter((e) => !e.redone)

  const problem = form.problem === '' ? null : Number(form.problem)
  const badProblem = problem !== null && !(Number.isInteger(problem) && problem >= 1 && problem <= 25)
  const submit = (e) => {
    e.preventDefault()
    if (badProblem || (!form.test.trim() && !form.key_idea.trim())) return
    amc.addError({ test: form.test.trim(), problem, topic: form.topic, reason: form.reason, key_idea: form.key_idea.trim(), redone: false })
    // Keep the test name: errors usually come in batches from one test.
    setForm({ ...EMPTY, test: form.test, topic: form.topic })
  }

  return (
    <section className="glass-tile amc-errors" id="amc-errors">
      <div className="tile-head">
        <h3>Error log</h3>
        <span className="muted small">{errors.length} logged</span>
      </div>

      <form className="amc-form err-form" onSubmit={submit}>
        <label className="ef-test">
          <span>Test</span>
          <input value={form.test} onChange={(e) => set({ test: e.target.value })} placeholder="AMC 10A 2022" maxLength={120} />
        </label>
        <label className="ef-num">
          <span>#</span>
          <input type="number" inputMode="numeric" min={1} max={25} value={form.problem} onChange={(e) => set({ problem: e.target.value })} />
        </label>
        <label>
          <span>Topic</span>
          <select className="ae-select" value={form.topic} onChange={(e) => set({ topic: e.target.value })}>
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Reason</span>
          <select className="ae-select" value={form.reason} onChange={(e) => set({ reason: e.target.value })}>
            {REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ef-idea">
          <span>Key idea</span>
          <input value={form.key_idea} onChange={(e) => set({ key_idea: e.target.value })} placeholder="What would have cracked it?" maxLength={2000} />
        </label>
        <button className="btn primary sm ef-add" disabled={badProblem}>
          <Plus size={14} /> Log
        </button>
      </form>

      <div className="el-summary">
        <Counts title="By topic" list={TOPICS} counts={byTopic} active={topic} onPick={setTopic} />
        <Counts title="By reason" list={REASONS} counts={byReason} active={reason} onPick={setReason} />
      </div>

      <div className="el-filters">
        <select className="ae-select" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Filter by topic">
          <option value="">All topics</option>
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select className="ae-select" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Filter by reason">
          <option value="">All reasons</option>
          {REASONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        {(topic || reason) && (
          <button className="btn ghost sm" onClick={() => (setTopic(''), setReason(''))}>
            Clear
          </button>
        )}
        <span className="muted small">{shown.length} shown</span>
      </div>

      <div className="el-table-wrap">
        <table className="amc-table el-table">
          <thead>
            <tr>
              <th>Test</th>
              <th>#</th>
              <th>Topic</th>
              <th>Reason</th>
              <th>Key idea</th>
              <th>Redone</th>
              <th aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} className={e.redone ? 'done' : ''}>
                <td data-label="Test">
                  <span className="el-test">
                    {e.test || <span className="muted">—</span>}
                    <OpenProblem e={e} />
                  </span>
                </td>
                <td data-label="#" className="num">{e.problem ?? '—'}</td>
                <td data-label="Topic">
                  <span className={`amc-tag t-${e.topic}`}>{topicLabel(e.topic)}</span>
                </td>
                <td data-label="Reason">{reasonLabel(e.reason)}</td>
                <td data-label="Key idea" className="el-idea">{e.key_idea}</td>
                <td data-label="Redone">
                  <input type="checkbox" className="amc-check" checked={e.redone} onChange={() => amc.updateError(e.id, { redone: !e.redone })} aria-label="Redone" />
                </td>
                <td className="el-del">
                  <button className="icon-btn sm" onClick={() => amc.deleteError(e.id)} aria-label="Delete error">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <div className="dash-empty">
            <p>{errors.length ? 'Nothing matches these filters.' : 'Log every miss from timed sets and mocks.'}</p>
          </div>
        )}
      </div>

      <div className="redo-queue">
        <div className="el-counts-title">
          <RotateCcw size={13} /> Redo queue <span className="muted">· {queue.length}</span>
        </div>
        {queue.length ? (
          <ul>
            {queue.map((e) => (
              <li key={e.id}>
                <input type="checkbox" className="amc-check" checked={false} onChange={() => amc.updateError(e.id, { redone: true })} aria-label="Mark redone" />
                <span className="rq-what">
                  {e.test || 'Untitled'} {e.problem ? `#${e.problem}` : ''}
                </span>
                <OpenProblem e={e} />
                <span className={`amc-tag t-${e.topic}`}>{topicLabel(e.topic)}</span>
                {e.key_idea && <span className="rq-idea muted">{e.key_idea}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">All caught up.</p>
        )}
      </div>
    </section>
  )
}
