import { it, test } from 'node:test';
import { RelayError } from '@nostrify/nostrify';
import { genEvent, jsonlEvents } from '@nostrify/nostrify/test';
import { deepStrictEqual, ok, rejects } from 'node:assert';
import { Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { finalizeEvent, generateSecretKey, matchFilters } from 'nostr-tools';
import type { NostrEvent, NostrFilter } from '@nostrify/types';
import type { LogConfig, LogEvent } from 'kysely';
import postgres from 'postgres';
import process from 'node:process';

import { NPostgres } from './NPostgres.ts';
import type { NPostgresOpts, NPostgresSchema } from './NPostgres.ts';

import event0 from '../../fixtures/event-0.json' with { type: 'json' };
import event1 from '../../fixtures/event-1.json' with { type: 'json' };
import events from '../../fixtures/events.json' with { type: 'json' };

const databaseUrl = process.env.DATABASE_URL;

/** Kysely console logger. */
const log: LogConfig = (event: LogEvent): void => {
  if (process.env.DEBUG) {
    console.log(event.query.sql, JSON.stringify(event.query.parameters));
  }
};

/** Create in-memory database for testing. */
async function createDB(
  opts?: NPostgresOpts,
): Promise<
  {
    store: NPostgres;
    kysely: Kysely<NPostgresSchema>;
    [Symbol.asyncDispose]: () => Promise<void>;
  }
> {
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
  const DEBUG = process.env.DEBUG;
  delete process.env.DEBUG;

  await callback();

  if (typeof DEBUG === 'string') {
    process.env.DEBUG = DEBUG;
  }
}

test('NPostgres.migrate', { skip: !databaseUrl }, async () => {
  await using _db = await createDB();
});

test('NPostgres.migrate twice', { skip: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  await store.migrate();
});

test('NPostgres.count', { skip: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  deepStrictEqual((await store.count([{ kinds: [1] }])).count, 0);
  await store.event(event1);
  deepStrictEqual((await store.count([{ kinds: [1] }])).count, 1);
});

test('NPostgres.query', { skip: !databaseUrl }, async () => {
  await using db = await createDB({ indexTags: ({ tags }) => tags });
  const { store } = db;

  await store.event(event1);

  deepStrictEqual(await store.query([{ kinds: [1] }]), [event1]);
  deepStrictEqual(await store.query([{ kinds: [3] }]), []);
  deepStrictEqual(await store.query([{ since: 1691091000 }]), [event1]);
  deepStrictEqual(await store.query([{ until: 1691091000 }]), []);
  deepStrictEqual(
    await store.query([{
      '#proxy': [
        'https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79',
      ],
    }]),
    [event1],
  );
});

test(
  'NPostgres.query returns a purified event',
  { skip: !databaseUrl },
  async () => {
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

    deepStrictEqual(keys, expected);
  },
);

test(
  'NPostgres.query with tag filters and limit',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB();
    const { store } = db;

    for (const event of await jsonlEvents('./fixtures/events-3036.jsonl')) {
      await store.event(event);
    }

    const events = await store.query([{
      kinds: [30383],
      authors: [
        'db0e60d10b9555a39050c258d460c5c461f6d18f467aa9f62de1a728b8a891a4',
      ],
      '#k': ['3036'],
      '#p': [
        '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd',
      ],
      '#n': ['approved'],
      limit: 20,
    }]);

    deepStrictEqual(events.length, 1);
    deepStrictEqual(
      events[0].id,
      'b745a502b455a2380019dafad64b927575cd9223f5369d9eb402b63f84847235',
    );

    const pubkeys = new Set<string>();

    for (const event of events) {
      for (const tag of event.tags.filter(([name]) => name === 'p')) {
        pubkeys.add(tag[1]);
      }
    }

    deepStrictEqual([...pubkeys], [
      '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd',
    ]);
  },
);

test('NPostgres.query with multiple tags', { skip: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  for (const event of await jsonlEvents('./fixtures/trends.jsonl')) {
    await store.event(event);
  }

  const filters = [{
    kinds: [1985],
    authors: [
      '15b68d319a088a9b0c6853d2232aff0d69c8c58f0dccceabfb9a82bd4fd19c58',
    ],
    '#L': ['pub.ditto.trends'],
    '#l': ['#t'],
  }];

  const results = await store.query(filters);

  for (const event of results) {
    ok(matchFilters(filters, event));
  }

  deepStrictEqual(results.length, 20);
  deepStrictEqual(
    results[0].tags.find(([name]) => name === 't')?.[1],
    'bitcoin',
  );
});

