import { useMemo, useState } from 'react'
import { Bot, Check, Flag, HeartPulse, Plus, Trash2, X } from 'lucide-react'
import { GROUPS, MUSCLES, MUSCLE_BY_ID, distanceUnit, isCardio, muscleLabel } from '../../lib/fitness'

const STATUSES = [
  { id: 'planned', label: 'Planned' },
  { id: 'done', label: 'Done' },
  { id: 'skipped', label: 'Skipped' },
]

/** "3 × 8 @ 135" (or "30 min · 3.1 mi" for cardio) summary of an exercise's completed sets. */
function summarize(ex, unit) {
  const sets = ex.sets
  if (isCardio(ex)) {
    const done = sets.filter((s) => s.done && (s.minutes || s.distance))
    if (!done.length) return null
    const min = done.reduce((t, s) => t + (Number(s.minutes) || 0), 0)
    const dist = done.reduce((t, s) => t + (Number(s.distance) || 0), 0)
    return [min && `${+min.toFixed(1)} min`, dist && `${+dist.toFixed(2)} ${distanceUnit(unit)}`].filter(Boolean).join(' · ')
  }
  const done = sets.filter((s) => s.done && s.reps)
  if (!done.length) return null
  const top = done.reduce((a, b) => ((Number(b.weight) || 0) > (Number(a.weight) || 0) ? b : a))
  return `${done.length} × ${top.reps}${top.weight ? ` @ ${Number(top.weight)} ${unit}` : ''}`
}

