-- Cardio: an exercise is either strength (reps × weight) or cardio (minutes, distance).
-- Distance is in miles when the user's unit is lb, kilometres when kg.

alter table public.workout_exercises
  add column if not exists kind text not null default 'strength' check (kind in ('strength', 'cardio'));

alter table public.workout_sets
  add column if not exists minutes  numeric(6, 1) check (minutes between 0 and 1440),
  add column if not exists distance numeric(7, 2) check (distance between 0 and 10000);
