import 'fake-indexeddb/auto';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NIndexedDB } from './NIndexedDB.ts';

import events from '../../fixtures/events.json' with { type: 'json' };

const db = new NIndexedDB('bench-events');

// Seed the store with 1000 events.
for (const event of events) {
  await db.event(event);
}

Deno.bench('NIndexedDB.event', async (b) => {
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

Deno.bench('NIndexedDB.event with many tags', async (b) => {
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

Deno.bench('NIndexedDB.query by id', async () => {
  await db.query([{ ids: ['1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b'], limit: 1 }]);
});

Deno.bench('NIndexedDB.query by multiple ids', async () => {
  await db.query([{
    ids: [
      '1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b',
      'a9d877196e64eec8645c9c28a1051f3cdde94b6272c0769517f47cfae518ea0c',
    ],
    limit: 20,
  }]);
});

Deno.bench('NIndexedDB.query by kind', async () => {
  await db.query([{ kinds: [1], limit: 20 }]);
});

Deno.bench('NIndexedDB.query by multiple kinds', async () => {
  await db.query([{ kinds: [6, 7], limit: 20 }]);
});

Deno.bench('NIndexedDB.query by author', async () => {
  await db.query([{ authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'], limit: 20 }]);
});

Deno.bench('NIndexedDB.query by multiple authors', async () => {
  await db.query([{
    authors: [
      '753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f',
      '79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6',
    ],
    limit: 20,
  }]);
});

Deno.bench('NIndexedDB.query by author and kind', async () => {
  await db.query([{
    authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'],
    kinds: [1],
    limit: 20,
  }]);
});
