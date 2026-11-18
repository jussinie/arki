# AGENTS.md — Arki Working Agreements & Architecture Guide

This file records the working agreements, architectural boundary rules, Definition of Done, and standard commands for developers and coding agents working on Arki.

## Definition of Done

A story counts as done only when it meets every item below; partially done work counts as zero:

- [ ] Acceptance criteria pass as automated end-to-end tests (Playwright).
- [ ] Logic has unit tests (Vitest); nutrition code also has property-based tests (`fast-check`).
- [ ] Every new table, policy or RPC has integration tests against local Supabase, including a cross-user access test.
- [ ] Schema changes exist only as migrations in `supabase/migrations/`.
- [ ] Lint, type check and boundary rules pass.
- [ ] CI is green and the change is deployed to staging.
- [ ] The pull request has been self-reviewed in GitHub (an AI review is an extra check, not a replacement).
- [ ] Code is refactored; any new architectural choice has an ADR in `docs/adr/`.

## Module Structure and Enforced Boundaries

```text
src/
  app/          routing, providers, layout
  features/
    session/    sign in, sign out, current user (index.ts, ui/, api/, model/)
    water/      ui/, api/, model/
    library/    ui/, api/, model/
    food-log/   ui/, api/, model/
  nutrition/    pure calculation contract (ADR 5)
  shared/       ui kit, date helpers, supabase client
supabase/
  migrations/
  tests/        RLS, RPC, and boundary integration tests
tools/import/   library import command (ADR 9)
docs/adr/       Architecture Decision Records (0001..0010)
```

These 4 boundary rules are enforced in CI via `dependency-cruiser` (`.dependency-cruiser.cjs`) and verified against deliberate violations by `npm run test:boundaries`:

1. **Only `features/*/api/` and `shared/supabase` import the Supabase client** (`only-api-and-shared-import-supabase`; `tools/import/` is also permitted for the CLI import tool).
2. **Components never call Supabase; they use TanStack Query hooks from their feature's `api/`** (`ui-never-imports-supabase-or-feature-internals`: `src/shared/ui/` cannot import from `src/features/`, `src/shared/supabase/`, or `@supabase/supabase-js`, and feature `ui/` modules are barred from importing Supabase by Rule 1).
3. **Features import each other only through their `index.ts`** (`cross-feature-only-via-index` and `app-to-feature-only-via-index`).
4. **`nutrition/` imports nothing from `features/`, `shared/supabase` or React** (`pure-nutrition-contract`: `src/nutrition/` cannot import from `react`, `react-dom`, `@supabase/supabase-js`, `src/features/`, `src/app/`, or `src/shared/supabase/`).

## Standard Commands

All scripts in `package.json` follow these exact names so local development, `AGENTS.md`, and CI stay in sync:

| Command                   | Purpose                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`             | Start local Vite dev server                                                  |
| `npm run build`           | Type-check and build production SPA into `dist/`                             |
| `npm run preview`         | Preview built SPA locally on port `4173`                                     |
| `npm run format`          | Format all files with Prettier                                               |
| `npm run format:check`    | Check formatting in CI                                                       |
| `npm run lint:eslint`     | Run ESLint (flat config)                                                     |
| `npm run lint:boundaries` | Enforce module boundary rules on `src/` and `tools/`                         |
| `npm run lint`            | Run all static lint and boundary checks (`lint:eslint` + `lint:boundaries`)  |
| `npm run typecheck`       | Run strict TypeScript compiler check (`tsc --noEmit`)                        |
| `npm run test:boundaries` | Verify `dependency-cruiser` rejects deliberate boundary violations           |
| `npm run test:unit`       | Run unit & `fast-check` property tests (`src/**/*.test.{ts,tsx}`)            |
| `npm run test:db`         | Run integration tests against local Supabase (`supabase/tests/init.test.ts`) |
| `npm run test:e2e`        | Run Playwright E2E tests (`e2e/**/*.spec.ts`)                                |
| `npm run db:start`        | Start local Supabase containers                                              |
| `npm run db:stop`         | Stop local Supabase containers                                               |
| `npm run db:reset`        | Recreate local DB from `supabase/migrations/` + `supabase/seed.sql`          |
| `npm run db:types`        | Regenerate TypeScript types from local schema                                |
| `npm run db:types:check`  | Fail in CI if committed `database.types.ts` drifts from migrations           |

## Working Agreements

- **Scrumban, WIP limit of one story:** Pull the next story only when the current one is done.
- **Trunk-based development:** Short-lived branches, small pull requests, merged into `main` at least daily. Unfinished features hide behind a simple feature flag instead of a long-lived branch.
- **Database migrations only:** Schema changes exist only as versioned SQL migrations in `supabase/migrations/`. Coupled multi-row/multi-table writes run as `security invoker` Postgres functions called via `supabase.rpc()` (ADR 4).
- **Synthetic data only outside production:** Real personal or health data never goes into local, CI, or staging environments (`supabase/seed.sql` and test fixtures must remain 100% synthetic).
- **Architecture Decision Records (`docs/adr/`):** Accepted ADRs are never edited in place; a changed decision gets a new ADR that supersedes the old one.
