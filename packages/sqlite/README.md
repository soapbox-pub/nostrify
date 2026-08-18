# @nostrify/sqlite

A high-performance `NStore` backed by SQLite, for any SQLite library.

```sh
npm install @nostrify/sqlite
```

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

Requires an FTS5-enabled SQLite of at least 3.43 (2023), for contentless
full-text tables that support deletion. `node:sqlite`, `better-sqlite3` and
`bun:sqlite` all ship something newer.

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

### Write batching

`NSQLite` collects events handed to it without an intervening `await` and
commits them in one transaction, as a handful of multi-row `INSERT`s. Nothing
about the contract changes — the promise from `event()` still resolves only once
that event is durably committed — but the per-event overhead is amortized across
the batch.

```ts
// One transaction, not 500.
await Promise.all(events.map((event) => store.event(event)));
```

Measured on 50k events, disk-backed with WAL and `synchronous = NORMAL`:

| Ingest pattern             | per event |          |
| -------------------------- | --------: | -------- |
| `await` each event in turn |    823 µs | baseline |
| 500 concurrent             |    281 µs | **2.9x** |

Awaiting each event in turn gives batches of one, which is why that row is the
baseline rather than an improvement: there's only ever one event in flight to
batch. Feed events in concurrently to get the benefit.

### Recommended pragmas

For a durable on-disk store:

```ts
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA synchronous = NORMAL');
```

