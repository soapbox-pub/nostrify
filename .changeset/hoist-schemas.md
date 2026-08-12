---
"@nostrify/nostrify": patch
"@nostrify/policies": patch
---

Build zod schemas once instead of reconstructing them on every call, in `NIP05`,
`NConnectSigner`, `N64`, `LNURL`, `BlossomUploader`, `NostrBuildUploader`,
`NRelay1`'s NIP-11 parsing, and `DomainPolicy`. Constructing these schemas cost
far more than parsing with them, so the affected calls are 60-600x cheaper.

`LNURL.lnurlDetailsSchema()` and `LNURL.lnurlCallbackSchema()` remain methods with
the same signatures, and are now memoized internally.
