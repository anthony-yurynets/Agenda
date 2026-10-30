-- Files: uploads that only one account can see and manage (the Files page).
-- Each file has its own link (/f/<token>) that opens it for anyone holding it,
-- served by /api/file. Rotating the token turns the old link off.
--
-- The owner's email is hard-coded here and in src/lib/files.js.

create table if not exists public.shared_files (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 255),
  path        text not null unique,
  mime        text not null default 'application/octet-stream',
  size        bigint not null default 0,
  token       text not null unique check (char_length(token) >= 24),
  created_at  timestamptz not null default now()
);
create index if not exists shared_files_user_idx on public.shared_files (user_id, created_at desc);

alter table public.shared_files enable row level security;
drop policy if exists "files owner" on public.shared_files;
create policy "files owner" on public.shared_files for all to authenticated
  using (user_id = auth.uid() and auth.jwt() ->> 'email' = 'toha.yurynets@gmail.com')
  with check (user_id = auth.uid() and auth.jwt() ->> 'email' = 'toha.yurynets@gmail.com');

-- Private bucket: guests only ever get short-lived signed URLs from /api/file.
insert into storage.buckets (id, name, public)
values ('shared-files', 'shared-files', false)
on conflict (id) do nothing;

drop policy if exists "files owner objects" on storage.objects;
create policy "files owner objects" on storage.objects for all to authenticated
  using (bucket_id = 'shared-files' and auth.jwt() ->> 'email' = 'toha.yurynets@gmail.com'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'shared-files' and auth.jwt() ->> 'email' = 'toha.yurynets@gmail.com'
              and (storage.foldername(name))[1] = auth.uid()::text);
