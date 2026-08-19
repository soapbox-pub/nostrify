---
'@nostrify/nostrify': minor
---

`LNURL`: validate the addresses it fetches.

- `fromLightningAddress` interpolated the name straight into the well-known
  path after an email-shaped check. LUD-16 limits a name to `a-z0-9-_.` (plus
  `+`), which is narrower than an email local part, and even that admits `..` —
  which `new URL` resolves as a step up the path. Names and domains are now
  checked against LUD-16's form, and the address is lowercased as LUD-16
  specifies.
- Every URL an LNURL flow fetches must be https, or http for a `.onion` host,
  per LUD-01. This covers both the endpoint itself — which arrives bech32
  encoded, so it can decode to any string at all — and the `callback`, which is
  chosen by whichever server answered the first request and was previously
  fetched as given.
