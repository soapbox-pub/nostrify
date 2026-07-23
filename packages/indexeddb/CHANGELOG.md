# Changelog

## 0.2.0

### Minor Changes

- 3140377: Add NIP-50 full-text search to `NIndexedDB`. `search` filters are parsed per NIP-50 — extension tokens (`key:value`) are parsed and removed — and the remaining keywords are matched against event content case-insensitively (all keywords must appear; `-keyword` excludes). Search scans page candidates through the planned index in fixed-size chunks, newest-first, matching until the filter's limit is reached, so memory stays bounded by the chunk size even on a full-store scan.

## 0.1.1

### Patch Changes

- faac744: Overhaul NIndexedDB query execution for performance:

  - `ids` filters now use direct primary-key `get()`s instead of one cursor per id.
  - Unlimited scans fetch each index range with a single `getAll()` instead of stepping a cursor per record (~75x faster on the benchmark).
  - Limited scans open all planned cursors in parallel and k-way merge them newest-first, so a query touches ~`limit` records total instead of up to `limit` records per cursor.
  - Multiple filters in one `query()` now run concurrently within a single transaction.
  - `count()` uses `index.count()` for index-only plans with disjoint ranges, counting inside the index without deserializing rows (~700x faster on the benchmark).
  - In-memory filter matching uses `Set` lookups instead of `Array.includes`, and pre-lowercases `search` terms.
  - An aborted `AbortSignal` now rejects `query()` instead of resolving with `[]`.

- Updated dependencies [9ab9e73]
- Updated dependencies
  - @nostrify/nostrify@0.54.0

## 0.1.0

### Minor Changes

- Initial release of `@nostrify/indexeddb`, providing `NIndexedDB`: a general-purpose `NStore` backed by IndexedDB for use as a persistent client-side cache in the browser. It is a port of strfry's LMDB query engine, supporting arbitrary Nostr filters, replaceable/addressable supersession, NIP-09 deletions, and configurable tag indexing.
