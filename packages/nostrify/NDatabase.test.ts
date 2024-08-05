import { Database as Sqlite } from '@db/sqlite';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import { assert, assertEquals, assertRejects } from '@std/assert';
import { Kysely, LogConfig, LogEvent } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { finalizeEvent, generateSecretKey, matchFilters } from 'nostr-tools';
import postgres from 'postgres';

import { NostrEvent } from '../types/NostrEvent.ts';
import { NostrFilter } from '../types/NostrFilter.ts';

import { NDatabase, NDatabaseOpts, NDatabaseSchema } from './NDatabase.ts';

import event0 from '../../fixtures/event-0.json' with { type: 'json' };
import event1 from '../../fixtures/event-1.json' with { type: 'json' };
import events from '../../fixtures/events.json' with { type: 'json' };

const databaseUrl = Deno.env.get('DATABASE_URL') ?? 'sqlite://:memory:';

const dialect: 'sqlite' | 'postgres' = (() => {
  const protocol = databaseUrl.split(':')[0];
  switch (protocol) {
    case 'sqlite':
    case 'postgres':
      return protocol;
    case 'postgresql':
      return 'postgres';
    default:
      throw new Error(`Unsupported protocol: ${protocol}`);
  }
})();

/** Kysely console logger. */
const log: LogConfig = (event: LogEvent): void => {
  if (Deno.env.get('DEBUG')) {
    console.log(event.query.sql, JSON.stringify(event.query.parameters));
  }
};

/** Create in-memory database for testing. */
async function createDB(
  opts?: NDatabaseOpts,
): Promise<{ store: NDatabase; kysely: Kysely<NDatabaseSchema>; [Symbol.asyncDispose]: () => Promise<void> }> {
  let kysely: Kysely<NDatabaseSchema>;

  switch (dialect) {
    case 'sqlite':
      kysely = new Kysely<NDatabaseSchema>({
        dialect: new DenoSqlite3Dialect({
          database: new Sqlite(databaseUrl.replace('sqlite://', '')),
        }),
        log,
      });
      break;
    case 'postgres':
      kysely = new Kysely({
        dialect: new PostgresJSDialect({
          // @ts-ignore mismatched library versions
          postgres: postgres(databaseUrl),
        }),
      });
      break;
  }

  const store = new NDatabase(kysely, opts);

  await withoutDebug(() => store.migrate());

  return {
    store,
    kysely,
    [Symbol.asyncDispose]: async () => {
      if (databaseUrl !== 'sqlite://:memory:') {
        await withoutDebug(async () => {
          for (const table of ['nostr_events', 'nostr_tags', 'nostr_pgfts']) {
            await kysely.schema.dropTable(table).ifExists().cascade().execute();
          }
        });
      }
      await kysely.destroy();
    },
  };
}

/** Run an async function with the Kysely logger disabled. */
async function withoutDebug(callback: () => Promise<void>) {
  const DEBUG = Deno.env.get('DEBUG');
  Deno.env.delete('DEBUG');

  await callback();

  if (typeof DEBUG === 'string') {
    Deno.env.set('DEBUG', DEBUG);
  }
}

/** Import a JSONL fixture by name in tests. */
export async function jsonlEvents(path: string): Promise<NostrEvent[]> {
  const data = await Deno.readTextFile(path);
  return data.split('\n').map((line) => JSON.parse(line));
}

Deno.test('NDatabase.migrate', async () => {
  await using _db = await createDB();
});

Deno.test('NDatabase.migrate with fts', async () => {
  await using _db = await createDB({ fts: dialect });
});

Deno.test('NDatabase.migrate twice', async () => {
  await using db = await createDB();
  const { store } = db;

  await store.migrate();
});

Deno.test('NDatabase.count', async () => {
  await using db = await createDB();
  const { store } = db;

  assertEquals((await store.count([{ kinds: [1] }])).count, 0);
  await store.event(event1);
  assertEquals((await store.count([{ kinds: [1] }])).count, 1);
});

Deno.test('NDatabase.query', async () => {
  await using db = await createDB({ indexTags: ({ tags }) => tags });
  const { store } = db;

  await store.event(event1);

  assertEquals(await store.query([{ kinds: [1] }]), [event1]);
  assertEquals(await store.query([{ kinds: [3] }]), []);
  assertEquals(await store.query([{ since: 1691091000 }]), [event1]);
  assertEquals(await store.query([{ until: 1691091000 }]), []);
  assertEquals(
    await store.query([{ '#proxy': ['https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79'] }]),
    [event1],
  );
});

