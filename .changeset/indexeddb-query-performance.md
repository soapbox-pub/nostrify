---
"@nostrify/indexeddb": patch
---

Overhaul NIndexedDB query execution for performance:

- `ids` filters now use direct primary-key `get()`s instead of one cursor per id.
- Unlimited scans fetch each index range with a single `getAll()` instead of stepping a cursor per record (~75x faster on the benchmark).
- Limited scans open all planned cursors in parallel and k-way merge them newest-first, so a query touches ~`limit` records total instead of up to `limit` records per cursor.
- Multiple filters in one `query()` now run concurrently within a single transaction.
- `count()` uses `index.count()` for index-only plans with disjoint ranges, counting inside the index without deserializing rows (~700x faster on the benchmark).
- In-memory filter matching uses `Set` lookups instead of `Array.includes`, and pre-lowercases `search` terms.
- An aborted `AbortSignal` now rejects `query()` instead of resolving with `[]`.
