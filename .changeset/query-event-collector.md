---
"@nostrify/nostrify": patch
---

`NPool.query` and `NRelay1.query` no longer use `NSet` to collect results, which was
re-sorting and rescanning the whole result set on every incoming event. Collecting
100 events is now ~5x faster, and 1000 events ~40x faster.

This also fixes an edge case: previously, when an event was rejected because a kind `5`
deleted it, it could still evict the older version of the replaceable event it would
have replaced, dropping both from the results.
