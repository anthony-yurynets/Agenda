-- Competition links: one 'group' link (/g/<token>) can open several groups,
-- with view or edit access, without signing in. /api/group serves them.
-- Replaces the single group_id with group_ids (existing links keep their group).

alter table public.share_links add column if not exists group_ids uuid[] not null default '{}';
alter table public.share_links add column if not exists access text not null default 'view';
alter table public.share_links drop constraint if exists share_links_access_check;
alter table public.share_links add constraint share_links_access_check check (access in ('view', 'edit'));

alter table public.share_links drop constraint if exists share_links_group_fields;
update public.share_links
   set group_ids = array[group_id], group_id = null
 where group_id is not null;
alter table public.share_links add constraint share_links_group_fields
  check ((kind = 'group') = (cardinality(group_ids) > 0));

-- A link can only open the same user's groups.
create or replace function public.share_links_check_group()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from unnest(new.group_ids) as g(id)
     where not exists (select 1 from public.competition_groups cg where cg.id = g.id and cg.user_id = new.user_id)
  ) then
    raise exception 'Group not found';
  end if;
  return new;
end;
$$;
drop trigger if exists share_links_check_group on public.share_links;
create trigger share_links_check_group before insert or update of group_ids on public.share_links
  for each row execute function public.share_links_check_group();

-- Deleting a group removes it from competitions and links; a link left with
-- no groups is turned off.
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
  delete from public.share_links
   where user_id = old.user_id and kind = 'group' and group_ids = array[old.id];
  update public.share_links
     set group_ids = array_remove(group_ids, old.id)
   where user_id = old.user_id and old.id = any (group_ids);
  return old;
end;
$$;

-- Competitions added through an edit link.
alter table public.competitions drop constraint if exists competitions_source_check;
alter table public.competitions add constraint competitions_source_check check (source in ('user', 'ai', 'shared'));