test('NPostgres.query with multiple tags and time window', {
  skip: !databaseUrl,
}, async () => {
  await using db = await createDB();
  const { store } = db;

  for (const event of await jsonlEvents('./fixtures/trends.jsonl')) {
    await store.event(event);
  }

  const filters = [{
    kinds: [1985],
    authors: [
      '15b68d319a088a9b0c6853d2232aff0d69c8c58f0dccceabfb9a82bd4fd19c58',
    ],
    '#L': ['pub.ditto.trends'],
    '#l': ['#t'],
    since: 1722124800,
    until: 1722211200,
  }];

  const results = await store.query(filters);

  for (const event of results) {
    ok(matchFilters(filters, event));
  }

  deepStrictEqual(results.length, 2);
  ok(matchFilters(filters, results[0]));
  deepStrictEqual(
    results[0].tags.find(([name]) => name === 't')?.[1],
    'bitcoin',
  );
});

test('NPostgres.query with multiple tags and time window and limit', {
  skip: !databaseUrl,
}, async () => {
  await using db = await createDB();
  const { store } = db;

  for (const event of await jsonlEvents('./fixtures/trends.jsonl')) {
    await store.event(event);
  }

  const filters = [{
    kinds: [1985],
    authors: [
      '15b68d319a088a9b0c6853d2232aff0d69c8c58f0dccceabfb9a82bd4fd19c58',
    ],
    '#L': ['pub.ditto.trends'],
    '#l': ['#t'],
    since: 1722124800,
    until: 1722211200,
    limit: 1,
  }];

  const results = await store.query(filters);

  deepStrictEqual(results.length, 1);
  ok(matchFilters(filters, results[0]));
  deepStrictEqual(
    results[0].tags.find(([name]) => name === 't')?.[1],
    'bitcoin',
  );
});

test(
  'NPostgres.query tag query with non-tag query',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB();
    const { store } = db;

    const results = await store.query([{
      kinds: [0],
      authors: [
        'c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c',
      ],
    }, {
      kinds: [1985],
      authors: [
        'c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c',
      ],
      '#L': ['nip05'],
      '#l': ['alex@gleasonator.com'],
    }]);

    deepStrictEqual(results, []);
  },
);

test('NPostgres.query with search', { skip: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(event0);
  await store.event(event1);

  await it('match single event', async () => {
    deepStrictEqual(await store.query([{ search: 'Fediverse' }]), [event0]);
  });

  await it('match multiple events', async () => {
    deepStrictEqual(await store.query([{ search: 'vegan' }]), [event0, event1]);
  });

  await it("don't match nonsense queries", async () => {
    deepStrictEqual(
      await store.query([{ search: "this shouldn't match" }]),
      [],
    );
  });

  await it('match with multiple words', async () => {
    deepStrictEqual(await store.query([{ search: 'Fediverse vegan' }]), [
      event0,
    ]);
  });

  await it('match phrase', async () => {
    deepStrictEqual(await store.query([{ search: '"vegan btw"' }]), [event0]);
  });

  await it('negative word', async () => {
    deepStrictEqual(await store.query([{ search: '-btw' }]), [event1]);
  });

  await it('special characters', async () => {
    // It just has to not throw an error
    deepStrictEqual(
      await store.query([{ search: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~' }]),
      [],
    );
  });
});

test(
  'NPostgres.query with search and fts disabled',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB({ indexSearch: () => undefined });
    const { store } = db;

    await store.event(event1);

    deepStrictEqual(await store.query([{ kinds: [1], search: 'vegan' }]), []);
  },
);

test(
  'NPostgres.query by id returns sorted results',
  { skip: !databaseUrl },
  async () => {
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
    deepStrictEqual(results.map((event) => event.id), expected);
  },
);

test('NPostgres.remove', { skip: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(event1);
  deepStrictEqual(await store.query([{ kinds: [1] }]), [event1]);
  await store.remove([{ kinds: [1] }]);
  deepStrictEqual(await store.query([{ kinds: [1] }]), []);
});

test(
  'NPostgres.remove with multiple filters',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB();
    const { store } = db;

    const event1 = genEvent({ kind: 1 });
    const event7 = genEvent({
      kind: 7,
      content: '+',
      tags: [['e', event1.id]],
    });

    await store.event(event1);
    await store.event(event7);

    await store.remove([{ kinds: [1] }, { kinds: [7] }]);

    deepStrictEqual(await store.query([{}]), []);
  },
);

test('NPostgres.event with timeout', { skip: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  await rejects(
    async () => {
      await store.event(event1, { timeout: 1 });
    },
    RelayError,
    'the event could not be added fast enough',
  );
});

test('NPostgres.event with the same event multiple times', {
  skip: !databaseUrl,
}, async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(event1);
  await store.event(event1);
});

