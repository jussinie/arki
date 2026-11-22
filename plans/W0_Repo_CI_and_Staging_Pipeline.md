# W-0 Implementation Plan: Repo, CI and Staging Pipeline

Nov 16, 2026

Based on [Arki_Architecture_Decisions_and_First_Backlog.md](./Arki_Architecture_Decisions_and_First_Backlog.md), **W-0** establishes the delivery pipeline, module boundary enforcement, local Supabase workflow, test harnesses, and repository documentation before feature work (`W-1`) begins.

## Confirmed Decisions for W-0

1. **Static Host**: **Cloudflare Pages** (deployed on merge to `main` via GitHub Actions, gated by green CI).
2. **Package Manager**: **`npm`** (`package-lock.json` committed, `npm ci` in GitHub Actions).
3. **Staging Supabase Project**: Exists and ready; GitHub Actions builds the SPA with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and pushes database migrations via `supabase db push`.
4. **ADR Initial Statuses**: When extracting ADRs into `docs/adr/`, ADRs 1, 2, and 4–10 are marked `Accepted` (per the overview in `Arki_Architecture_Decisions_and_First_Backlog.md`: _"Nine of the ten ADRs are proposed for acceptance now. ADR 3 stays open until the Supabase spike reports"_), and ADR 3 remains `Open (spike)`.

---

## Target Repository Structure

```text
arki/
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       └── ci.yml                # PR + push to main: CI checks, then deploy-staging job on main
├── docs/
│   └── adr/
│       ├── 0001-browser-spa-react-vite-strict-ts.md
│       ├── 0002-supabase-auth-data-rls.md
│       ├── 0003-separate-supabase-project.md
│       ├── 0004-coupled-writes-postgres-rpc.md
│       ├── 0005-one-nutrition-calculation-contract.md
│       ├── 0006-logged-entries-immutable-snapshots.md
│       ├── 0007-explicit-local-dates.md
│       ├── 0008-idempotent-writes-client-op-ids.md
│       ├── 0009-repeatable-library-import.md
│       └── 0010-reuse-nutritrack-behaviour-not-structure.md
├── e2e/
│   └── smoke.spec.ts             # Playwright smoke test verifying app shell renders
├── plans/
│   ├── Arki_Architecture_Decisions_and_First_Backlog.md
│   └── W0_Repo_CI_and_Staging_Pipeline.md
├── public/
│   └── _redirects                # Cloudflare Pages SPA fallback: /* /index.html 200
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── App.test.tsx
│   │   └── main.tsx
│   ├── features/
│   │   ├── session/              # index.ts, ui/, api/, model/
│   │   ├── water/                # index.ts, ui/, api/, model/
│   │   ├── library/              # index.ts, ui/, api/, model/
│   │   └── food-log/             # index.ts, ui/, api/, model/
│   ├── nutrition/
│   │   ├── index.ts              # Pure TS contract placeholder (no React/Supabase imports)
│   │   └── index.test.ts
│   └── shared/
│       ├── supabase/
│       │   ├── client.ts
│       │   ├── database.types.ts
│       │   └── index.ts
│       ├── date/
│       │   └── index.ts
│       └── ui/
│           └── index.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 20261116000000_init.sql
│   ├── seed.sql                  # Synthetic seed only (no personal/health data)
│   └── tests/
│       ├── boundaries.test.ts    # Automated deliberate violation test for dependency-cruiser
│       └── init.test.ts          # Vitest integration test against local Supabase
├── tools/
│   └── import/
│       └── index.ts              # CLI entry placeholder for ADR 9
├── .dependency-cruiser.cjs       # Enforced architectural boundary rules
├── .env.example                  # Documented local Supabase env vars
├── .gitignore
├── .prettierignore
├── .prettierrc
├── AGENTS.md
├── README.md
├── eslint.config.js
├── index.html
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── vitest.db.config.ts
```

---

## Standard `package.json` Scripts

All scripts must match these exact names so local development, `AGENTS.md`, and CI stay in sync:

