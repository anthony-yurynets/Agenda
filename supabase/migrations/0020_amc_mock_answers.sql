-- AMC mock review: a mock is matched to a real test (test_id is a file in
-- public/amc/, e.g. '2024-10B'), and answers holds what was put on each
-- problem, keyed by problem number:
--   { "7": { "pick": "C" | "blank", "key": "D", "note": "…", "reason": "careless", "topic": "geometry" } }
-- key, reason and topic are only stored when they differ from the dataset.
-- Error log rows made from a mock point back at it (one per problem); deleting
-- the mock keeps them.

alter table public.amc_mocks
  add column if not exists test_id text check (char_length(test_id) <= 40),
  add column if not exists answers jsonb not null default '{}'::jsonb;

alter table public.amc_errors
  add column if not exists mock_id uuid references public.amc_mocks (id) on delete set null;

create unique index if not exists amc_errors_mock_problem_idx on public.amc_errors (mock_id, problem) where mock_id is not null;
