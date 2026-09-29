-- Allow blocks without a status (fixed commitments like sleep or school).
alter table public.blocks drop constraint if exists blocks_status_check;
alter table public.blocks add constraint blocks_status_check
  check (status in ('planned', 'in_progress', 'done', 'canceled', 'none'));