Deno.test('NDatabase.query with tag filters and limit', async () => {
  await using db = await createDB();
  const { store } = db;

  for (const event of await jsonlEvents('./fixtures/events-3036.jsonl')) {
    await store.event(event);
  }

  const events = await store.query([{
    kinds: [30383],
    authors: ['db0e60d10b9555a39050c258d460c5c461f6d18f467aa9f62de1a728b8a891a4'],
    '#k': ['3036'],
    '#p': ['0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd'],
    '#n': ['approved'],
    limit: 20,
  }]);

  assertEquals(events.length, 1);
  assertEquals(events[0].id, 'b745a502b455a2380019dafad64b927575cd9223f5369d9eb402b63f84847235');

  const pubkeys = new Set<string>();

  for (const event of events) {
    for (const tag of event.tags.filter(([name]) => name === 'p')) {
      pubkeys.add(tag[1]);
    }
  }

  assertEquals([...pubkeys], ['0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd']);
});

Deno.test('NDatabase.query with multiple tags', async () => {
  await using db = await createDB();
  const { store } = db;

  for (const event of await jsonlEvents('./fixtures/trends.jsonl')) {
    await store.event(event);
  }

  const filters = [{
    kinds: [1985],
    authors: ['15b68d319a088a9b0c6853d2232aff0d69c8c58f0dccceabfb9a82bd4fd19c58'],
    '#L': ['pub.ditto.trends'],
    '#l': ['#t'],
  }];

  const results = await store.query(filters);

  for (const event of results) {
    assert(matchFilters(filters, event));
  }

  assertEquals(results.length, 20);
  assertEquals(results[0].tags.find(([name]) => name === 't')?.[1], 'bitcoin');
});

Deno.test('NDatabase.query with multiple tags and time window', async () => {
  await using db = await createDB();
  const { store } = db;

  for (const event of await jsonlEvents('./fixtures/trends.jsonl')) {
    await store.event(event);
  }

  const filters = [{
    kinds: [1985],
    authors: ['15b68d319a088a9b0c6853d2232aff0d69c8c58f0dccceabfb9a82bd4fd19c58'],
    '#L': ['pub.ditto.trends'],
    '#l': ['#t'],
    since: 1722124800,
    until: 1722211200,
  }];

  const results = await store.query(filters);

  for (const event of results) {
    assert(matchFilters(filters, event));
  }

  assertEquals(results.length, 2);
  assert(matchFilters(filters, results[0]));
  assertEquals(results[0].tags.find(([name]) => name === 't')?.[1], 'bitcoin');
});

Deno.test('NDatabase.query with multiple tags and time window and limit', async () => {
  await using db = await createDB();
  const { store } = db;

  for (const event of await jsonlEvents('./fixtures/trends.jsonl')) {
    await store.event(event);
  }

  const filters = [{
    kinds: [1985],
    authors: ['15b68d319a088a9b0c6853d2232aff0d69c8c58f0dccceabfb9a82bd4fd19c58'],
    '#L': ['pub.ditto.trends'],
    '#l': ['#t'],
    since: 1722124800,
    until: 1722211200,
    limit: 1,
  }];

  const results = await store.query(filters);

  assertEquals(results.length, 1);
  assert(matchFilters(filters, results[0]));
  assertEquals(results[0].tags.find(([name]) => name === 't')?.[1], 'bitcoin');
});

Deno.test('NDatabase.query tag query with non-tag query', async () => {
  await using db = await createDB();
  const { store } = db;

  const results = await store.query([{
    kinds: [0],
    authors: ['c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c'],
  }, {
    kinds: [1985],
    authors: ['c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c'],
    '#L': ['nip05'],
    '#l': ['alex@gleasonator.com'],
  }]);

  assertEquals(results, []);
});

Deno.test('NDatabase.query with search', async (t) => {
  await using db = await createDB({ fts: dialect });
  const { store } = db;

  await store.event(event0);
  await store.event(event1);

  await t.step('match single event', async () => {
    assertEquals(await store.query([{ search: 'Fediverse' }]), [event0]);
  });

  await t.step('match multiple events', async () => {
    assertEquals(await store.query([{ search: 'vegan' }]), [event0, event1]);
  });

  await t.step("don't match nonsense queries", async () => {
    assertEquals(await store.query([{ search: "this shouldn't match" }]), []);
  });
});

Deno.test('NDatabase.query with search and fts disabled', async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(event1);

  assertEquals(await store.query([{ kinds: [1], search: 'vegan' }]), []);
});