test(
  'NPostgres.event with a deleted event',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB();
    const { store } = db;

    await store.event(event1);

    deepStrictEqual(await store.query([{ kinds: [1] }]), [event1]);

    await store.event({
      kind: 5,
      pubkey: event1.pubkey,
      tags: [['e', event1.id]],
      created_at: 0,
      content: '',
      id: '',
      sig: '',
    });

    deepStrictEqual(await store.query([{ kinds: [1] }]), []);

    await rejects(() => store.event(event1));

    deepStrictEqual(await store.query([{ kinds: [1] }]), []);
  },
);

test(
  'NPostgres.event with replaceable event',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB();
    const { store } = db;

    const sk = generateSecretKey();
    const event = genEvent({ kind: 0, created_at: 0 }, sk);

    deepStrictEqual(
      (await store.count([{ kinds: [0], authors: [event.pubkey] }])).count,
      0,
    );

    await store.event(event);
    deepStrictEqual(
      (await store.count([{ kinds: [0], authors: [event.pubkey] }])).count,
      1,
    );

    const changeEvent = genEvent({ kind: 0, created_at: 1 }, sk);
    await store.event(changeEvent);
    deepStrictEqual(await store.query([{ kinds: [0] }]), [changeEvent]);
  },
);

test('NPostgres.event with parameterized replaceable event', {
  skip: !databaseUrl,
}, async () => {
  await using db = await createDB();
  const { store } = db;

  const sk = generateSecretKey();
  const event0 = genEvent(
    { kind: 30000, created_at: 0, tags: [['d', 'a']] },
    sk,
  );
  const event1 = genEvent(
    { kind: 30000, created_at: 1, tags: [['d', 'a']] },
    sk,
  );
  const event2 = genEvent(
    { kind: 30000, created_at: 2, tags: [['d', 'a']] },
    sk,
  );

  await store.event(event0);
  deepStrictEqual(await store.query([{ ids: [event0.id] }]), [event0]);

  await store.event(event1);
  deepStrictEqual(await store.query([{ ids: [event0.id] }]), []);
  deepStrictEqual(await store.query([{ ids: [event1.id] }]), [event1]);

  await store.event(event2);
  deepStrictEqual(await store.query([{ ids: [event0.id] }]), []);
  deepStrictEqual(await store.query([{ ids: [event1.id] }]), []);
  deepStrictEqual(await store.query([{ ids: [event2.id] }]), [event2]);
});

test(
  'NPostgres.event processes deletions',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB();
    const { store } = db;

    const [sk1, sk2] = [generateSecretKey(), generateSecretKey()];
    const [one, two] = [
      genEvent({ kind: 1, created_at: 0 }, sk1),
      genEvent({ kind: 1, created_at: 1 }, sk2),
    ];

    await store.event(one);
    await store.event(two);

    // Sanity check
    deepStrictEqual(await store.query([{ kinds: [1] }]), [two, one]);

    const deletion = genEvent({
      kind: 5,
      pubkey: one.pubkey,
      tags: [['e', one.id]],
    }, sk1);

    await store.event(deletion);

    deepStrictEqual(await store.query([{ kinds: [1] }]), [two]);
  },
);

test(
  'NPostgres.event with a replaceable deleted event',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB();
    const { store } = db;
    const sk = generateSecretKey();

    const event0 = genEvent({ kind: 0, created_at: 1 }, sk);

    deepStrictEqual(await store.query([{ kinds: [0] }]), []);

    await store.event(event0);

    deepStrictEqual(await store.query([{ kinds: [0] }]), [event0]);

    await store.event(genEvent({
      kind: 5,
      tags: [['a', `0:${event0.pubkey}:`]],
      created_at: 0,
    }, sk));

    deepStrictEqual(await store.query([{ kinds: [0] }]), [event0]);

    await store.event(genEvent({
      kind: 5,
      tags: [['a', `0:${event0.pubkey}:`]],
      created_at: 5,
    }, sk));

    deepStrictEqual(await store.query([{ kinds: [0] }]), []);
  },
);