| Script            | Command                                                                          | Purpose                                                                      |
| ----------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `dev`             | `vite`                                                                           | Start local Vite dev server                                                  |
| `build`           | `tsc --noEmit && vite build`                                                     | Type-check and build production SPA into `dist/`                             |
| `preview`         | `vite preview --port 4173`                                                       | Preview built SPA locally                                                    |
| `format`          | `prettier --write .`                                                             | Format all files                                                             |
| `format:check`    | `prettier --check .`                                                             | Check formatting in CI                                                       |
| `lint:eslint`     | `eslint .`                                                                       | Run ESLint (flat config)                                                     |
| `lint:boundaries` | `depcruise src tools --config .dependency-cruiser.cjs`                           | Enforce module boundary rules on `src/` and `tools/`                         |
| `lint`            | `npm run lint:eslint && npm run lint:boundaries`                                 | Run all static lint and boundary checks                                      |
| `typecheck`       | `tsc --noEmit`                                                                   | Run strict TypeScript compiler check                                         |
| `test:boundaries` | `vitest run supabase/tests/boundaries.test.ts`                                   | Verify `dependency-cruiser` rejects deliberate violations                    |
| `test:unit`       | `vitest run --config vitest.config.ts`                                           | Run unit & fast-check property tests (`src/**/*.test.{ts,tsx}`)              |
| `test:db`         | `vitest run --config vitest.db.config.ts`                                        | Run integration tests against local Supabase (`supabase/tests/init.test.ts`) |
| `test:e2e`        | `playwright test`                                                                | Run Playwright E2E tests (`e2e/**/*.spec.ts`)                                |
| `db:start`        | `supabase start`                                                                 | Start local Supabase containers                                              |
| `db:stop`         | `supabase stop`                                                                  | Stop local Supabase containers                                               |
| `db:reset`        | `supabase db reset`                                                              | Recreate local DB from `migrations/` + `seed.sql`                            |
| `db:types`        | `supabase gen types typescript --local > src/shared/supabase/database.types.ts`  | Regenerate TypeScript types from local schema                                |
| `db:types:check`  | `npm run db:types && git diff --exit-code src/shared/supabase/database.types.ts` | Fail in CI if committed types drift from migrations                          |

---

## Step-by-Step Implementation Plan

### Step 1: Scaffold Vite + React + Strict TypeScript & Core Tooling

1. Initialize `package.json` using `npm` (`"type": "module"`):
   - **Dependencies**: `react`, `react-dom`, `@supabase/supabase-js`, `@tanstack/react-query`, `zod`
   - **DevDependencies**: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `dependency-cruiser`, `prettier`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `fast-check`, `@playwright/test`, `supabase`
2. Configure `tsconfig.json` with strict compiler flags:
   - `"target": "ES2022"`, `"lib": ["ES2022", "DOM", "DOM.Iterable"]`, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"jsx": "react-jsx"`, `"noEmit": true`
   - `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, `"noImplicitOverride": true`, `"noFallthroughCasesInSwitch": true`, `"isolatedModules": true`, `"skipLibCheck": true`
3. Configure **ESLint v9 flat config** (`eslint.config.js`) using `@eslint/js` and `typescript-eslint`, ignoring `dist/`, `node_modules/`, and `supabase/.temp/`.
4. Configure **Prettier** (`.prettierrc`, `.prettierignore`) and `.gitignore` (`node_modules`, `dist`, `.env`, `.env.local`, `playwright-report`, `test-results`, `supabase/.temp`, `supabase/.branches`).
5. Create `public/_redirects` containing `/* /index.html 200` so Cloudflare Pages routes all deep links to the SPA shell.
6. Create `.env.example` documenting `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY=<local-anon-key-from-supabase-status>`.
7. Create the module skeleton with valid TypeScript exports so all folders exist in Git:
   - `src/app/App.tsx` rendering `<h1>Arki</h1>` and `src/app/main.tsx` mounting it.
   - `src/features/{session,water,library,food-log}/` each with `index.ts`, `ui/index.ts`, `api/index.ts`, `model/index.ts`.
   - `src/nutrition/index.ts` exporting a pure helper (e.g., `export function scaleAmount(value: number, factor: number): number { return value * factor; }`).
   - `src/shared/supabase/{client.ts,database.types.ts,index.ts}`, `src/shared/date/index.ts`, `src/shared/ui/index.ts`.
   - `tools/import/index.ts` CLI placeholder.

