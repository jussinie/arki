# Arki — Architecture Decisions and First Backlog

Nov 16, 2026 · @Jussi Niemi

## Overview

Arki starts as a small browser SPA on Supabase, with food and water tracking as its first complete feature set. This document records the ten architecture decisions that are hard to change, the working agreements, and the first backlog that proves them.

The first build is a walking skeleton: water tracking end to end, deployed through CI. Water exercises auth, row-level security (RLS), migrations, idempotent writes, explicit dates and the data layer without nutrition complexity.

Conventions:

- **ADR status** is Proposed, Accepted or Superseded. Accepted ADRs are never edited; a changed decision gets a new ADR that supersedes the old one.
- **ADRs live in the repo** as `docs/adr/NNNN-title.md`, one file per decision, copied from this document.
- **Backlog items** are GitHub issues. Stories carry Given–When–Then acceptance criteria that become automated tests.
- **Priority** is the order in the backlog section. Only the top items are fully refined; later items stay rough on purpose.

## Architecture decisions

Nine of the ten ADRs are proposed for acceptance now. ADR 3 stays open until the Supabase spike reports.

| ADR | Decision | Status |
| --- | --- | --- |
| 1 | Browser SPA: React, Vite, strict TypeScript | Proposed |
| 2 | Supabase Auth, Postgres and RLS; no custom API server | Proposed |
| 3 | Separate Supabase project for Arki | Open (spike) |
| 4 | Coupled writes through Postgres functions (RPC) | Proposed |
| 5 | One TypeScript nutrition contract; database stores results | Proposed |
| 6 | Logged entries are immutable snapshots | Proposed |
| 7 | `local_date` is the grouping key for all logs | Proposed |
| 8 | Idempotent writes through client operation IDs | Proposed |
| 9 | Repeatable, keyed library import with dry run | Proposed |
| 10 | Reuse NutriTrack behaviour and tests, not structure | Proposed |

### ADR 1: Browser SPA with React, Vite and strict TypeScript

**Context.** Arki must work on phone and desktop. One developer builds it. Native features (health integrations, background sync) are deferred.

**Decision.** Build a responsive single-page app with React, Vite and TypeScript in `strict` mode. No server rendering and no native app. Data from outside the app (Supabase responses that bypass generated types, import files) is validated at runtime with a schema library such as Zod.

**Consequences.**

- \+ One codebase for all screens; static hosting; fast local development.
- \+ Type errors are caught before runtime; generated database types keep queries honest.
- − No reliable background work or native push; revisit if reminders become core.
- − First load depends on bundle size; keep it in check from the start.

### ADR 2: Supabase for auth, data and access control

**Context.** Arki needs accounts, a relational store and per-user data isolation. Building and securing an API server would cost weeks without adding user value.

**Decision.** Use Supabase Auth, PostgreSQL and row-level security. The SPA talks to Supabase directly with the public anon key. Every user-owned table has RLS enabled with deny-by-default policies. The service-role key never reaches the browser or the repo.

**Consequences.**

- \+ No auth system or general-purpose API server to build and maintain.
- \+ Access control is enforced in the database, not in UI filtering.
- − Security depends entirely on correct RLS policies, so policies need automated tests (see Working agreements).
- − Logic that must run server-side lives in Postgres functions (ADR 4) or, if ever needed, an Edge Function.
- − Vendor dependency on Supabase; mitigated by standard Postgres and versioned migrations.

### ADR 3: Separate Supabase project for Arki (open)

**Context.** NutriTrack runs on an existing Supabase project. A new project gives a clean schema and keeps NutriTrack intact. Reusing the old one could save migration work but may carry legacy assumptions.

**Proposed decision.** Create a new Supabase project for Arki, plus a separate staging project.

**Decide after spike S-1.** Reuse the existing project only if it saves at least 3 working days *and* Arki's schema needs no legacy columns, fallbacks or shared tables with NutriTrack.

**Consequences if accepted.**

- \+ Clean schema built only from Arki migrations.
- \+ NutriTrack keeps running unchanged as a reference and fallback.
- − Users and the library must be moved with an import (ADR 9).
- − Two projects to pay for and maintain for a while.

### ADR 4: Coupled writes through Postgres functions

**Context.** Saving a recipe and its ingredients must succeed or fail together. supabase-js cannot run a multi-statement transaction from the browser, and delete-then-insert sequences leave broken data on partial failure.

**Decision.** Writes that touch more than one row or table run as Postgres functions called through `supabase.rpc()`, each in one transaction. Simple reads and single-row writes use table access with RLS. Functions are declared `security invoker` so RLS still applies; `security definer` needs its own ADR.

