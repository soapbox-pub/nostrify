---
outline: deep
---

# SQLite

`NSQLite` is a high-performance `NStore` backed by SQLite. It works with any SQLite library, and treats SQLite as a key/value store with hand-maintained indexes rather than a relational schema — there are no joins.

The package also ships `NSQLiteJoin`, the conventional relational implementation — an events table and a tags table, joined, planned by SQLite. The two share an interface, a driver, and their semantics, so they're interchangeable. See [Choosing between them](#choosing-between-them).

## Installation

Install `@nostrify/sqlite`:

::: code-group

```sh [npm]
npm install @nostrify/sqlite
```

```sh [yarn]
yarn add @nostrify/sqlite
```

```sh [pnpm]
pnpm add @nostrify/sqlite
```

```sh [Bun]
bun add @nostrify/sqlite
```

:::

## Usage

`NSQLite` has no dependency on a SQLite library. Give it an object with `run` and `all` and it works with whatever driver you already have. Either method may be synchronous or return a promise.

```ts
import { DatabaseSync } from 'node:sqlite';
import { NSQLite } from '@nostrify/sqlite';

const sqlite = new DatabaseSync('events.db');

const db = new NSQLite({
  run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
  all: (sql, params = []) => sqlite.prepare(sql).all(...params),
  close: () => sqlite.close(),
});

await db.migrate(); // create the tables and indexes
```

`migrate()` is safe to call on every startup.

#### Insert an event

```ts
await db.event(event);
```

#### Query events

```ts
const events = await db.query([{ kinds: [1], limit: 20 }]);
```

#### Count events

```ts
const { count } = await db.count([{ kinds: [1] }]);
```

#### Remove events

```ts
await db.remove([{ kinds: [1] }]);
```

## Drivers

Any library that can run a SQL string with bound parameters will work.

::: code-group

```ts [node:sqlite]
import { DatabaseSync } from 'node:sqlite';

const sqlite = new DatabaseSync('events.db');

const db = new NSQLite({
  run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
  all: (sql, params = []) => sqlite.prepare(sql).all(...params),
  close: () => sqlite.close(),
});
```

```ts [better-sqlite3]
import BetterSQLite3 from 'better-sqlite3';

const sqlite = new BetterSQLite3('events.db');

const db = new NSQLite({
  run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
  all: (sql, params = []) => sqlite.prepare(sql).all(...params),
  close: () => sqlite.close(),
});
```

```ts [bun:sqlite]
import { Database } from 'bun:sqlite';

const sqlite = new Database('events.db');

const db = new NSQLite({
  run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
  all: (sql, params = []) => sqlite.prepare(sql).all(...params),
  close: () => sqlite.close(),
});
```

```ts [@db/sqlite]
import { Database } from '@db/sqlite';

const sqlite = new Database('events.db');

const db = new NSQLite({
  run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
  all: (sql, params = []) => sqlite.prepare(sql).all(...params),
  close: () => sqlite.close(),
});
```

:::

### Caching prepared statements

`NSQLite` issues a small set of statement shapes with bound parameters, so a driver can cache prepared statements by SQL text and avoid re-parsing them. This is worth doing:

```ts
const statements = new Map<string, Statement>();

function prepare(sql: string) {
  let statement = statements.get(sql);
  if (!statement) {
    statement = sqlite.prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
}

const db = new NSQLite({
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
const db = new NSQLite(sqlite, {
  indexTags: (event) => event.tags.filter(([name]) => name === 'e' || name === 'p'),
  tablePrefix: 'nostr',
  onQuery: (sql, params) => console.log(sql, params),
});
```

- `indexTags` — which tags to index, and therefore which are queryable. Defaults to every single-letter tag with a non-empty value under 200 characters. A filter on a tag the policy doesn't index simply matches nothing, and changing the policy only affects events written afterwards.
- `tablePrefix` — prefix for the table names the store creates. Defaults to `nostr`.
- `onQuery` — called with every statement executed, for debugging.

## How it works

SQLite is used as a key/value store plus a set of hand-maintained indexes, and the query planner in `NSQLite` — not SQLite's — decides which index a filter scans.

- **`nostr_events`** is the value store, keyed by event id. `kind`, `pubkey` and `created_at` are duplicated out of the JSON as columns so they can be indexed and filtered without deserializing.
- **`nostr_tags`** is the tag index: `(name, value, created_at DESC, id)` carrying `kind`. It's a `WITHOUT ROWID` table, so the rows _are_ the b-tree and a tag scan touches exactly one.
- **`nostr_coords`** maps a replaceable or addressable coordinate (`kind:pubkey:d`) to the id currently stored there, making supersession a single primary-key lookup.
- **`nostr_events_fts`** is an FTS5 index over event content, kept in step by triggers rather than by application code, so no write path can forget it.

