---
'@nostrify/nostrify': minor
---

`NSchema.event()` now validates `sig` as 64 bytes of lowercase hex, matching
NIP-01, instead of accepting any string (including `""`) while holding `id` and
`pubkey` to the exact hex form. Added `NSchema.signature()` for the same check
on its own.