Initial RPC list: `save_recipe`, `log_food_entry`, `import_library_batch`.

**Consequences.**

- \+ Atomic writes; no orphan ingredients or half-saved recipes.
- \+ The RPC list is the write-side service layer, small and explicit.
- − Logic in SQL is harder to unit test, so each function gets integration tests against local Supabase.
- − Function signatures are an API contract; changes go through migrations.

### ADR 5: One nutrition calculation contract

**Context.** Library previews, portion calculations, logs and summaries must agree on units, quantities, precision and rounding. Two implementations (TypeScript and SQL) would drift.

**Decision.** A pure TypeScript module `src/nutrition/` is the single authority. It has no React or Supabase imports. The client computes the values; RPCs store them as given. The database does not recompute nutrition.

The contract fixes:

- Supported units and conversions.
- Internal precision (unrounded values stored) and display rounding (applied only at render).
- How a recipe's per-portion values derive from its ingredients.
- How a day summary sums entries.

**Consequences.**

- \+ One place to test and change nutrition rules.
- \+ Previews and saved values cannot disagree.
- − The database trusts the client's numbers. Acceptable because users write only their own data.
- − Any future server-side calculation must reuse this contract, not copy it.

### ADR 6: Logged entries are immutable snapshots

**Context.** Editing a recipe or ingredient must not rewrite previous days.

**Decision.** A log entry stores its own name, quantity, unit and computed nutrition at log time. It may keep a nullable reference to its source item for convenience, but summaries read only the snapshot. Editing a log entry recomputes that entry only.

**Consequences.**

- \+ History stays true to what was eaten and logged.
- \+ Deleting a library item never breaks old logs.
- − Some duplicated data per entry, which is fine at this scale.
- − Fixing a wrong library value does not correct past logs; that is intended.

### ADR 7: Explicit local dates

**Context.** Users log against a calendar day they choose, often after the fact. Deriving the day from a UTC timestamp breaks around midnight and when travelling.

**Decision.** Every log row has `local_date date not null`, chosen in the UI and sent explicitly. `logged_at timestamptz` is kept as metadata only. All day views and summaries group by `local_date`. Changing time zones does not move existing entries.

**Consequences.**

- \+ What the user picked is what they see, everywhere.
- \+ No time-zone arithmetic in queries.
- − "Today" is computed in the browser's time zone; the selected date must be passed through every write path.

### ADR 8: Idempotent writes through client operation IDs

**Context.** TanStack Query and flaky mobile networks retry requests. A retried "add 250 ml water" must not add 500 ml.

**Decision.** Create operations generate a UUID when the user acts, not when the request is sent. That UUID is the row's primary key (or a unique `client_op_id`). Inserts use `on conflict do nothing` and return the existing row. Naturally idempotent writes (set favourite, set value) need no ID.

**Consequences.**

- \+ Retries, double taps and reconnects never duplicate data.
- \+ A step towards offline use later, without building sync now.
- − Every create path must carry the ID from the UI through to the database; tests cover the retry case.

### ADR 9: Repeatable library import

**Context.** The existing library (ingredients, recipe relationships, direct-macro meals, favourites, configured portions) is a launch requirement. Units and precision must survive, and conflicts must not be resolved silently.

**Decision.** Import runs as a repeatable command with two modes:

- **Dry run** writes nothing and produces a conflict report.
- **Apply** writes in batches through `import_library_batch`.

Every imported row stores its NutriTrack source ID, so re-runs update instead of duplicating. A conflict (an existing Arki row differs from the source, a unit cannot be mapped, a reference is missing) is reported and skipped, never overwritten.

**Consequences.**

- \+ The import can run many times during development and once more at launch.
- \+ Data loss shows up as a report line, not a surprise.
- − Source IDs remain in the schema as provenance.
- − Historical logs are not imported (deferred scope).

### ADR 10: Reuse NutriTrack behaviour, not structure

**Context.** NutriTrack has proven calculations and useful UI pieces, but also large page orchestration, inconsistent persistence paths and legacy compatibility code.

**Decision.** Port code only after review and only with tests. Calculations are ported with characterization tests: NutriTrack's outputs on real library data become the expected values. Selected components are ported into Arki's feature modules. Page orchestration, persistence code and compatibility handling are rebuilt.

**Consequences.**

- \+ Arki starts with verified behaviour and a clean structure.
- \+ Differences from NutriTrack are visible as failing tests, then decided deliberately.
- − Porting with tests is slower than copying code.

## Working agreements

A story counts as done only when it meets every item below; partially done work counts as zero.

### Definition of done

