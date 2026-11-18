# Testing, Security & Verification Rules for Coding Agents

Referenced from [`AGENTS.md`](../AGENTS.md) for writing, running, and reviewing tests and security checks. For software architecture, module layering, code quality attributes, and refactoring rules, see [`docs/coding-principles.md`](./coding-principles.md).

## 0. Prime Directive

You are implementing behavior that a human has specified. Tests are the executable specification. Your job is to make the code satisfy the tests, never to make the tests satisfy the code. "Done" means verified with actual command output, not "looks done."

---

## 1. Project Commands (Arki Repository)

See [`AGENTS.md` §4](../AGENTS.md#4-verification-commands) for the canonical `package.json` command table. Test and security verification suites:

```text
- Fast unit, UI & property tests: npm run test:unit (Vitest + Testing Library + fast-check)
- Module boundary tests:          npm run lint:boundaries && npm run test:boundaries
- Local Supabase RLS / RPC tests: npm run db:start && npm run db:reset && npm run test:db
- Generated DB types drift check: npm run db:types:check
- End-to-End browser tests:       npm run test:e2e (Playwright)
- Coverage / Mutation (on diff):  npx vitest run --coverage | npx stryker run (when enabled)
- Dependency / supply-chain scan: npm audit
- Full pre-PR verification gate:  npm run format:check && npm run lint && npm run typecheck && npm run test:boundaries && npm run test:unit && npm run db:types:check && npm run test:db && npm run test:e2e
```

---

## 2. Workflow for Every New Feature or Behavior Change

1. **Clarify the spec.** Restate the requirement as acceptance criteria in Given/When/Then form (matching the stories in `plans/`), including error cases, domain invariants, and security/RLS expectations. If anything is ambiguous, ASK before coding. List what is out of scope.
2. **Design first.** Sketch the public interface (`index.ts` exports, RPC signatures, table columns/constraints), data types, edge cases, and failure modes for the whole feature before writing code (do not let the first test dictate the design). Verify the design respects the 4 enforced module boundary rules in `.dependency-cruiser.cjs`.
3. **Write failing tests (RED).** Derive tests from the acceptance criteria, not from an imagined implementation. Do not write production code yet; do not create stub implementations that make tests pass.
4. **Prove RED for the right reason.** Run the tests (`npm run test:unit`, `npm run test:db`, or `npm run test:e2e`). Each must fail with an assertion or "not implemented" error tied to the missing behavior, not with a syntax/import/fixture error. Record the failing output.
5. **Checkpoint.** Commit tests alone: `test: <feature> acceptance tests`. Stop and present the tests for review when the task is non-trivial, security/RLS-relevant, or the spec was ambiguous.
6. **Implement (GREEN).** Write the minimal code (and SQL migrations in `supabase/migrations/` if applicable) to pass. Do NOT modify, delete, skip, or weaken any test committed in step 5. Run the fast suite (`npm run test:unit`) after each meaningful change; run the full gate before finishing.
7. **Refactor.** Improve structure with tests green. Keep structural changes (renames, extractions) in separate commits from behavioral changes. Record any new architectural decision in `docs/adr/`.
8. **Harden.** Add `fast-check` property-based tests for invariants (mandatory for `src/nutrition/`), boundary/negative tests, and local Supabase RLS/RPC security tests (Section 6 & Section 7). When mutation testing is used on changed files, add or strengthen tests until surviving mutants are killed or documented as equivalent.
9. **Exercise the real thing.** Start local Supabase (`npm run db:start && npm run db:reset`) and the app (`npm run dev` or `npm run test:e2e`) and exercise the new behavior end-to-end. If you find a bug, first write a failing test reproducing it, then fix.
10. **Independent review & report.** For behavior-changing work, obtain a fresh read-only review from an agent/reviewer that did not author the code (Section 9). Summarize: tests added, commands run with actual output, coverage/mutation results, security/RLS checks, and anything skipped and why.

### Bug Fixes

Reproduce first: write a test that fails because of the bug, show it fails, then fix. The test stays as a regression test.

### Legacy / Ported Code (ADR 10)

When porting calculations or behavior from NutriTrack (ADR 10) or modifying existing code, first write characterization tests that pin expected behavior against sanitized library fixtures (treat them as read-only). Then change behavior via new tests. When retiring an unsafe legacy path breaks an old test, document the exact conflict and obtain explicit human approval before updating the test.

---

## 3. NEVER Do These

- Never edit, delete, rename, skip (`skip`, `xfail`, `@Disabled`, `.only`, `.skip`, `it.todo`), or loosen an existing test or assertion to make a suite pass.
- Never change test config (`vitest*.config.ts`, `playwright.config.ts`), thresholds, CI workflows (`.github/workflows/`), coverage/mutation settings, ESLint config, or `.dependency-cruiser.cjs` boundary rules to make checks pass.
- Never special-case test inputs, detect test environments in production logic, hard-code expected outputs, or catch-and-ignore exceptions to get green.
- Never compute a test's expected value by calling the code under test.
- Never mock the unit under test or internal modules/validators/hooks/contracts you own (e.g., never mock `src/nutrition/` inside feature tests).
- Never bypass architectural boundaries (e.g., importing Supabase inside `ui/` or `src/nutrition/`, or importing another feature's internals bypassing its `index.ts`).
- Never add a dependency you have not verified exists on the official npm registry (Section 8).
- Never commit secrets, tokens, Supabase `service_role` keys, real personal or health data (`supabase/seed.sql` and test fixtures must be 100% synthetic), or `.env` / `.env.local` files.
- Never edit an `Accepted` ADR in `docs/adr/` in place; write a new ADR that supersedes it.
- Never mark work done with failing, flaky, or unrun tests, or claim test evidence in documentation that is not actually asserted in code.

**If a test seems wrong or the task seems impossible: STOP. Do not work around it. Explain the conflict between spec and test and ask a human.**

---

## 4. Test-Quality Checklist (Every Test You Write)

1. **Public interfaces:** Tests behavior through public entry points:
   - UI & journeys through rendered DOM (`@testing-library/react`, user events, or Playwright E2E)
   - Feature APIs through their public `index.ts` or TanStack Query hooks
   - Pure calculations through `src/nutrition/index.ts`
   - Database tables, RLS policies, and RPCs through `@supabase/supabase-js` against local Supabase (`npm run test:db`)
   - CLI library import through `tools/import/` entrypoints
2. **Equivalence classes & boundaries:** Covers below/at/above each limit (e.g., water amounts `0`, `1`, `5000`, `5001`, `-1`, `NaN`), empty, `null`/`undefined`, whitespace-only, max byte/character size, invalid types, multi-byte Unicode (e.g., Finnish characters `ä`, `ö`, `å`), and negative/zero/NaN numbers.
3. **Meaningful assertions:** Uses literal or independently derived expected values. Asserts exact database states, PostgREST/Auth error codes, rendered text/aria roles, and state changes.
4. **Focused & descriptive:** One behavior per test; name states the behavior (`rejects_water_entry_when_amount_exceeds_5000_ml`, `prevents_user_b_from_reading_user_a_water_logs`).
5. **Deterministic:** No real wall-clock time (`local_date` is always passed explicitly per ADR 7), unseeded randomness, live external network, or test-order dependence.
6. **Verified by mutation:** Would fail if the implementation were wrong — verify by breaking the code or via mutation testing.

### Mocking Policy & External Boundary Alignment

- **Mock only at external boundaries you do not own** (outbound HTTP `fetch`, Supabase wire boundary in isolated unit tests, or clock). Never mock the component, hook, Zod validator, or `src/nutrition/` calculation function under test. For database, RLS, and RPC behavior, run real integration tests against local Supabase (`npm run test:db`) rather than mocking Supabase.
- If a test needs more than ~2 mocks, the design is likely coupled; refactor.
- **Preventing Mock Drift (Contract Alignment):** When a feature modifies database or API persistence, keep all 4 contract layers synchronized:
  1. **Database Schema & Migrations (`supabase/migrations/`):** Table definitions, column types, `NOT NULL` / `CHECK` constraints, Row-Level Security (RLS) policies (ADR 2), and `security invoker` Postgres RPC functions (ADR 4).
  2. **Generated Types & Runtime Validation (`src/shared/supabase/database.types.ts` & Zod):** Regenerate TypeScript types from local Supabase (`npm run db:types`) and verify no drift (`npm run db:types:check`). Validate external/untrusted payloads (such as library import files or untyped responses) at runtime with Zod (ADR 1).
  3. **Local Supabase Integration Tests (`supabase/tests/`, `npm run test:db`):** Exercise every new table, RLS policy (including cross-user denial), idempotent `client_op_id` write (ADR 8), explicit `local_date` constraint (ADR 7), and RPC transaction against the real local Postgres/PostgREST container.
  4. **E2E Tests & Synthetic Fixtures (`e2e/`, `supabase/seed.sql`, `npm run test:e2e`):** Run Playwright E2E tests against the built app and local Supabase (or contract-spy route interceptors that assert outbound payloads match the schema), keeping `supabase/seed.sql` 100% synthetic and schema-aligned.

### Property-Based Tests (`fast-check`)

Required for `src/nutrition/` (ADR 5) and recommended for date helpers (`src/shared/date/`), quantity math, parsers, and library import mappers (`tools/import/`):

- **Scaling & linearity:** Scaling a portion by `2` equals adding two `1x` portions within agreed floating-point tolerance (`1e-9`).
- **Aggregation invariants:** A recipe's total nutrition equals the sum of its ingredients; a day summary equals the sum of its logged snapshots.
- **Precision vs. display rounding:** Internal stored values remain unrounded; display rounding never mutates stored snapshot values (ADR 5, ADR 6).
- **Round-trip & idempotence:** `decode(encode(x)) === x`, repeatable library import batching (ADR 9), and structural validation across arbitrary fuzz inputs.

### Coverage & Mutation Thresholds

- Coverage shows what is untested; it is not a quality score by itself.
- **Diff coverage** of changed lines: **>= 80%** with branch coverage enabled.
- **Mutation score** on changed files: **>= 70%** (or every surviving mutant individually inspected and justified as equivalent).

---

## 5. Examples (TypeScript / Vitest + `fast-check` + Supabase RLS)

### Boundary & Property-Based Test (`src/nutrition/` / Domain Logic)

```ts
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { scaleAmount } from './index';

describe('nutrition contract', () => {
  it('Rejects water amounts outside 1..5000 ml', () => {
    for (const invalid of [0, -1, 5001, NaN, Infinity]) {
      expect(() => validateWaterAmountMl(invalid)).toThrow();
    }
    for (const valid of [1, 250, 5000]) {
      expect(validateWaterAmountMl(valid)).toBe(valid);
    }
  });

  it('scaleAmount(value, 2) equals scaleAmount(value, 1) + scaleAmount(value, 1)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100_000, noNaN: true }), (value) => {
        const doubled = scaleAmount(value, 2);
        const summed = scaleAmount(value, 1) + scaleAmount(value, 1);
        expect(Math.abs(doubled - summed)).toBeLessThan(1e-9);
      }),
      { numRuns: 500 }
    );
  });
});
```

### Cross-User RLS & Idempotency Integration Test (`supabase/tests/`)

```ts
it('Prevents user B from reading, updating, or deleting user A water entries', async () => {
  const entryId = crypto.randomUUID();
  const { error: insertError } = await userAClient
    .from('water_logs')
    .insert({ id: entryId, amount_ml: 250, local_date: '2026-11-20' });
  expect(insertError).toBeNull();

  const { data: userBRead } = await userBClient
    .from('water_logs')
    .select('*')
    .eq('id', entryId);
  expect(userBRead).toEqual([]);

  const { data: userBDelete } = await userBClient
    .from('water_logs')
    .delete()
    .eq('id', entryId)
    .select();
  expect(userBDelete).toEqual([]);
});
```

---

## 6. Security Testing Checklist (OWASP Top 10:2025, Supabase RLS & LLM Top 10)

Add explicit tests for every category that applies to the change:

- **Access Control, RLS & IDOR (A01 / ADR 2 & ADR 4):**
  - Every user-owned table has Row-Level Security (RLS) enabled with deny-by-default policies checking `auth.uid() = user_id`.
  - Every table, policy, and RPC has integration tests in `supabase/tests/` (`npm run test:db`) for unauthenticated requests (rejected), wrong user (`User B` sees `0` rows / cannot mutate `User A`'s rows), and the allowed owner case.
  - Multi-row/multi-table writes use `security invoker` Postgres functions (`supabase.rpc()`) so RLS stays active (ADR 4). Using `security definer` is forbidden without a dedicated accepted ADR.
  - Enforce server/database-side identity (`auth.uid()`); never trust a caller-supplied `user_id` or `email` without enforcing `user_id = auth.uid()` in RLS `WITH CHECK` and RPC bodies.
- **SSRF & Outbound Requests (A01):**
  - Validate outbound URLs against an explicit origin/protocol allowlist (`https:` required; local loopback `http://127.0.0.1` or `http://localhost` only in local dev/test). Disable credential-carrying redirects (`redirect: 'error'`).
- **Misconfiguration & Secrets (A02 / ADR 2):**
  - Only `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY` may be exposed via `VITE_*` client environment variables.
  - The Supabase `service_role` key, database passwords, and private API keys must never be placed in `VITE_*` variables, client bundles, committed files, or URL query parameters (`?key=`).
  - Missing or placeholder Supabase configuration must fail closed with a clear diagnostic error and zero unintended network calls.
- **Cryptography & Auth Tokens (A04 & A07 / ADR 2):**
  - Delegate authentication and JWT verification strictly to Supabase Auth; never implement homemade JWT signature verification or custom crypto.
  - Test sign-in, sign-out, unauthenticated redirect to sign-in, and expired/invalid session handling.
- **Injection, XSS & Untrusted Inputs (A05 / ADR 1 & ADR 9):**
  - Parameterize all SQL queries inside Postgres functions; never concatenate unescaped user input into dynamic SQL (`EXECUTE`).
  - Treat all user-supplied and imported text (food names, recipe instructions, import payloads) as untrusted data; render via React's default escaping (never `dangerouslySetInnerHTML`) and validate external files/responses with Zod.
- **Domain Invariants, Input Bounds & Idempotency (A10 / ADR 5–8):**
  - Enforce numeric bounds (`CHECK (amount_ml BETWEEN 1 AND 5000)`, finite non-negative macros), string length caps, and collection size limits in both client Zod schemas and Postgres constraints.
  - Require explicit `local_date date not null` on all log tables; never derive `local_date` from UTC `logged_at` (ADR 7).
  - Keep logged food entries as immutable nutrition snapshots so editing or deleting a library item never alters historical logs (ADR 6).
  - Test idempotent writes: sending a create request twice with the same client-generated UUID / `client_op_id` must use `ON CONFLICT DO NOTHING`, return the existing row, and never duplicate data (ADR 8).
- **Logging & Error Handling (A09):**
  - Never leak bearer tokens, `anon` / `service_role` keys, raw stack traces, or environment variable dumps into user-facing error messages or console logs.
- **LLM & AI Integrations (OWASP LLM Top 10, if added in future):**
  - Bound upstream response stream bytes and timeouts (`504`). Validate parsed model output against a strict Zod schema and return `502` on malformed or out-of-range values. Never allow model output to grant permissions, bypass RLS, or write logs without user confirmation.

---

## 7. Standard Security Boundary Pipelines

### A. Supabase Table / RPC Write Pipeline (Arki Primary Data Path)

When implementing or reviewing a database table, RLS policy, or Postgres RPC in `supabase/migrations/`:

1. **Migration-only schema:** All DDL changes live in versioned SQL files under `supabase/migrations/`.
2. **RLS enabled immediately:** Every table enables RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`) in the same migration that creates it.
3. **Explicit ownership check:** `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies verify `auth.uid() IS NOT NULL AND auth.uid() = user_id` (using both `USING` and `WITH CHECK` on writes).
4. **Invoker security on RPCs:** Functions are declared `SECURITY INVOKER` with an explicit `SET search_path = public` and run atomic transactions (ADR 4).
5. **Idempotency & conflict handling:** Create paths accept the client-generated operation UUID (`id` or `client_op_id`), handle retries via `ON CONFLICT DO NOTHING`, and return the existing record (ADR 8).
6. **Constraint enforcement:** Database `NOT NULL`, `CHECK`, and foreign-key constraints reject invalid payloads (e.g., missing `local_date`, out-of-range quantities, negative macros) even if client validation is bypassed.

### B. HTTP / Edge Function API Security Pipeline (When Applicable)

If an Edge Function or custom HTTP endpoint is introduced, enforce and test checks in this exact order:

1. **Route match:** Unknown routes return `404` (`NOT_FOUND`) with `Cache-Control: no-store`.
2. **Origin validation:** Reject disallowed cross-origin requests with `403` (`FORBIDDEN_ORIGIN`). No wildcard (`*`) credential policies.
3. **HTTP method check:** Return `405` (`METHOD_NOT_ALLOWED`) with `Allow` header for unsupported methods; handle `OPTIONS` preflight (`204`) with zero auth or provider calls.
4. **Media type & header size check:** Require expected `Content-Type` (`415` `UNSUPPORTED_MEDIA_TYPE`) and reject oversize `Content-Length` headers early (`413` `PAYLOAD_TOO_LARGE`).
5. **Single-authority authentication:** Verify bearer token against the configured Supabase project with bounded timeout (`5s`) and `redirect: 'error'`. Return `401` on invalid/missing token, `503` on missing config or upstream auth outage. No fallback to secondary/legacy projects.
6. **Fail-closed rate limiting:** Key rate limits by verified user ID and operation group. Return `429` with `Retry-After` when exceeded, or `503` if limiter is missing/broken.
7. **Bounded stream body read:** Read request body through a byte-counting stream reader and abort immediately with `413` if the stream exceeds the route's byte cap.
8. **Strict schema validation:** Validate with Zod; reject unknown keys, invalid types, duplicates, and out-of-range values with `400`.
9. **Bounded provider call & output validation:** Enforce upstream timeout (`504`) and response byte cap (`502`), and validate output schema before returning `{ data }` or `{ error, code }` with `Cache-Control: no-store`.

---

## 8. Dependencies & Supply Chain (A03)

- Prefer the web platform standard library and existing repository dependencies (`react`, `@tanstack/react-query`, `@supabase/supabase-js`, `zod`, `vitest`, `fast-check`, `@playwright/test`).
- Before adding any npm package: verify it exists on the official npm registry, check exact name spelling, maintainer, age, downloads, and repository; reject brand-new or unverified packages to prevent LLM hallucination / "slopsquatting".
- Pin versions in `package.json`, commit `package-lock.json`, run `npm audit`, verify `npm run lint:boundaries` still passes, and state every added dependency and why in the PR description.

---

## 9. Multi-Agent Roles, Write Allowlists & Independent Review

- **Execution Brief & Write Allowlist:** Before modifying code, define the goal, acceptance criteria, exact write allowlist (paths/globs), read-only inputs, and required verification commands. Do not modify files outside the allowlist without amending the plan.
- **Discovery Before Implementation:** When hardening or extending existing modules, run a read-only discovery phase first to inventory all affected features, ADRs, migrations, RLS policies, environment variables, and test coverage gaps.
- **Independent Read-Only Review:** The agent or author that wrote the implementation cannot supply its own independent review. Before publishing a behavior-changing PR:
  1. Delegate review to a **fresh, read-only subagent** (or separate model) with zero implementation context bias.
  2. Provide the reviewer with the story spec/acceptance criteria, relevant ADRs, complete `git diff` (plus untracked files), and command output from the verification suite.
  3. The reviewer must verify that every acceptance criterion is genuinely exercised through public entry points in the test files (not just claimed in markdown docs), check module boundary compliance (`npm run lint:boundaries`), verify RLS/cross-user tests for any schema change, and report actionable findings back to the implementer.

---

## 10. Definition of Done

A story counts as done only when it meets every item below; partially done work counts as zero:

- [ ] Acceptance criteria written in Given/When/Then form and each mapped to automated tests through public entrypoints (Playwright E2E in `e2e/` for user journeys, Vitest in `src/` for unit/component logic)
- [ ] Failing-test commit (RED) precedes implementation commit (GREEN)
- [ ] No existing test modified, removed, or skipped without explicit human approval
- [ ] Pure nutrition and domain logic has `fast-check` property-based tests as well as boundary/negative unit tests
- [ ] Every new or changed table, RLS policy, or Postgres RPC exists only as a migration in `supabase/migrations/`, has regenerated types (`npm run db:types:check`), and has local Supabase integration tests (`npm run test:db`) including a cross-user access denial test and idempotency test
- [ ] Full verification suite passes with actual output shown: `npm run format:check`, `npm run lint` (`lint:eslint` + `lint:boundaries`), `npm run typecheck`, `npm run test:boundaries`, `npm run test:unit`, `npm run db:types:check`, `npm run test:db`, and `npm run test:e2e`
- [ ] Changed-line coverage >= 80% (with branch coverage) and changed-file mutation score >= 70% (or surviving mutants justified)
- [ ] Applicable Section 6 & 7 security items tested; `npm audit` and secret checks clean; seed and test fixtures remain 100% synthetic
- [ ] Code is refactored; any new architectural choice is recorded as a new ADR in `docs/adr/`
- [ ] Feature exercised end-to-end against the real local runtime (`npm run dev` / `npm run preview` + local Supabase)
- [ ] Fresh independent read-only review completed, all findings resolved, PR self-reviewed in GitHub, CI green, and deployed to staging
