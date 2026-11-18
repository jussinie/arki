# ADR 6: Logged entries are immutable snapshots

**Status:** Accepted
**Date:** 2026-11-16

**Context.** Editing a recipe or ingredient must not rewrite previous days.

**Decision.** A log entry stores its own name, quantity, unit and computed nutrition at log time. It may keep a nullable reference to its source item for convenience, but summaries read only the snapshot. Editing a log entry recomputes that entry only.

**Consequences.**

- \+ History stays true to what was eaten and logged.
- \+ Deleting a library item never breaks old logs.
- − Some duplicated data per entry, which is fine at this scale.
- − Fixing a wrong library value does not correct past logs; that is intended.
