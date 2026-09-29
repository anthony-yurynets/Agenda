-- Recurring blocks.
--
-- A block with `repeat` set is a series *template*: it is never shown itself;
-- the app expands it into virtual occurrences. Editing a single occurrence
-- copies it (and its sub-blocks) into a real row with recurrence_id pointing at
-- the template row it came from and recurrence_date = the original date.
-- Deleting a single occurrence adds its date to repeat_exdates.
--
-- repeat = { "freq": "daily" | "weekly" | "monthly" | "yearly",
--            "interval": 1..99,
--            "days": ["mon", "wed", ...],   -- weekly only
--            "until": "YYYY-MM-DD" | null }

alter table public.blocks
  add column if not exists repeat          jsonb,
  add column if not exists repeat_exdates  date[] not null default '{}',
  add column if not exists recurrence_id   uuid references public.blocks (id) on delete cascade,
  add column if not exists recurrence_date date;

do $$
begin
  alter table public.blocks add constraint blocks_repeat_shape check (
    repeat is null or (
      parent_id is null
      and repeat->>'freq' in ('daily', 'weekly', 'monthly', 'yearly')
    )
  );
exception when duplicate_object then null;
end $$;

create index if not exists blocks_series_idx on public.blocks (user_id, date) where repeat is not null;
create index if not exists blocks_recurrence_idx on public.blocks (user_id, recurrence_date) where recurrence_id is not null;
create unique index if not exists blocks_one_exception_per_date
  on public.blocks (recurrence_id, recurrence_date) where recurrence_id is not null;

-- Extend the write guard: an occurrence must point at the same user's block.
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

  if new.recurrence_id is not null and not exists (
    select 1 from public.blocks b where b.id = new.recurrence_id and b.user_id = new.user_id
  ) then
    raise exception 'Series not found';
  end if;

  return new;
end;
$$;
