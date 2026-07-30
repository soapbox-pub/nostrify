---
outline: deep
---

# SQLite

`NSQLite` is a high-performance `NStore` backed by SQLite. It works with any SQLite library, and treats SQLite as a key/value store with hand-maintained indexes rather than a relational schema — there are no joins.

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

Every index ends in `(created_at DESC, id ASC)`, so scanning any index prefix yields it newest-first with no sorter — the same trick [strfry](https://github.com/hoytech/strfry) uses by packing `created_at` into the trailing bytes of an LMDB key.

A filter is planned with strfry's `DBScan` priority cascade — ids, then the most selective `#tag`, then pubkey+kind, pubkey, kind, and finally a full `created_at` scan — and the chosen index is forced with `INDEXED BY`, so the plan never depends on SQLite's cost estimates or on how stale `ANALYZE` is. Execution is two-phase: scan the index for candidate keys, then fetch those values by primary key. Conditions the index can't express become part of the scan's `WHERE` clause where SQLite can evaluate them; anything left over — extra tag terms, NIP-50 keywords — is matched in memory, with the scan paged by keyset so memory stays bounded.

## Behavior

- **Replaceable and addressable events** supersede older versions at the same coordinate on write, so queries never return a stale profile or list.
- **Deletion requests** (kind `5`) delete the events they target, but only when the requester authored them. A deleted event can't be re-added — the attempt throws a `RelayError`.
- **Ephemeral events** are never stored.
- **NIP-50 `search`** matches every keyword against the event's `content`, case-insensitively, with `-keyword` negating. Unsupported extension tokens (`key:value`) are ignored per the NIP. There is no full-text index, so search always post-filters a scan.
- **NIP-40 expiration is not handled**, and nothing is pruned automatically.
