-- Competition tracker: competitions plus a user-editable list of submission
-- item options (e.g. "Research paper", "Demo video") that competitions pick from.
-- timeline is a JSON array of stages: [{ "label": "Stage 1", "date": "2026-10-01", "end": "2026-10-10"? }].

create table if not exists public.competition_options (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists competition_options_user_idx on public.competition_options (user_id, position);

create table if not exists public.competitions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null default '' check (char_length(name) <= 200),
  url               text not null default '' check (char_length(url) <= 2000),
  description       text not null default '' check (char_length(description) <= 4000),
  prestige          int check (prestige between 1 and 10),
  category          text not null default 'other' check (category in ('research', 'software', 'innovation', 'engineering', 'other')),
  submission_items  uuid[] not null default '{}',
  timeline          jsonb not null default '[]' check (jsonb_typeof(timeline) = 'array'),
  source            text not null default 'user' check (source in ('user', 'ai')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists competitions_user_idx on public.competitions (user_id, created_at desc);

create or replace function public.competitions_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists competitions_before_write on public.competitions;
create trigger competitions_before_write before insert or update on public.competitions
  for each row execute function public.competitions_before_write();

-- Deleting an option removes it from every competition that used it.
create or replace function public.competition_options_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.competitions
     set submission_items = array_remove(submission_items, old.id)
   where user_id = old.user_id and old.id = any (submission_items);
  return old;
end;
$$;
drop trigger if exists competition_options_after_delete on public.competition_options;
create trigger competition_options_after_delete after delete on public.competition_options
  for each row execute function public.competition_options_after_delete();

alter table public.competitions        enable row level security;
alter table public.competition_options enable row level security;

drop policy if exists "own competitions" on public.competitions;
create policy "own competitions" on public.competitions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own competition options" on public.competition_options;
create policy "own competition options" on public.competition_options for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Live updates (e.g. your AI adding a competition while the page is open).
do $$
begin
  begin alter publication supabase_realtime add table public.competitions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.competition_options; exception when duplicate_object then null; end;
end $$;