### Step 2: Configure Module Boundary Rules & Deliberate Violation Verification

Create `.dependency-cruiser.cjs` with these exact 4 `forbidden` rules (matching Working Agreements):

1. **`only-api-and-shared-import-supabase`** (Rule 1 — Supabase client isolation):
   - Only `src/features/*/api/**`, `src/shared/supabase/**`, and `tools/import/**` may import `@supabase/supabase-js` or `src/shared/supabase/**`.
   - Config:
     ```js
     {
       name: 'only-api-and-shared-import-supabase',
       severity: 'error',
       from: { pathNot: '^(src/features/[^/]+/api/|src/shared/supabase/|tools/import/)' },
       to: { path: '^(@supabase/supabase-js|src/shared/supabase/)' }
     }
     ```
2. **`ui-never-imports-other-feature-api-or-supabase`** (Rule 2 — Component/UI isolation):
   - UI components (`src/features/<feature>/ui/**`, `src/shared/ui/**`, `src/app/**`) never import `@supabase/supabase-js` or `src/shared/supabase/**`, and `src/shared/ui/**` cannot import from `src/features/**`.
   - Config:
     ```js
     {
       name: 'ui-never-imports-supabase-or-feature-internals',
       severity: 'error',
       from: { path: '^src/shared/ui/' },
       to: { path: '^(src/features/|src/shared/supabase/|@supabase/supabase-js)' }
     }
     ```
3. **`feature-encapsulation-via-index`** (Rule 3 — Cross-feature and app-to-feature encapsulation):
   - A feature `src/features/<A>/**` or `src/app/**` may only import from `src/features/<B>` via its barrel file `src/features/<B>/index.ts`.
   - Config (split into two clean rules for clarity and regex compatibility):
     ```js
     {
       name: 'cross-feature-only-via-index',
       severity: 'error',
       from: { path: '^src/features/([^/]+)/' },
       to: {
         path: '^src/features/([^/]+)/',
         pathNot: ['^src/features/$1/', '^src/features/[^/]+/index\\.ts$']
       }
     },
     {
       name: 'app-to-feature-only-via-index',
       severity: 'error',
       from: { path: '^src/app/' },
       to: {
         path: '^src/features/[^/]+/',
         pathNot: '^src/features/[^/]+/index\\.ts$'
       }
     }
     ```
4. **`pure-nutrition-contract`** (Rule 4 — Pure nutrition contract):
   - `src/nutrition/**` cannot import from `react`, `react-dom`, `@supabase/supabase-js`, `src/features/**`, `src/app/**`, or `src/shared/supabase/**`.
   - Config:
     ```js
     {
       name: 'pure-nutrition-contract',
       severity: 'error',
       from: { path: '^src/nutrition/' },
       to: { path: '^(react|react-dom|@supabase/supabase-js|src/features/|src/app/|src/shared/supabase/)' }
     }
     ```

- **Automated Deliberate Violation Verification (`supabase/tests/boundaries.test.ts` run via `npm run test:boundaries`)**:
  - Write a Vitest test that creates temporary violation files inside a temporary subdirectory (cleaned up in `afterEach`/`finally`) or invokes `execFileSync('npx', ['depcruise', ...])` for each rule:
    1. A file in `src/features/water/ui/__violation__.ts` importing `src/shared/supabase/index.ts` -> fails with `only-api-and-shared-import-supabase`.
    2. A file in `src/shared/ui/__violation__.ts` importing `src/features/water/index.ts` -> fails with `ui-never-imports-supabase-or-feature-internals`.
    3. A file in `src/features/food-log/ui/__violation__.ts` importing `src/features/water/api/index.ts` -> fails with `cross-feature-only-via-index`.
    4. A file in `src/nutrition/__violation__.ts` importing `react` -> fails with `pure-nutrition-contract`.
    5. Running `depcruise` on the clean `src/` and `tools/` tree exits with code `0`.

