-- All-day blocks. Their times are stored as 00:00–24:00 so sub-blocks (timed
-- sessions inside an all-day "Conference") still fit inside the parent.
alter table public.blocks add column if not exists all_day boolean not null default false;
