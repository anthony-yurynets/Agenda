-- AMC prep: one settings row per user (linked to their AMC entry in the
-- competition tracker), mock test scores, and an error log.
-- plan_done holds the plan dates ticked off; topics_done the checklist item ids
-- (see src/lib/amc.js); block_ids the calendar series the page created.

create table if not exists public.amc_prep (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Deleting the competition just unlinks it.
  competition_id  uuid references public.competitions (id) on delete set null,
  test_date       date not null default '2026-11-10',
  target_score    numeric(4, 1) not null default 105 check (target_score between 0 and 150),
  plan_done       date[] not null default '{}',
  topics_done     text[] not null default '{}',
  block_ids       uuid[] not null default '{}',
  updated_at      timestamptz not null default now()
);

create table if not exists public.amc_mocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 120),
  date        date not null,
  -- Null until the test is graded.
  correct     int check (correct between 0 and 25),
  blank       int check (blank between 0 and 25),
  wrong       int check (wrong between 0 and 25),
  created_at  timestamptz not null default now(),
  constraint amc_mocks_total check (coalesce(correct, 0) + coalesce(blank, 0) + coalesce(wrong, 0) <= 25)
);
create index if not exists amc_mocks_user_date_idx on public.amc_mocks (user_id, date);

create table if not exists public.amc_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  test        text not null default '' check (char_length(test) <= 120),
  problem     int check (problem between 1 and 25),
  topic       text not null default 'algebra' check (topic in ('algebra', 'counting', 'number_theory', 'geometry')),
  reason      text not null default 'concept' check (reason in ('concept', 'careless', 'time', 'misread')),
  key_idea    text not null default '' check (char_length(key_idea) <= 2000),
  redone      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists amc_errors_user_idx on public.amc_errors (user_id, created_at desc);

create or replace function public.amc_prep_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.competition_id is not null and not exists (
    select 1 from public.competitions c where c.id = new.competition_id and c.user_id = new.user_id
  ) then
    raise exception 'Competition not found';
  end if;
  return new;
end;
$$;
drop trigger if exists amc_prep_before_write on public.amc_prep;
create trigger amc_prep_before_write before insert or update on public.amc_prep
  for each row execute function public.amc_prep_before_write();

alter table public.amc_prep   enable row level security;
alter table public.amc_mocks  enable row level security;
alter table public.amc_errors enable row level security;

drop policy if exists "own amc prep" on public.amc_prep;
create policy "own amc prep" on public.amc_prep for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own amc mocks" on public.amc_mocks;
create policy "own amc mocks" on public.amc_mocks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own amc errors" on public.amc_errors;
create policy "own amc errors" on public.amc_errors for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  begin alter publication supabase_realtime add table public.amc_prep; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.amc_mocks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.amc_errors; exception when duplicate_object then null; end;
end $$;
