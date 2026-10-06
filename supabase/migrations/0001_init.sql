-- Agenda schema: categories, nested blocks, and personal API tokens for MCP.
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ─── Categories ────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  color       text not null default '#3b82f6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists categories_user_idx on public.categories (user_id, position);

-- ─── Blocks (recursive: a block can be divided into sub-blocks) ─────────────
create table if not exists public.blocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id    uuid references public.blocks (id) on delete cascade,
  title        text not null default '' check (char_length(title) <= 200),
  date         date not null,
  start_time   time not null,
  end_time     time not null,
  category_id  uuid references public.categories (id) on delete set null,
  status       text not null default 'planned'
               check (status in ('planned', 'in_progress', 'done', 'canceled')),
  notes        text not null default '' check (char_length(notes) <= 5000),
  source       text not null default 'user' check (source in ('user', 'ai')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint blocks_time_order check (end_time > start_time)
);

create index if not exists blocks_user_date_idx on public.blocks (user_id, date);
create index if not exists blocks_parent_idx    on public.blocks (parent_id);

-- Keep updated_at fresh and guard ownership / cycles on parent + category.
create or replace function public.blocks_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A block cannot be its own parent';
    end if;
    if not exists (
      select 1 from public.blocks b where b.id = new.parent_id and b.user_id = new.user_id
    ) then
      raise exception 'Parent block not found';
    end if;
    if tg_op = 'UPDATE' and exists (
      with recursive ancestors as (
        select b.id, b.parent_id from public.blocks b where b.id = new.parent_id
        union all
        select b.id, b.parent_id from public.blocks b join ancestors a on b.id = a.parent_id
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception 'A block cannot be nested inside its own sub-block';
    end if;
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id
  ) then
    raise exception 'Category not found';
  end if;

  return new;
end;
$$;

drop trigger if exists blocks_before_write on public.blocks;
create trigger blocks_before_write
  before insert or update on public.blocks
  for each row execute function public.blocks_before_write();

-- ─── API tokens (hashed) used by the MCP endpoint ───────────────────────────
create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  token_hash    text not null unique,
  token_prefix  text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists api_tokens_user_idx on public.api_tokens (user_id);

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.categories enable row level security;
alter table public.blocks     enable row level security;
alter table public.api_tokens enable row level security;

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "read own tokens" on public.api_tokens;
create policy "read own tokens" on public.api_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "create own tokens" on public.api_tokens;
create policy "create own tokens" on public.api_tokens
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "delete own tokens" on public.api_tokens;
create policy "delete own tokens" on public.api_tokens
  for delete to authenticated using (user_id = auth.uid());

-- ─── Realtime: stream changes so AI-created blocks appear instantly ─────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.blocks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.categories;
  exception when duplicate_object then null;
  end;
end $$;
