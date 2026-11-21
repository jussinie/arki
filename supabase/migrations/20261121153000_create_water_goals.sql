-- Daily water goal (ARK-33). One row per user, changed only by an explicit write.
-- This is a setting, not a log, so it has no local_date. Setting it is a
-- naturally idempotent write keyed by user_id (ADR 8).

create table public.water_goals (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  goal_ml integer not null check (goal_ml between 100 and 10000)
);

alter table public.water_goals enable row level security;

create policy "Users can select their own water goal"
  on public.water_goals
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can insert their own water goal"
  on public.water_goals
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can update their own water goal"
  on public.water_goals
  for update
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id)
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can delete their own water goal"
  on public.water_goals
  for delete
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);
