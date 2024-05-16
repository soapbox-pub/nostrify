import { Database as Sqlite } from '@db/sqlite';
import { assertEquals, assertRejects } from '@std/assert';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import { Kysely } from 'kysely';

import { NDatabase, NDatabaseOpts, NDatabaseSchema } from './NDatabase.ts';

import event0 from '../fixtures/event-0.json' with { type: 'json' };
import event1 from '../fixtures/event-1.json' with { type: 'json' };

/** Create in-memory database for testing. */
const createDB = async (opts?: NDatabaseOpts) => {
  const kysely = new Kysely<NDatabaseSchema>({
    dialect: new DenoSqlite3Dialect({
      database: new Sqlite(':memory:'),
    }),
  });
  const db = new NDatabase(kysely, opts);
  await db.migrate();
  return db;
};

Deno.test('NDatabase.migrate', async () => {
  await createDB();
});

Deno.test('NDatabase.migrate with FTS5', async () => {
  await createDB({ fts5: true });
});

Deno.test('NDatabase.migrate twice', async () => {
  const db = await createDB();
  await db.migrate();
});

Deno.test('NDatabase.count', async () => {
  const db = await createDB();
  assertEquals((await db.count([{ kinds: [1] }])).count, 0);
  await db.event(event1);
  assertEquals((await db.count([{ kinds: [1] }])).count, 1);
});

Deno.test('NDatabase.query', async () => {
  const db = await createDB({ indexTags: ({ tags }) => tags });
  await db.event(event1);

  assertEquals(await db.query([{ kinds: [1] }]), [event1]);
  assertEquals(await db.query([{ kinds: [3] }]), []);
  assertEquals(await db.query([{ since: 1691091000 }]), [event1]);
  assertEquals(await db.query([{ until: 1691091000 }]), []);
  assertEquals(
    await db.query([{ '#proxy': ['https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79'] }]),
    [event1],
  );
});

Deno.test("NDatabase.query with multiple tags doesn't crash", async () => {
  const db = await createDB();

  await db.query([{
    kinds: [1985],
    authors: ['c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c'],
    '#L': ['nip05'],
    '#l': ['alex@gleasonator.com'],
  }]);
});

Deno.test('NDatabase.query with search', async () => {
  const db = await createDB({ fts5: true });

  await db.event(event0);
  await db.event(event1);

  assertEquals(await db.query([{ search: 'vegan' }]), [event0, event1]);
  assertEquals(await db.query([{ search: 'Fediverse' }]), [event0]);
});

Deno.test('NDatabase.query with search and fts5 disabled', async () => {
  const db = await createDB({ fts5: false });

  await db.event(event1);

  assertEquals(await db.query([{ kinds: [1], search: 'vegan' }]), []);
});

Deno.test('NDatabase.remove', async () => {
  const db = await createDB();
  await db.event(event1);
  assertEquals(await db.query([{ kinds: [1] }]), [event1]);
  await db.remove([{ kinds: [1] }]);
  assertEquals(await db.query([{ kinds: [1] }]), []);
});

Deno.test('NDatabase.event with a deleted event', async () => {
  const db = await createDB();

  await db.event(event1);

  assertEquals(await db.query([{ kinds: [1] }]), [event1]);

  await db.event({
    kind: 5,
    pubkey: event1.pubkey,
    tags: [['e', event1.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await db.query([{ kinds: [1] }]), []);

  await assertRejects(() => db.event(event1));

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

Deno.test('NDatabase.event with parameterized replaceable event', async () => {
  const db = await createDB();

  const event0 = { id: '1', kind: 30000, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [['d', 'a']] };
  const event1 = { id: '2', kind: 30000, pubkey: 'abc', content: '', created_at: 1, sig: '', tags: [['d', 'a']] };
  const event2 = { id: '3', kind: 30000, pubkey: 'abc', content: '', created_at: 2, sig: '', tags: [['d', 'a']] };

  await db.event(event0);
  assertEquals(await db.query([{ ids: [event0.id] }]), [event0]);

  await db.event(event1);
  assertEquals(await db.query([{ ids: [event0.id] }]), []);
  assertEquals(await db.query([{ ids: [event1.id] }]), [event1]);

  await db.event(event2);
  assertEquals(await db.query([{ ids: [event0.id] }]), []);
  assertEquals(await db.query([{ ids: [event1.id] }]), []);
  assertEquals(await db.query([{ ids: [event2.id] }]), [event2]);
});

Deno.test('NDatabase.event processes deletions', async () => {
  const db = await createDB();

  const [one, two] = [
    { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] },
    { id: '2', kind: 1, pubkey: 'abc', content: 'yolo fam', created_at: 2, sig: '', tags: [] },
  ];

  await db.event(one);
  await db.event(two);

  // Sanity check
  assertEquals(await db.query([{ kinds: [1] }]), [two, one]);

  await db.event({
    kind: 5,
    pubkey: one.pubkey,
    tags: [['e', one.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await db.query([{ kinds: [1] }]), [two]);
});

Deno.test("NDatabase.event does not delete another user's event", async () => {
  const db = await createDB();

  const event = { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] };
  await db.event(event);

  // Sanity check
  assertEquals(await db.query([{ kinds: [1] }]), [event]);

  await db.event({
    kind: 5,
    pubkey: 'def', // different pubkey
    tags: [['e', event.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await db.query([{ kinds: [1] }]), [event]);
});
