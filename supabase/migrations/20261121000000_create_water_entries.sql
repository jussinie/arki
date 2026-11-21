-- Water log schema (ARK-9): explicit local_date (ADR 7), client operation ID (ADR 8),
-- and deny-by-default Row-Level Security (ADR 2).

create table public.water_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount_ml integer not null check (amount_ml between 1 and 5000),
  local_date date not null,
  logged_at timestamptz not null default now()
);

create index water_entries_user_local_date_idx
  on public.water_entries (user_id, local_date, logged_at);

alter table public.water_entries enable row level security;

create policy "Users can select their own water entries"
  on public.water_entries
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can insert their own water entries"
  on public.water_entries
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can delete their own water entries"
  on public.water_entries
  for delete
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);
