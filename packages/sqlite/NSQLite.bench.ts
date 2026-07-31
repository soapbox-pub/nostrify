import BetterSQLite3 from 'better-sqlite3';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NSQLite } from './NSQLite.ts';
import { NSQLiteFTS } from './NSQLiteFTS.ts';
import { NSQLiteJoin } from './NSQLiteJoin.ts';
import type { NSQLiteDatabase, NSQLiteRow, NSQLiteValue } from './types.ts';

import events from '../../fixtures/events.json' with { type: 'json' };

// ============================================================================
// Three schemas, one interface:
//
//   NSQLite      key/value + hand-picked b-tree indexes, no joins
//   NSQLiteFTS   every index term — tags included — in one FTS5 table
//   NSQLiteJoin  events and tags tables, joined, planned by SQLite
//
// All three implement the same interface with the same semantics and run on
// the same driver, so each group below isolates the schema and query strategy.
//
// Read and write benchmarks use separate store instances: the write benchmarks
// insert an event per iteration, and letting that grow the store the read
// benchmarks query would make the read numbers depend on how many iterations
// the runner happened to choose.
//
//   deno bench -A --no-check NSQLite.bench.ts
// ============================================================================

type Store = NSQLite | NSQLiteFTS | NSQLiteJoin;

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

/** A migrated store seeded with the fixture events. */
async function seeded(Store: new (db: NSQLiteDatabase) => Store): Promise<Store> {
  const store = new Store(betterSQLite3());
  await store.migrate();
  for (const event of events) {
    await store.event(event);
  }
  return store;
}

/** A migrated, empty store, for the write benchmarks. */
async function empty(Store: new (db: NSQLiteDatabase) => Store): Promise<Store> {
  const store = new Store(betterSQLite3());
  await store.migrate();
  return store;
}

const read = {
  NSQLite: await seeded(NSQLite),
  NSQLiteFTS: await seeded(NSQLiteFTS),
  NSQLiteJoin: await seeded(NSQLiteJoin),
};

const write = {
  NSQLite: await empty(NSQLite),
  NSQLiteFTS: await empty(NSQLiteFTS),
  NSQLiteJoin: await empty(NSQLiteJoin),
};

/**
 * Register the same benchmark against both stores, as a comparison group.
 *
 * The result is deliberately discarded rather than returned: the runner holds
 * on to whatever a benchmark returns, and these queries return whole events, so
 * returning them accumulates every iteration's result set until the heap runs
 * out.
 */
function compare(group: string, fn: (store: Store) => Promise<unknown>): void {
  Deno.bench({
    name: 'NSQLite',
    group,
    baseline: true,
    fn: async () => {
      await fn(read.NSQLite);
    },
  });
  Deno.bench({
    name: 'NSQLiteFTS',
    group,
    fn: async () => {
      await fn(read.NSQLiteFTS);
    },
  });
  Deno.bench({
    name: 'NSQLiteJoin',
    group,
    fn: async () => {
      await fn(read.NSQLiteJoin);
    },
  });
}

/** Register a write benchmark, whose event is generated outside the timed section. */
function compareWrite(group: string, make: () => NostrEventInit): void {
  const bench = (store: Store) => async (b: Deno.BenchContext) => {
    const event = finalizeEvent(make(), generateSecretKey());
    b.start();
    await store.event(event);
  };

  Deno.bench({ name: 'NSQLite', group, baseline: true, fn: bench(write.NSQLite) });
  Deno.bench({ name: 'NSQLiteFTS', group, fn: bench(write.NSQLiteFTS) });
  Deno.bench({ name: 'NSQLiteJoin', group, fn: bench(write.NSQLiteJoin) });
}

interface NostrEventInit {
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
}

// ── Writes ──────────────────────────────────────────────────────────────────

compareWrite('event', () => ({
  kind: 1,
  content: 'hello world!',
  created_at: Math.floor(Date.now() / 1000),
  tags: [['t', 'test']],
}));

compareWrite('event with many tags', () => ({
  kind: 1,
  content: 'hello world!',
  created_at: Math.floor(Date.now() / 1000),
  tags: new Array(300).fill('').map(() => ['p', '570a9c85c7dd56eca0d8c7f258d7fc178f1b2bb3aab4136ba674dc4879eee88a']),
}));

// ── Reads ───────────────────────────────────────────────────────────────────

compare('query by id', (db) =>
  db.query([{ ids: ['1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b'], limit: 1 }]));

compare('query by multiple ids', (db) =>
  db.query([{
    ids: [
      '1dd49619b558cc202b00c982922526d4bbb6dab09d5debbc2be3d3fd49b1db3b',
      'a9d877196e64eec8645c9c28a1051f3cdde94b6272c0769517f47cfae518ea0c',
    ],
    limit: 20,
  }]));

compare('query by kind', (db) => db.query([{ kinds: [1], limit: 20 }]));

compare('query by multiple kinds', (db) => db.query([{ kinds: [6, 7], limit: 20 }]));

compare('query by author', (db) =>
  db.query([{ authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'], limit: 20 }]));

compare('query by multiple authors', (db) =>
  db.query([{
    authors: [
      '753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f',
      '79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6',
    ],
    limit: 20,
  }]));

compare('query by author and kind', (db) =>
  db.query([{
    authors: ['753d025936c8c3238b1b2b2f748be6df92743c2201e5198946e9d6a29156793f'],
    kinds: [1],
    limit: 20,
  }]));

// Feed-style query: every distinct author in the fixture set (~470) × 2 kinds.
const authors = [...new Set(events.map((e) => e.pubkey))];

compare('query feed (many authors + kinds, limit 20)', (db) => db.query([{ authors, kinds: [1, 6], limit: 20 }]));

compare('query by kind without limit', (db) => db.query([{ kinds: [7] }]));

// Tag queries: the sharpest difference between the two designs. NSQLite scans
// one tag b-tree; NSQLiteJoin joins the tag table against the events table.
const tagged = events.find((e) => e.tags.some(([name]) => name === 'p'))!;
const pubkeyTag = tagged.tags.find(([name]) => name === 'p')![1];
const eventTag = events.flatMap((e) => e.tags).find(([name]) => name === 'e')![1];

compare('query by tag', (db) => db.query([{ '#p': [pubkeyTag], limit: 20 }]));

compare('query by tag and kind', (db) => db.query([{ '#p': [pubkeyTag], kinds: [1], limit: 20 }]));

compare('query by tag with multiple values', (db) => db.query([{ '#e': [eventTag, pubkeyTag], limit: 20 }]));

compare('query by two tags', (db) => db.query([{ '#p': [pubkeyTag], '#e': [eventTag], limit: 20 }]));

compare('count by kind', (db) => db.count([{ kinds: [1] }]));

compare('count by tag', (db) => db.count([{ '#p': [pubkeyTag] }]));

// NIP-50 search. These groups are not a schema comparison: NSQLite answers
// keywords from an FTS5 index, NSQLiteJoin scans and matches in memory. The
// gap is the index, not the joins.

compare('query by search (limit 20)', (db) => db.query([{ search: 'temperature', limit: 20 }]));

compare('query by search without limit', (db) => db.query([{ search: 'temperature' }]));

compare('query by search and kind (limit 20)', (db) => db.query([{ kinds: [1], search: 'temperature', limit: 20 }]));

compare('query by search (rare/no match)', (db) => db.query([{ search: 'zzzznonexistentzzzz', limit: 20 }]));
