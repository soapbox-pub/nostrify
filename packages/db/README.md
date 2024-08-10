# Nostrify SQL Databases

This package offers Nostrify SQL storages built on [Kysely](https://github.com/kysely-org/kysely).

Full documentation: https://nostrify.dev/store/sql

## Postgres

The `NPostgres` class is specialized for high performance in Postgres, making use of jsonb for tag queries and FTS for NIP-50 search. It contains a single `nostr_events` table with unique indexes for replaceable and parameterized replaceable events, upserting newer entries for the best performance. This implementation is used by Ditto in production and is the recommended database adapter.

## SQLite, MySQL, and others

The `NDatabase` class is a general-purpose SQL database using standard SQL. It is meant to be compatible with a variety of SQL databases, and is a good place to start if you want to use SQLite and then change to a different database later. However, it is optimized for simplicity and flexibility, not for performance.

It has a `nostr_events` table, and a separate `nostr_tags` table it joins with to resolve tag queries. Replaceable events delete older entries in a transaction before inserting new ones.

## Usage

### Postgres

```ts
import { NPostgres } from '@nostrify/db';
import { Kysely } from 'kysely';

const kysely = new Kysely(/* set up your database */);

const db = new NPostgres(kysely);
await db.migrate();
```

### SQLite, MySQL, and others

```ts
import { NDatabase } from '@nostrify/db';
import { Kysely } from 'kysely';

const kysely = new Kysely(/* set up your database */);

const db = new NDatabase(kysely);
await db.migrate();
```

## License

MIT