Every index ends in `(created_at DESC, id ASC)`, so scanning any index prefix yields it newest-first with no sorter — the same trick [strfry](https://github.com/hoytech/strfry) uses by packing `created_at` into the trailing bytes of an LMDB key.

A filter is planned with strfry's `DBScan` priority cascade — ids, then the most selective `#tag`, then pubkey+kind, pubkey, kind, and finally a full `created_at` scan — and the chosen index is forced with `INDEXED BY`, so the plan never depends on SQLite's cost estimates or on how stale `ANALYZE` is. Execution is two-phase: scan the index for candidate keys, then fetch those values by primary key. Conditions the index can't express become part of the scan's `WHERE` clause where SQLite can evaluate them; anything left over — extra tag terms, NIP-50 keywords — is matched in memory, with the scan paged by keyset so memory stays bounded.

## Choosing between them

Use `NSQLite` unless your workload is dominated by filters that intersect two or more tags. It's faster on nearly every query shape, and its lead on tag queries widens as the database grows, because the relational design's cost scales with how many rows a tag matches while `NSQLite`'s stays flat.

Measured with better-sqlite3 on a synthetic dataset. Ratios are `NSQLiteJoin ÷ NSQLite`, so above 1.0 means `NSQLite` is faster:

| Query                        | 50k events | 200k events |
| ---------------------------- | ---------: | ----------: |
| by kind, limit 20            |       1.1x |        1.2x |
| by author, limit 20          |       1.2x |        1.3x |
| by author + kind, limit 20   |       1.1x |        1.5x |
| **by tag, limit 20**         |   **2.5x** |   **10.3x** |
| **by tag + kind, limit 20**  |   **5.6x** |    **5.6x** |
| **count by tag**             |   **3.7x** |    **8.3x** |
| feed (500 authors × 2 kinds) |       1.0x |        1.0x |
| count by kind                |       1.0x |        1.0x |
| **by two tags, limit 20**    |   **0.3x** |    **0.3x** |
| insert (whole dataset)       |      0.75x |        0.7x |

Search is absent from the table because the two no longer answer it the same way — `NSQLite` uses a full-text index and `NSQLiteJoin` scans — so comparing them would measure the index rather than the schema. Writes are the one place `NSQLiteJoin` is reliably ahead, by about a third, which is what maintaining that index costs.

On a database of a few thousand events the two are within noise of each other on most shapes, since deserializing the events dominates. The differences above are what you get once the store is large enough for the query strategy to matter.

The one shape `NSQLiteJoin` wins decisively is intersecting two tag terms (`{"#t": [...], "#p": [...]}`), by 3–4x. That difference is structural rather than incidental: only one tag index can drive the scan, so `NSQLite` resolves the remaining terms to id sets and intersects them in memory, which costs a row handed across the driver boundary for every event matching _either_ term. A join lets SQLite intersect internally and apply the `LIMIT` before any row is materialized. Writes are within a couple of percent either way.

Both benchmarks live in the package:

```sh
deno bench -A --no-check NSQLite.bench.ts     # on the 1000-event fixture
deno run -A --no-check scale.bench.ts 200000  # on a synthetic dataset
```

## Search

NIP-50 `search` is answered from an FTS5 index that triggers keep in step with the events table. Every keyword must appear in the event's `content`, and a `-keyword` token excludes it; unsupported extension tokens (`key:value`) are ignored per the NIP.

Keywords match whole words, case- and accent-insensitively, so `nostr` matches "nostr" but not "nostrich", and `cafe` matches "café". Whatever a user types is passed as a literal phrase, so a keyword like `OR` or `(` searches for that word rather than being read as query syntax.

How the keywords are applied depends on how many events they match, which the store measures before deciding: selective terms drive the query so it reads only matching rows, while common terms filter an ordinary indexed scan, since matches are dense enough that the scan runs into one almost immediately.

Measured against the previous scan-and-match implementation, 200k events, better-sqlite3:

| Query                      |     scan |   FTS5 |          |
| -------------------------- | -------: | -----: | -------- |
| rare term, limit 20        |  42.7 ms | 1.7 ms | 25x      |
| rare term, unlimited       | 870.0 ms | 2.4 ms | 366x     |
| term matching nothing      | 873.3 ms | 0.0 ms | 22600x   |
| two keywords               |  39.8 ms | 1.8 ms | 23x      |
| with negation              |  38.8 ms | 1.7 ms | 23x      |
| search + kind              |  25.0 ms | 2.3 ms | 11x      |
| search + tag               |  80.0 ms | 2.2 ms | 36x      |
| count by search            | 842.4 ms | 2.4 ms | 352x     |
| very common term, limit 20 |   1.8 ms | 3.2 ms | **0.6x** |
| insert (whole dataset)     |  13.8 s  | 22.8 s | **0.6x** |

The scan wins one case: a word appearing in nearly every event, where it runs into matches immediately while the index has more bookkeeping to do. Results there aren't useful anyway, and the absolute cost is a few milliseconds.

Maintaining the index costs about 1.7x on writes. That buys search bounded by the number of matches rather than by the size of the database.

## Behavior

- **Replaceable and addressable events** supersede older versions at the same coordinate on write, so queries never return a stale profile or list.
- **Deletion requests** (kind `5`) delete the events they target, but only when the requester authored them. A deleted event can't be re-added — the attempt throws a `RelayError`.
- **Ephemeral events** are never stored.
- **NIP-50 `search`** is answered from a full-text index — see [Search](#search).
- **NIP-40 expiration is not handled**, and nothing is pruned automatically.
