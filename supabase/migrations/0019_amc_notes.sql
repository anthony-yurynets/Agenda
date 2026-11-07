-- AMC prep notepad: free-form Notion-style notes (Markdown text, see src/lib/notes.js)
-- in place of the 30-day plan table on the page.

alter table public.amc_prep
  add column if not exists notes text not null default '' check (char_length(notes) <= 20000);
