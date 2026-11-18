# ADR 2: Supabase for auth, data and access control

**Status:** Accepted
**Date:** 2026-11-16

**Context.** Arki needs accounts, a relational store and per-user data isolation. Building and securing an API server would cost weeks without adding user value.

**Decision.** Use Supabase Auth, PostgreSQL and row-level security. The SPA talks to Supabase directly with the public anon key. Every user-owned table has RLS enabled with deny-by-default policies. The service-role key never reaches the browser or the repo.

**Consequences.**

- \+ No auth system or general-purpose API server to build and maintain.
- \+ Access control is enforced in the database, not in UI filtering.
- − Security depends entirely on correct RLS policies, so policies need automated tests (see Working agreements).
- − Logic that must run server-side lives in Postgres functions (ADR 4) or, if ever needed, an Edge Function.
- − Vendor dependency on Supabase; mitigated by standard Postgres and versioned migrations.