### Step 3: Testing Harnesses (Vitest, fast-check, Local Supabase Integration, Playwright)

1. **Unit & Property Tests (`vitest.config.ts`, `npm run test:unit`)**:
   - Configure `vitest.config.ts` with `environment: 'jsdom'`, `include: ['src/**/*.test.{ts,tsx}']`, and `exclude: ['node_modules', 'dist', 'e2e', 'supabase']`.
   - Add `src/app/App.test.tsx` rendering `<App />` with `@testing-library/react` and asserting the `"Arki"` heading is present.
   - Add `src/nutrition/index.test.ts` with a `fast-check` property test verifying `scaleAmount(v, 2)` equals `scaleAmount(v, 1) + scaleAmount(v, 1)` within floating-point tolerance (`1e-9`).
2. **Database Integration Tests (`vitest.db.config.ts`, `npm run test:db`)**:
   - Configure `vitest.db.config.ts` with `environment: 'node'` and `include: ['supabase/tests/init.test.ts']`.
   - In `supabase/tests/init.test.ts`, resolve `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `process.env.VITE_SUPABASE_URL` / `process.env.VITE_SUPABASE_ANON_KEY`, falling back to querying `npx supabase status -o json` (`API_URL` and `ANON_KEY`) so `npm run test:db` works locally and in CI right after `supabase start` without manual `.env` copying.
   - Assert that the Supabase client connects to local PostgREST/Auth and receives a valid response from `supabase.auth.getSession()`.
3. **End-to-End Tests (`playwright.config.ts`, `npm run test:e2e`)**:
   - Configure `playwright.config.ts` with `testDir: './e2e'`, `webServer` running `npm run build && npm run preview` on `http://127.0.0.1:4173` (providing placeholder `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars if unset), and headless Chromium project.
   - Add `e2e/smoke.spec.ts` visiting `/` and asserting `expect(page.getByRole('heading', { name: 'Arki' })).toBeVisible()`.

### Step 4: Local Supabase CLI Project, Baseline Migration & Synthetic Seed

1. Run `npx supabase init` (or create `supabase/config.toml` with `project_id = "arki"` and seed enabled).
2. Create `supabase/migrations/20261116000000_init.sql`:
   ```sql
   -- Baseline empty migration for W-0 walking skeleton pipeline verification.
   -- Schema tables and RLS policies are added starting in W-2.
   select 1;
   ```
3. Create `supabase/seed.sql`:
   ```sql
   -- Synthetic seed data only. Never place real personal or health data in this file.
   select 1;
   ```
4. Commit a valid baseline `src/shared/supabase/database.types.ts` matching the output of `supabase gen types typescript --local`.

### Step 5: Documentation & ADR Extraction (`docs/adr/`, `AGENTS.md`, `README.md`)

1. Extract ADRs 1–10 from `plans/Arki_Architecture_Decisions_and_First_Backlog.md` into `docs/adr/0001-*.md` through `docs/adr/0010-*.md`:
   - Include `# ADR N: <Title>`, `**Status:** Accepted` (or `**Status:** Open (spike)` for ADR 3), `**Date:** 2026-11-16`, and the exact `Context`, `Decision`, and `Consequences` text.
2. Create `AGENTS.md` containing:
   - Definition of Done checklist
   - Module structure and the 4 enforced boundary rules
   - Standard commands table (`npm run lint`, `npm run typecheck`, `npm run test:boundaries`, `npm run test:unit`, `npm run test:db`, `npm run test:e2e`, `npm run db:reset`, `npm run db:types:check`)
   - Working agreements (Scrumban WIP limit of 1, trunk-based development, schema changes only via `supabase/migrations/`, synthetic-only data outside prod)
