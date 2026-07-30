import BetterSQLite3 from 'better-sqlite3';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NSQLite, type NSQLiteDatabase, type NSQLiteRow, type NSQLiteValue } from './NSQLite.ts';

import events from '../../fixtures/events.json' with { type: 'json' };

/**
 * A better-sqlite3 driver that caches prepared statements by SQL text.
 *
 * The store issues a small set of statement shapes with bound parameters
 * precisely so a driver can do this; without the cache every query re-parses
 * its SQL.
 */
function betterSQLite3(path: string): NSQLiteDatabase {
  const sqlite = new BetterSQLite3(path);

  // Recommended pragmas for a write-heavy event store.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');

  const statements = new Map<string, BetterSQLite3.Statement>();

  const prepare = (sql: string): BetterSQLite3.Statement => {
    let statement = statements.get(sql);
    if (!statement) {
      statement = sqlite.prepare(sql);
      statements.set(sql, statement);
    }
    return statement;
  };

  return {
    run: (sql, params = []) => void prepare(sql).run(...params as NSQLiteValue[]),
    all: (sql, params = []) => prepare(sql).all(...params as NSQLiteValue[]) as NSQLiteRow[],
    close: () => sqlite.close(),
  };
}

const db = new NSQLite(betterSQLite3(':memory:'));
await db.migrate();

// Seed the store with 1000 events.
for (const event of events) {
  await db.event(event);
}

Deno.bench('NSQLite.event', async (b) => {
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

Deno.bench('NSQLite.event with many tags', async (b) => {
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

Deno.bench('NSQLite.query by id', async () => {
  await db.query([{ ids: ['1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b'], limit: 1 }]);
});

Deno.bench('NSQLite.query by multiple ids', async () => {
  await db.query([{
    ids: [
      '1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b',
      'a9d877196e64eec8645c9c28a1051f3cdde94b6272c0769517f47cfae518ea0c',
    ],
    limit: 20,
  }]);
});

Deno.bench('NSQLite.query by kind', async () => {
  await db.query([{ kinds: [1], limit: 20 }]);
});

Deno.bench('NSQLite.query by multiple kinds', async () => {
  await db.query([{ kinds: [6, 7], limit: 20 }]);
});

Deno.bench('NSQLite.query by author', async () => {
  await db.query([{ authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'], limit: 20 }]);
});

Deno.bench('NSQLite.query by multiple authors', async () => {
  await db.query([{
    authors: [
      '753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f',
      '79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6',
    ],
    limit: 20,
  }]);
});

Deno.bench('NSQLite.query by author and kind', async () => {
  await db.query([{
    authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'],
    kinds: [1],
    limit: 20,
  }]);
});

// Feed-style query: every distinct author in the fixture set (~470) × 2 kinds,
// stressing the multi-cursor merge with a small limit.
const authors = [...new Set(events.map((e) => e.pubkey))];

Deno.bench('NSQLite.query feed (many authors + kinds, limit 20)', async () => {
  await db.query([{ authors, kinds: [1, 6], limit: 20 }]);
});

Deno.bench('NSQLite.query by kind without limit', async () => {
  await db.query([{ kinds: [7] }]);
});

// Tag queries: the tag index is scanned for keys, then the bodies are fetched.
// The `kinds` variant is answered from the tag index alone, since `kind` is
// denormalized onto it.
const tagged = events.find((e) => e.tags.some(([name]) => name === 'p'))!;
const pubkeyTag = tagged.tags.find(([name]) => name === 'p')![1];

Deno.bench('NSQLite.query by tag', async () => {
  await db.query([{ '#p': [pubkeyTag], limit: 20 }]);
});

Deno.bench('NSQLite.query by tag and kind', async () => {
  await db.query([{ '#p': [pubkeyTag], kinds: [1], limit: 20 }]);
});

Deno.bench('NSQLite.count by kind', async () => {
  await db.count([{ kinds: [1] }]);
});

// NIP-50 search: no index covers keywords, so every candidate's content is
// matched in memory. The limited variants exercise the paged early-out; the
// unlimited variant pages the whole store one chunk at a time.

Deno.bench('NSQLite.query by search (limit 20)', async () => {
  await db.query([{ search: 'temperature', limit: 20 }]);
});

Deno.bench('NSQLite.query by search without limit', async () => {
  await db.query([{ search: 'temperature' }]);
});

Deno.bench('NSQLite.query by search with multiple keywords (AND)', async () => {
  await db.query([{ search: 'minimum maximum temperature', limit: 20 }]);
});

Deno.bench('NSQLite.query by search with negation', async () => {
  await db.query([{ search: 'temperature -wind', limit: 20 }]);
});

Deno.bench('NSQLite.query by search and kind (limit 20)', async () => {
  await db.query([{ kinds: [1], search: 'temperature', limit: 20 }]);
});

Deno.bench('NSQLite.query by search (rare/no match)', async () => {
  await db.query([{ search: 'zzzznonexistentzzzz', limit: 20 }]);
});
