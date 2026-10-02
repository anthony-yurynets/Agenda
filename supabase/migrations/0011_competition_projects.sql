-- "Are we doing this?" for competitions. The answer is one of the user's
-- projects (yes — entering with that project), 'maybe', 'no', or unset.
-- Stored as project_id (doing) or decision (maybe/no), never both.

create table if not exists public.competition_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists competition_projects_user_idx on public.competition_projects (user_id, position);

alter table public.competitions add column if not exists decision text check (decision in ('maybe', 'no'));
-- Deleting a project sends its competitions back to undecided.
alter table public.competitions add column if not exists project_id uuid references public.competition_projects (id) on delete set null;
alter table public.competitions drop constraint if exists competitions_one_answer;
alter table public.competitions add constraint competitions_one_answer check (project_id is null or decision is null);

-- A competition can only point at the same user's project.
create or replace function public.competitions_check_project()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.competition_projects p where p.id = new.project_id and p.user_id = new.user_id
  ) then
    raise exception 'Project not found';
  end if;
  return new;
end;
$$;
drop trigger if exists competitions_check_project on public.competitions;
create trigger competitions_check_project before insert or update of project_id on public.competitions
  for each row execute function public.competitions_check_project();

alter table public.competition_projects enable row level security;
drop policy if exists "own competition projects" on public.competition_projects;
create policy "own competition projects" on public.competition_projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  begin alter publication supabase_realtime add table public.competition_projects; exception when duplicate_object then null; end;
end $$;