Deno.test('NDatabase.query by id returns sorted results', async () => {
  await using db = await createDB();
  const { store } = db;

  for (const event of events) {
    await store.event(event);
  }

  const ids = [
    '2ec9f6674ddc165a83b44150725f9ace4f076215e1ecce6987cf2f648b4f8acd', // 1711468992
    'bef55b59cc332d6aa3902ba9d69a3c8f477c88fe0017f74bff3ebc55f152a668', // 1711468855
    '8e1b98146eee8a2dbfc4eb68323a81d38278bfdcfa848f0e8e8da7799e719af8', // 1711469117
    '84e857340fd1136ba2ab7db8383ef5d9a0d6ca750c7a22e8deac1ad34e93a4ac', // 1711468765
    '1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b', // 1711469125
    '638b1e9ccc69ecc674ad004c4c92f5a43d1d50ef673150ce8664d8e108cc85e5', // 1711469103
  ];

  const expected = [
    '1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b', // 1711469125
    '8e1b98146eee8a2dbfc4eb68323a81d38278bfdcfa848f0e8e8da7799e719af8', // 1711469117
    '638b1e9ccc69ecc674ad004c4c92f5a43d1d50ef673150ce8664d8e108cc85e5', // 1711469103
  ];

  const results = await store.query([{ ids, limit: 3 }]);
  assertEquals(results.map((event) => event.id), expected);
});

Deno.test('NDatabase.remove', async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(event1);
  assertEquals(await store.query([{ kinds: [1] }]), [event1]);
  await store.remove([{ kinds: [1] }]);
  assertEquals(await store.query([{ kinds: [1] }]), []);
});

