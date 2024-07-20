import { Database as Sqlite } from '@db/sqlite';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';
import { Kysely } from 'kysely';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NDatabase, NDatabaseSchema } from './NDatabase.ts';

import events from '../fixtures/events.json' with { type: 'json' };
import { PostgresJSDialect } from 'kysely-postgres-js';
import postgres from 'postgres';

const databaseUrl = Deno.env.get('DATABASE_URL');
const kysely = databaseUrl?.startsWith('postgres')
  ? new Kysely<NDatabaseSchema>({
    dialect: new PostgresJSDialect({
      // @ts-ignore mismatched library versions
      postgres: postgres(databaseUrl),
    }),
  })
  : new Kysely<NDatabaseSchema>({
    dialect: new DenoSqlite3Dialect({
      database: new Sqlite(databaseUrl || ':memory:'),
    }),
  });

const db = new NDatabase(kysely);
await db.migrate();

// Seed database with 1000 events.
for (const event of events) {
  await db.event(event).catch((error) => {
    // Don't throw for duplicate events.
    if (
      error.message.includes('violates unique constraint') ||
      error.message.includes('Cannot replace an event with an older event')
    ) {
      return;
    } else {
      throw error;
    }
  });
}

Deno.bench('NDatabase.event', async (b) => {
  const secretKey = generateSecretKey();
  const event = finalizeEvent({
    kind: 1,
    content: 'hello world!',
    created_at: Math.floor(Date.now() / 1000),
    tags: [['t', 'test']],
  }, secretKey);

  b.start();

  await db.event(event);
});

Deno.bench('NDatabase.event with many tags', async (b) => {
  const secretKey = generateSecretKey();

  const tags: string[][] = new Array(300)
    .fill('')
    .map(() => ['p', '570a9c85c7dd56eca0d8c7f258d7fc178f1b2bb3aab4136ba674dc4879eee88a']);

  const event = finalizeEvent({
    kind: 1,
    content: 'hello world!',
    created_at: Math.floor(Date.now() / 1000),
    tags,
  }, secretKey);

  b.start();

  await db.event(event);
});

Deno.bench('NDatabase.query by id', async () => {
  await db.query([{ ids: ['119abcfcebf253a6b1af1a03e2ff1c05798c2f46cadfa2efc98eaef686095292'], limit: 1 }]);
});

Deno.bench('NDatabase.query by multiple ids', async () => {
  await db.query([{
    ids: [
      '119abcfcebf253a6b1af1a03e2ff1c05798c2f46cadfa2efc98eaef686095292',
      'a9d877196e64eec8645c9c28a1051f3cdde94b6272c0769517f47cfae518ea0c',
    ],
    limit: 20,
  }]);
});

Deno.bench('NDatabase.query by kind', async () => {
  await db.query([{ kinds: [1], limit: 20 }]);
});

Deno.bench('NDatabase.query by multiple kinds', async () => {
  await db.query([{ kinds: [6, 7], limit: 20 }]);
});

Deno.bench('NDatabase.query by author', async () => {
  await db.query([{ authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'], limit: 20 }]);
});

Deno.bench('NDatabase.query by multiple authors', async () => {
  await db.query([{
    authors: [
      '753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f',
      '79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6',
    ],
    limit: 20,
  }]);
});

Deno.bench('NDatabase.query replaceable event by author', async () => {
  await db.query([{
    kinds: [0],
    authors: ['9887797d06372fa7aa79950328e0754277ee748efa2222204c713ac03f1a5a81'],
    limit: 1,
  }]);
});

Deno.bench('NDatabase.query parameterized replaceable event by author', async () => {
  await db.query([{
    kinds: [30078],
    authors: ['bac7a8b8b0bb6b4194969254a5223a1f13b8d01c5bd18f65d5cefc41525ae54f'],
    '#d': ['snort'],
    limit: 1,
  }]);
});

Deno.bench('NDatabase.query by single tag', async () => {
  await db.query([{
    '#p': ['be49045474d8234adbd38dff67bbb9ae2a6d0696bf809e44e9cd12aac0ea6318'],
    limit: 20,
  }]);
});

Deno.bench('NDatabase.query by multiple tags', async () => {
  await db.query([{
    '#p': ['be49045474d8234adbd38dff67bbb9ae2a6d0696bf809e44e9cd12aac0ea6318'],
    '#e': ['8b6b27ecb89097d7b7eacd63068e10858ec8114a2a1b021e7bf2ff2a7543d7a9'],
    limit: 20,
  }]);
});

Deno.bench('NDatabase.query many events by tag', async () => {
  await db.query([{
    '#r': ['wss://relay.mostr.pub'],
    limit: 20,
  }]);
});

Deno.bench('NDatabase.query by kind and pubkey', async () => {
  await db.query([{
    kinds: [3],
    authors: ['235f0103f48a7c04524d0ab40de8d8549c5563545b9ab21da2949c013c48bffd'],
    limit: 20,
  }]);
});

Deno.bench('NDatabase.query by multiple kinds and pubkey', async () => {
  await db.query([{
    kinds: [3, 5, 6],
    authors: ['235f0103f48a7c04524d0ab40de8d8549c5563545b9ab21da2949c013c48bffd'],
    limit: 20,
  }]);
});

Deno.bench('NDatabase.query by kind and multiple pubkeys', async () => {
  await db.query([{
    kinds: [3],
    authors: [
      '235f0103f48a7c04524d0ab40de8d8549c5563545b9ab21da2949c013c48bffd',
      'd7ac5eb387d842d79f2421a7f7de3349f02fb2fecac8b8714b4f570d58b4baaf',
      'dace63b00c42e6e017d00dd190a9328386002ff597b841eb5ef91de4f1ce8491',
    ],
    limit: 20,
  }]);
});

Deno.bench('NDatabase.query by multiple kinds and multiple pubkeys', async () => {
  await db.query([{
    kinds: [3, 5, 6],
    authors: [
      '235f0103f48a7c04524d0ab40de8d8549c5563545b9ab21da2949c013c48bffd',
      'd7ac5eb387d842d79f2421a7f7de3349f02fb2fecac8b8714b4f570d58b4baaf',
      'dace63b00c42e6e017d00dd190a9328386002ff597b841eb5ef91de4f1ce8491',
    ],
    limit: 20,
  }]);
});
