# AGENTS.md — Project Agent Instructions & Architecture Guide

Core instructions, guardrails, module boundary rules, verification commands, and review tiers for coding agents working on Arki.

> **Context-Window Efficiency Rule:** `AGENTS.md` is loaded into every turn automatically. Keep this file concise as a router and guardrail index. Read the detailed documents in §1 **on demand** only when your task requires them.

## 1. Context & On-Demand Docs (Read Only When Relevant)

- **Feature / task work:** Read the active plan and backlog under `plans/` ([`plans/Arki_Architecture_Decisions_and_First_Backlog.md`](./plans/Arki_Architecture_Decisions_and_First_Backlog.md), [`plans/W0_Repo_CI_and_Staging_Pipeline.md`](./plans/W0_Repo_CI_and_Staging_Pipeline.md)) before editing.
- **Designing, writing, or refactoring code:** Read and follow [`docs/coding-principles.md`](./docs/coding-principles.md) (layering, encapsulation, cohesion, low coupling, DRY, YAGNI, code smells, refactoring).
- **Writing, changing, or reviewing tests & security:** Read and satisfy [`docs/testing-and-security.md`](./docs/testing-and-security.md) (Red-Green-Refactor TDD, `fast-check` property tests, Supabase RLS/RPC security checklists, independent review, Definition of Done).
- **Domain logic & calculation changes (`src/nutrition/`):** Read [ADR 5](./docs/adr/0005-one-nutrition-calculation-contract.md), [ADR 6](./docs/adr/0006-logged-entries-immutable-snapshots.md), [ADR 7](./docs/adr/0007-explicit-local-dates.md), and [ADR 10](./docs/adr/0010-reuse-nutritrack-behaviour-not-structure.md) before changing calculations or logging rules.
- **Database, Auth, RLS, RPC & import changes:** Read [ADR 2](./docs/adr/0002-supabase-auth-data-rls.md), [ADR 4](./docs/adr/0004-coupled-writes-postgres-rpc.md), [ADR 8](./docs/adr/0008-idempotent-writes-client-op-ids.md), and [ADR 9](./docs/adr/0009-repeatable-library-import.md) before changing `supabase/migrations/`, `src/shared/supabase/`, `src/features/*/api/`, or `tools/import/`.
- **PRs & merging:** Follow §5 below (and `.agents/skills/pr-review-and-merge/SKILL.md` when configured).

## 2. Core Guardrails & Working Agreements

- Inspect `git status` before editing; never discard or overwrite unrelated user changes.
- Respect the active task's **write allowlist**; treat unlisted files and existing tests as read-only unless explicitly approved.
- Keep shared UI primitives (`src/shared/ui/`) unchanged unless the task targets the UI kit.
- Never commit secrets, tokens, Supabase `service_role` keys, `.env` / `.env.local` files, or real personal/health data (`supabase/seed.sql` and non-production fixtures must remain 100% synthetic).
- **Scrumban, WIP limit of one story:** Pull the next story only when the current one is done (partially done work counts as zero).
- **Trunk-based development:** Short-lived branches, small pull requests, merged into `main` at least daily; hide unfinished work behind a simple feature flag.
- **Database migrations only:** Schema changes exist only as versioned SQL migrations in `supabase/migrations/`. Coupled multi-row/multi-table writes run as `security invoker` Postgres functions via `supabase.rpc()` (ADR 4).
- **Architecture Decision Records (`docs/adr/`):** Accepted ADRs are never edited in place; a changed decision gets a new superseding ADR.

## 3. Module Structure and Enforced Boundaries

```text
src/
  app/          routing, providers, layout
  features/
    session/    sign in, sign out, current user (index.ts, ui/, api/, model/)
    water/      index.ts, ui/, api/, model/
    library/    index.ts, ui/, api/, model/
    food-log/   index.ts, ui/, api/, model/
  nutrition/    pure calculation contract (ADR 5)
  shared/       ui kit (src/shared/ui/), date helpers, supabase client
supabase/
  migrations/   versioned SQL schema, RLS policies, and RPC functions
  tests/        RLS, RPC, and boundary integration tests
tools/import/   library import command (ADR 9)
docs/           coding-principles.md, testing-and-security.md, adr/ (0001..0010)
plans/          backlog and implementation plans
```

