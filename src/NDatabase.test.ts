import { Database as Sqlite } from '@db/sqlite';
import { assertEquals, assertRejects } from '@std/assert';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import { PostgreSQLDriver } from 'kysely_deno_postgres';
import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NDatabase, NDatabaseOpts, NDatabaseSchema } from './NDatabase.ts';

import event0 from '../fixtures/event-0.json' with { type: 'json' };
import event1 from '../fixtures/event-1.json' with { type: 'json' };

/** Create in-memory database for testing. */
const createDB = async (opts?: NDatabaseOpts) => {
  const kysely = new Kysely<NDatabaseSchema>({
    dialect: new DenoSqlite3Dialect({
      database: new Sqlite(':memory:'),
    }),
    log(event): void {
      if (event.level === 'query') {
        console.log(event.query.sql, JSON.stringify(event.query.parameters));
      }
    },
  });
  const db = new NDatabase(kysely, opts);
  await db.migrate();
  return db;
};

/** Create postgres database for testing. */
const createPostgresDB = async (opts?: NDatabaseOpts) => {
  const kysely = new Kysely({
    dialect: {
      createAdapter() {
        return new PostgresAdapter();
      },
      // @ts-ignore mismatched kysely versions
      createDriver() {
        return new PostgreSQLDriver({
          connectionString: Deno.env.get('DATABASE_URL'),
        });
      },
      createIntrospector(db: Kysely<unknown>) {
        return new PostgresIntrospector(db);
      },
      createQueryCompiler() {
        return new PostgresQueryCompiler();
      },
    },
  });
  const db = new NDatabase(kysely, opts);
  await db.migrate();
  return { db, kysely };
};

/** Import a JSONL fixture by name in tests. */
export async function jsonlEvents(path: string): Promise<NostrEvent[]> {
  const data = await Deno.readTextFile(path);
  return data.split('\n').map((line) => JSON.parse(line));
}

Deno.test('NDatabase.migrate', async () => {
  await createDB();
});

Deno.test('NDatabase.migrate with sqlite fts', async () => {
  await createDB({ fts: 'sqlite' });
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

Deno.test('NDatabase.query with tag filters and limit', async () => {
  const db = await createDB();

  for (const event of await jsonlEvents('./fixtures/events-3036.jsonl')) {
    await db.event(event);
  }

  const events = await db.query([{
    kinds: [30383],
    authors: ['db0e60d10b9555a39050c258d460c5c461f6d18f467aa9f62de1a728b8a891a4'],
    '#k': ['3036'],
    '#p': ['0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd'],
    '#n': ['approved'],
    limit: 20,
  }]);

  assertEquals(events.length, 1);

  const pubkeys = new Set<string>();

  for (const event of events) {
    for (const tag of event.tags.filter(([name]) => name === 'p')) {
      pubkeys.add(tag[1]);
    }
  }

  assertEquals([...pubkeys], ['0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd']);
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

Deno.test("NDatabase.query tag query with non-tag query doesn't crash", async () => {
  const db = await createDB();

  await db.query([{
    kinds: [0],
    authors: ['c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c'],
  }, {
    kinds: [1985],
    authors: ['c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c'],
    '#L': ['nip05'],
    '#l': ['alex@gleasonator.com'],
  }]);
});

Deno.test('NDatabase.query with search', async (t) => {
  const db = await createDB({ fts: 'sqlite' });

  await db.event(event0);
  await db.event(event1);

  await t.step('match single event', async () => {
    assertEquals(await db.query([{ search: 'Fediverse' }]), [event0]);
  });

  await t.step('match multiple events', async () => {
    assertEquals(await db.query([{ search: 'vegan' }]), [event0, event1]);
  });

  await t.step("don't match nonsense queries", async () => {
    assertEquals(await db.query([{ search: "this shouldn't match" }]), []);
  });
});

Deno.test('NDatabase.query with postgres fts', { ignore: !Deno.env.get('DATABASE_URL') }, async (t) => {
  const { db, kysely } = await createPostgresDB({ fts: 'postgres' });

  await db.event(event0);
  await db.event(event1);

  await t.step('match single event', async () => {
    assertEquals(await db.query([{ search: 'Fediverse' }]), [event0]);
  });

  await t.step('match multiple events', async () => {
    assertEquals(await db.query([{ search: 'vegan' }]), [event0, event1]);
  });

  await t.step("don't match nonsense queries", async () => {
    assertEquals(await db.query([{ search: "this shouldn't match" }]), []);
  });

  await kysely.destroy();
});

Deno.test('NDatabase.query with search and fts disabled', async () => {
  const db = await createDB();

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

Deno.test('NDatabase.event with a replaceable deleted event', async () => {
  const db = await createDB();

  assertEquals(await db.query([{ kinds: [0] }]), []);

  await db.event(event0);

  assertEquals(await db.query([{ kinds: [0] }]), [event0]);

  await db.event({
    kind: 5,
    pubkey: event0.pubkey,
    tags: [['a', `0:${event0.pubkey}:`]],
    created_at: 1699398370,
    content: '',
    id: '1',
    sig: '',
  });

  assertEquals(await db.query([{ kinds: [0] }]), [event0]);

  await db.event({
    kind: 5,
    pubkey: event0.pubkey,
    tags: [['a', `0:${event0.pubkey}:`]],
    created_at: 1699398377,
    content: '',
    id: '2',
    sig: '',
  });

  assertEquals(await db.query([{ kinds: [0] }]), []);
});

Deno.test('NDatabase.event with a parameterized-replaceable deleted event', async () => {
  const db = await createDB();

  const eventA = { id: '1', kind: 30000, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [['d', 'a']] };
  const eventB = { id: '2', kind: 30000, pubkey: 'abc', content: '', created_at: 2, sig: '', tags: [['d', 'a']] };

  await db.event(eventA);
  assertEquals(await db.query([{ ids: [eventA.id] }]), [eventA]);

  await db.event({
    kind: 5,
    pubkey: eventA.pubkey,
    tags: [['a', `30000:${eventA.pubkey}:a`]],
    created_at: 1,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await db.query([{ ids: [eventA.id] }]), []);

  await db.event(eventB);
  assertEquals(await db.query([{ ids: [eventB.id] }]), [eventB]);
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
