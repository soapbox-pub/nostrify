---
outline: deep
---

# SQL Databases

Nostrify can store events in a variety of SQL databases thanks to [Kysely](https://github.com/kysely-org/kysely).

> [!NOTE]
> We recommend using [Nostrify with Postgres](/store/postgres.md), which is the fastest and most complete implementation.
> This page is about the `NDatabase` class, which works with many SQL databases, but suffers in performance at scale.

## Installation

Install [`@nostrify/db`](https://jsr.io/@nostrify/db) from JSR.

::: code-group

```sh [npm]
npx jsr add @nostrify/db
```

```sh [Deno]
deno add jsr:@nostrify/db
```

```sh [yarn]
yarn add jsr:@nostrify/db
```

```sh [pnpm]
pnpm add jsr:@nostrify/db
```

```sh [Bun]
bunx jsr add @nostrify/db
```

:::

## Usage

NDatabase implements [`NStore`](https://jsr.io/@nostrify/types/doc/~/NStore), allowing you to use it interchangeably with relays.

First create a Kysely instance and connect it to whichever database you choose, then pass it to NDatabase.

```ts
import { NDatabase } from '@nostrify/db';
import { Kysely } from 'kysely';

const kysely = new Kysely(/* set up your database */);

const db = new NDatabase(kysely);
await db.migrate(); // create the database tables
```

#### Insert an event

```ts
await db.event(event);
```

#### Query events

```ts
const events = await db.query([{ kinds: [1, 6], limit: 5 }]);
```

#### Count events

```ts
const { count } = await db.count([{ kinds: [1, 6] }]);
```

#### Remove events

```ts
await db.remove([{ kinds: [1, 6] }]);
```

## Full text search

NDatabase supports [NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md) search with the `fts` option:

```ts
const db = new NDatabase(kysely, {
  fts: 'sqlite',
});
```

- `sqlite` uses the built-in [SQLite FTS5](https://sqlite.org/fts5.html).

### Search filters

Once enabled, you can query with `search` filters:

```ts
const events = await db.query([{ kinds: [1], search: 'hello world' }]);
```

> [!NOTE]
> If FTS is not enabled, the `search` filter will always return an empty array.

## Custom tag indexes

By default, NDatabase will index all single-letter tags. For more control, add a custom `indexTags` function:

```ts
const db = new NDatabase(kysely, {
  indexTags(event: NostrEvent): string[][] {
    // Return the tags that you want to index!
    return event.tags.filter(([name]) => ['a', 'd', 'e', 'proxy'].includes(name));
  },
});
```

## Tables

NDatabase manages two tables:

- `nostr_events` stores Nostr events. Each property has its own column.
- `nostr_tags` stores tags to be indexed for tag filters.

> [!TIP]
> By default, all single-letter tags are indexed. You can customize this behavior by passing a custom [`indexTags`](https://jsr.io/@nostrify/db/doc/~/NDatabase.prototype.indexTags) function into NDatabase.

> [!NOTE]
> If FTS is enabled, the following table will also be created:
>
> - `nostr_fts5` to store the SQLite search index.

### Migrating the database

Run `await db.migrate()` to create the necessary tables and indexes before use.
You should call this every time the program starts.

## SQLite on Deno

Using [`@db/sqlite`](https://jsr.io/@db/sqlite) and [`@soapbox/kysely-deno-sqlite`](https://jsr.io/@soapbox/kysely-deno-sqlite), you can connect to an SQLite database in Deno.

```ts
import { NDatabase } from '@nostrify/db';
import { Database } from '@db/sqlite';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import { Kysely } from 'kysely';

const kysely = new Kysely({
  dialect: new DenoSqlite3Dialect({
    database: new Database('./nostr.sqlite3'),
  }),
});

const db = new NDatabase(kysely);
await db.migrate();
```

## Postgres on Deno

Using [x/postgresjs](https://deno.land/x/postgresjs) you can connect to a Postgres database in Deno.

```ts
import { NDatabase } from '@nostrify/db';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { Kysely } from 'kysely';
import postgres from 'postgres';

const databaseUrl = Deno.env.get('DATABASE_URL');

const kysely = new Kysely<Database>({
  dialect: new PostgresJSDialect({
    postgres: postgres(databaseUrl),
  }),
});

const db = new NDatabase(kysely);
await db.migrate();
```

> [!TIP]
> There are a few different Postgres drivers for Deno. See which one works best for you.

## Other databases

Kysely maintains a [list of supported dialects](https://www.kysely.dev/docs/dialects).

It may be possible to get other dialects working. Or build your own!
