import BetterSQLite3 from 'better-sqlite3';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NSQLite } from './NSQLite.ts';
import type { NSQLiteDatabase, NSQLiteRow, NSQLiteValue } from './types.ts';

import events from '../../fixtures/events.json' with { type: 'json' };

// ============================================================================
// NSQLite against the 1000-event fixture, in memory.
//
// This is the shape most callers have: a small store, where deserializing the
// events dominates and every query is a fraction of a millisecond. It's the
// regression net — a change that makes one of these several times slower has
// broken something. For the differences between query strategies, which only
// appear once a store is large enough for them to matter, see scale.bench.ts.
//
// Read and write benchmarks use separate store instances: the write benchmarks
// insert an event per iteration, and letting that grow the store the read
// benchmarks query would make the read numbers depend on how many iterations
// the runner happened to choose.
//
//   deno bench -A --no-check NSQLite.bench.ts
// ============================================================================

/** A better-sqlite3 driver that caches prepared statements by SQL text. */
function betterSQLite3(): NSQLiteDatabase {
  const sqlite = new BetterSQLite3(':memory:');

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
    close: () => void sqlite.close(),
  };
}

const read = new NSQLite(betterSQLite3());
await read.migrate();
await Promise.all(events.map((event) => read.event(event)));

const write = new NSQLite(betterSQLite3());
await write.migrate();

/**
 * Register a read benchmark.
 *
 * The result is deliberately discarded rather than returned: the runner holds
 * on to whatever a benchmark returns, and these queries return whole events, so
 * returning them accumulates every iteration's result set until the heap runs
 * out.
 */
function bench(name: string, fn: (store: NSQLite) => Promise<unknown>): void {
  Deno.bench({
    name,
    fn: async () => {
      await fn(read);
    },
  });
}

/** Register a write benchmark, whose event is generated outside the timed section. */
function benchWrite(name: string, make: () => NostrEventInit): void {
  Deno.bench({
    name,
    fn: async (b) => {
      const event = finalizeEvent(make(), generateSecretKey());
      b.start();
      await write.event(event);
    },
  });
}

interface NostrEventInit {
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
}

// ── Writes ──────────────────────────────────────────────────────────────────

// One event per iteration is the worst case for a store that batches writes:
// there is only ever one in flight, so every event pays for its own
// transaction. Concurrent ingest is several times cheaper per event.
benchWrite('event', () => ({
  kind: 1,
  content: 'hello world!',
  created_at: Math.floor(Date.now() / 1000),
  tags: [['t', 'test']],
}));

// 300 tags is one index row here, not 300 — the case the token index is
// most obviously better at than a b-tree.
benchWrite('event with many tags', () => ({
  kind: 1,
  content: 'hello world!',
  created_at: Math.floor(Date.now() / 1000),
  tags: new Array(300).fill('').map(() => ['p', '570a9c85c7dd56eca0d8c7f258d7fc178f1b2bb3aab4136ba674dc4879eee88a']),
}));

// ── Reads ───────────────────────────────────────────────────────────────────

bench(
  'query by id',
  (db) => db.query([{ ids: ['1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b'], limit: 1 }]),
);

bench('query by multiple ids', (db) =>
  db.query([{
    ids: [
      '1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b',
      'a9d877196e64eec8645c9c28a1051f3cdde94b6272c0769517f47cfae518ea0c',
    ],
    limit: 20,
  }]));

bench('query by kind', (db) => db.query([{ kinds: [1], limit: 20 }]));

bench('query by multiple kinds', (db) => db.query([{ kinds: [6, 7], limit: 20 }]));

bench(
  'query by author',
  (db) => db.query([{ authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'], limit: 20 }]),
);

bench('query by multiple authors', (db) =>
  db.query([{
    authors: [
      '753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f',
      '79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6',
    ],
    limit: 20,
  }]));

bench('query by author and kind', (db) =>
  db.query([{
    authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'],
    kinds: [1],
    limit: 20,
  }]));

// Feed-style query: every distinct author in the fixture set (~470) × 2 kinds.
const authors = [...new Set(events.map((e) => e.pubkey))];

bench('query feed (many authors + kinds, limit 20)', (db) => db.query([{ authors, kinds: [1, 6], limit: 20 }]));

bench('query by kind without limit', (db) => db.query([{ kinds: [7] }]));

const tagged = events.find((e) => e.tags.some(([name]) => name === 'p'))!;
const pubkeyTag = tagged.tags.find(([name]) => name === 'p')![1];
const eventTag = events.flatMap((e) => e.tags).find(([name]) => name === 'e')![1];

bench('query by tag', (db) => db.query([{ '#p': [pubkeyTag], limit: 20 }]));

bench('query by tag and kind', (db) => db.query([{ '#p': [pubkeyTag], kinds: [1], limit: 20 }]));

bench('query by tag with multiple values', (db) => db.query([{ '#e': [eventTag, pubkeyTag], limit: 20 }]));

// Two terms intersected by FTS5, rather than one driving and the rest being
// resolved to id sets and intersected in the application.
bench('query by two tags', (db) => db.query([{ '#p': [pubkeyTag], '#e': [eventTag], limit: 20 }]));

bench('count by kind', (db) => db.count([{ kinds: [1] }]));

bench('count by tag', (db) => db.count([{ '#p': [pubkeyTag] }]));

// ── NIP-50 search ───────────────────────────────────────────────────────────

bench('query by search (limit 20)', (db) => db.query([{ search: 'temperature', limit: 20 }]));

bench('query by search without limit', (db) => db.query([{ search: 'temperature' }]));

bench('query by search and kind (limit 20)', (db) => db.query([{ kinds: [1], search: 'temperature', limit: 20 }]));

// Bounded by the number of matches rather than the size of the store, so a
// keyword nothing contains is the cheapest search there is, not the dearest.
bench('query by search (rare/no match)', (db) => db.query([{ search: 'zzzznonexistentzzzz', limit: 20 }]));
