# @nostrify/sqlite

A high-performance `NStore` backed by SQLite, for any SQLite library.

```sh
npm install @nostrify/sqlite
```

Two implementations are provided. They share an interface, a driver, and their
semantics, and differ only in how they store and query events:

- **`NSQLite`** treats SQLite as a key/value store with hand-picked indexes and
  no joins. This is the default choice.
- **`NSQLiteJoin`** uses the conventional relational schema — an events table
  and a tags table, joined, planned by SQLite.

See [Which one?](#which-one) for the measured differences.

## Usage

`NSQLite` doesn't depend on a SQLite library. Give it an object with `run` and
`all` and it works with whatever driver you already have — `node:sqlite`,
`better-sqlite3`, `bun:sqlite`, `@db/sqlite`, wa-sqlite in the browser, or a
remote database over HTTP. Either method may be sync or async.

```ts
import { DatabaseSync } from 'node:sqlite';
import { NSQLite } from '@nostrify/sqlite';

const sqlite = new DatabaseSync('events.db');

const store = new NSQLite({
  run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
  all: (sql, params = []) => sqlite.prepare(sql).all(...params),
  close: () => sqlite.close(),
});

await store.migrate();

await store.event(event);

const events = await store.query([{ kinds: [1], limit: 20 }]);
```

`migrate()` creates the tables and indexes if they don't exist. It's safe to
call on every startup.

### Caching prepared statements

The store issues a small set of statement shapes with bound parameters, so a
driver can cache prepared statements by SQL text and skip re-parsing. This is
worth doing:

```ts
const statements = new Map<string, Statement>();

const prepare = (sql: string) => {
  let statement = statements.get(sql);
  if (!statement) {
    statement = sqlite.prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
};

const store = new NSQLite({
  run: (sql, params = []) => void prepare(sql).run(...params),
  all: (sql, params = []) => prepare(sql).all(...params),
});
```

### Recommended pragmas

For a durable on-disk store:

```ts
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA synchronous = NORMAL');
```

## Options

```ts
const store = new NSQLite(db, {
  // Which tags to index, and therefore which are queryable. Defaults to every
  // single-letter tag with a non-empty value under 200 chars.
  indexTags: (event) => event.tags.filter(([name]) => name === 'e' || name === 'p'),
  // Prefix for the table names the store creates. Default `nostr`.
  tablePrefix: 'nostr',
  // Called with every statement executed, for debugging.
  onQuery: (sql, params) => console.log(sql, params),
});
```

A filter on a tag the policy doesn't index simply matches nothing. Changing the
policy only affects events written afterwards.

## Benchmarks

```sh
# NSQLite vs NSQLiteJoin on the 1000-event fixture
deno bench -A --no-check NSQLite.bench.ts

# ...and on a synthetic dataset of any size
deno run -A --no-check scale.bench.ts 200000
```

## How NSQLite works

SQLite is used as a key/value store plus a set of hand-maintained indexes, and
the query planner in this package — not SQLite's — decides which index a filter
scans. There are no joins.

- **`nostr_events`** is the value store, keyed by event id. `kind`, `pubkey`
  and `created_at` are duplicated out of the JSON as columns so they can be
  indexed and filtered without deserializing.
- **`nostr_tags`** is the tag index: `(name, value, created_at DESC, id)`
  carrying `kind`. It's a `WITHOUT ROWID` table, so the rows *are* the b-tree
  and a tag scan touches exactly one.
- **`nostr_coords`** maps a replaceable or addressable coordinate
  (`kind:pubkey:d`) to the id currently stored there, making supersession a
  single primary-key lookup.

Every index ends in `(created_at DESC, id ASC)`, so scanning any index prefix
yields it newest-first with no sorter — the same trick strfry uses by packing
`created_at` into the trailing bytes of an LMDB key.

A filter is planned with strfry's `DBScan` priority cascade — ids, then the
most selective `#tag`, then pubkey+kind, pubkey, kind, and finally a full
`created_at` scan — and the chosen index is forced with `INDEXED BY`, so the
plan never depends on SQLite's cost estimates or on how stale `ANALYZE` is.
Execution is two-phase: scan the index for candidate keys, then fetch those
values by primary key. Conditions the index can't express become part of the
scan's `WHERE` clause where SQLite can evaluate them; anything left over —
extra tag terms, NIP-50 keywords — is matched in memory, with the scan paged by
keyset so memory stays bounded.

## How NSQLiteJoin works

The conventional relational design, for comparison and for workloads that
intersect several tags. An events table and a tags table
(`(name, value, event_id)`, plus a secondary index on `event_id` so an event's
tags can be deleted without a scan), with one statement per filter: each `#tag`
term becomes an `INNER JOIN` against the tag table and everything else becomes a
`WHERE` clause. `DISTINCT` is added only when a join can actually duplicate a
row. There's no `INDEXED BY` — choosing the join order and the driving index is
what SQLite's planner is for.

## Which one?

Use `NSQLite` unless your workload is dominated by filters that intersect two
or more tags. It's faster on nearly every query shape, and its lead on tag
queries widens as the database grows, because the relational design's cost
scales with how many rows a tag matches while `NSQLite`'s stays flat.

Measured with better-sqlite3 on a synthetic dataset (`deno run -A --no-check
scale.bench.ts <count>`). Ratios are `NSQLiteJoin ÷ NSQLite`, so above 1.0
means `NSQLite` is faster:

| Query                       | 50k events | 200k events |
| --------------------------- | ---------: | ----------: |
| by kind, limit 20           |      1.1x  |       1.2x  |
| by author, limit 20         |      1.2x  |       1.3x  |
| by author + kind, limit 20  |      1.1x  |       1.5x  |
| **by tag, limit 20**        |    **2.5x**|   **10.3x** |
| **by tag + kind, limit 20** |    **5.6x**|    **5.6x** |
| **count by tag**            |    **3.7x**|    **8.3x** |
| feed (500 authors × 2 kinds)|      1.0x  |       0.9x  |
| count by kind               |      1.0x  |       0.9x  |
| search, limit 20            |      0.9x  |       0.9x  |
| **by two tags, limit 20**   |    **0.3x**|    **0.2x** |
| insert (whole dataset)      |      1.0x  |       1.0x  |

On a database of a few thousand events the two are within noise of each other
on most shapes, since deserializing the events dominates. The differences above
are what you get once the store is large enough for the query strategy to
matter.

The one shape `NSQLiteJoin` wins decisively is intersecting two tag terms
(`{"#t": [...], "#p": [...]}`), by 3–4x. That difference is structural rather
than incidental: only one tag index can drive the scan, so `NSQLite` resolves
the remaining terms to id sets and intersects them in memory, which costs a row
handed across the driver boundary for every event matching *either* term. A
join lets SQLite intersect internally and apply the `LIMIT` before any row is
materialized. Writes are within a couple of percent either way.

## Behavior

- **Replaceable and addressable events** supersede older versions at the same
  coordinate on write, so queries never return a stale profile or list.
- **Deletion requests** (kind 5) delete the events they target, but only when
  the requester authored them. A deleted event can't be re-added — the attempt
  throws a `RelayError`.
- **Ephemeral events** are never stored.
- **NIP-50 `search`** matches every keyword against the event's `content`,
  case-insensitively, with `-keyword` negating. Unsupported extension tokens
  (`key:value`) are ignored per the NIP. There's no full-text index, so search
  always post-filters a scan.
- **NIP-40 expiration is not handled**, and nothing is pruned automatically.
