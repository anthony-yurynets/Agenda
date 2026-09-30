import { useEffect, useMemo, useState } from 'react'
import { useFitness, localToday } from '../state/useFitness'
import { addDays, personalRecords, recovery, setsPerMuscle, suggestGroup, weekDays, weekStreak, weekdayOf } from '../lib/fitness'
import BodyMap from '../components/fitness/BodyMap'
import WorkoutLog from '../components/fitness/WorkoutLog'
import WorkoutPanel from '../components/fitness/WorkoutPanel'
import { PRTile, StreakTile, TodayTile, VolumeTile, WeekTile } from '../components/fitness/FitnessTiles'

/** Fitness: recovery body map, workout log, and weekly progress in a bento grid. */
export default function FitnessPage({ session, toast }) {
  const fit = useFitness(session.user.id, { onError: (m) => toast(m, 'error') })
  const { workouts, settings } = fit
  const unit = settings.unit
  const today = localToday()

  // Recovery keeps changing with time; refresh it every few minutes.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  const rec = useMemo(() => recovery(workouts, now), [workouts, now])
  const streak = useMemo(() => weekStreak(workouts, settings.weekly_goal, today), [workouts, settings.weekly_goal, today])
  const days = useMemo(() => weekDays(workouts, today, settings.training_days), [workouts, today, settings.training_days])
  const perMuscle = useMemo(() => setsPerMuscle(workouts, addDays(today, -6)), [workouts, today])
  const prs = useMemo(() => personalRecords(workouts, 5), [workouts])
  const suggestion = useMemo(() => suggestGroup(rec), [rec])

  const [muscle, setMuscle] = useState(null)
  const [openId, setOpenId] = useState(null)
  const open = openId ? workouts.find((w) => w.id === openId) : null
  const todayWorkout = workouts.find((w) => w.date === today && w.status !== 'skipped')

  const newWorkout = (fields = {}) => setOpenId(fit.createWorkout({ date: today, ...fields }))

  return (
    <div className="fitness">
      <div className="bento">
        <section className="tile t-body glass-tile">
          <BodyMap rec={rec} selected={muscle} onSelect={setMuscle} />
        </section>
        <section className="tile t-week glass-tile">
          <WeekTile
            days={days}
            streak={streak}
            settings={settings}
            onSettings={fit.saveSettings}
            onOpenDay={(d) => (d.workout ? setOpenId(d.workout.id) : d.date >= today && newWorkout({ date: d.date }))}
          />
        </section>
        <section className="tile t-streak glass-tile">
          <StreakTile streak={streak} />
        </section>
        <section className="tile t-today glass-tile">
          <TodayTile
            todayWorkout={todayWorkout}
            isTrainingDay={settings.training_days.includes(weekdayOf(today))}
            suggestion={suggestion}
            onOpen={setOpenId}
            onStart={(g) => newWorkout({ title: `${g.label} day` })}
          />
        </section>
        <section className="tile t-volume glass-tile">
          <VolumeTile perMuscle={perMuscle} rec={rec} />
        </section>
        <section className="tile t-prs glass-tile">
          <PRTile prs={prs} unit={unit} />
        </section>
        <section className="tile t-log glass-tile">
          <WorkoutLog
            workouts={workouts}
            today={today}
            selectedId={openId}
            onOpen={setOpenId}
            onNew={() => newWorkout()}
            unit={unit}
            onUnit={(u) => fit.saveSettings({ unit: u })}
          />
        </section>
      </div>

      {open && <WorkoutPanel key={open.id} workout={open} workouts={workouts} fit={fit} unit={unit} onClose={() => setOpenId(null)} toast={toast} />}
    </div>
  )
}
