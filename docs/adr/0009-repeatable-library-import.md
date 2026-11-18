# ADR 9: Repeatable library import

**Status:** Accepted
**Date:** 2026-11-16

**Context.** The existing library (ingredients, recipe relationships, direct-macro meals, favourites, configured portions) is a launch requirement. Units and precision must survive, and conflicts must not be resolved silently.

**Decision.** Import runs as a repeatable command with two modes:

- **Dry run** writes nothing and produces a conflict report.
- **Apply** writes in batches through `import_library_batch`.

Every imported row stores its NutriTrack source ID, so re-runs update instead of duplicating. A conflict (an existing Arki row differs from the source, a unit cannot be mapped, a reference is missing) is reported and skipped, never overwritten.

**Consequences.**

- \+ The import can run many times during development and once more at launch.
- \+ Data loss shows up as a report line, not a surprise.
- − Source IDs remain in the schema as provenance.
- − Historical logs are not imported (deferred scope).
