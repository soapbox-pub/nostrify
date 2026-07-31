---
'@nostrify/sqlite': minor
---

Add `NSQLite`, a high-performance `NStore` backed by SQLite.

It accepts any SQLite library through a two-method driver interface (`run` and `all`, either sync or async), so it works with `node:sqlite`, `better-sqlite3`, `bun:sqlite`, `@db/sqlite`, wa-sqlite, and remote drivers alike.

SQLite is treated as a key/value store with hand-maintained indexes rather than a relational schema — there are no joins. Filters are planned with strfry's `DBScan` priority cascade and the chosen index is forced with `INDEXED BY`, so query plans never depend on SQLite's cost estimates. Every index ends in `(created_at DESC, id ASC)`, so scans come back newest-first without a sorter.

Supports replaceable and addressable supersession, NIP-09 deletions (including refusing to re-admit a deleted event), `count()`, and `remove()`.

NIP-50 search is answered from an FTS5 index kept in step by triggers, which makes it bounded by the number of matches rather than the size of the database — 25x to 366x faster than scanning at 200k events, at about 1.7x on writes. Keywords match whole words, case- and accent-insensitively.

Writes are micro-batched: events handed over without an intervening `await` are committed in one transaction, up to 4.2x faster on concurrent ingest, with no change to the contract.

Also adds `NSQLiteJoin`, the conventional relational implementation — an events table and a tags table, joined, planned by SQLite. It has the same interface and semantics as `NSQLite`, and the two are benchmarked against each other in the package. `NSQLite` is faster on nearly every query shape (2.5–10x on tag queries, widening with database size); `NSQLiteJoin` is 3–4x faster at intersecting two or more tag terms.
