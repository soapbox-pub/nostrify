---
outline: deep
---

# SQLite

`NSQLite` is a high-performance `NStore` backed by SQLite. It works with any SQLite library, and treats SQLite as a key/value store with hand-maintained indexes rather than a relational schema — there are no joins.

The package ships two alternative implementations with the same interface, driver and semantics, so all three are interchangeable:

- **`NSQLiteFTS`** indexes tags as full-text tokens instead of b-tree rows, and keys every table by time. Faster than `NSQLite` on tag and search queries — by an order of magnitude on the harder ones — at the same write cost.
- **`NSQLiteJoin`** is the conventional relational implementation: an events table and a tags table, joined, planned by SQLite.

See [Choosing between them](#choosing-between-them).

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

## How NSQLiteFTS works

Same idea as `NSQLite` — one chosen index, no joins, plans that don't depend on SQLite's cost estimates — but the tag index is an FTS5 inverted index rather than a b-tree, and there is no tags table at all.

An event's tags become a string of opaque tokens (`e:<id>`, `p:<pubkey>`, `t:nostr`), and FTS5's tokenizer is configured so each one is a single indivisible token. `{"#e": [id]}` is then a full-text match for the word `e:<id>`, and `{"#t": [a, b], "#p": [c]}` is one MATCH — `(t:a OR t:b) AND p:c` — that FTS5 answers by merging sorted posting lists in C. That's the whole advantage: intersecting tag terms is what an inverted index does, while a b-tree can only ever drive on one of them and has to intersect the rest by hand.

The problem with using FTS5 this way is ordering: Nostr wants newest-first with a small limit, and FTS5 only yields rows in rowid order. So rowid _is_ time:

```
rowid = created_at × 2²⁰ + a per-second sequence number
```

`ORDER BY rowid DESC` is then `ORDER BY created_at DESC`, which FTS5 satisfies by walking its posting lists backwards with no sorter, and `since`/`until` become a rowid range it pushes down into that walk. A tag query is one statement that stops as soon as it has enough rows.

The encoding pays off outside the index too. The events table is clustered by time, so the `created_at DESC` index the other designs need _is the table_; `(kind)` and `(pubkey)` are implicitly `(kind, created_at)` and `(pubkey, created_at)`, with narrower keys; and a candidate key is one integer whose event is a seek into the table b-tree rather than into a 64-character text index.

What the index doesn't carry matters as much. A posting list is only worth intersecting when it's short, and read backwards FTS5 walks a term's list in full — so a term matching a large share of the store costs its whole length however small the answer. Kinds are exactly that: there are only a handful in use. So kinds (and authors, unless a tag is already driving) are tested on the event rows the index finds, which is a column read on a row that was going to be fetched anyway, and measured 2–3x faster than intersecting a `_k:` posting list.

Tag values are encoded rather than stored raw: tokenizers split on punctuation and fold case, so a value is embedded verbatim only when it's lowercase alphanumeric — which ids, pubkeys and most topics are — and anything else is hex-escaped, keeping matches exact for values with spaces, capitals, emoji or URLs in them.

`NSQLiteFTS` requires an FTS5-enabled SQLite of at least 3.43 (2023), for contentless full-text tables that support deletion. `node:sqlite`, `better-sqlite3` and `bun:sqlite` all ship something newer.

## Choosing between them

**`NSQLiteFTS` if your workload leans on tag or search queries; `NSQLite` otherwise.** `NSQLiteFTS` is at parity on writes and on plain kind/author queries, and ahead everywhere tags or keywords are involved — by 10–60x on the shapes that combine several terms. `NSQLite` is the more conservative choice: it needs nothing of SQLite beyond ordinary b-trees, and its performance is flatter and easier to reason about.

Measured with better-sqlite3 on a synthetic dataset; the 50k column is the median of three runs. Ratios are the other store ÷ `NSQLite`, so **below 1.0 is faster than `NSQLite`**:

| Query                         | FTS @50k  | FTS @200k | Join @50k | Join @200k |
| ----------------------------- | --------: | --------: | --------: | ---------: |
| insert (whole dataset)        |     0.99x |     1.07x |     0.75x |      0.70x |
| by kind, limit 20             |     0.98x |     1.17x |     1.15x |      1.20x |
| by author, limit 20           |     0.91x |     0.79x |     1.16x |      1.02x |
| by author + kind, limit 20    |     0.97x |     1.06x |     1.15x |      1.08x |
| feed (500 authors × 2 kinds)  |     0.79x |     0.96x |     1.07x |      1.18x |
| by tag, limit 20              | **0.63x** | **0.71x** |     2.39x |     11.70x |
| by tag + kind, limit 20       | **0.78x** | **0.70x** |     5.01x |      4.60x |
| by tag, no limit              | **0.36x** | **0.46x** |     0.49x |      0.66x |
| **by two tags, limit 20**     | **0.11x** | **0.05x** |     0.33x |      0.27x |
| **by tag + author + kind**    | **0.04x** | **0.02x** |     0.02x |      0.01x |
| **by tag, 100 values**        | **0.20x** | **0.08x** |    17.83x |     38.80x |
| count by kind                 | **0.70x** | **0.45x** |     1.01x |      0.96x |
| count by tag                  |     1.06x |     1.11x |     3.67x |      8.86x |
| **by search, limit 20**       | **0.12x** | **0.03x** |     1.42x |      0.36x |
| **by search + tag, limit 20** | **0.15x** | **0.06x** |     0.79x |      0.93x |

The `NSQLiteJoin` search column measures the absence of a full-text index rather than the schema, since it scans and matches in memory.

A few things worth reading out of that table:

- **`NSQLiteFTS`'s lead grows with the database.** Intersecting two tags goes from 9x to 20x between 50k and 200k events, and a 100-value tag filter from 5x to 12x, because merging posting lists costs the size of the _answer_ while intersecting id sets in the application costs the size of the _terms_.
- **Writes are a wash.** Not obviously so, given `NSQLiteFTS` maintains two full-text indexes: it gets there by writing one index row per event instead of one per tag.
- **`NSQLiteJoin` still wins one shape outright**, tag + author + kind, where SQLite's planner correctly drives from the author index. `NSQLiteFTS` is within 3x of it there and 25–60x ahead of `NSQLite`.
- **On a small store all three are within noise** on most shapes, since deserializing events dominates. The differences above are what you get once the store is large enough for the query strategy to matter.

The one shape `NSQLiteJoin` beats `NSQLite` on is intersecting two tag terms (`{"#t": [...], "#p": [...]}`), by 3–4x. That difference is structural: only one tag index can drive the scan, so `NSQLite` resolves the remaining terms to id sets and intersects them in memory, which costs a row handed across the driver boundary for every event matching _either_ term. A join lets SQLite intersect internally and apply the `LIMIT` before any row is materialized — and an inverted index does the same thing faster still.

Both benchmarks live in the package:

```sh
deno bench -A --no-check NSQLite.bench.ts     # on the 1000-event fixture
deno run -A --no-check scale.bench.ts 200000  # on a synthetic dataset
```

## Search

NIP-50 `search` is answered from an FTS5 index that triggers keep in step with the events table. Every keyword must appear in the event's `content`, and a `-keyword` token excludes it; unsupported extension tokens (`key:value`) are ignored per the NIP.

Keywords match whole words, case- and accent-insensitively, so `nostr` matches "nostr" but not "nostrich", and `cafe` matches "café". Whatever a user types is passed as a literal phrase, so a keyword like `OR` or `(` searches for that word rather than being read as query syntax.

In `NSQLite`, how the keywords are applied depends on how many events they match, which the store measures before deciding: selective terms drive the query so it reads only matching rows, while common terms filter an ordinary indexed scan, since matches are dense enough that the scan runs into one almost immediately.

`NSQLiteFTS` needs no such choice. Its rowids are timestamps, so the index yields a keyword's matches newest-first and the scan simply stops at the limit, whether the keyword matches ten events or a million.

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
