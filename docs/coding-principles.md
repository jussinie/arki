# Coding Principles

Design and code-quality rules for Arki. Written for both human contributors and coding agents.

Referenced from [`AGENTS.md`](../AGENTS.md) so agents load it on demand when designing, writing, refactoring, or reviewing code. For TDD workflow, test quality, and security/RLS verification rules, see [`docs/testing-and-security.md`](./testing-and-security.md).

The goal of every design decision is **internal quality**: code that is easy to read, change, extend, and verify. Concretely, that means:

- Code says what it does through naming and structure, and makes the underlying design visible.
- Changing one thing happens in **one place** (one function, module, or contract).
- It is easy to find _where_ a fix or extension belongs.
- A change has no side effects in places the author could not anticipate.
- After a change, it is easy to verify nothing else broke (automated tests and boundary checks).

---

## 1. Architecture

### 1.1 Respect the layers

Arki uses a **layered, feature-modular architecture**. Each layer uses only the layers below it, and dependencies point **downward only**.

| Layer in Arki                             | Responsibility                                                                                                                      | Must NOT                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/app/` & `src/features/*/ui/`         | Render views, handle user input, call feature TanStack Query hooks / public `index.ts` exports                                      | Import `@supabase/supabase-js` or `src/shared/supabase/`, or implement core nutrition calculations |
| `src/features/*/model/`                   | Feature domain types, Zod input validation, view-model transforms, client operation ID creation (ADR 8)                             | Import React UI components or the Supabase client                                                  |
| `src/features/*/api/` & `tools/import/`   | Query/write storage via `src/shared/supabase/`, invoke `security invoker` Postgres RPCs (ADR 4), expose TanStack Query hooks        | Contain UI rendering or duplicate nutrition math from `src/nutrition/`                             |
| `src/nutrition/` & `src/shared/date/`     | Pure domain contracts: units, portion scaling, recipe aggregation, day summaries (ADR 5), and explicit `local_date` helpers (ADR 7) | Depend on React, Supabase, `src/features/`, or `src/app/`                                          |
| `src/shared/ui/` & `src/shared/supabase/` | Reusable design-system primitives (`ui/`) and typed Supabase client (`supabase/`)                                                   | Import from any `src/features/*` module                                                            |
| `supabase/migrations/`                    | Versioned SQL schema, constraints, deny-by-default RLS policies (ADR 2), and atomic `security invoker` RPCs (ADR 4)                 | Recompute nutrition in SQL (ADR 5) or derive `local_date` from UTC timestamps (ADR 7)              |

- **Dependencies point downward only.** Pure domain contracts (`src/nutrition/`) never import features or infrastructure. `src/shared/ui/` never imports features or Supabase.
- **Never shortcut a layer** to make something work (e.g., calling `supabase.from(...)` directly inside a React component, or importing `src/features/water/api/` directly from `src/features/food-log/ui/`). It works once and erodes the architecture every time. If a UI component needs data, expose a hook through the feature's `api/` and re-export it via the feature's `index.ts` when needed across features.
- Keep the layer structure visible in the directory layout (`ui/`, `api/`, `model/`, `index.ts`).

### 1.2 Enforce architecture automatically (fitness functions)

Written rules erode unless checked automatically. Arki encodes its 4 dependency rules in [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs), runs them on every lint pass (`npm run lint:boundaries`), and tests that deliberate violations fail the build (`npm run test:boundaries` in [`supabase/tests/boundaries.test.ts`](../supabase/tests/boundaries.test.ts)):

1. **`only-api-and-shared-import-supabase`**: Only `src/features/*/api/`, `src/shared/supabase/`, and `tools/import/` may import Supabase.
2. **`ui-never-imports-supabase-or-feature-internals`**: `src/shared/ui/` cannot import from `src/features/` or Supabase.
3. **`cross-feature-only-via-index` & `app-to-feature-only-via-index`**: Features and `src/app/` import a feature only through its barrel file `src/features/<feature>/index.ts`.
4. **`pure-nutrition-contract`**: `src/nutrition/` imports nothing from React, Supabase, `src/features/`, or `src/app/`.

### 1.3 Prefer a modular monolith over microservices

- Start as a single deployable SPA backed by Supabase Postgres/Auth/RLS, split internally into **feature modules (`session`, `water`, `library`, `food-log`) with clear `index.ts` interfaces**.
- Modules must not reach into each other's internal `ui/`, `api/`, or `model/` directories.
- Coupled multi-table database writes happen in atomic `security invoker` Postgres RPC functions (`save_recipe`, `log_food_entry`, `import_library_batch` per ADR 4), treating function signatures and generated types (`src/shared/supabase/database.types.ts`) as explicit contracts.

### 1.4 Grow the architecture incrementally — with discipline

- Build a **walking skeleton** first (`W-0` through `W-3`: pipeline + sign-in + water tracking end-to-end): a thin slice connecting React, TanStack Query, Supabase Auth, RLS, migrations, idempotent writes, explicit local dates, and CI/staging deployment. It is permanent, production-quality code with tests, not a throwaway.
- Add each feature as a **vertical slice** through all layers (migration/RLS → generated types → `model/` & `api/` → `ui/` → E2E test), not horizontal layer by layer.
- Design "just enough" up front; revise earlier decisions via a superseding ADR when they no longer serve the system.
- Incremental design fails when it becomes an accumulation of ad-hoc tactical shortcuts. Each change must leave the structure as clean as, or cleaner than, before.

### 1.5 Record architecture decisions (ADRs)

Every significant architectural decision gets a concise (≤ 1 page) Markdown file in [`docs/adr/`](./adr/), versioned with the code:

```markdown
# ADR N: <Decision title>