3. Create `README.md` covering prerequisites (Node 22+, Docker for local Supabase), quickstart commands, test commands, and links to `docs/adr/`, `AGENTS.md`, and `plans/`.

### Step 6: GitHub Actions CI, Staging DB Push, Cloudflare Pages Deploy & Repo Security

1. **`.github/workflows/ci.yml`** with two jobs so staging deployment is strictly gated by CI:
   - **Job 1: `ci`** (runs on `pull_request` and `push` to `main`):
     1. `actions/checkout@v4`
     2. `actions/setup-node@v4` (`node-version: 22`, `cache: 'npm'`)
     3. `npm ci`
     4. `npm run format:check`
     5. `npm run lint`
     6. `npm run typecheck`
     7. `npm run test:boundaries`
     8. `npm run test:unit`
     9. `supabase/setup-cli@v1` (`version: latest`)
     10. `npx supabase start` (exclude unused heavy services like studio/imgproxy/vector/logflare with `-x studio,imgproxy,vector,logflare,supavisor` for fast CI startup)
     11. `npx supabase db reset`
     12. `npm run db:types:check`
     13. `npm run test:db`
     14. `npx playwright install --with-deps chromium`
     15. `npm run test:e2e`
   - **Job 2: `deploy-staging`** (`needs: [ci]`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`):
     1. `actions/checkout@v4` & `actions/setup-node@v4` (`node-version: 22`, `cache: 'npm'`)
     2. `npm ci`
     3. Setup `supabase/setup-cli@v1`, link staging project (`supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}`), and push migrations (`supabase db push`) when `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_PROJECT_ID` secrets are configured.
     4. Build SPA (`npm run build`) with `VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}` and `VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}`.
     5. Deploy `dist/` to Cloudflare Pages via `cloudflare/wrangler-action@v3` with:
        - `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`
        - `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`
        - `command: pages deploy dist --project-name=${{ secrets.CLOUDFLARE_PAGES_PROJECT_NAME }} --branch=main`
2. **`.github/dependabot.yml`**:
   - Configure weekly updates for `npm` (`/`) and `github-actions` (`/`).
   - Enable GitHub secret scanning and push protection in repository settings.

---

## Required GitHub Secrets for Staging Deployment

| Secret / Variable               | Purpose                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Staging Supabase project URL                                        |
| `VITE_SUPABASE_ANON_KEY`        | Staging Supabase public anon key                                    |
| `SUPABASE_DB_URL`               | Staging Supabase Session Pooler connection string (IPv4 compatible) |
| `CLOUDFLARE_API_TOKEN`          | Cloudflare API token with `Cloudflare Pages:Edit` permission        |
| `CLOUDFLARE_ACCOUNT_ID`         | Cloudflare account ID                                               |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Target Cloudflare Pages project name (e.g. `arki-staging`)          |

---

## Verification Checklist (Definition of Done for W-0)

- [ ] Vite + React + TypeScript (`strict`), ESLint, Prettier, Vitest, Playwright configured and passing.
- [ ] Supabase CLI project with `20261116000000_init.sql` migration and synthetic `seed.sql` resets cleanly (`supabase db reset`).
- [ ] Boundary rules enforced via `dependency-cruiser` (`npm run lint:boundaries`) and proven to fail on deliberate violations (`npm run test:boundaries`).
- [ ] GitHub Actions `ci` job installs, lints, type-checks, runs boundary tests, starts local Supabase, applies migrations, checks generated types, and runs unit, DB integration, and Playwright E2E tests.
- [ ] GitHub Actions `deploy-staging` job (gated by `needs: [ci]` on `main`) pushes migrations to staging Supabase and deploys `dist/` to Cloudflare Pages (`--branch=main`).
- [ ] `.github/dependabot.yml`, `public/_redirects`, `.env.example`, `AGENTS.md`, `README.md`, and `docs/adr/0001..0010` committed.
