---
"@nostrify/nostrify": minor
---

NRelay1: automatically retry REQ and EVENT after NIP-42 AUTH

When a relay responds with `auth-required:` in a CLOSED or OK message, NRelay1 now waits for the AUTH flow to complete and re-sends the original request. This implements the full NIP-42 client-side protocol flow. Retries are limited to one attempt per subscription/event to prevent infinite loops.
