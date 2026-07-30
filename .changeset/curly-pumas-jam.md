---
'@nostrify/sqlite': minor
---

Add `NSQLite`, a high-performance `NStore` backed by SQLite.

It accepts any SQLite library through a two-method driver interface (`run` and `all`, either sync or async), so it works with `node:sqlite`, `better-sqlite3`, `bun:sqlite`, `@db/sqlite`, wa-sqlite, and remote drivers alike.

SQLite is treated as a key/value store with hand-maintained indexes rather than a relational schema — there are no joins. Filters are planned with strfry's `DBScan` priority cascade and the chosen index is forced with `INDEXED BY`, so query plans never depend on SQLite's cost estimates. Every index ends in `(created_at DESC, id ASC)`, so scans come back newest-first without a sorter.

Supports replaceable and addressable supersession, NIP-09 deletions (including refusing to re-admit a deleted event), NIP-50 search, `count()`, and `remove()`.
