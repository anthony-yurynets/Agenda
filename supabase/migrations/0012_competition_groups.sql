-- Competition groups: named collections of competitions (a competition can be
-- in several). Each group can have read-only share links ('group' kind,
-- /g/<token>) served by /api/group.

create table if not exists public.competition_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists competition_groups_user_idx on public.competition_groups (user_id, position);

alter table public.competitions add column if not exists group_ids uuid[] not null default '{}';

-- Deleting a group removes it from every competition in it.
create or replace function public.competition_groups_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.competitions
     set group_ids = array_remove(group_ids, old.id)
   where user_id = old.user_id and old.id = any (group_ids);
  return old;
end;
$$;
drop trigger if exists competition_groups_after_delete on public.competition_groups;
create trigger competition_groups_after_delete after delete on public.competition_groups
  for each row execute function public.competition_groups_after_delete();

alter table public.competition_groups enable row level security;
drop policy if exists "own competition groups" on public.competition_groups;
create policy "own competition groups" on public.competition_groups for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Group share links. Deleting a group turns its links off.
alter table public.share_links add column if not exists group_id uuid references public.competition_groups (id) on delete cascade;
alter table public.share_links drop constraint if exists share_links_kind_check;
alter table public.share_links add constraint share_links_kind_check
  check (kind in ('edit', 'booking', 'embed', 'group'));
alter table public.share_links drop constraint if exists share_links_group_fields;
alter table public.share_links add constraint share_links_group_fields
  check ((kind = 'group') = (group_id is not null));

-- A link can only point at the same user's group.
create or replace function public.share_links_check_group()
returns trigger
language plpgsql
as $$
begin
  if new.group_id is not null and not exists (
    select 1 from public.competition_groups g where g.id = new.group_id and g.user_id = new.user_id
  ) then
    raise exception 'Group not found';
  end if;
  return new;
end;
$$;
drop trigger if exists share_links_check_group on public.share_links;
create trigger share_links_check_group before insert or update of group_id on public.share_links
  for each row execute function public.share_links_check_group();

do $$
begin
  begin alter publication supabase_realtime add table public.competition_groups; exception when duplicate_object then null; end;
end $$;
