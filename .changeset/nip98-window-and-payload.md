---
'@nostrify/nostrify': minor
---

`NIP98.verify`: bound `created_at` in both directions, and require the `payload`
tag when payload validation is on.

NIP-98 asks that `created_at` be "within a reasonable time window"; only the
past was bounded, so a future-dated event had a negative age that never reached
`maxAge` and a token minted with a `created_at` a year out was accepted forever.
`maxAge` is now the tolerance in either direction.

The `payload` check was skipped entirely when the tag was absent, which meant a
`POST`/`PUT`/`PATCH` token bound only the URL and method — replayable against
the same endpoint with any body. NIP-98 makes the tag a client-side SHOULD and
the check a server-side MAY, so this is a policy choice, and `validatePayload`
is now the knob for it: when on (still the default for `POST`, `PUT` and
`PATCH`) the tag is required, and servers that must accept clients which omit it
can pass `validatePayload: false`. A payload tag that is present is checked
either way.
