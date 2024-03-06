import { DB as Sqlite } from 'https://raw.githubusercontent.com/dyedgreen/deno-sqlite/1e98e837c6b2efe1f7b6291501bbe49aca296c9e/mod.ts';
import { DenoSqliteDialect } from 'https://gitlab.com/soapbox-pub/kysely-deno-sqlite/-/raw/v2.0.1/mod.ts';
import { Kysely } from 'npm:kysely@^0.27.2';

import { NDatabase, NDatabaseSchema } from './NDatabase.ts';

const kysely = new Kysely<NDatabaseSchema>({
  dialect: new DenoSqliteDialect({
    database: new Sqlite(),
  }),
});

const db = new NDatabase(kysely);
await db.migrate();

let id = 0;

Deno.bench('NDatabase.event', async () => {
  return await db.event(
    { id: `${++id}`, kind: 1, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [['d', 'a']] },
  );
});

Deno.bench('NDatabase.event with many tags', async () => {
  const tags: string[][] = new Array(100)
    .fill('')
    .map(() => ['p', '570a9c85c7dd56eca0d8c7f258d7fc178f1b2bb3aab4136ba674dc4879eee88a']);

  return await db.event(
    { id: `${++id}`, kind: 1, pubkey: 'abc', content: '', created_at: 0, sig: '', tags },
  );
});
