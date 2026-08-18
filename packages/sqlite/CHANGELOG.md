# Changelog

## 0.1.0

### Minor Changes

- Initial release of `@nostrify/sqlite`, providing `NSQLite`: a high-performance `NStore` backed by SQLite.

  It accepts any SQLite library through a two-method driver interface (`run` and `all`, either sync or async), so it works with `node:sqlite`, `better-sqlite3`, `bun:sqlite`, `@db/sqlite`, wa-sqlite, and remote drivers alike.

  There is no tags table. An event's tags become opaque tokens (`e:<id>`, `p:<pubkey>`, `t:nostr`) in an FTS5 index whose tokenizer is configured so each is a single indivisible token, so `{"#e": [id]}` is a match for the word `e:<id>` and `{"#t": [a,b], "#p": [c]}` is one MATCH that FTS5 answers by merging posting lists in C — rather than by driving on one term and intersecting the rest in the application.

  The obstacle to using FTS5 this way is that it only yields rows in rowid order, so rowid is made to _be_ time: `created_at × 2²⁰ + a per-second sequence`. Newest-first is then a backwards walk of a posting list with no sorter, `since`/`until` are a rowid range FTS5 pushes down, and the events table is clustered by time — which also makes `(kind)` and `(pubkey)` implicitly time-ordered, and a candidate key one integer.

  Plans are pinned rather than costed: b-tree scans are chosen by strfry's `DBScan` priority cascade and forced with `INDEXED BY`, and index-driven scans fix their join order with `CROSS JOIN`, applying the limit after every condition so a scan stops as soon as it has enough surviving rows. Nothing depends on SQLite's cost estimates, so `ANALYZE` is not needed.

  Writes are batched: events handed over without an intervening `await` are committed in one transaction as multi-row `INSERT`s, which matters because SQLite runs an `AFTER INSERT` trigger's sub-program once per statement rather than once per row. Concurrent ingest costs 281µs an event against 823µs for awaiting each in turn.

  Supports replaceable and addressable supersession, NIP-09 deletions (including refusing to re-admit a deleted event), `count()`, and `remove()`.

  NIP-50 search is answered from a second FTS5 index kept in step by triggers. Because rowids are timestamps, a keyword's matches arrive newest-first and the scan stops at the limit, so search is bounded by the number of matches rather than by the size of the database.

  Measured on 200k events with better-sqlite3 — Zipf authors and topics, a tenth of them replaceable, on disk — a tag query with a limit takes 0.31ms, intersecting two tags 0.41ms, a 100-value tag filter 5.6ms, and a search 0.64ms, in 198MB.
