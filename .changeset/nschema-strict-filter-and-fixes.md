---
"@nostrify/nostrify": minor
"@nostrify/types": minor
---

NSchema: stricter validation and NIP-11 spec coverage.

- `n.event()` and `n.filter()` now enforce the documented `kind` upper bound of `65535`.
- `n.filter()` now rejects unrecognized top-level keys (e.g. `seenOn`) instead of silently dropping them. `#`-prefixed tag filters continue to pass through. Callers that were relying on the lenient behavior should strip application-specific fields before validating.
- `n.bech32(prefix)` now returns a helpful error message when the prefix doesn't match (e.g. `Expected bech32 prefix "npub1"`).
- `n.relayInfo()` (and `NostrRelayInfo`) now cover the NIP-11 spec fields that were previously missing: `banner`, `self`, `terms_of_service`, and `limitation.default_limit`.
- Removed a redundant no-op `.required({...})` call from `n.event()`.