test('NPostgres.event with a parameterized-replaceable deleted event', {
  skip: !databaseUrl,
}, async () => {
  await using db = await createDB();
  const { store } = db;

  const sk = generateSecretKey();

  const eventA = genEvent(
    { kind: 30000, created_at: 0, tags: [['d', 'a']] },
    sk,
  );
  const eventB = genEvent(
    { kind: 30000, created_at: 1, tags: [['d', 'a']] },
    sk,
  );
  const eventC = genEvent(
    { kind: 30000, created_at: 2, tags: [['d', 'a']] },
    sk,
  );

  await store.event(eventA);

  deepStrictEqual(await store.query([{ ids: [eventA.id] }]), [eventA]);

  await store.event(genEvent({
    kind: 5,
    tags: [['a', `30000:${eventA.pubkey}:a`]],
    created_at: 1,
  }, sk));

  deepStrictEqual(await store.query([{ ids: [eventA.id] }]), []);

  rejects(() => store.event(eventB));

  await store.event(eventC);
  deepStrictEqual(await store.query([{ ids: [eventC.id] }]), [eventC]);
});

test("NPostgres.event does not delete another user's event", {
  skip: !databaseUrl,
}, async () => {
  await using db = await createDB();
  const { store } = db;

  const event = genEvent({ kind: 1 });
  await store.event(event);

  // Sanity check
  deepStrictEqual(await store.query([{ kinds: [1] }]), [event]);

  await store.event(genEvent({
    kind: 5,
    tags: [['e', event.id]],
  }));

  deepStrictEqual(await store.query([{ kinds: [1] }]), [event]);
});

test('NPostgres.transaction', { skip: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  await store.transaction(async (store) => {
    await store.event(event0);
    await store.event(event1);
  });

  deepStrictEqual(await store.query([{ kinds: [0] }]), [event0]);
  deepStrictEqual(await store.query([{ kinds: [1] }]), [event1]);
});

// When `statement_timeout` is 0 it's disabled, so we need to create slow queries.
test('NPostgres timeout', { skip: !databaseUrl }, async (t) => {
  await using db = await createDB();

  const { store } = db;

  // Setup
  await withoutDebug(async () => {
    await Promise.all(events.map((event) => store.event(event)));
  });

  await it('Slow event (lots of tags)', async () => {
    await rejects(
      () =>
        store.event(
          finalizeEvent({
            kind: 1,
            content: 'hello world!',
            created_at: Math.floor(Date.now() / 1000),
            tags: new Array(1000).fill([
              'p',
              '570a9c85c7dd56eca0d8c7f258d7fc178f1b2bb3aab4136ba674dc4879eee88a',
            ]),
          }, generateSecretKey()),
          { timeout: 1 },
        ),
      RelayError,
      'error: the event could not be added fast enough',
    );
  });

  const slowFilters: NostrFilter[] = [{
    '#t': [
      'lorem',
      'ipsum',
      'dolor',
      'sit',
      'amet',
      'consectetur',
      'adipiscing',
      'elit',
      'etiam',
      'sed',
      'orci',
      'faucibus',
      'faucibus',
      'mi',
      'condimentum',
      'blandit',
      'orci',
      'duis',
      'ac',
      'felis',
      'nec',
      'nulla',
      'venenatis',
      'laoreet',
      'lorem',
      'ipsum',
      'dolor',
      'sit',
      'amet',
      'consectetur',
      'adipiscing',
      'elit',
      'vivamus',
      'quis',
      'facilisis',
      'tellus',
      'ut',
      'condimentum',
      'ante',
      'pellentesque',
      'interdum',
      'molestie',
      'vehicula',
      'duis',
      'tristique',
      'euismod',
      'convallis',
      'in',
      'tortor',
      'purus',
      'sollicitudin',
      'ut',
      'vestibulum',
      'vitae',
      'cursus',
      'ut',
      'velit',
      'vivamus',
      'libero',
      'quam',
      'commodo',
      'a',
      'purus',
      'eget',
      'molestie',
      'convallis',
      'felis',
      'proin',
      'bibendum',
      'vitae',
      'mauris',
      'ac',
      'maximus',
      'sed',
      'laoreet',
      'ex',
      'in',
      'mi',
      'maximus',
      'porttitor',
      'duis',
      'ultrices',
      'pharetra',
      'nisi',
      'quis',
      'hendrerit',
      'pellentesque',
      'dui',
      'libero',
      'cursus',
      'sit',
      'amet',
      'neque',
      'vel',
      'consectetur',
      'dignissim',
      'augue',
      'aliquam',
      'volutpat',
      'sapien',
      'vitae',
      'ipsum',
      'varius',
      'luctus',
      'donec',
      'ac',
      'erat',
      'venenatis',
      'vestibulum',
      'arcu',
      'ut',
      'tincidunt',
      'augue',
      'etiam',
      'vel',
      'molestie',
      'mi',
    ],
  }];

  await it('Slow query', async () => {
    await rejects(
      () => db.store.query(slowFilters, { timeout: 1 }),
      postgres.PostgresError,
      'canceling statement due to statement timeout',
    );
  });

  await it('Slow count', async () => {
    await rejects(
      () => db.store.count(slowFilters, { timeout: 1 }),
      postgres.PostgresError,
      'canceling statement due to statement timeout',
    );
  });

  await it("Check that the previous query's timeout doesn't impact the next query", async () => {
    await store.count(slowFilters);
  });

  await it('Slow remove', async () => {
    await rejects(
      () => db.store.remove(slowFilters, { timeout: 1 }),
      postgres.PostgresError,
      'canceling statement due to statement timeout',
    );
  });

  await it("Sanity check that a query with timeout doesn't throw an error", async () => {
    await store.event(event0, { timeout: 1000 });
  });
});

