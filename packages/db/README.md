# Nostrify Database with Kysely

This is a Nostrify storage for SQL databases built on [Kysely](https://github.com/kysely-org/kysely).

It is tested with SQLite and Postgres, and may work with others. It aims to be simple and compatible, using only standard SQL features.

Full documentation: https://nostrify.dev/store/sql

## Usage

```ts
import { NDatabase } from '@nostrify/db';
import { Kysely } from 'kysely';

const kysely = new Kysely(/* set up your database */);

const db = new NDatabase(kysely);
await db.migrate();
```

## License

MIT
