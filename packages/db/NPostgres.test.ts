import { genEvent, jsonlEvents } from '@nostrify/nostrify/test';
import { NostrEvent, NostrFilter } from '@nostrify/types';
import { assert, assertEquals, assertRejects } from '@std/assert';
import { Kysely, LogConfig, LogEvent } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { finalizeEvent, generateSecretKey, matchFilters } from 'nostr-tools';
import postgres from 'postgres';

import { NPostgres, NPostgresOpts, NPostgresSchema } from './NPostgres.ts';

import event0 from '../../fixtures/event-0.json' with { type: 'json' };
import event1 from '../../fixtures/event-1.json' with { type: 'json' };
import events from '../../fixtures/events.json' with { type: 'json' };

const databaseUrl = Deno.env.get('DATABASE_URL');

/** Kysely console logger. */
const log: LogConfig = (event: LogEvent): void => {
  if (Deno.env.get('DEBUG')) {
    console.log(event.query.sql, JSON.stringify(event.query.parameters));
  }
};

/** Create in-memory database for testing. */
async function createDB(
  opts?: NPostgresOpts,
): Promise<{ store: NPostgres; kysely: Kysely<NPostgresSchema>; [Symbol.asyncDispose]: () => Promise<void> }> {
  const kysely = new Kysely<NPostgresSchema>({
    dialect: new PostgresJSDialect({
      // @ts-ignore mismatched library versions
      postgres: postgres(databaseUrl!),
    }),
    log,
  });

  const store = new NPostgres(kysely, opts);

  await withoutDebug(() => store.migrate());

  return {
    store,
    kysely,
    [Symbol.asyncDispose]: async () => {
      await withoutDebug(() => kysely.schema.dropTable('nostr_events').ifExists().cascade().execute());
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

Deno.test('NPostgres.migrate', { ignore: !databaseUrl }, async () => {
  await using _db = await createDB();
});

Deno.test('NPostgres.migrate twice', { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  await store.migrate();
});

Deno.test('NPostgres.count', { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  assertEquals((await store.count([{ kinds: [1] }])).count, 0);
  await store.event(event1);
  assertEquals((await store.count([{ kinds: [1] }])).count, 1);
});

Deno.test('NPostgres.query', { ignore: !databaseUrl }, async () => {
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

Deno.test('NPostgres.query returns a purified event', { ignore: !databaseUrl }, async () => {
  await using db = await createDB({ indexTags: ({ tags }) => tags });
  const { store } = db;

  await store.event(event1);
  const [event] = await store.query([{ kinds: [1] }]);

  const keys = Object.keys(event).sort();

  const expected = [
    'content',
    'created_at',
    'id',
    'kind',
    'pubkey',
    'sig',
    'tags',
  ];

  assertEquals(keys, expected);
});

Deno.test('NPostgres.query with tag filters and limit', { ignore: !databaseUrl }, async () => {
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

Deno.test('NPostgres.query with multiple tags', { ignore: !databaseUrl }, async () => {
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

Deno.test('NPostgres.query with multiple tags and time window', { ignore: !databaseUrl }, async () => {
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

Deno.test('NPostgres.query with multiple tags and time window and limit', { ignore: !databaseUrl }, async () => {
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

Deno.test('NPostgres.query tag query with non-tag query', { ignore: !databaseUrl }, async () => {
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

Deno.test('NPostgres.query with search', { ignore: !databaseUrl }, async (t) => {
  await using db = await createDB();
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

Deno.test('NPostgres.query with search and fts disabled', { ignore: !databaseUrl }, async () => {
  await using db = await createDB({ indexSearch: () => undefined });
  const { store } = db;

  await store.event(event1);

  assertEquals(await store.query([{ kinds: [1], search: 'vegan' }]), []);
});

Deno.test('NPostgres.query by id returns sorted results', { ignore: !databaseUrl }, async () => {
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

Deno.test('NPostgres.remove', { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(event1);
  assertEquals(await store.query([{ kinds: [1] }]), [event1]);
  await store.remove([{ kinds: [1] }]);
  assertEquals(await store.query([{ kinds: [1] }]), []);
});

Deno.test('NPostgres.remove with multiple filters', { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  const event1 = genEvent({ kind: 1 });
  const event7 = genEvent({ kind: 7, content: '+', tags: [['e', event1.id]] });

  await store.event(event1);
  await store.event(event7);

  await store.remove([{ kinds: [1] }, { kinds: [7] }]);

  assertEquals(await store.query([{}]), []);
});

Deno.test('NPostgres.event with a deleted event', { ignore: !databaseUrl }, async () => {
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

Deno.test('NPostgres.event with replaceable event', { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  const sk = generateSecretKey();
  const event = genEvent({ kind: 0, created_at: 0 }, sk);

  assertEquals((await store.count([{ kinds: [0], authors: [event.pubkey] }])).count, 0);

  await store.event(event);
  assertEquals((await store.count([{ kinds: [0], authors: [event.pubkey] }])).count, 1);

  const changeEvent = genEvent({ kind: 0, created_at: 1 }, sk);
  await store.event(changeEvent);
  assertEquals(await store.query([{ kinds: [0] }]), [changeEvent]);
});

Deno.test('NPostgres.event with parameterized replaceable event', { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  const sk = generateSecretKey();
  const event0 = genEvent({ kind: 30000, created_at: 0, tags: [['d', 'a']] }, sk);
  const event1 = genEvent({ kind: 30000, created_at: 1, tags: [['d', 'a']] }, sk);
  const event2 = genEvent({ kind: 30000, created_at: 2, tags: [['d', 'a']] }, sk);

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

Deno.test('NPostgres.event processes deletions', { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  const [sk1, sk2] = [generateSecretKey(), generateSecretKey()];
  const [one, two] = [genEvent({ kind: 1, created_at: 0 }, sk1), genEvent({ kind: 1, created_at: 1 }, sk2)];

  await store.event(one);
  await store.event(two);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [two, one]);

  const deletion = genEvent({
    kind: 5,
    pubkey: one.pubkey,
    tags: [['e', one.id]],
  }, sk1);

  await store.event(deletion);

  assertEquals(await store.query([{ kinds: [1] }]), [two]);
});

Deno.test('NPostgres.event with a replaceable deleted event', { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;
  const sk = generateSecretKey();

  const event0 = genEvent({ kind: 0, created_at: 1 }, sk);

  assertEquals(await store.query([{ kinds: [0] }]), []);

  await store.event(event0);

  assertEquals(await store.query([{ kinds: [0] }]), [event0]);

  await store.event(genEvent({
    kind: 5,
    tags: [['a', `0:${event0.pubkey}:`]],
    created_at: 0,
  }, sk));

  assertEquals(await store.query([{ kinds: [0] }]), [event0]);

  await store.event(genEvent({
    kind: 5,
    tags: [['a', `0:${event0.pubkey}:`]],
    created_at: 5,
  }, sk));

  assertEquals(await store.query([{ kinds: [0] }]), []);
});

Deno.test('NPostgres.event with a parameterized-replaceable deleted event', { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  const sk = generateSecretKey();

  const eventA = genEvent({ kind: 30000, created_at: 0, tags: [['d', 'a']] }, sk);
  const eventB = genEvent({ kind: 30000, created_at: 1, tags: [['d', 'a']] }, sk);
  const eventC = genEvent({ kind: 30000, created_at: 2, tags: [['d', 'a']] }, sk);

  await store.event(eventA);

  assertEquals(await store.query([{ ids: [eventA.id] }]), [eventA]);

  await store.event(genEvent({
    kind: 5,
    tags: [['a', `30000:${eventA.pubkey}:a`]],
    created_at: 1,
  }, sk));

  assertEquals(await store.query([{ ids: [eventA.id] }]), []);

  assertRejects(() => store.event(eventB));

  await store.event(eventC);
  assertEquals(await store.query([{ ids: [eventC.id] }]), [eventC]);
});

Deno.test("NPostgres.event does not delete another user's event", { ignore: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  const event = genEvent({ kind: 1 });
  await store.event(event);

  // Sanity check
  assertEquals(await store.query([{ kinds: [1] }]), [event]);

  await store.event(genEvent({
    kind: 5,
    tags: [['e', event.id]],
  }));

  assertEquals(await store.query([{ kinds: [1] }]), [event]);
});

Deno.test('NPostgres.transaction', { ignore: !databaseUrl }, async () => {
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
Deno.test('NPostgres timeout', { ignore: !databaseUrl }, async (t) => {
  await using db = await createDB();

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
            tags: new Array(1000).fill(['p', '570a9c85c7dd56eca0d8c7f258d7fc178f1b2bb3aab4136ba674dc4879eee88a']),
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

Deno.test('NPostgres.req streams events', { ignore: !databaseUrl }, async () => {
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
