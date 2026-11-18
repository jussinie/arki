# ADR 8: Idempotent writes through client operation IDs

**Status:** Accepted
**Date:** 2026-11-16

**Context.** TanStack Query and flaky mobile networks retry requests. A retried "add 250 ml water" must not add 500 ml.

**Decision.** Create operations generate a UUID when the user acts, not when the request is sent. That UUID is the row's primary key (or a unique `client_op_id`). Inserts use `on conflict do nothing` and return the existing row. Naturally idempotent writes (set favourite, set value) need no ID.

**Consequences.**

- \+ Retries, double taps and reconnects never duplicate data.
- \+ A step towards offline use later, without building sync now.
- − Every create path must carry the ID from the UI through to the database; tests cover the retry case.
