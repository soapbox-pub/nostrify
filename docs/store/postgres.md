---
outline: deep
---

# Postgres

Nostrify has special support for Postgres with the [`NPostgres`](https://jsr.io/@nostrify/db/doc/~/NPostgres) class. This is currently the fastest and most complete storage implementation, and also the one used by [Ditto](https://soapbox.pub/ditto/).

For SQLite and other databases, see [SQL Databases](/store/sql).

## Installation

Install [`@nostrify/db`](https://jsr.io/@nostrify/db) from JSR.

::: code-group

```sh [npm]
npx jsr add @nostrify/db
```

```sh [Deno]
deno add @nostrify/db
```

```sh [yarn]
yarn dlx jsr add @nostrify/db
```

```sh [pnpm]
pnpm dlx jsr add @nostrify/db
```

```sh [Bun]
bunx jsr add @nostrify/db
```

:::

## Usage

NPostgres implements [`NStore`](https://jsr.io/@nostrify/types/doc/~/NStore), allowing you to use it interchangeably with relays.

First create a Kysely instance, then pass it to NPostgres.

```ts
import { NPostgres } from '@nostrify/db';
import { Kysely } from 'kysely';

const kysely = new Kysely(/* set up your database */);

const db = new NPostgres(kysely);
await db.migrate(); // create the database tables
```

> [!TIP]
> We recommend using the [`kysely-postgres-js` dialect](/store/postgres#kysely-postgres-js).

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

NPostgres supports [NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md) full text search, including custom search extensions. This is available out-of-the-box, but it's recommended to customize it to your needs.

### Search filters

You can query with `search` filters:

```ts
const events = await db.query([{ kinds: [1], search: 'hello world' }]);
```

### Custom search text

By default, only kind 0 and 1 events are indexed for search text, using a basic function on the event's content. To customize this, supply an `indexSearch` option.

```ts
const db = new NPostgres(kysely, {
  indexSearch(event: NostrEvent): string | undefined {
    // Index the user's name and nip05
    if (event.kind === 0) {
      const { name, nip05 } = n.json().pipe(n.metadata()).catch({}).parse(event.content);
      return [name, nip05].filter(Boolean).join('\n');
    }

    // Index note text with tags.
    if (event.kind === 1) {
      return `${event.content} ${event.tags.map(([_name, value]) => value).join(' ')}`.substring(0, 1000);
    }

    // TODO: your other event kinds...
  },
});
```

### Custom search extensions

NIP-50 supports "search extensions", which are key-value pairs like `language:pt` within the search text. For example:

```json
{ "kinds": [1], "search": "language:pt" }
```

This filter should only return posts in Portuguese.

To enable this, provide a custom `indexExtensions` option to NPostgres:

```ts
const db = new NPostgres(kysely, {
  indexExtensions(event: NostrEvent): string | undefined {
    const ext: Record<string, string> = {};

    if (event.kind === 1) {
      const language = detectLanguage(event.content); // you must implement this function

      if (language) {
        ext.language = language;
      }
    }

    // TODO: any additional logic

    return ext;
  },
});
```

## Custom tag indexes

By default, NPostgres will index all single-letter tags. For more control, add a custom `indexTags` function:

```ts
const db = new NPostgres(kysely, {
  indexTags(event: NostrEvent): string[][] {
    // Return the tags that you want to index!
    return event.tags.filter(([name]) => ['a', 'd', 'e', 'proxy'].includes(name));
  },
});
```

## Tables

NPostgres manages a single `nostr_events` table.

It includes one column for each property of Nostr events:

- `id`: `char(64)`
- `kind`: `integer`
- `pubkey`: `char(64)`
- `content`: `text`
- `created_at`: `bigint`
- `tags`: `jsonb`
- `sig`: `char(128)`

It also includes additional columns for full-text search support and improved performance:

- `tags_index`: `jsonb` - tags normalized into an object, with a GIN index for fast lookups with `@>`. This is customized by the `indexTags` option.
- `search`: `tsvector` - NIP-50 search text, has GIN index.
- `search_ext`: `jsonb` - NIP-50 search extensions object, customized by `indexExtensions` option, has GIN index.
- `d`: `text` - value of the `d` tag for addressable events. Utilizes a UNIQUE index for fast lookups.

### Indexes and constraints

There are 2 main composite indexes used for queries with and without authors:

- chronological index: `(created_at desc, id asc, kind, pubkey)`
- authors index: `(pubkey, created_at desc, id asc, kind)`

There are also UNIQUE partial indexes for fast lookups of replaceable and addressable events:

- replaceable: `UNIQUE (kind, pubkey) WHERE kind >= 10000 and kind < 20000 or (kind in (0, 3))`
- addressable: `UNIQUE (kind, pubkey, d) WHERE kind >= 30000 and kind < 40000`

Finally, `tags_index`, `search` and `search_ext` use GIN indexes.

Several constraints also exist, to enforce things like that `kind` and `created_at` cannot be less than 0, that `tags` must be a json array, etc.

### Migrating the database

Run `await db.migrate()` to create the necessary tables and indexes before use.
You should call this every time the program starts.

## Dialects

### kysely-postgres-js

This is the recommended dialect for NPostgres in production.

```ts
import { NPostgres } from '@nostrify/db';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { Kysely } from 'kysely';
import postgres from 'postgres';

const databaseUrl = Deno.env.get('DATABASE_URL');

const kysely = new Kysely<Database>({
  dialect: new PostgresJSDialect({
    postgres: postgres(databaseUrl),
  }),
});

const db = new NPostgres(kysely);
await db.migrate();
```

### pglite

Pglite is a good choice for local development, so that developers don't need to install Postgres to start hacking.

```ts
import { PGlite } from '@electric-sql/pglite';
import { NPostgres } from '@nostrify/db';
import { PgliteDialect } from '@soapbox/kysely-pglite';
import { Kysely } from 'kysely';

const kysely = new Kysely<Database>({
  dialect: new PgliteDialect({
    database: new PGlite('file://data/pgdata'),
  }),
});

const db = new NPostgres(kysely);
await db.migrate();
```