- Acceptance criteria pass as automated end-to-end tests (Playwright).
- Logic has unit tests (Vitest); nutrition code also has property-based tests (fast-check).
- Every new table, policy or RPC has integration tests against local Supabase, including a cross-user access test.
- Schema changes exist only as migrations in `supabase/migrations/`.
- Lint, type check and boundary rules pass.
- CI is green and the change is deployed to staging.
- The pull request has been self-reviewed in GitHub (an AI review is an extra check, not a replacement).
- Code is refactored; any new architectural choice has an ADR.

### Cadence and branching

- **Scrumban, WIP limit of one story.** Pull the next story only when the current one is done.
- **Weekly review.** Use the staging app for real, then reorder and refine the top of the backlog.
- **Trunk-based development.** Short-lived branches, small pull requests, merged into `main` at least daily.
- **Unfinished features** hide behind a simple feature flag instead of a long-lived branch.
- **Forecasting** counts finished stories per week; no story points.

### Module structure and enforced boundaries

```
src/
  app/          routing, providers, layout
  features/
    session/    sign in, sign out, current user
    water/      ui/, api/, model/
    library/    ui/, api/, model/
    food-log/   ui/, api/, model/
  nutrition/    pure calculation contract (ADR 5)
  shared/       ui kit, date helpers, supabase client
supabase/
  migrations/
  tests/        RLS and RPC integration tests
tools/import/   library import command (ADR 9)
docs/adr/
```

These rules run in CI with eslint-plugin-boundaries or dependency-cruiser, and are copied into `AGENTS.md`:

1. Only `features/*/api/` and `shared/supabase` import the Supabase client.
2. Components never call Supabase; they use TanStack Query hooks from their feature's `api/`.
3. Features import each other only through their `index.ts`.
4. `nutrition/` imports nothing from `features/`, `shared/supabase` or React.

### Environments

| Environment | Database | Data | Deploys |
| --- | --- | --- | --- |
| Local | Supabase CLI (Docker) | Synthetic seed | On demand |
| CI | Supabase CLI in GitHub Actions | Synthetic seed | Every push |
| Staging | Staging Supabase project | Synthetic plus a sanitised library copy | Every merge to `main` |
| Production | Arki Supabase project (ADR 3) | Real | Manual button |

Real personal or health data never goes into local, CI or staging.

## First backlog

The first two weeks deliver the spike and the water walking skeleton; launch needs items up to I-3. Items are in priority order; W-items are fully refined, later items get refined as they rise.

| ID | Item | Proves | Depends on |
| --- | --- | --- | --- |
| S-1 | Spike: Supabase project choice and import mapping | ADR 3, ADR 9 feasibility | — |
| W-0 | Repo, CI and staging pipeline | Delivery pipeline | — |
| W-1 | Sign in and sign out | ADR 2 | W-0 |
| W-2 | Add water to a chosen day | ADR 7, ADR 8, RLS | W-1 |
| W-3 | See and remove the day's water | Query invalidation, RLS delete | W-2 |
| N-1 | Port nutrition contract with characterization tests | ADR 5, ADR 10 | S-1 |
| L-1 | Browse the imported library (read-only) | Library schema | S-1, W-1 |
| I-1 | Import ingredients and portions (dry run + apply) | ADR 9 | L-1 |
| F-1 | Log food from the library with a snapshot | ADR 4, ADR 6 | N-1, L-1 |
| F-2 | Day summary for food and water | ADR 5, ADR 7 | F-1, W-3 |
| I-2 | Import recipes, direct-macro meals and favourites | ADR 9 | I-1 |
| R-1 | Create and edit a recipe atomically | ADR 4, ADR 6 | I-2, F-1 |
| I-3 | Launch import and conflict review | Launch requirement | I-2, R-1 |

### S-1 Spike: Supabase project and import mapping (time-box: 3 days)

The spike answers two questions with evidence and ends with ADR 3 accepted and ADR 9 confirmed or revised.

- [ ] Estimate the cost of a new project: moving auth users, data and storage; list the steps.
- [ ] Inventory the existing project's schema; note legacy columns, fallbacks and shared assumptions.
- [ ] Draft the Arki library schema (ingredients, portions, recipes, recipe ingredients, favourites).
- [ ] Write the field-by-field mapping from NutriTrack to Arki, including units and precision.
- [ ] Run a throwaway dry-run import on a sanitised copy and count unmappable rows.
- [ ] Apply the ADR 3 criterion (≥ 3 days saved and no legacy schema) and record the decision.

Output: the mapping document, a conflict count by type, and the accepted ADR 3. Spike code is thrown away.

### W-0 Repo, CI and staging pipeline