`ANALYZE` is not needed. Every scan names its index or fixes its join order, so
plans don't depend on SQLite's cost estimates — see [How it works](#how-it-works).

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

## How it works

There is no tags table. An event's tags are flattened into a string of opaque
tokens — `e:<id>`, `p:<pubkey>`, `t:nostr` — and handed to FTS5, whose tokenizer
is configured so each one is a single indivisible token. `{"#e": [id]}` is then
a full-text match for the word `e:<id>`, and `{"#t": [a, b], "#p": [c]}` is one
MATCH — `(t:a OR t:b) AND p:c` — that FTS5 answers by merging sorted posting
lists in C.

That's the whole idea: intersecting tag terms is what an inverted index does,
while a b-tree can only ever drive on one of them and has to intersect the rest
by hand. Posting lists are delta-encoded varints too, so an indexed tag costs a
byte or two rather than a whole b-tree entry — an event with 300 tags is one
insert of one row, not 300 index inserts.

The problem with using FTS5 this way is ordering: Nostr wants newest-first with
a small limit, and FTS5 only yields rows in rowid order. So rowid *is* time:

```
rowid = created_at × 2²⁰ + a per-second sequence number
```

`ORDER BY rowid DESC` is then `ORDER BY created_at DESC`, which FTS5 satisfies
by walking its posting lists backwards with no sorter, and `since`/`until`
become a rowid range it pushes down into that walk.

The encoding pays off outside the index too. The events table is clustered by
time, so the `created_at DESC` index a conventional schema needs *is the table*;
`(kind)` and `(pubkey)` are implicitly `(kind, created_at)` and
`(pubkey, created_at)`, since SQLite appends the rowid to every index entry; and
a candidate key is one integer whose event is a seek into the table b-tree
rather than into a 64-character text index.

### Storage layout

- **`nostr_events`** is the value store, keyed by the time-encoded `seq` rowid.
  `kind`, `pubkey` and `created_at` are lifted out of the JSON so they can be
  indexed and tested without deserializing, and `coord` carries the
  replaceable/addressable coordinate under a partial unique index — so "one live
  version per coordinate" is an invariant SQLite enforces, and deleting an event
  takes its coordinate with it.
- **`nostr_tags_fts`** is the tag index: one row per event, holding its tag
  tokens plus `_p:<pubkey>`. Contentless and `detail=none`, which reduces FTS5
  to a bare inverted index — no positions, no column tags, no copy of the text.
- **`nostr_events_fts`** is NIP-50 search over `content`, tokenized for prose
  and kept in step by triggers rather than by application code, so no write path
  can forget it.

### Planning

A filter is planned with strfry's `DBScan` priority cascade — ids, then tags or
search, then pubkey+kind, pubkey, kind, and finally the whole store — and the
chosen b-tree is forced with `INDEXED BY`. Scans driven by the token index
instead make it the driving table of a `CROSS JOIN` against the events table.

Both of those pin the plan, deliberately. `CROSS JOIN` is SQLite's one way to
fix a join order, and without it a condition on the events table is enough to
make the planner drive from *there* — seeking the index by rowid once per row,
re-evaluating the MATCH every time, and sorting the result through a temp
b-tree. The conditions go in the `WHERE` and the `LIMIT` comes last, so SQLite
walks the posting lists backwards and stops as soon as the limit is filled with
rows that survived *everything*. A complete plan is one statement; anything the
index can't express is matched in memory, with the scan paged by keyset so
memory stays bounded.

### What the index doesn't carry

A posting list is only worth intersecting when it's short, and read backwards
FTS5 walks a term's list in full — so a term matching a large share of the store
costs its whole length however small the answer. Kinds are exactly that: there
are only a handful in use. So kinds — and authors, unless a tag is already
driving — are tested on the event rows the index finds, which is a column read
on a row that was going to be fetched anyway, and measured 2–3x faster than
intersecting a `_k:` posting list.

Two other details are worth knowing about:

- **Tag values are encoded, not stored raw.** Tokenizers split on punctuation
  and fold case, so a value is embedded verbatim only when it's lowercase
  alphanumeric — which ids, pubkeys and most topics are. Anything else is
  hex-escaped, so matching stays exact for values with spaces, capitals, emoji
  or URLs in them.
- **`automerge` is turned down to its minimum.** Every commit leaves an FTS5
  segment behind, and a query with N terms opens an iterator per term *per
  segment*, so a store written an event at a time — as a relay writes — answers
  a many-term filter several times slower than the same data bulk-loaded.
  Turning FTS5's incremental defrag up measured free on writes and 4x faster on
  a 100-term filter.

## Search

NIP-50 `search` is answered from an FTS5 index that triggers keep in step with
the events table. Every keyword must appear in the event's `content`, and a
`-keyword` token excludes it; unsupported extension tokens (`key:value`) are
ignored per the NIP.

Keywords match whole words, case- and accent-insensitively, so `nostr` matches
"nostr" but not "nostrich", and `cafe` matches "café". Whatever a user types is
passed as a literal phrase, so a keyword like `OR` or `(` searches for that word
rather than being read as query syntax.

Because rowids are timestamps, the index yields a keyword's matches newest-first
and the scan simply stops at the limit — whether the keyword matches ten events
or a million. Search is bounded by the number of matches rather than by the size
of the database, so a term matching nothing is the cheapest search there is
rather than the dearest.

Keywords *alongside* a tag filter are a second index, and FTS5 can't merge two
of them, so they're resolved to a rowid set the tag-driven scan tests against.

## Performance

Measured with better-sqlite3 on a synthetic dataset of 200k events: 500 authors
and 200 topics drawn from a Zipf distribution, a tenth of the events replaceable
or addressable, on disk with WAL, ingested 500 at a time.

```sh
deno run -A --no-check scale.bench.ts 200000 --real --burst
```

| Query                              | per call |
| ---------------------------------- | -------: |
| by kind, limit 20                  |  0.23 ms |
| by author, limit 20                |  0.19 ms |
| by author + kind, limit 20         |  0.22 ms |
| by tag, limit 20                   |  0.31 ms |
| by tag + kind, limit 20            |  0.36 ms |
| by two tags, limit 20              |  0.41 ms |
| by tag + author + kind, limit 20   |  0.46 ms |
| addressable by `#d`                |  0.12 ms |
| by search, limit 20                |  0.64 ms |
| feed (500 authors × 2 kinds)       |  4.97 ms |
| by tag, 100 values, limit 20       |  5.56 ms |
| count by tag                       |  4.55 ms |
| count by kind                      |  7.05 ms |
| by search + tag, limit 20          | 14.30 ms |
| by tag, no limit (a sixth of them) |   317 ms |

Storage is 198 MB, about 1 KB per event, of which the events table — the JSON
bodies — is 127 MB. The tag index is 3.3 MB, or about 17 bytes per event to
cover all of its tags.

The two unbounded rows are the shape to design around rather than a cost to
avoid: a query with no `limit` that matches a sixth of the store has to
materialize a sixth of the store, and `count` has to walk what it counts. Both
are linear in the answer, not in the database.

A smaller benchmark runs against the 1000-event fixture, where deserializing
events dominates and everything is a fraction of a millisecond:

```sh
deno bench -A --no-check NSQLite.bench.ts
```

## Behavior

- **Replaceable and addressable events** supersede older versions at the same
  coordinate on write, so queries never return a stale profile or list.
- **Deletion requests** (kind 5) delete the events they target, but only when
  the requester authored them. A deleted event can't be re-added — the attempt
  throws a `RelayError`.
- **Ephemeral events** are never stored.
- **NIP-50 `search`** is answered from a full-text index. See
  [Search](#search).
- **NIP-40 expiration is not handled**, and nothing is pruned automatically.
