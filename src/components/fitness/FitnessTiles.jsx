import { Dumbbell, Flame, Play, Trophy } from 'lucide-react'
import { GROUPS, MUSCLES, LEVELS, workoutStats } from '../../lib/fitness'

const DAY_LABEL = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' }

/** This week's training days as dots, plus progress toward the weekly goal. */
export function WeekTile({ days, streak, settings, onSettings, onOpenDay }) {
  const pct = Math.min(streak.thisWeek / streak.goal, 1)
  return (
    <div className="tile-inner">
      <div className="tile-head">
        <h3>This week</h3>
        <select
          className="mini-select"
          value={settings.weekly_goal}
          onChange={(e) => onSettings({ weekly_goal: Number(e.target.value) })}
          aria-label="Weekly goal"
        >
          {[3, 4, 5].map((n) => (
            <option key={n} value={n}>
              Goal {n}/wk
            </option>
          ))}
        </select>
      </div>
      <div className="week-big">
        <strong>{streak.thisWeek}</strong>
        <span className="muted">/ {streak.goal} sessions</span>
      </div>
      <div className="week-bar">
        <span style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="week-dots">
        {days.map((d) => (
          <button key={d.date} className={`wdot ${d.state}`} onClick={() => onOpenDay(d)} title={`${d.date} · ${d.state}`}>
            <span>{DAY_LABEL[d.weekday]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Weeks in a row hitting the goal (fits a weekday-only routine better than a daily streak). */
export function StreakTile({ streak }) {
  const alive = streak.streak > 0
  return (
    <div className={`tile-inner streak-tile ${alive ? 'alive' : ''}`}>
      <div className="tile-head">
        <h3>Streak</h3>
        <Flame size={16} className="streak-flame" />
      </div>
      <div className="streak-num">
        <strong>{streak.streak}</strong>
        <span>week{streak.streak === 1 ? '' : 's'}</span>
      </div>
      <p className="muted small">
        {streak.thisWeek >= streak.goal
          ? 'Goal hit this week. Keep it rolling.'
          : `${streak.goal - streak.thisWeek} more session${streak.goal - streak.thisWeek === 1 ? '' : 's'} this week to ${alive ? 'extend' : 'start'} it.`}
        {streak.best > streak.streak && ` Best: ${streak.best}.`}
      </p>
    </div>
  )
}

/** Today's plan, or a suggestion from what's recovered. */
export function TodayTile({ todayWorkout, isTrainingDay, suggestion, onStart, onOpen }) {
  const st = todayWorkout && workoutStats(todayWorkout)
  return (
    <div className="tile-inner today-tile">
      <div className="tile-head">
        <h3>Today</h3>
        <Dumbbell size={16} className="muted" />
      </div>
      {todayWorkout ? (
        <>
          <div className="today-title">{todayWorkout.title || 'Workout'}</div>
          <p className="muted small">
            {todayWorkout.exercises.length} exercises · {st.done}/{st.sets} sets done
          </p>
          <button className="btn primary sm" onClick={() => onOpen(todayWorkout.id)}>
            <Play size={13} /> {st.done ? 'Continue' : todayWorkout.status === 'done' ? 'View' : 'Start'}
          </button>
        </>
      ) : isTrainingDay ? (
        <>
          <div className="today-title">{suggestion.label} day?</div>
          <p className="muted small">Your {suggestion.hint} are the most recovered.</p>
          <button className="btn primary sm" onClick={() => onStart(suggestion)}>
            <Play size={13} /> Start {suggestion.label.toLowerCase()} workout
          </button>
        </>
      ) : (
        <>
          <div className="today-title">Rest day</div>
          <p className="muted small">Weekends are for recovery. See you Monday.</p>
        </>
      )}
    </div>
  )
}

/** Completed sets per muscle over the last 7 days (≈10–20 per week is a common target). */
export function VolumeTile({ perMuscle, rec }) {
  const rows = MUSCLES.filter((m) => perMuscle[m.id]).sort((a, b) => perMuscle[b.id] - perMuscle[a.id])
  const max = Math.max(20, ...rows.map((m) => perMuscle[m.id]))
  return (
    <div className="tile-inner">
      <div className="tile-head">
        <h3>Sets · last 7 days</h3>
        <span className="muted small">{rows.reduce((s, m) => s + perMuscle[m.id], 0)} total</span>
      </div>
      {rows.length ? (
        <ul className="vol-list">
          {rows.slice(0, 7).map((m) => (
            <li key={m.id}>
              <span className="vol-name">{m.label}</span>
              <span className="vol-bar">
                <span className={`g-${m.group}`} style={{ width: `${(perMuscle[m.id] / max) * 100}%` }} />
                <i className="vol-target" style={{ left: `${(10 / max) * 100}%`, width: `${(10 / max) * 100}%` }} />
              </span>
              <span className="vol-n">{perMuscle[m.id]}</span>
              <span className={`rec-dot rec-${rec[m.id].level}`} title={LEVELS[rec[m.id].level].label} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Completed sets show up here.</p>
      )}
      <div className="vol-groups">
        {GROUPS.map((g) => (
          <span key={g.id}>
            <i className={`g-${g.id}`} /> {g.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Best set per exercise (by estimated 1-rep max). */
export function PRTile({ prs, unit }) {
  return (
    <div className="tile-inner">
      <div className="tile-head">
        <h3>Personal records</h3>
        <Trophy size={16} className="muted" />
      </div>
      {prs.length ? (
        <ul className="pr-list">
          {prs.map((p) => (
            <li key={p.name}>
              <span className="pr-name">{p.name}</span>
              <span className="pr-set">
                {p.weight} {unit} × {p.reps}
              </span>
              <span className="muted small">
                ~{Math.round(p.score)} {unit} 1RM
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Log weight and reps to track your bests.</p>
      )}
    </div>
  )
}

