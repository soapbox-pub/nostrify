---
'@nostrify/policies': patch
---

`DomainPolicy`: compare NIP-05 domains case-insensitively (and ignore a trailing
dot), so `user@EVIL.COM` no longer walks past a blacklist of `evil.com` — DNS
resolves both to the same host, and the lookup succeeded either way because
`URL` folds the host itself. Blacklist and whitelist entries are folded the same
way. Both list checks now run *before* the NIP-05 lookup, so a rejected domain
can't make the relay issue an HTTP request to a host of the event author's
choosing.

`AntiDuplicationPolicy`: key on a SHA-256 digest instead of a 32-bit
`hashCode`. A 4-byte digest is cheap to find preimages for, so a spammer could
seed the store with content colliding against a message they wanted suppressed
and have it rejected for the whole `expireIn` window.
