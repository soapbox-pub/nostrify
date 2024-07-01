import { Database as Sqlite } from '@db/sqlite';
import { assertEquals, assertRejects } from '@std/assert';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import { PostgreSQLDriver } from 'kysely_deno_postgres';
import { Kysely, LogConfig, LogEvent, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { Pool, TransactionError } from 'postgres';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { NostrFilter } from '../interfaces/NostrFilter.ts';
import { NDatabase, NDatabaseOpts, NDatabaseSchema } from './NDatabase.ts';

import event0 from '../fixtures/event-0.json' with { type: 'json' };
import event1 from '../fixtures/event-1.json' with { type: 'json' };
import events from '../fixtures/events.json' with { type: 'json' };

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
  if (Deno.env.get('DEBUG') && event.level === 'query') {
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
        dialect: {
          createAdapter() {
            return new PostgresAdapter();
          },
          // @ts-ignore mismatched kysely versions
          createDriver() {
            return new PostgreSQLDriver(
              // @ts-ignore mismatched deno-postgres versions
              new Pool(databaseUrl, 1),
            );
          },
          createIntrospector(db: Kysely<unknown>) {
            return new PostgresIntrospector(db);
          },
          createQueryCompiler() {
            return new PostgresQueryCompiler();
          },
        },
        log,
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

  const pubkeys = new Set<string>();

  for (const event of events) {
    for (const tag of event.tags.filter(([name]) => name === 'p')) {
      pubkeys.add(tag[1]);
    }
  }

  assertEquals([...pubkeys], ['0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd']);
});

Deno.test("NDatabase.query with multiple tags doesn't crash", async () => {
  await using db = await createDB();
  const { store } = db;

  await store.query([{
    kinds: [1985],
    authors: ['c87e0d90c7e521967a6975439ba20d9052c2b6680d8c4c80fc2943e2c726d98c'],
    '#L': ['nip05'],
    '#l': ['alex@gleasonator.com'],
  }]);
});

Deno.test("NDatabase.query tag query with non-tag query doesn't crash", async () => {
  await using db = await createDB();
  const { store } = db;

  await store.query([{
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
      TransactionError,
      'aborted',
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
      () => store.query(slowFilters, { timeout: 1 }),
      TransactionError,
      'aborted',
    );
  });

  await t.step('Slow count', async () => {
    await assertRejects(() => store.count(slowFilters, { timeout: 1 }), TransactionError, 'aborted');
  });

  await t.step("Check that the previous query's timeout doesn't impact the next query", async () => {
    await store.count(slowFilters);
  });

  await t.step('Slow remove', async () => {
    await assertRejects(() => store.remove(slowFilters, { timeout: 1 }), TransactionError, 'aborted');
  });

  await t.step("Sanity check that a query with timeout doesn't throw an error", async () => {
    await store.event(event0, { timeout: 1000 });
  });
});

Deno.test('NDatabase timeout has no effect on SQLite', async () => {
  await using db = await createDB();
  const { store } = db;

  await store.event(event0, { timeout: 1 });
  await store.query([{ kinds: [0] }], { timeout: 1 });
  await store.count([{ kinds: [0] }], { timeout: 1 });
  await store.remove([{ kinds: [0] }], { timeout: 1 });
});
