# ADR 5: One nutrition calculation contract

**Status:** Accepted
**Date:** 2026-11-16

**Context.** Library previews, portion calculations, logs and summaries must agree on units, quantities, precision and rounding. Two implementations (TypeScript and SQL) would drift.

**Decision.** A pure TypeScript module `src/nutrition/` is the single authority. It has no React or Supabase imports. The client computes the values; RPCs store them as given. The database does not recompute nutrition.

The contract fixes:

- Supported units and conversions.
- Internal precision (unrounded values stored) and display rounding (applied only at render).
- How a recipe's per-portion values derive from its ingredients.
- How a day summary sums entries.

**Consequences.**

- \+ One place to test and change nutrition rules.
- \+ Previews and saved values cannot disagree.
- − The database trusts the client's numbers. Acceptable because users write only their own data.
- − Any future server-side calculation must reuse this contract, not copy it.
