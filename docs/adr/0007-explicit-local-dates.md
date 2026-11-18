# ADR 7: Explicit local dates

**Status:** Accepted
**Date:** 2026-11-16

**Context.** Users log against a calendar day they choose, often after the fact. Deriving the day from a UTC timestamp breaks around midnight and when travelling.

**Decision.** Every log row has `local_date date not null`, chosen in the UI and sent explicitly. `logged_at timestamptz` is kept as metadata only. All day views and summaries group by `local_date`. Changing time zones does not move existing entries.

**Consequences.**

- \+ What the user picked is what they see, everywhere.
- \+ No time-zone arithmetic in queries.
- − "Today" is computed in the browser's time zone; the selected date must be passed through every write path.