These 4 boundary rules are enforced in CI via `dependency-cruiser` ([`.dependency-cruiser.cjs`](./.dependency-cruiser.cjs)) and tested against deliberate violations by `npm run test:boundaries` (see [`docs/coding-principles.md`](./docs/coding-principles.md) §1 for layer responsibilities):

1. **Only `features/*/api/` and `shared/supabase` import the Supabase client** (`only-api-and-shared-import-supabase`; `tools/import/` is also permitted for the CLI import tool).
2. **Components never call Supabase; they use TanStack Query hooks from their feature's `api/`** (`ui-never-imports-supabase-or-feature-internals`: `src/shared/ui/` cannot import from `src/features/`, `src/shared/supabase/`, or `@supabase/supabase-js`, and feature `ui/` modules are barred from importing Supabase by Rule 1).
3. **Features import each other only through their `index.ts`** (`cross-feature-only-via-index` and `app-to-feature-only-via-index`).
4. **`nutrition/` imports nothing from `features/`, `shared/supabase` or React** (`pure-nutrition-contract`: `src/nutrition/` cannot import from `react`, `react-dom`, `@supabase/supabase-js`, `src/features/`, `src/app/`, or `src/shared/supabase/`).

## 4. Verification Commands

All `package.json` scripts follow these exact names so local development, `AGENTS.md`, and CI stay in sync:

| Command                   | Purpose                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `npm ci`                  | Clean install dependencies from `package-lock.json`                          |
| `npm run dev`             | Start local Vite dev server                                                  |
| `npm run build`           | Type-check and build production SPA into `dist/`                             |
| `npm run preview`         | Preview built SPA locally on port `4173`                                     |
| `npm run format`          | Format all files with Prettier (`npm run format:check` in CI)                |
| `npm run lint`            | Run static lint and boundary checks (`lint:eslint` + `lint:boundaries`)      |
| `npm run typecheck`       | Run strict TypeScript compiler check (`tsc --noEmit`)                        |
| `npm run test:boundaries` | Verify `dependency-cruiser` rejects deliberate boundary violations           |
| `npm run test:unit`       | Run unit, component & `fast-check` property tests (`src/**/*.test.{ts,tsx}`) |
| `npm run test:db`         | Run integration tests against local Supabase (`supabase/tests/init.test.ts`) |
| `npm run test:e2e`        | Run Playwright E2E browser tests (`e2e/**/*.spec.ts`)                        |
| `npm run db:start`        | Start local Supabase containers (`db:stop` to stop, `db:reset` to reseed)    |
| `npm run db:types`        | Regenerate `database.types.ts` (`db:types:check` fails on drift in CI)       |

- **Pre-PR full verification gate (required before any PR):**
  `npm run format:check && npm run lint && npm run typecheck && npm run test:boundaries && npm run test:unit && npm run db:types:check && npm run test:db && npm run test:e2e`

## 5. Roles, Review, Merge Tiers & Definition of Done

- **One file, one owner:** Use a single implementer for coupled changes; use parallel agents only in isolated worktrees with non-overlapping write allowlists.
- **Independent review:** Before any behavior-changing PR, a fresh read-only reviewer (separate subagent or model) must review the spec, full diff, and test evidence per [`docs/testing-and-security.md`](./docs/testing-and-security.md) §9. The author cannot self-approve.
- **Tier 1 (Explicit human merge approval; auto-merge OFF):** Schema/migrations (`supabase/migrations/`), RLS policies and RPCs, auth/security (`src/features/session/`, `src/shared/supabase/`), core nutrition calculation contract (`src/nutrition/`), library import (`tools/import/`), secrets/infra/CI, breaking changes, or major user journeys.
- **Tier 2 (Auto-merge candidate after green gate + independent review):** Targeted bug fixes, UI polish, tooling/tests, or minor internal refactors.
- **Definition of Done:** A story is done only when it satisfies both the design checklist in [`docs/coding-principles.md`](./docs/coding-principles.md) §7 and the verification & security Definition of Done in [`docs/testing-and-security.md`](./docs/testing-and-security.md) §10 (Playwright E2E, Vitest + `fast-check`, local Supabase cross-user RLS/RPC tests, migration-only schema with `db:types:check`, green lint/typecheck/boundaries, independent review, self-reviewed PR, green CI deployed to staging, and any new architectural decision recorded in `docs/adr/`).
