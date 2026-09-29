-- Sharing: editor links (edit my calendar without logging in) and booking links
-- (pick a time inside my bookable blocks; expires after N uses).
--
-- Guests never talk to these tables directly: the /api/share and /api/book
-- serverless functions validate the token and act on the owner's behalf.

-- Blocks people can book time inside of.
alter table public.blocks add column if not exists bookable boolean not null default false;

-- Where a block came from: the owner, the AI (MCP), a shared editor, or a booking.
alter table public.blocks drop constraint if exists blocks_source_check;
alter table public.blocks add constraint blocks_source_check
  check (source in ('user', 'ai', 'shared', 'booking'));

create table if not exists public.share_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('edit', 'booking')),
  token         text not null unique check (char_length(token) >= 24),
  name          text not null default '' check (char_length(name) <= 80),
  -- booking links only
  slot_minutes  int check (slot_minutes between 5 and 480),
  max_uses      int check (max_uses between 1 and 1000),
  uses          int not null default 0,
  timezone      text not null default 'UTC',
  expires_at    timestamptz,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint share_links_booking_fields check (kind <> 'booking' or slot_minutes is not null)
);

create index if not exists share_links_user_idx on public.share_links (user_id, created_at desc);

alter table public.share_links enable row level security;

drop policy if exists "own share links" on public.share_links;
create policy "own share links" on public.share_links
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Atomically consume one use of a booking link. Returns false when it's used up,
-- revoked or expired. Only the server (service role) may call it.
create or replace function public.claim_share_use(p_link uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  update public.share_links
     set uses = uses + 1, last_used_at = now()
   where id = p_link
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses < max_uses)
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

revoke all on function public.claim_share_use(uuid) from public, anon, authenticated;
grant execute on function public.claim_share_use(uuid) to service_role;

-- Give a use back (e.g. the booking failed after claiming).
create or replace function public.release_share_use(p_link uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.share_links set uses = greatest(uses - 1, 0) where id = p_link;
$$;

revoke all on function public.release_share_use(uuid) from public, anon, authenticated;
grant execute on function public.release_share_use(uuid) to service_role;

do $$
begin
  begin
    alter publication supabase_realtime add table public.share_links;
  exception when duplicate_object then null;
  end;
end $$;