**Status:** Accepted (or: Proposed | Open (spike) | Superseded by ADR M)
**Date:** YYYY-MM-DD

## Context

Why a decision was needed; forces and constraints.

## Decision

What we chose.

## Consequences

- - positive consequences
- − negative consequences / costs / trade-offs
```

- **Never edit an accepted ADR.** If a decision changes, write a new ADR that supersedes the old one.
- Agents may draft ADRs and explore options, but **the human owner makes and approves the decision**.

### 1.6 Diagrams

Use the [C4 model](https://c4model.com/) levels (Context → Containers → Components → Code). Every diagram has a clear level and every box and arrow is labelled. Prefer diagrams-as-code (`mermaid` flowcharts, sequence diagrams, or ER diagrams) kept in the repo, and always pair diagrams with written responsibilities and interfaces.

---

## 2. Quality Attributes of Good Code

Aim for all seven. The first four are structural; testability, clarity, and simplicity largely follow from them.

1. **Encapsulation**
2. **High cohesion**
3. **Low coupling**
4. **No redundancy (DRY)**
5. **Testability**
6. **Clarity**
7. **Simplicity**

### 2.1 Encapsulation / information hiding

- Hide internal state and implementation details behind a small public interface. Export only what external callers need from `src/features/<feature>/index.ts`; keep internal helpers, query key builders, and raw persistence shapes non-exported or confined to `api/` and `model/`.
- Encapsulation is broader than private fields. Also hide: **data structures, calculation precision rules, wire formats, how operation IDs are constructed, and internal component breakdown**.
- Apply Parnas's rule: **each module hides one design decision that is likely to change** (e.g., `src/nutrition/` hides internal precision and display rounding rules; `src/features/*/api/` hides PostgREST queries and RPC argument mapping; `tools/import/` hides NutriTrack legacy format mapping).
- Do not reach into another module's internals.

### 2.2 High cohesion

Each function, component, hook, and module focuses on **one thing**.

- **Function level:** A function does one task at **one level of abstraction**. Do not mix low-level details (building Supabase query filters, parsing raw JSON strings) with domain-level logic (calculating recipe portion macros) in the same function. Extract small, well-named helpers and let the top-level function coordinate them.
- **Module / component level (Single Responsibility Principle):** A module has **only one reason to change**. If a module would change both because "nutrition rounding rules changed" and because "Supabase table columns changed", split it (`src/nutrition/` vs. `src/features/food-log/api/`).
- UI components render and dispatch user intents; TanStack Query hooks in `api/` manage server-state synchronization; `model/` owns validation and pure state transformations.

### 2.3 Low coupling

- **Remove unnecessary dependencies** by moving responsibilities to the module that owns the data.
- **Program to an interface, not an implementation.** Use TypeScript structural interfaces/types so domain logic depends on narrow abstractions rather than concrete infrastructure clients.
- **Inject dependencies** (via function parameters, hook arguments, or React props/context at the app boundary) instead of hard-wiring network clients, clocks (`new Date()`), random UUID generators, or file readers inside business logic.

```ts
// Bad: hard-wired wall-clock time and concrete Supabase call inside domain logic
export async function createWaterEntry(amountMl: number) {
  const today = new Date().toISOString().slice(0, 10); // violates ADR 7 & couples to system clock
  return supabase
    .from('water_logs')
    .insert({ amount_ml: amountMl, local_date: today });
}

// Good: explicit inputs and narrow persistence interface injected
export interface WaterLogStore {
  insertWaterLog(entry: NewWaterLogEntry): Promise<WaterLogEntry>;
}

export function buildWaterLogEntry(params: {
  id: string;
  amountMl: number;
  localDate: LocalDate;
}): NewWaterLogEntry {
  validateWaterAmountMl(params.amountMl);
  return {
    id: params.id,
    amount_ml: params.amountMl,
    local_date: params.localDate,
  };
}
```

- Wire concrete implementations together at the composition root (`src/app/` providers, feature `api/` hooks, or `tools/import/index.ts`).
- **Favour composition over inheritance.** Compose small pure functions, custom hooks, and React children/props rather than building class hierarchies.

### 2.4 DRY — don't repeat yourself

- _Every piece of knowledge must have a single, unambiguous, authoritative representation within the system._ In Arki:
  - **Nutrition rules:** `src/nutrition/` is the single authority (ADR 5) — never duplicate macro math in React components or SQL functions.
  - **Database schema & types:** `supabase/migrations/` is the single schema authority, and `src/shared/supabase/database.types.ts` is generated from it via `npm run db:types` (verified by `npm run db:types:check`).
- **Search for and reuse existing code** before writing new helpers.
- **Rule of three:** Similar logic in two places is acceptable when contexts differ; on the third occurrence, refactor into a shared helper.
- _Duplication is far cheaper than the wrong abstraction_ (Sandi Metz). Do not abstract prematurely across features when two forms or views only look superficially similar today.

### 2.5 Testability

- Code built from loosely coupled, single-responsibility units is easy to test. **If something is hard to test, treat it as a design problem** (mixed responsibilities, hidden I/O, or direct coupling to globals) and fix the design, not the test.
- Keep validation, date helpers (`src/shared/date/`), import mapping, and nutrition calculations (`src/nutrition/`) pure so they can be verified with fast unit and `fast-check` property tests without a browser or database.
- Use injected fakes/stubs for I/O or clock dependencies in unit tests, and test real SQL/RLS/RPC contracts against local Supabase (`npm run test:db`). See [`docs/testing-and-security.md`](./testing-and-security.md) for the full testing and mocking policy.

### 2.6 Clarity (clean code)

Most engineering time is spent reading code. Optimise for the reader:

- **Descriptive names** for variables, functions, types, components, and modules. Include units in numeric identifiers where ambiguity exists (e.g., `amountMl`, `weightGrams`, `kcalPer100g`, `localDate`).
- **Consistent formatting and lint:** Follow Prettier (`.prettierrc`) and strict TypeScript/ESLint (`eslint.config.js`, `tsconfig.json`).
- **Short functions** focused on one task at one level of abstraction.
- **Avoid deep nesting:** Use early returns / guard clauses and small extracted functions.
- **No magic numbers:** Use named constants (e.g., `MIN_WATER_AMOUNT_ML = 1`, `MAX_WATER_AMOUNT_ML = 5000`).
- **Comments:**
  - Do **not** write comments that narrate _what_ the code does — make the code self-explanatory through naming and structure.
  - **Do** write comments that explain _why_: rationale for a non-obvious constraint, reference to an ADR (e.g., `// ADR 6: snapshot macros at log time`), or edge-case context.
  - **Do** write concise TSDoc comments on exported contract functions in `src/nutrition/` and feature `index.ts` boundaries.

### 2.7 Simplicity — KISS and YAGNI

- **Do not add features, flexibility, configuration options, or abstractions "in case we need them later."** (For example, do not build offline sync queues, custom caching layers, or multi-tenant organization roles when the backlog story only asks for single-user idempotent writes).
- Introduce a design pattern only when there is a **real, present need**.
- Flexibility can be added later cheaply by refactoring — as long as the code stays well-tested and modular.

---

## 3. Code Smells — Recognise and Fix

A smell is an easy-to-spot sign that internal quality is degrading; address the root cause in the design.

| Smell                                                                                          | Usually Indicates                   | Typical Fix in Arki                                                                           |
| ---------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Duplicated code (e.g., macro scaling or date formatting repeated in UI)                        | Violated DRY / weak cohesion        | Consolidate into `src/nutrition/` or `src/shared/date/`; apply Rule of three                  |
| Long function or component                                                                     | Low cohesion, mixed abstraction     | Extract pure helper functions into `model/` or smaller sub-components into `ui/`              |
| Module/file with many unrelated exports                                                        | Violated SRP                        | Split into focused modules (`ui/`, `api/`, `model/`)                                          |
| Long parameter lists                                                                           | Missing domain parameter object     | Pass a typed domain object (e.g., `LogFoodSnapshotInput`)                                     |
| Unclear or unitless names (`val`, `data`, `amount`, `date`)                                    | Hidden domain design                | Rename with domain & unit specificity (`amountMl`, `localDate`, `portionGrams`)               |
| "What" comments explaining obvious syntax                                                      | Unclear code                        | Rename or extract helper; delete the redundant comment                                        |
| **Primitive obsession** — domain concepts (`LocalDate`, `ClientOpId`, units) as raw primitives | Missing domain type / validation    | Introduce branded/validated Zod schemas and TypeScript types in `model/` or `src/shared/`     |
| **Shotgun surgery** — one logical change requires edits across many features                   | Poor encapsulation, DRY violation   | Move shared contract into `src/nutrition/`, `src/shared/`, or the owning feature's `index.ts` |
| Complex conditionals switching on item/unit kind across multiple files                         | Missing data-driven map or strategy | Centralize unit conversion table or polymorphic strategy in `src/nutrition/`                  |

---

## 4. Refactoring

Refactoring is changing internal structure **without changing externally visible behaviour**.

- **Tests first.** Passing tests are a precondition for refactoring. When porting legacy NutriTrack calculations or components (ADR 10), write characterization tests first before restructuring.
- **Small steps.** Make one controlled structural change at a time and run `npm run test:unit` and `npm run typecheck` after each step.
- **Keep structural and behavioral commits separate.** Follow Red → Green → Refactor (see [`docs/testing-and-security.md`](./testing-and-security.md) §2): first make the test pass, then clean up the structure in a distinct step.
- **Refactor continuously.** Code is "done" only when it has been refactored to a clean state and passes all lint, type, and boundary checks.

---

## 5. Technical Debt

Shortcuts trade speed now for "interest" paid later on every change. Classify debt with Fowler's quadrant:

1. **Reckless & deliberate** — _"we don't have time for design or boundaries"_ → **Forbidden.**
2. **Reckless & inadvertent** — _"what's layering / RLS?"_ → **Prevented by reading ADRs, `docs/coding-principles.md`, and running automated boundary checks.**
3. **Prudent & inadvertent** — _"now that we built it, we see a cleaner design"_ → **Refactor when touched or record for immediate follow-up.**
4. **Prudent & deliberate** — _"ship a simple walking-skeleton slice now, defer non-essential scope"_ → **Acceptable when explicitly scoped in `plans/` or recorded.**

- **Make deliberate debt visible:** Record it in a GitHub issue or a `// TODO(debt): <reason and payback trigger>` comment. Never hide silent workarounds.

---

## 6. Design Rules for Coding Agents

Agents generate code quickly and naturally bias toward "make the immediate prompt work." Without discipline, that erodes module boundaries and introduces duplication. When working in Arki, agents must:

1. **Follow the layer and boundary rules in §1.1–1.2.** Never bypass a layer or import across features outside `index.ts`.
2. **Search for and reuse existing code** (`src/nutrition/`, `src/shared/`, feature `model/` and `api/`) before writing new helpers. Do not copy-paste logic.
3. **Apply YAGNI (§2.7).** Do not add speculative abstractions, unrequested configuration flags, or extra features outside the story's acceptance criteria.
4. **Inject external dependencies (§2.3).** Do not hard-wire system clocks (`new Date()`), random IDs, or direct network/database calls inside pure domain or calculation functions.
5. **Keep changes local and cohesive.** Respect the task's write allowlist. If a change requires touching many unrelated modules, stop and flag the design issue (shotgun surgery).
6. **Refactor as an explicit, separate step** after tests are green, and report what was refactored.
7. **Do not make architectural decisions silently.** If a change affects database schema design, module boundaries, dependencies, or ADRs (`docs/adr/`), propose the change (or draft a superseding ADR) and ask for human approval.
8. **Avoid cognitive debt:** Keep functions small and readable, use domain-specific names with units, and explain non-obvious trade-offs in _why_ comments or the PR summary.
9. **Satisfy all automated checks and testing rules:** Follow [`docs/testing-and-security.md`](./testing-and-security.md) for TDD, property testing, RLS security verification, and never weaken a check (`eslint`, `tsc`, `dependency-cruiser`, or tests) to get green.

---

## 7. Design & Code-Quality Pre-Merge Checklist

Verify these design items alongside the verification and security Definition of Done in [`docs/testing-and-security.md`](./testing-and-security.md) §10:

- [ ] Layer and feature-module boundary rules (§1.1–1.2) respected and `npm run lint:boundaries` + `npm run test:boundaries` pass
- [ ] Each new or changed function does one thing at one level of abstraction (§2.2)
- [ ] Each module/component has a single responsibility and a narrow public interface via `index.ts` (§2.1–2.2)
- [ ] External dependencies (clock, IDs, storage/Supabase) are injected rather than hard-wired into domain logic (§2.3)
- [ ] Single source of truth preserved (`src/nutrition/` for nutrition math, `supabase/migrations/` + generated `database.types.ts` for schema) with no copy-pasted logic (§2.4)
- [ ] No speculative generality or unrequested features added ("just in case" / YAGNI, §2.7)
- [ ] Clear, unit-explicit names, no magic numbers, no _what_ comments, and concise _why_ / ADR comments where needed (§2.6)
- [ ] No code smells from §3 introduced
- [ ] Refactoring completed in small, test-verified steps after GREEN (§4)
- [ ] Any significant architectural choice recorded as a new ADR in `docs/adr/` (§1.5)
- [ ] Any deliberate technical debt explicitly marked with `TODO(debt):` and a reason (§5)
