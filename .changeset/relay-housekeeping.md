---
'@nostrify/nostrify': patch
---

`NRelay1.event` now clears its pending-event bookkeeping when the publish
settles, instead of only when an `OK` arrives — a relay that never answers, or
an aborted signal, used to leave the event held for the lifetime of the
connection.

`CircularSet` evicted the oldest member only if it was truthy, so a set holding
`''` or `0` could grow past its capacity.

`NostrBuildUploader` no longer logs the upload response to the console.
