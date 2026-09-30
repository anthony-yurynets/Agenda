-- Per-link tool access: an edit link only opens the tools (pages) listed here.
-- Existing links keep calendar access.
alter table public.share_links add column if not exists tools text[] not null default '{calendar}';

-- The widget functions act on the calendar, so an edit link needs calendar access.
create or replace function public.widget_owner(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.share_links
   where token = p_token
     and (kind = 'embed' or (kind = 'edit' and 'calendar' = any(tools)))
     and revoked_at is null
     and (expires_at is null or expires_at > now())
$$;

revoke all on function public.widget_owner(text) from public, anon, authenticated;
