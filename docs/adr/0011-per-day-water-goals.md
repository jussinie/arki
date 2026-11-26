# ADR 11: Per-day water goals with change points and single-day exceptions

**Status:** Proposed
**Date:** 2026-11-26

## Context

ARK-33 stored one water goal per user (`water_goals(user_id pk, goal_ml)`), edited inline on the Water page. ARK-49 moves goal editing to Settings and requires goals to vary by day: a goal set for today or a future date applies every day from that date until the next change, earlier days keep their goals, and a goal set for a past date affects only that date. Days that no goal covers stay empty rather than falling back to a default.

## Decision

`water_goals` stores one row per goal entry, keyed `(user_id, local_date, single_day)`:

- `single_day = false` — a **change point**: the goal applies from `local_date` (inclusive) until the next change point.
- `single_day = true` — a **single-day exception**: the goal applies to exactly `local_date`, never propagating to other days.

The client resolves a day's goal from the user's rows with the pure function `resolveWaterGoalMl` (`src/features/water/model/`): an exception on that date wins, else the latest change point on or before the date applies, else the day has no goal. The composite key lets an exception share a date with a change point (correcting a day that itself started a goal) without erasing the range behind it.

Goal writes remain single-row upserts with RLS (ADR 2) — naturally idempotent set-value writes that need no client operation ID (ADR 8) and no RPC (ADR 4 covers only coupled multi-row writes). The Water page only displays the resolved goal; editing lives in Settings, where the chosen date decides the kind: today or future → change point, past → exception. `local_date` is chosen in the UI and stored explicitly, extending ADR 7 from logs to this day-keyed setting.

The migration backfills each existing one-per-user goal as a change point starting on the migration day (`current_date`): existing goals are preserved going forward, and earlier days — which had no per-day goal — stay empty unless the user adds one. This backfill runs once per environment and cannot be exercised by `db:reset` (which rebuilds from an empty database).

## Consequences

- \+ Each day can carry its own goal; history is never rewritten by a later change.
- \+ Past-date corrections stay isolated as explicit exceptions.
- \+ One small, owner-scoped table; reads fetch all rows once and resolve client-side.
- − Two row kinds in one table (`single_day` flag) — the flag must be respected by every reader/writer.
- − Days before the first change point show no goal; there is no default goal anymore (previously 2 L).
- − The migration date, not a user-chosen date, starts pre-existing goals (ADR 7 is bent once for backfill; `current_date` is the deploy day in each environment).
