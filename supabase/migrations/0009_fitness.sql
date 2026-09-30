-- Fitness: workouts → exercises (tagged with muscles) → sets.
-- Muscle ids match react-muscle-highlighter slugs (see src/lib/fitness.js).

create table if not exists public.workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null default '' check (char_length(title) <= 120),
  date          date not null,
  status        text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  notes         text not null default '' check (char_length(notes) <= 4000),
  source        text not null default 'user' check (source in ('user', 'ai')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists workouts_user_date_idx on public.workouts (user_id, date desc);

create table if not exists public.workout_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id  uuid not null references public.workouts (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 120),
  muscles     text[] not null default '{}',
  position    int not null default 0,
  notes       text not null default '' check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now()
);
create index if not exists workout_exercises_workout_idx on public.workout_exercises (workout_id, position);

create table if not exists public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id  uuid not null references public.workout_exercises (id) on delete cascade,
  position     int not null default 0,
  reps         int check (reps between 0 and 1000),
  weight       numeric(7, 2) check (weight between 0 and 10000),
  done         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists workout_sets_exercise_idx on public.workout_sets (exercise_id, position);

create table if not exists public.fitness_settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  unit           text not null default 'lb' check (unit in ('lb', 'kg')),
  weekly_goal    int not null default 4 check (weekly_goal between 1 and 7),
  training_days  text[] not null default '{mon,tue,wed,thu,fri}',
  timezone       text,  -- set by the app, so the AI knows the user's "today"
  updated_at     timestamptz not null default now()
);

alter table public.fitness_settings add column if not exists timezone text;

-- Children must belong to the same user as their parent.
create or replace function public.fitness_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'workouts' then
    new.updated_at := now();
    if new.status = 'done' and new.completed_at is null then new.completed_at := now(); end if;
    if new.status <> 'done' then new.completed_at := null; end if;
  elsif tg_table_name = 'workout_exercises' then
    if not exists (select 1 from public.workouts w where w.id = new.workout_id and w.user_id = new.user_id) then
      raise exception 'Workout not found';
    end if;
  elsif tg_table_name = 'workout_sets' then
    if not exists (select 1 from public.workout_exercises e where e.id = new.exercise_id and e.user_id = new.user_id) then
      raise exception 'Exercise not found';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workouts_before_write on public.workouts;
create trigger workouts_before_write before insert or update on public.workouts
  for each row execute function public.fitness_before_write();
drop trigger if exists workout_exercises_before_write on public.workout_exercises;
create trigger workout_exercises_before_write before insert or update on public.workout_exercises
  for each row execute function public.fitness_before_write();
drop trigger if exists workout_sets_before_write on public.workout_sets;
create trigger workout_sets_before_write before insert or update on public.workout_sets
  for each row execute function public.fitness_before_write();

alter table public.workouts          enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets      enable row level security;
alter table public.fitness_settings  enable row level security;

drop policy if exists "own workouts" on public.workouts;
create policy "own workouts" on public.workouts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own workout exercises" on public.workout_exercises;
create policy "own workout exercises" on public.workout_exercises for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own workout sets" on public.workout_sets;
create policy "own workout sets" on public.workout_sets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own fitness settings" on public.fitness_settings;
create policy "own fitness settings" on public.fitness_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Live updates (e.g. your AI creating a workout while the page is open).
do $$
begin
  begin alter publication supabase_realtime add table public.workouts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.workout_exercises; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.workout_sets; exception when duplicate_object then null; end;
end $$;
