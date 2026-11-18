# ADR 4: Coupled writes through Postgres functions

**Status:** Accepted
**Date:** 2026-11-16

**Context.** Saving a recipe and its ingredients must succeed or fail together. supabase-js cannot run a multi-statement transaction from the browser, and delete-then-insert sequences leave broken data on partial failure.

**Decision.** Writes that touch more than one row or table run as Postgres functions called through `supabase.rpc()`, each in one transaction. Simple reads and single-row writes use table access with RLS. Functions are declared `security invoker` so RLS still applies; `security definer` needs its own ADR.

Initial RPC list: `save_recipe`, `log_food_entry`, `import_library_batch`.

**Consequences.**

- \+ Atomic writes; no orphan ingredients or half-saved recipes.
- \+ The RPC list is the write-side service layer, small and explicit.
- − Logic in SQL is harder to unit test, so each function gets integration tests against local Supabase.
- − Function signatures are an API contract; changes go through migrations.