function MusclePicker({ value, onChange, optional }) {
  const [open, setOpen] = useState(false)
  const toggle = (id) => onChange(value.includes(id) ? value.filter((m) => m !== id) : [...value, id])
  return (
    <div className="muscle-picker">
      <div className="mchips">
        {value.map((m, i) => (
          <button key={m} className={`mchip g-${MUSCLE_BY_ID[m]?.group}`} onClick={() => toggle(m)} title={i === 0 ? 'Primary muscle · click to remove' : 'Click to remove'}>
            {muscleLabel(m)}
            {i === 0 && value.length > 1 && <small> · main</small>}
          </button>
        ))}
        <button className="mchip add" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Plus size={11} /> Muscle
        </button>
      </div>
      {open && (
        <div className="muscle-grid">
          {GROUPS.map((g) => (
            <div key={g.id}>
              <span className="field-label">{g.label}</span>
              <div className="chips">
                {MUSCLES.filter((m) => m.group === g.id).map((m) => (
                  <button key={m.id} className={`chip ${value.includes(m.id) ? 'on' : ''}`} onClick={() => toggle(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="muted small">
            {optional ? 'Optional for cardio. ' : ''}The first muscle is the main one; others count half toward recovery.
          </p>
        </div>
      )}
    </div>
  )
}

function ExerciseCard({ ex, fit, unit, lastTime }) {
  const num = (v) => (v === '' ? null : Number(v))
  const cardio = isCardio(ex)
  // Strength sets log reps × weight; cardio intervals log minutes and distance.
  const [a, b] = cardio ? ['minutes', 'distance'] : ['reps', 'weight']
  return (
    <div className={`ex-card ${cardio ? 'cardio' : ''}`}>
      <div className="ex-head">
        {cardio && <HeartPulse size={15} className="ex-kind" aria-label="Cardio" />}
        <input
          className="ex-name"
          placeholder={cardio ? 'Cardio (e.g. Run, Bike, Rower)' : 'Exercise (e.g. Bench press)'}
          value={ex.name}
          maxLength={120}
          onChange={(e) => fit.updateExercise(ex.id, { name: e.target.value }, { debounce: 400 })}
        />
        <button className="icon-btn sm" onClick={() => fit.deleteExercise(ex.id)} aria-label="Remove exercise">
          <Trash2 size={14} />
        </button>
      </div>
      <MusclePicker optional={cardio} value={ex.muscles ?? []} onChange={(muscles) => fit.updateExercise(ex.id, { muscles })} />
      {lastTime && <div className="ex-last muted small">Last time: {lastTime}</div>}

      <div className="set-table" role="table">
        <div className="set-row head" role="row">
          <span>{cardio ? '#' : 'Set'}</span>
          <span>{cardio ? 'Min' : 'Reps'}</span>
          <span>{cardio ? distanceUnit(unit) : unit}</span>
          <span />
          <span />
        </div>
        {ex.sets.map((s, i) => (
          <div key={s.id} className={`set-row ${s.done ? 'is-done' : ''}`} role="row">
            <span className="set-n">{i + 1}</span>
            <input
              type="number"
              inputMode={cardio ? 'decimal' : 'numeric'}
              min={0}
              placeholder="–"
              value={s[a] ?? ''}
              onChange={(e) => fit.updateSet(s.id, { [a]: num(e.target.value) }, { debounce: 350 })}
            />
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={cardio ? '0.1' : '0.5'}
              placeholder="–"
              value={s[b] ?? ''}
              onChange={(e) => fit.updateSet(s.id, { [b]: num(e.target.value) }, { debounce: 350 })}
            />
            <button className={`set-check ${s.done ? 'on' : ''}`} onClick={() => fit.updateSet(s.id, { done: !s.done })} aria-pressed={s.done} aria-label={cardio ? 'Interval done' : 'Set done'}>
              <Check size={14} />
            </button>
            <button className="icon-btn sm" onClick={() => fit.deleteSet(s.id)} aria-label={cardio ? 'Remove interval' : 'Remove set'}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn ghost sm add-set" onClick={() => fit.addSet(ex.id)}>
        <Plus size={13} /> {cardio ? 'Add interval' : 'Add set'}
      </button>
    </div>
  )
}

/** Edit and log one workout. */
export default function WorkoutPanel({ workout: w, workouts, fit, unit, onClose, toast }) {
  // Most recent earlier performance of each exercise, by name.
  const lastTimes = useMemo(() => {
    const out = {}
    for (const ex of w.exercises) {
      const key = ex.name.trim().toLowerCase()
      if (!key) continue
      const prev = workouts
        .filter((o) => o.id !== w.id && o.date <= w.date)
        .flatMap((o) => o.exercises.filter((e) => e.name.trim().toLowerCase() === key && isCardio(e) === isCardio(ex)))
        .find((e) => summarize(e, unit))
      if (prev) out[ex.id] = summarize(prev, unit)
    }
    return out
  }, [w, workouts, unit])

  return (
    <aside className="fit-panel" aria-label="Workout">
      <div className="bp-head">
        <input className="wk-date-input" type="date" value={w.date} onChange={(e) => e.target.value && fit.updateWorkout(w.id, { date: e.target.value })} />
        {w.source === 'ai' && (
          <span className="ai-badge">
            <Bot size={13} /> From your AI
          </span>
        )}
        <span className="flex1" />
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="bp-scroll">
        <input
          className="wk-title-input"
          placeholder="Workout name (e.g. Push day)"
          value={w.title}
          maxLength={120}
          onChange={(e) => fit.updateWorkout(w.id, { title: e.target.value }, { debounce: 400 })}
        />
        <div className="chips">
          {STATUSES.map((s) => (
            <button key={s.id} className={`chip wk-status-chip st-${s.id} ${w.status === s.id ? 'on' : ''}`} onClick={() => fit.setWorkoutStatus(w.id, s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        {w.exercises.map((ex) => (
          <ExerciseCard key={ex.id} ex={ex} fit={fit} unit={unit} lastTime={lastTimes[ex.id]} />
        ))}
        <div className="add-exercise-row">
          <button className="btn ghost add-exercise" onClick={() => fit.addExercise(w.id)}>
            <Plus size={15} /> Add exercise
          </button>
          <button className="btn ghost add-exercise" onClick={() => fit.addExercise(w.id, { kind: 'cardio' })}>
            <HeartPulse size={15} /> Add cardio
          </button>
        </div>

        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            className="notes"
            rows={3}
            placeholder="How did it feel?"
            value={w.notes}
            maxLength={4000}
            onChange={(e) => fit.updateWorkout(w.id, { notes: e.target.value }, { debounce: 500 })}
          />
        </label>
      </div>

      <div className="bp-foot">
        <button
          className="btn ghost danger"
          onClick={() => {
            fit.deleteWorkout(w.id)
            toast('Workout deleted')
            onClose()
          }}
        >
          <Trash2 size={15} /> Delete
        </button>
        <span className="flex1" />
        {w.status !== 'done' && (
          <button
            className="btn primary"
            onClick={() => {
              fit.setWorkoutStatus(w.id, 'done')
              toast('Workout complete — nice work')
            }}
          >
            <Flag size={15} /> Finish workout
          </button>
        )}
      </div>
    </aside>
  )
}