- [ ] Vite + React + TypeScript (`strict`), ESLint, Prettier, Vitest, Playwright.
- [ ] Supabase CLI project with an empty first migration and a synthetic seed.
- [ ] Boundary rules from Working agreements configured and failing on a deliberate violation.
- [ ] GitHub Actions: install, lint, type check, start local Supabase, apply migrations, run all tests.
- [ ] Merge to `main` deploys the SPA to static hosting against the staging project.
- [ ] Dependabot and secret scanning on; `AGENTS.md`, `README.md` and `docs/adr/` with ADRs 1–10.

### W-1 Sign in and sign out

```gherkin
Scenario: Sign in with a valid account
  Given a user "test@example.com" exists
  When they sign in with the correct password
  Then they see today's view with their email shown

Scenario: Wrong password is rejected
  Given a user "test@example.com" exists
  When they sign in with a wrong password
  Then they see "Invalid email or password"
  And they stay on the sign-in page

Scenario: Signed-out users cannot reach the app
  Given no one is signed in
  When they open today's view
  Then they are sent to the sign-in page
```

### W-2 Add water to a chosen day

```gherkin
Scenario: Add water to today
  Given I am signed in and today is 2026-11-20
  When I add 250 ml of water
  Then today's water total shows 250 ml

Scenario: Add water to an earlier day
  Given I am signed in and today is 2026-11-20
  When I select 2026-11-19 and add 500 ml of water
  Then 2026-11-19 shows 500 ml
  And 2026-11-20 is unchanged

Scenario: A retried request does not double the amount
  Given I am signed in
  When I add 250 ml and the request is sent twice with the same operation ID
  Then exactly one 250 ml entry exists

Scenario: Invalid amounts are rejected
  Given I am signed in
  When I try to add 0 ml or more than 5000 ml
  Then I see "Enter an amount between 1 and 5000 ml"
  And nothing is saved
```

Integration tests (local Supabase):

- [ ] User B cannot select, insert, update or delete user A's water rows.
- [ ] An insert with a reused ID returns the existing row and creates no duplicate.
- [ ] `local_date` is required; the database never derives it from `logged_at`.

### W-3 See and remove the day's water

```gherkin
Scenario: See the day's entries
  Given I have added 250 ml and 500 ml on 2026-11-20
  When I open 2026-11-20
  Then I see both entries and a total of 750 ml

Scenario: Remove an entry
  Given I have added 250 ml and 500 ml on 2026-11-20
  When I remove the 250 ml entry
  Then the total shows 500 ml without reloading the page
```

With W-3 done, the walking skeleton is complete: every layer, policy and pipeline step exists and works end to end.

### Later items (refined when they reach the top)

- **N-1 Nutrition contract.** Port the calculation code into `src/nutrition/`. Expected values come from NutriTrack's outputs on the sanitised library. Property tests: scaling a portion by 2 equals adding two portions within the agreed precision; a recipe's total equals the sum of its ingredients; display rounding never changes stored values.
- **L-1 Library browse.** Search and list ingredients and portions; values rendered through the nutrition contract.
- **I-1 Ingredient import.** Dry run produces a report (new, unchanged, updated, conflict, unmappable); apply is repeatable and keyed on source IDs.
- **F-1 Log food.** `log_food_entry` stores name, quantity, unit and computed nutrition; acceptance test proves that editing the library item afterwards leaves the entry unchanged.
- **F-2 Day summary.** Food totals and water total for the selected `local_date`; numbers match the nutrition contract's summary function exactly.
- **I-2 Recipe import.** Recipe relationships, direct-macro meals, favourites; missing references are reported, never guessed.
- **R-1 Recipe editing.** `save_recipe` writes the recipe and all its ingredients in one transaction; a forced failure halfway leaves the old recipe intact; old logs keep their snapshots.
- **I-3 Launch import.** Final dry run, conflicts reviewed and resolved by hand, apply to production, row counts checked against the source.

## Open questions

Three questions block acceptance of the ADRs; the rest can wait for the items that need them.

- [ ] **Blocks ADR 3:** does moving NutriTrack's auth users to a new project keep their sign-in working, or must users re-register? (S-1)
- [ ] **Blocks ADR 5:** what internal precision and which display rounding rules does NutriTrack actually use today? (S-1, N-1)
- [ ] **Blocks ADR 9:** which NutriTrack units have no clean mapping, and who decides each conflict? (S-1)
- [ ] Static host for the SPA (for example Netlify, Vercel or Cloudflare Pages): pick during W-0.
- [ ] Water amount limits (1–5000 ml per entry) and default quick-add sizes: confirm during W-2.
- [ ] Privacy basics for health-related data: hosting region, data export and account deletion: decide before production launch.

Next review points: after S-1 (accept or revise ADRs 3, 5 and 9) and after W-3 (confirm the walking skeleton holds up before building food logging).
