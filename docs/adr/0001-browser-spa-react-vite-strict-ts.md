# ADR 1: Browser SPA with React, Vite and strict TypeScript

**Status:** Accepted
**Date:** 2026-11-16

**Context.** Arki must work on phone and desktop. One developer builds it. Native features (health integrations, background sync) are deferred.

**Decision.** Build a responsive single-page app with React, Vite and TypeScript in `strict` mode. No server rendering and no native app. Data from outside the app (Supabase responses that bypass generated types, import files) is validated at runtime with a schema library such as Zod.

**Consequences.**

- \+ One codebase for all screens; static hosting; fast local development.
- \+ Type errors are caught before runtime; generated database types keep queries honest.
- − No reliable background work or native push; revisit if reminders become core.
- − First load depends on bundle size; keep it in check from the start.
