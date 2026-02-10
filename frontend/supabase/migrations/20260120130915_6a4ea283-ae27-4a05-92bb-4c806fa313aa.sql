create table if not exists public.launch_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.launch_waitlist enable row level security;

drop policy if exists "launch_waitlist_insert" on public.launch_waitlist;

create policy "launch_waitlist_insert"
on public.launch_waitlist
for insert
to anon
with check (true);