test('NPostgres.req streams events', { skip: !databaseUrl }, async () => {
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

  deepStrictEqual(expected, results);
});

test(
  'NPostgres.req with an empty database',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB();
    const { store } = db;

    for await (
      const _msg of store.req([{}], { signal: AbortSignal.timeout(1000) })
    ) {
      // Just don't freeze
    }
  },
);

test('NPostgres.req with timeout', { skip: !databaseUrl }, async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(genEvent());

  for await (const _msg of store.req([{}], { timeout: 1000 })) {
    // Just don't throw an error
  }
});

test('NPostgres.shouldOrder', () => {
  deepStrictEqual(NPostgres.shouldOrder({}), true);

  deepStrictEqual(NPostgres.shouldOrder({ ids: ['1', '2', '3'] }), false);
  deepStrictEqual(
    NPostgres.shouldOrder({ ids: ['1', '2', '3'], limit: 2 }),
    true,
  ); // the limit is less than the number of ids
  deepStrictEqual(
    NPostgres.shouldOrder({ ids: ['1', '2', '3'], limit: 3 }),
    false,
  );
  deepStrictEqual(
    NPostgres.shouldOrder({ ids: ['1', '2', '3'], limit: 20 }),
    false,
  );

  deepStrictEqual(
    NPostgres.shouldOrder({ kinds: [0], authors: ['alex'] }),
    false,
  );
  deepStrictEqual(
    NPostgres.shouldOrder({
      kinds: [0],
      authors: ['alex', 'patrick', 'shantaram'],
      limit: 1,
    }),
    true,
  );
  deepStrictEqual(
    NPostgres.shouldOrder({
      kinds: [0],
      authors: ['alex', 'patrick', 'shantaram'],
      limit: 20,
    }),
    false,
  );
  deepStrictEqual(
    NPostgres.shouldOrder({ kinds: [0, 3], authors: ['alex'] }),
    false,
  );
  deepStrictEqual(
    NPostgres.shouldOrder({ kinds: [0, 3], authors: ['alex'], limit: 1 }),
    true,
  );
  deepStrictEqual(
    NPostgres.shouldOrder({ kinds: [0, 3], authors: ['alex'], limit: 2 }),
    false,
  );
  deepStrictEqual(
    NPostgres.shouldOrder({ kinds: [0, 3], authors: ['alex'], limit: 20 }),
    false,
  );

  deepStrictEqual(NPostgres.shouldOrder({ kinds: [1] }), true);
  deepStrictEqual(NPostgres.shouldOrder({ kinds: [1], limit: 20 }), true);
  deepStrictEqual(NPostgres.shouldOrder({ kinds: [1, 6] }), true);
  deepStrictEqual(NPostgres.shouldOrder({ kinds: [1, 6], limit: 20 }), true);

  deepStrictEqual(
    NPostgres.shouldOrder({ kinds: [30000], authors: ['alex'] }),
    true,
  );
  deepStrictEqual(
    NPostgres.shouldOrder({
      kinds: [30000],
      authors: ['alex'],
      '#d': ['yolo'],
    }),
    false,
  );
});

