# ADR 3: Separate Supabase project for Arki (open)

**Status:** Open (spike)
**Date:** 2026-11-16

**Context.** NutriTrack runs on an existing Supabase project. A new project gives a clean schema and keeps NutriTrack intact. Reusing the old one could save migration work but may carry legacy assumptions.

**Proposed decision.** Create a new Supabase project for Arki, plus a separate staging project.

**Decide after spike S-1.** Reuse the existing project only if it saves at least 3 working days _and_ Arki's schema needs no legacy columns, fallbacks or shared tables with NutriTrack.

**Consequences if accepted.**

- \+ Clean schema built only from Arki migrations.
- \+ NutriTrack keeps running unchanged as a reference and fallback.
- − Users and the library must be moved with an import (ADR 9).
- − Two projects to pay for and maintain for a while.
