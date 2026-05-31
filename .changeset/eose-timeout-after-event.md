---
"@nostrify/nostrify": patch
---

Fix NPool `eoseTimeout` to only start after at least one event has been received and a relay sends EOSE. Previously the timer started as soon as any relay sent EOSE, which could prematurely cancel relays that have results when an empty relay responded first.
