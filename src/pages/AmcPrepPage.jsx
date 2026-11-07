import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CalendarPlus, ChevronDown, ExternalLink, Sigma, Trophy } from 'lucide-react'
import { useAmcPrep } from '../state/useAmcPrep'
import { todayISO } from '../lib/dates'
import { fromMinutes } from '../lib/domain'
import { normalizeUrl, timelineState } from '../lib/competitions'
import {
  CHECKLIST,
  DEFAULT_TARGET,
  DEFAULT_TEST_DATE,
  PLAN,
  PLAN_END,
  PLAN_START,
  SCHEDULE,
  TOPICS,
  daysUntil,
  fmtDay,
  guessAmcCompetition,
  scoreOf,
  scoredMocks,
} from '../lib/amc'
import MockTracker from '../components/amc/MockTracker'
import ErrorLog from '../components/amc/ErrorLog'
import NotesEditor from '../components/NotesEditor'

const clock = (mins) => {
  const [h, m] = fromMinutes(mins).split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`
}

/** Countdown, target, linked competition and the latest mock. */
function Header({ amc, prep, today, onOpenCompetition }) {
  const comp = amc.competitions.find((c) => c.id === prep.competition_id)
  const suggestion = !comp ? guessAmcCompetition(amc.competitions) : null
  const days = daysUntil(today, prep.test_date)
  const graded = scoredMocks(amc.mocks)
  const latest = graded.at(-1)
  const prev = graded.at(-2)
  const delta = latest && prev ? scoreOf(latest) - scoreOf(prev) : null
  const target = Number(prep.target_score)
  const next = comp ? timelineState(comp.timeline, today).next : null

  return (
    <section className="glass-tile amc-head">
      <div className="ah-title">
        <div className="ah-icon"><Sigma size={18} /></div>
        <div className="ah-text">
          <h2>AMC 10 prep</h2>
          {comp ? (
            <div className="ah-comp">
              <Trophy size={13} />
              <button className="ah-comp-name" onClick={() => onOpenCompetition(comp.id)} title="Open in Competitions">
                {comp.name}
              </button>
              {next && <span className="muted">· {next.label} {fmtDay(next.date)}</span>}
              {normalizeUrl(comp.url) && (
                <a href={normalizeUrl(comp.url)} target="_blank" rel="noreferrer" className="icon-btn sm" aria-label="Open competition site">
                  <ExternalLink size={12} />
                </a>
              )}
              <button className="btn ghost sm ah-unlink" onClick={() => amc.savePrep({ competition_id: null })}>
                Unlink
              </button>
            </div>
          ) : (
            <div className="ah-comp">
              <span className="muted">Link your AMC entry:</span>
              <select className="ae-select ah-pick" value="" onChange={(e) => e.target.value && amc.savePrep({ competition_id: e.target.value })}>
                <option value="">{amc.competitions.length ? 'Choose a competition…' : 'No competitions tracked yet'}</option>
                {amc.competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Untitled competition'}
                  </option>
                ))}
              </select>
              {suggestion && (
                <button className="btn ghost sm" onClick={() => amc.savePrep({ competition_id: suggestion.id })}>
                  Use “{suggestion.name}”
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ah-stats">
        <div className="ah-stat ah-count">
          <span className="ah-label">{days > 0 ? 'Days until the AMC 10' : days === 0 ? 'Test day' : 'Days since the AMC 10'}</span>
          <strong>{days === 0 ? 'Today' : Math.abs(days)}</strong>
          <input
            type="date"
            value={prep.test_date ?? DEFAULT_TEST_DATE}
            onChange={(e) => e.target.value && amc.savePrep({ test_date: e.target.value })}
            aria-label="Test date"
          />
        </div>
        <div className="ah-stat">
          <span className="ah-label">Target score</span>
          <input
            className="ah-target"
            type="number"
            inputMode="decimal"
            min={0}
            max={150}
            step={1.5}
            defaultValue={target}
            key={target}
            onBlur={(e) => {
              const v = Number(e.target.value)
              amc.savePrep({ target_score: Number.isFinite(v) && v >= 0 && v <= 150 ? v : DEFAULT_TARGET })
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Target score"
          />
          <span className="ah-sub muted">out of 150</span>
        </div>
        <div className="ah-stat">
          <span className="ah-label">Latest mock</span>
          <strong className={latest && scoreOf(latest) >= target ? 'hit' : ''}>{latest ? scoreOf(latest) : '—'}</strong>
          <span className="ah-sub">
            {delta !== null ? (
              <span className={delta > 0 ? 'up' : delta < 0 ? 'down' : 'muted'}>
                {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta)} from last
              </span>
            ) : (
              <span className="muted">{latest ? latest.name : 'No graded mocks yet'}</span>
            )}
          </span>
        </div>
      </div>
    </section>
  )
}

/** The daily schedule, and the switch that puts it on the calendar as repeating blocks. */
function DailyBlocks({ store, prep, amc, today }) {
  // The calendar store only holds the visible week; pull in the whole prep window.
  const { loadRange } = store
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    Promise.resolve(loadRange(PLAN_START, PLAN_END)).finally(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [loadRange])

  const onCalendar = (prep.block_ids ?? []).filter((id) => store.blocks[id])
  const planToday = PLAN.find((p) => p.date === today)
  const firstDay = PLAN.find((p) => p.date >= today) ?? PLAN[0]
  const shown = planToday ?? firstDay

  const add = () => {
    const category_id = store.categories.find((c) => /\bamc\b/i.test(c.name))?.id ?? store.createCategory('AMC prep')
    const repeat = { freq: 'daily', interval: 1, until: PLAN_END }
    const ids = SCHEDULE.map((slot) => {
      const base = {
        date: PLAN_START,
        start: slot.start,
        end: slot.end,
        category_id,
        status: slot.rest ? 'none' : 'planned',
        notes: slot.notes ?? '',
        // Breaks and dinner would crowd the Agenda's "Coming up".
        hide_upcoming: Boolean(slot.rest),
      }
      const id = store.createBlock({ ...base, title: slot.title, repeat })
      // Each day's topic review is that one occurrence edited: it keeps its place in the series.
      if (slot.topic) {
        for (const p of PLAN) {
          store.createBlock({ ...base, date: p.date, title: p.topic, recurrence_id: id, recurrence_date: p.date })
        }
      }
      return id
    })
    amc.savePrep({ block_ids: ids })
  }
  const remove = () => {
    onCalendar.forEach((id) => store.deleteBlock(id))
    amc.savePrep({ block_ids: [] })
  }

  return (
    <section className="glass-tile amc-sched">
      <div className="tile-head">
        <h3>Daily blocks</h3>
        <span className="muted small">{fmtDay(PLAN_START)} – {fmtDay(PLAN_END)}</span>
      </div>
      <p className="sched-day small">
        {planToday ? 'Today' : today < PLAN_START ? 'Starts' : 'Last day'} · <strong>{fmtDay(shown.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
      </p>
      <ol className="sched-list">
        {SCHEDULE.map((s, i) => (
          <li key={i} className={s.rest ? 'rest' : s.topic ? 'topic' : ''}>
            <span className="sl-time">{clock(s.start)}–{clock(s.end)}</span>
            <span className="sl-title">
              {s.topic ? (
                <>
                  <span className="muted">Topic review · </span>
                  {shown.topic}
                </>
              ) : s.title.startsWith('Timed') ? (
                <>
                  <span className="muted">{s.title} · </span>
                  {shown.evening}
                </>
              ) : (
                s.title
              )}
            </span>
          </li>
        ))}
        <li className="stop">
          <span className="sl-time">11:30</span>
          <span className="sl-title">Stop</span>
        </li>
      </ol>
      <div className="sched-foot">
        {onCalendar.length ? (
          <>
            <span className="sched-on">
              <CalendarCheck size={14} /> On your calendar, every day
            </span>
            <button className="btn ghost sm danger" onClick={remove}>
              Remove
            </button>
          </>
        ) : (
          <button className="btn primary sm" onClick={add} disabled={!ready}>
            <CalendarPlus size={14} /> Add to calendar
          </button>
        )}
      </div>
    </section>
  )
}

/** A scratch notepad for anything worth jotting down, edited as Notion-style blocks. */
function Notepad({ prep, amc }) {
  return (
    <section className="glass-tile amc-plan amc-notes">
      <div className="tile-head">
        <h3>Notepad</h3>
      </div>
      <NotesEditor
        label="Notepad"
        placeholder="Jot anything down: tricks, formulas, reminders… type “/” for blocks"
        value={prep.notes ?? ''}
        maxLength={20000}
        onChange={(notes) => amc.savePrep({ notes }, { debounce: 500 })}
      />
    </section>
  )
}

/** Four collapsible topic groups with a progress bar each. */
function TopicChecklist({ prep, amc }) {
  const done = new Set(prep.topics_done ?? [])
  return (
    <section className="glass-tile amc-topics">
      <div className="tile-head">
        <h3>Topic checklist</h3>
      </div>
      <div className="tc-groups">
        {TOPICS.map((t) => {
          const items = CHECKLIST[t.id]
          const n = items.filter(([id]) => done.has(id)).length
          const pct = Math.round((n / items.length) * 100)
          return (
            <details key={t.id} className={`tc-group t-${t.id}`}>
              <summary>
                <ChevronDown size={15} className="tc-chev" />
                <span className="tc-name">{t.label}</span>
                <span className="tc-bar">
                  <i style={{ width: `${pct}%` }} />
                </span>
                <span className="tc-pct">{pct}%</span>
              </summary>
              <ul>
                {items.map(([id, label]) => (
                  <li key={id}>
                    <label>
                      <input type="checkbox" className="amc-check" checked={done.has(id)} onChange={() => amc.toggleIn('topics_done', id)} />
                      <span>{label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          )
        })}
      </div>
    </section>
  )
}

/**
 * AMC 10 → AIME prep: countdown and scores, the daily schedule (as repeating
 * calendar blocks), a notepad, mock tracker, error log and topic checklist.
 * Linked to the AMC entry in the competition tracker.
 */
export default function AmcPrepPage({ session, store, toast, onOpenCompetition }) {
  const amc = useAmcPrep(session.user.id, { onError: (m) => toast(m, 'error') })
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000)
    return () => clearInterval(t)
  }, [])
  const prep = amc.prep
  const target = useMemo(() => Number(prep?.target_score ?? DEFAULT_TARGET), [prep?.target_score])

  if (!prep) {
    return amc.loading ? (
      <div className="boot">
        <div className="spinner" />
      </div>
    ) : (
      <section className="panel blank-page">
        <div className="blank-page-inner">
          <Sigma size={22} />
          <h2>AMC Prep isn’t set up</h2>
          <p className="muted">Run supabase/migrations/0014_amc_prep.sql in the Supabase SQL editor, then reload.</p>
        </div>
      </section>
    )
  }

  return (
    <div className="amc">
      <div className="amc-grid">
        <Header amc={amc} prep={prep} today={today} onOpenCompetition={onOpenCompetition} />
        <Notepad prep={prep} amc={amc} />
        <DailyBlocks store={store} prep={prep} amc={amc} today={today} />
        <MockTracker amc={amc} target={target} today={today} />
        <TopicChecklist prep={prep} amc={amc} />
        <ErrorLog amc={amc} />
      </div>
    </div>
  )
}
