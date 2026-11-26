-- Per-day water goals (ARK-49). A row keyed by (user_id, local_date, single_day):
--   single_day = false  -> a goal change point: applies every day from local_date
--                           (inclusive) until the next change point.
--   single_day = true   -> a single-day exception: applies to exactly local_date
--                           (past-date corrections never propagate).
-- The composite key lets an exception share a date with a change point, e.g.
-- correcting a day that itself started a goal.
-- Existing one-per-user goals (ARK-33) carry forward from the migration day as
-- ongoing change points; days before it have no row and stay empty (ADR 11).

alter table public.water_goals
  add column local_date date,
  add column single_day boolean not null default false;

update public.water_goals
set local_date = current_date
where local_date is null;

alter table public.water_goals
  alter column local_date set not null;

alter table public.water_goals
  drop constraint water_goals_pkey;

alter table public.water_goals
  add constraint water_goals_user_date_kind_pkey
  primary key (user_id, local_date, single_day);

create index water_goals_user_local_date_idx
  on public.water_goals (user_id, local_date desc);
