-- Per-block productivity score (Settings → Rate productivity).
-- 1–10 = rated, 0 = skipped, null = not rated yet.
alter table public.blocks add column if not exists productivity_rating smallint
  check (productivity_rating between 0 and 10);
