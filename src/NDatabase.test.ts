import { assertEquals, assertRejects } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { DB as Sqlite } from 'https://raw.githubusercontent.com/dyedgreen/deno-sqlite/1e98e837c6b2efe1f7b6291501bbe49aca296c9e/mod.ts';
import { DenoSqliteDialect } from 'https://gitlab.com/soapbox-pub/kysely-deno-sqlite/-/raw/v2.0.1/mod.ts';
import { Kysely } from 'npm:kysely@^0.27.2';

import { NDatabase, NDatabaseOpts, NDatabaseSchema } from './NDatabase.ts';

import event0 from '../fixtures/event-0.json' with { type: 'json' };
import event1 from '../fixtures/event-1.json' with { type: 'json' };

/** Create in-memory database for testing. */
const createDB = async (opts?: NDatabaseOpts) => {
  const kysely = new Kysely<NDatabaseSchema>({
    dialect: new DenoSqliteDialect({
      database: new Sqlite(),
    }),
  });
  const db = new NDatabase(kysely, opts);
  await db.migrate();
  return db;
};

Deno.test('NDatabase.migrate', async () => {
  await createDB();
});

Deno.test('NDatabase.migrate with FTS', async () => {
  await createDB({ fts: true });
});

Deno.test('NDatabase.count', async () => {
  const db = await createDB();
  assertEquals((await db.count([{ kinds: [1] }])).count, 0);
  await db.event(event1);
  assertEquals((await db.count([{ kinds: [1] }])).count, 1);
});

Deno.test('NDatabase.query', async () => {
  const db = await createDB();
  await db.event(event1);

  assertEquals(await db.query([{ kinds: [1] }]), [event1]);
  assertEquals(await db.query([{ kinds: [3] }]), []);
  assertEquals(await db.query([{ since: 1691091000 }]), [event1]);
  assertEquals(await db.query([{ until: 1691091000 }]), []);
});

Deno.test('NDatabase.query with search', async () => {
  const db = await createDB({ fts: true });

  await db.event(event0);
  await db.event(event1);

  assertEquals(await db.query([{ search: 'vegan' }]), [event0, event1]);
  assertEquals(await db.query([{ search: 'Fediverse' }]), [event0]);
});

Deno.test('NDatabase.remove', async () => {
  const db = await createDB();
  await db.event(event1);
  assertEquals(await db.query([{ kinds: [1] }]), [event1]);
  await db.remove([{ kinds: [1] }]);
  assertEquals(await db.query([{ kinds: [1] }]), []);
});

Deno.test('NDatabase.event with replaceable event', async () => {
  const db = await createDB();
  assertEquals((await db.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 0);

  await db.event(event0);
  await assertRejects(() => db.event(event0));
  assertEquals((await db.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 1);

  const changeEvent = { ...event0, id: '123', created_at: event0.created_at + 1 };
  await db.event(changeEvent);
  assertEquals(await db.query([{ kinds: [0] }]), [changeEvent]);
});
