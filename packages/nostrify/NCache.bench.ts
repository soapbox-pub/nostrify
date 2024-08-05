import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NCache } from './NCache.ts';

import events from '../../fixtures/events.json' with { type: 'json' };

const cache = new NCache({ max: 5000 });

// Seed cache with 1000 events.
for (const event of events) {
  await cache.event(event);
}

Deno.bench('NCache.event', async (b) => {
  const secretKey = generateSecretKey();
  const event = finalizeEvent({
    kind: 1,
    content: 'hello world!',
    created_at: Math.floor(Date.now() / 1000),
    tags: [['t', 'test']],
  }, secretKey);

  b.start();

  await cache.event(event);
});

Deno.bench('NCache.event with many tags', async (b) => {
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

  await cache.event(event);
});

Deno.bench('NCache.query by id', async () => {
  await cache.query([{ ids: ['119abcfcebf253a6b1af1a03e2ff1c05798c2f46cadfa2efc98eaef686095292'], limit: 1 }]);
});

Deno.bench('NCache.query by multiple ids', async () => {
  await cache.query([{
    ids: [
      '119abcfcebf253a6b1af1a03e2ff1c05798c2f46cadfa2efc98eaef686095292',
      'a9d877196e64eec8645c9c28a1051f3cdde94b6272c0769517f47cfae518ea0c',
    ],
    limit: 20,
  }]);
});

Deno.bench('NCache.query by kind', async () => {
  await cache.query([{ kinds: [1], limit: 20 }]);
});

Deno.bench('NCache.query by multiple kinds', async () => {
  await cache.query([{ kinds: [6, 7], limit: 20 }]);
});

Deno.bench('NCache.query by author', async () => {
  await cache.query([{ authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'], limit: 20 }]);
});

Deno.bench('NCache.query by multiple authors', async () => {
  await cache.query([{
    authors: [
      '753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f',
      '79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6',
    ],
    limit: 20,
  }]);
});