test('NPostgres search extensions', { skip: !databaseUrl }, async () => {
  await using db = await createDB({
    indexExtensions(event) {
      const ext: Record<string, string> = {};

      if (/[\p{Script=Han}]/u.test(event.content)) {
        ext.language = 'zh';
      }

      if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(event.content)) {
        ext.language = 'ja';
      }

      return ext;
    },
  });

  const { store } = db;

  const en = genEvent({ kind: 1, content: 'hello', created_at: 0 });
  const zh = genEvent({ kind: 1, content: '藍天', created_at: 1 });
  const ja = genEvent({ kind: 1, content: 'こんにちは', created_at: 2 });

  await store.event(en);
  await store.event(zh);
  await store.event(ja);

  const results = await store.query([{ kinds: [1], search: 'language:zh' }]);

  deepStrictEqual(results.length, 1);
  deepStrictEqual(results[0].id, zh.id);

  const results2 = await store.query([{
    kinds: [1],
    search: 'language:zh language:ja',
  }]);

  deepStrictEqual(results2.map((e) => e.id), [ja.id, zh.id]);

  const results3 = await store.query([{
    kinds: [1],
    search: 'language:zh language:ja 藍天',
  }]);

  deepStrictEqual(results3.map((e) => e.id), [zh.id]);
});

test('NPostgres search extensions with multiple keys and values', {
  skip: !databaseUrl,
}, async () => {
  await using db = await createDB({
    indexExtensions(event) {
      const ext: Record<string, string> = {};

      const imeta: string[][][] = event.tags
        .filter(([name]) => name === 'imeta')
        .map(([_, ...entries]) =>
          entries.map((entry) => {
            const split = entry.split(' ');
            return [split[0], split.splice(1).join(' ')];
          })
        );

      if (imeta.length) {
        ext.media = 'true';

        if (
          imeta.every((tags) => tags.some(([name, value]) => name === 'm' && value.startsWith('video/')))
        ) {
          ext.video = 'true';
        }
      }

      ext.protocol = event.tags.find(([name]) => name === 'proxy')?.[2] ??
        'nostr';

      return ext;
    },
  });

  const { store } = db;

  const atpubVideo = genEvent({
    kind: 1,
    tags: [['imeta', 'm video/mp4'], ['proxy', '', 'activitypub']],
  });
  const nostrVideo = genEvent({ kind: 1, tags: [['imeta', 'm video/mp4']] });

  await store.event(atpubVideo);
  await store.event(nostrVideo);

  const results = await store.query([{
    kinds: [1],
    search: 'video:true protocol:nostr',
  }]);

  deepStrictEqual(results.map((e) => e.id), [nostrVideo.id]);
});

test(
  'NPostgres search extensions with negative tokens',
  { skip: !databaseUrl },
  async () => {
    await using db = await createDB({
      indexExtensions(event) {
        const ext: Record<string, string> = {};

        if (/[\p{Script=Han}]/u.test(event.content)) {
          ext.language = 'zh';
        }

        if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(event.content)) {
          ext.language = 'ja';
        }

        return ext;
      },
    });

    const { store } = db;

    const en = genEvent({ kind: 1, content: 'hello', created_at: 0 });
    const zh = genEvent({ kind: 1, content: '藍天', created_at: 1 });
    const ja = genEvent({ kind: 1, content: 'こんにちは', created_at: 2 });

    await store.event(en);
    await store.event(zh);
    await store.event(ja);

    const results = await store.query([{ kinds: [1], search: '-language:zh' }]);

    deepStrictEqual(results.map((e) => e.id), [ja.id, en.id]);
  },
);

test('NPostgres search extensions with multiple negative tokens', {
  skip: !databaseUrl,
}, async () => {
  await using db = await createDB({
    indexExtensions(event) {
      const ext: Record<string, string> = {};

      if (/[\p{Script=Han}]/u.test(event.content)) {
        ext.language = 'zh';
      }

      if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(event.content)) {
        ext.language = 'ja';
      }

      ext.always = 'true';

      return ext;
    },
  });

  const { store } = db;

  const en = genEvent({ kind: 1, content: 'hello', created_at: 0 });
  const zh = genEvent({ kind: 1, content: '藍天', created_at: 1 });
  const ja = genEvent({ kind: 1, content: 'こんにちは', created_at: 2 });

  await store.event(en);
  await store.event(zh);
  await store.event(ja);

  const results = await store.query([{
    kinds: [1],
    search: '-language:zh always:true -language:ja',
  }]);

  deepStrictEqual(results.map((e) => e.id), [en.id]);
});
