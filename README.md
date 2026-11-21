# Arki

Arki is a responsive browser single-page application for food and water tracking built with React, Vite, strict TypeScript, and Supabase (Auth, PostgreSQL, Row-Level Security).

## Prerequisites

- **Node.js 22+** and **npm**
- **Docker** (required for running the local Supabase stack via the Supabase CLI)

## Quickstart

1. **Install dependencies:**

   ```bash
   npm ci
   ```

2. **Configure local environment variables:**

   Copy `.env.example` to `.env.local` and fill in the local anon key output by `npm run db:start` (or `npx supabase status`):

   ```bash
   cp .env.example .env.local
   ```

3. **Start local Supabase and apply migrations + synthetic seed:**

   ```bash
   npm run db:start
   npm run db:reset
   ```

   `db:start` reuses an existing local database. After pulling a schema change
   (for example `water_goals`), run `npm run db:reset` or `npm run db:migrate`
   so PostgREST can see the new tables. `PGRST205` means that reset has not
   happened yet.

4. **Start the Vite development server:**

   ```bash
   npm run dev
   ```

The local seed includes the synthetic account `test@example.com` with password
`Arki-test-password-123!`. Use it to try signing in and to run `npm run test:e2e`
after starting and resetting local Supabase. Playwright reads the local public
credentials from `supabase status` unless `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are set explicitly.

## Quality Checks & Testing

| Command                   | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| `npm run format:check`    | Verify formatting with Prettier (`npm run format` to fix)                  |
| `npm run lint`            | Run ESLint (`lint:eslint`) and module boundary checks (`lint:boundaries`)  |
| `npm run typecheck`       | Run strict TypeScript compiler checks (`tsc --noEmit`)                     |
| `npm run test:boundaries` | Run automated deliberate-violation tests for `dependency-cruiser` rules    |
| `npm run test:unit`       | Run Vitest unit and `fast-check` property-based tests                      |
| `npm run test:db`         | Run Vitest integration tests against the local Supabase instance           |
| `npm run test:e2e`        | Build, preview, and run Playwright end-to-end tests                        |
| `npm run db:types:check`  | Regenerate `src/shared/supabase/database.types.ts` and verify no git drift |

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs a two-tier pipeline:

1. **`ci` (verification gate)** — on every pull request and every push to `main`. Formatting, lint, typecheck, boundary tests, unit tests, local Supabase, generated-type drift, RLS/RPC tests, and Playwright Chromium E2E must all pass.
2. **`deploy` (staging delivery)** — only after a green `ci` job on a push to `main`. Pushes migrations to the staging Supabase project, builds the SPA with staging public env vars, and deploys `dist/` to Cloudflare Pages.

Dependabot (`.github/dependabot.yml`) opens weekly update PRs for `npm` and `github-actions`.

### Required GitHub Actions secrets

Configure these under repository **Settings → Secrets and variables → Actions** before the first deploy from `main`:

| Secret                          | Purpose                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Staging Supabase project URL                               |
| `VITE_SUPABASE_ANON_KEY`        | Staging Supabase public anon key                           |
| `SUPABASE_PROJECT_ID`           | Staging Supabase project ref (for `supabase db push`)      |
| `SUPABASE_ACCESS_TOKEN`         | Supabase access token for CLI migration push               |
| `SUPABASE_DB_PASSWORD`          | Staging database password for `supabase db push`           |
| `CLOUDFLARE_API_TOKEN`          | Cloudflare API token with Pages edit permission            |
| `CLOUDFLARE_ACCOUNT_ID`         | Cloudflare account ID                                      |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Target Cloudflare Pages project name (e.g. `arki-staging`) |

### Repository settings

- Enable **secret scanning** and **push protection**.
- Protect `main` and require the **CI / Verification gate** check so style, lint, type, boundary, type-drift, and test failures block merges.

## Documentation & Architecture

- **[`AGENTS.md`](./AGENTS.md)** — Project agent instructions, working agreements, Definition of Done, module structure, enforced boundary rules, and standard commands.
- **[`docs/coding-principles.md`](./docs/coding-principles.md)** — Architecture layering, code quality attributes, code smells, refactoring, and design rules.
- **[`docs/testing-and-security.md`](./docs/testing-and-security.md)** — TDD workflow, test quality, property testing, RLS/RPC security checklists, and Definition of Done.
- **[`docs/adr/`](./docs/adr/)** — Architecture Decision Records (ADRs 0001–0010):
  - [ADR 1: Browser SPA with React, Vite and strict TypeScript](./docs/adr/0001-browser-spa-react-vite-strict-ts.md)
  - [ADR 2: Supabase for auth, data and access control](./docs/adr/0002-supabase-auth-data-rls.md)
  - [ADR 3: Separate Supabase project for Arki (open)](./docs/adr/0003-separate-supabase-project.md)
  - [ADR 4: Coupled writes through Postgres functions](./docs/adr/0004-coupled-writes-postgres-rpc.md)
  - [ADR 5: One nutrition calculation contract](./docs/adr/0005-one-nutrition-calculation-contract.md)
  - [ADR 6: Logged entries are immutable snapshots](./docs/adr/0006-logged-entries-immutable-snapshots.md)
  - [ADR 7: Explicit local dates](./docs/adr/0007-explicit-local-dates.md)
  - [ADR 8: Idempotent writes through client operation IDs](./docs/adr/0008-idempotent-writes-client-op-ids.md)
  - [ADR 9: Repeatable library import](./docs/adr/0009-repeatable-library-import.md)
  - [ADR 10: Reuse NutriTrack behaviour, not structure](./docs/adr/0010-reuse-nutritrack-behaviour-not-structure.md)
- **[`plans/`](./plans/)** — Implementation plans and backlog:
  - [Arki — Architecture Decisions and First Backlog](./plans/Arki_Architecture_Decisions_and_First_Backlog.md)
  - [W-0 Implementation Plan: Repo, CI and Staging Pipeline](./plans/W0_Repo_CI_and_Staging_Pipeline.md)
