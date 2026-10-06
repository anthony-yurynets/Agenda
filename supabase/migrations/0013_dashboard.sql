-- Dashboard: school assignments and exams (with a user-editable subject list),
-- quick links, and a per-block switch to keep an event out of "Coming up".

create table if not exists public.assignment_subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  color       text not null default '#3b82f6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists assignment_subjects_user_idx on public.assignment_subjects (user_id, position);

create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 200),
  kind        text not null default 'assignment' check (kind in ('assignment', 'exam')),
  status      text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  due_date    date not null,
  -- Deleting a subject leaves its assignments without one.
  subject_id  uuid references public.assignment_subjects (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists assignments_user_due_idx on public.assignments (user_id, due_date);

create or replace function public.assignments_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.subject_id is not null and not exists (
    select 1 from public.assignment_subjects s where s.id = new.subject_id and s.user_id = new.user_id
  ) then
    raise exception 'Subject not found';
  end if;
  return new;
end;
$$;
drop trigger if exists assignments_before_write on public.assignments;
create trigger assignments_before_write before insert or update on public.assignments
  for each row execute function public.assignments_before_write();

create table if not exists public.dashboard_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 80),
  url         text not null check (char_length(url) between 1 and 2000),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists dashboard_links_user_idx on public.dashboard_links (user_id, position);

-- Events you'd rather not see in the dashboard's "Coming up" (sleep, school…).
alter table public.blocks add column if not exists hide_upcoming boolean not null default false;

alter table public.assignment_subjects enable row level security;
alter table public.assignments         enable row level security;
alter table public.dashboard_links     enable row level security;

drop policy if exists "own assignment subjects" on public.assignment_subjects;
create policy "own assignment subjects" on public.assignment_subjects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own assignments" on public.assignments;
create policy "own assignments" on public.assignments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own dashboard links" on public.dashboard_links;
create policy "own dashboard links" on public.dashboard_links for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  begin alter publication supabase_realtime add table public.assignments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.assignment_subjects; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.dashboard_links; exception when duplicate_object then null; end;
end $$;
