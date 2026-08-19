---
'@nostrify/nostrify': patch
---

`NConnectSigner`: decrypt NIP-46 responses by looking at the ciphertext rather
than at the `encryption` option, and surface a response that can't be read
instead of waiting out the timeout.

`encryption` is documented as governing outbound messages only — "Decryption is
automatic" — but `decrypt()` dispatched on it just as `encrypt()` did. NIP-46
lets a signer answer in either scheme no matter which one the request used, so a
NIP-04 bunker talking to a client configured for NIP-44 could not be understood.
A NIP-04 ciphertext ends in `?iv=<iv>`, and `?` is outside the base64 alphabet a
NIP-44 payload is confined to, so the scheme is readable off the payload itself.

Such a failure previously hung until the request timed out, with nothing to say
why. Because the author is checked first, and forging that author means forging
its signature, an unreadable payload can only be the signer we are connected to
failing — which is worth reporting, so it now throws.
