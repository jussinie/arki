# ADR 10: Reuse NutriTrack behaviour, not structure

**Status:** Accepted
**Date:** 2026-11-16

**Context.** NutriTrack has proven calculations and useful UI pieces, but also large page orchestration, inconsistent persistence paths and legacy compatibility code.

**Decision.** Port code only after review and only with tests. Calculations are ported with characterization tests: NutriTrack's outputs on real library data become the expected values. Selected components are ported into Arki's feature modules. Page orchestration, persistence code and compatibility handling are rebuilt.

**Consequences.**

- \+ Arki starts with verified behaviour and a clean structure.
- \+ Differences from NutriTrack are visible as failing tests, then decided deliberately.
- − Porting with tests is slower than copying code.