Deno.test('NDatabase.event with a deleted event', async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(event1);

  assertEquals(await store.query([{ kinds: [1] }]), [event1]);

  await store.event({
    kind: 5,
    pubkey: event1.pubkey,
    tags: [['e', event1.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await store.query([{ kinds: [1] }]), []);

  await assertRejects(() => store.event(event1));

  assertEquals(await store.query([{ kinds: [1] }]), []);
});

Deno.test('NDatabase.event with replaceable event', async () => {
  await using db = await createDB();
  const { store } = db;

  assertEquals((await store.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 0);

  await store.event(event0);
  await assertRejects(() => store.event(event0));
  assertEquals((await store.count([{ kinds: [0], authors: [event0.pubkey] }])).count, 1);

  const changeEvent = { ...event0, id: '123', created_at: event0.created_at + 1 };
  await store.event(changeEvent);
  assertEquals(await store.query([{ kinds: [0] }]), [changeEvent]);
});

Deno.test('NDatabase.event with parameterized replaceable event', async () => {
  await using db = await createDB();
  const { store } = db;

  const event0 = { id: '1', kind: 30000, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [['d', 'a']] };
  const event1 = { id: '2', kind: 30000, pubkey: 'abc', content: '', created_at: 1, sig: '', tags: [['d', 'a']] };
  const event2 = { id: '3', kind: 30000, pubkey: 'abc', content: '', created_at: 2, sig: '', tags: [['d', 'a']] };

  await store.event(event0);
  assertEquals(await store.query([{ ids: [event0.id] }]), [event0]);

  await store.event(event1);
  assertEquals(await store.query([{ ids: [event0.id] }]), []);
  assertEquals(await store.query([{ ids: [event1.id] }]), [event1]);

  await store.event(event2);
  assertEquals(await store.query([{ ids: [event0.id] }]), []);
  assertEquals(await store.query([{ ids: [event1.id] }]), []);
  assertEquals(await store.query([{ ids: [event2.id] }]), [event2]);
});

Deno.test('NDatabase.event processes deletions', async () => {
  await using db = await createDB();
  const { store } = db;

  const [one, two] = [
    { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] },
    { id: '2', kind: 1, pubkey: 'abc', content: 'yolo fam', created_at: 2, sig: '', tags: [] },
  ];

  await store.event(one);
  await store.event(two);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [two, one]);

  await store.event({
    kind: 5,
    pubkey: one.pubkey,
    tags: [['e', one.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await store.query([{ kinds: [1] }]), [two]);
});

Deno.test('NDatabase.event with a replaceable deleted event', async () => {
  await using db = await createDB();
  const { store } = db;

  assertEquals(await store.query([{ kinds: [0] }]), []);

  await store.event(event0);

  assertEquals(await store.query([{ kinds: [0] }]), [event0]);

  await store.event({
    kind: 5,
    pubkey: event0.pubkey,
    tags: [['a', `0:${event0.pubkey}:`]],
    created_at: 1699398370,
    content: '',
    id: '1',
    sig: '',
  });

  assertEquals(await store.query([{ kinds: [0] }]), [event0]);

  await store.event({
    kind: 5,
    pubkey: event0.pubkey,
    tags: [['a', `0:${event0.pubkey}:`]],
    created_at: 1699398377,
    content: '',
    id: '2',
    sig: '',
  });

  assertEquals(await store.query([{ kinds: [0] }]), []);
});

Deno.test('NDatabase.event with a parameterized-replaceable deleted event', async () => {
  await using db = await createDB();
  const { store } = db;

  const eventA = { id: '1', kind: 30000, pubkey: 'abc', content: '', created_at: 0, sig: '', tags: [['d', 'a']] };
  const eventB = { id: '2', kind: 30000, pubkey: 'abc', content: '', created_at: 2, sig: '', tags: [['d', 'a']] };

  await store.event(eventA);
  assertEquals(await store.query([{ ids: [eventA.id] }]), [eventA]);

  await store.event({
    kind: 5,
    pubkey: eventA.pubkey,
    tags: [['a', `30000:${eventA.pubkey}:a`]],
    created_at: 1,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await store.query([{ ids: [eventA.id] }]), []);

  await store.event(eventB);
  assertEquals(await store.query([{ ids: [eventB.id] }]), [eventB]);
});

Deno.test("NDatabase.event does not delete another user's event", async () => {
  await using db = await createDB();
  const { store } = db;

  const event = { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] };
  await store.event(event);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [event]);

  await store.event({
    kind: 5,
    pubkey: 'def', // different pubkey
    tags: [['e', event.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await store.query([{ kinds: [1] }]), [event]);
});

Deno.test('NDatabase.transaction', async () => {
  await using db = await createDB();
  const { store } = db;

  await store.transaction(async (store) => {
    await store.event(event0);
    await store.event(event1);
  });

  assertEquals(await store.query([{ kinds: [0] }]), [event0]);
  assertEquals(await store.query([{ kinds: [1] }]), [event1]);
});

// When `statement_timeout` is 0 it's disabled, so we need to create slow queries.
Deno.test('NDatabase timeout', { ignore: dialect !== 'postgres' }, async (t) => {
  await using db = await createDB({
    timeoutStrategy: 'setStatementTimeout',
    fts: 'postgres',
  });

  const { store } = db;

  // Setup
  await withoutDebug(async () => {
    await Promise.all(events.map((event) => store.event(event)));
  });

  await t.step('Slow event (lots of tags)', async () => {
    await assertRejects(
      () =>
        store.event(
          finalizeEvent({
            kind: 1,
            content: 'hello world!',
            created_at: Math.floor(Date.now() / 1000),
            tags: new Array(300).fill(['p', '570a9c85c7dd56eca0d8c7f258d7fc178f1b2bb3aab4136ba674dc4879eee88a']),
          }, generateSecretKey()),
          { timeout: 1 },
        ),
      postgres.PostgresError,
      'canceling statement due to statement timeout',
    );
  });

  const slowFilters: NostrFilter[] = [
    {
      search:
        'Block #: 836,386\nPrice: $70,219\nSats/$: 1,424\nFee: 23 sat/vB\nHashrate: 538 EH/s\nDifficulty: 83T nonces\nNodes: 7,685\nFull-node size: 521 GB',
    },
  ];

  await t.step('Slow query', async () => {
    await assertRejects(
      () => db.store.query(slowFilters, { timeout: 1 }),
      postgres.PostgresError,
      'canceling statement due to statement timeout',
    );
  });

  await t.step('Slow count', async () => {
    await assertRejects(
      () => db.store.count(slowFilters, { timeout: 1 }),
      postgres.PostgresError,
      'canceling statement due to statement timeout',
    );
  });

  await t.step("Check that the previous query's timeout doesn't impact the next query", async () => {
    await store.count(slowFilters);
  });

  await t.step('Slow remove', async () => {
    await assertRejects(
      () => db.store.remove(slowFilters, { timeout: 1 }),
      postgres.PostgresError,
      'canceling statement due to statement timeout',
    );
  });

  await t.step("Sanity check that a query with timeout doesn't throw an error", async () => {
    await store.event(event0, { timeout: 1000 });
  });
});

Deno.test('NDatabase timeout has no effect on SQLite', { ignore: dialect === 'postgres' }, async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(event0, { timeout: 1 });
  await store.query([{ kinds: [0] }], { timeout: 1 });
  await store.count([{ kinds: [0] }], { timeout: 1 });
  await store.remove([{ kinds: [0] }], { timeout: 1 });
});

Deno.test('NDatabase.req streams events', async () => {
  await using db = await createDB();
  const { store } = db;

  for (const event of events) {
    await store.event(event);
  }

  const expected = await store.query([{ kinds: [0] }]);

  const results: NostrEvent[] = [];
  for await (const msg of store.req([{ kinds: [0] }])) {
    if (msg[0] === 'EVENT') {
      results.push(msg[2]);
    }
  }

  assertEquals(expected, results);
});
