import { finalizeEvent, generateSecretKey } from 'npm:nostr-tools@^2.3.1';
import { NDenoKvDatabase } from './NDenoKvDatabase.ts';
import events from '../fixtures/events.json' with { type: 'json' };

const kv = await Deno.openKv(':memory:');
const db = new NDenoKvDatabase(kv);

// Seed database with 1000 events.
for (const event of events) {
  if (event.id === '927f28d9000c832db954e18dd530ce20c6f9476f78162bf5b1e22cefcb582c9c') {
    // big ass kind 3, skip for now
    continue;
  }
  try {
    await db.event(event);
  } catch (e) {
    console.log('==== EVENT ====');
    console.log(event.id);
    console.log('==== ERROR ====');
    console.log(e);
    Deno.exit(1);
  }
}

Deno.bench('NKvDatabase.event', async (b) => {
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

Deno.bench('NKvDatabase.event with many tags', async (b) => {
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

Deno.bench('NKvDatabase.query by id', async () => {
  await db.query([{ ids: ['119abcfcebf253a6b1af1a03e2ff1c05798c2f46cadfa2efc98eaef686095292'], limit: 1 }]);
});

Deno.bench('NKvDatabase.query by multiple ids', async () => {
  await db.query([{
    ids: [
      '119abcfcebf253a6b1af1a03e2ff1c05798c2f46cadfa2efc98eaef686095292',
      'a9d877196e64eec8645c9c28a1051f3cdde94b6272c0769517f47cfae518ea0c',
    ],
    limit: 20,
  }]);
});

Deno.bench('NKvDatabase.query by kind', async () => {
  await db.query([{ kinds: [1], limit: 20 }]);
});

Deno.bench('NKvDatabase.query by multiple kinds', async () => {
  await db.query([{ kinds: [6, 7], limit: 20 }]);
});

Deno.bench('NKvDatabase.query by author', async () => {
  await db.query([{ authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'], limit: 20 }]);
});

Deno.bench('NKvDatabase.query by multiple authors', async () => {
  await db.query([{
    authors: [
      '753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f',
      '79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6',
    ],
    limit: 20,
  }]);
});
