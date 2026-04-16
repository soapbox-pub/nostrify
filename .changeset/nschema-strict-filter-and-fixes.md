---
"@nostrify/nostrify": minor
---

NSchema: stricter validation and bug fixes.

- `n.event()` and `n.filter()` now enforce the documented `kind` upper bound of `65535`.
- `n.filter()` now rejects unrecognized top-level keys (e.g. `seenOn`) instead of silently dropping them. `#`-prefixed tag filters continue to pass through. Callers that were relying on the lenient behavior should strip application-specific fields before validating.
- `n.bech32(prefix)` now returns a helpful error message when the prefix doesn't match (e.g. `Expected bech32 prefix "npub1"`).
- `n.relayInfo()`'s nested `retention` and `fees` entries now use `.catch(undefined)` consistently, so a single malformed entry no longer invalidates the entire NIP-11 document.
- Removed a redundant no-op `.required({...})` call from `n.event()`.
